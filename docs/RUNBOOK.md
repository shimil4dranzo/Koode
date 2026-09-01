# Koode — operations runbook

Written for whoever is on the end of the phone when something breaks, possibly
years from now, possibly not the person who built it.

---

## Before the first deployment

Work through this list. Several items are the difference between a system that
protects people's data and one that only appears to.

### 1. Rotate the database password

The password circulated in the original build brief must be treated as
compromised — it was written into a document and shared. Rotate it before
anything real touches this database.

### 2. Create a dedicated application user

`root` is for local development only.

```sql
CREATE USER 'koode_app'@'10.0.0.%' IDENTIFIED BY '<generated>';
GRANT SELECT, INSERT, UPDATE, DELETE ON `Koode`.* TO 'koode_app'@'10.0.0.%';
FLUSH PRIVILEGES;
```

Notes on that grant, all deliberate:

- **No `GRANT ALL`**, and **no `WITH GRANT OPTION`**.
- **No wildcard host** (`'%'`). Scope it to the application subnet.
- **No DDL** (`CREATE`, `ALTER`, `DROP`). Migrations run as a separate,
  higher-privileged user during deployment only — see below.
- Scoped to the `Koode` schema, never `*.*`.

A separate migration user, used only by the deploy step:

```sql
CREATE USER 'koode_migrate'@'10.0.0.%' IDENTIFIED BY '<generated>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON `Koode`.* TO 'koode_migrate'@'10.0.0.%';
```

### 3. Create the schema with the right charset

```sql
CREATE DATABASE `Koode` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
```

If the database already exists with a different collation, **stop and raise it**
rather than working around it. Malayalam is silently corrupted by MySQL's
legacy 3-byte `utf8`, and the damage is invisible until a user reads the page.

### 4. Confirm `lower_case_table_names`

```sql
SHOW VARIABLES LIKE 'lower_case_table_names';
```

It must match between the development machine and the server. Linux defaults to
`0` (case-sensitive); macOS and Windows do not. The schema name is capitalised
`Koode`, so a mismatch is the classic works-on-my-machine failure. It cannot be
changed after initialisation without rebuilding the instance.

Record the value in `ARCHITECTURE.md`.

### 5. Generate secrets

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Needed: `SESSION_SECRET`, `IP_HASH_SECRET`, `MAINTENANCE_SECRET`.

Rotating `SESSION_SECRET` invalidates every session and every outstanding claim
link. Rotating `IP_HASH_SECRET` makes historic audit records uncorrelatable
with new ones — which is a privacy feature, but do it knowingly.

### 6. Provision Redis

Production refuses to start without `REDIS_URL`. The in-process fallback
protects a single process only, which behind more than one instance is no
protection at all.

### 7. Configure SMS, then enable third-party recommendations

`SMS_PROVIDER=console` writes one-time passwords to the server log and is
refused in production.

Once a real provider is configured, set `ALLOW_RECOMMENDING_NON_USERS=true`. Do
not do this before. That flag governs whether a member can enter a stranger's
name and number, and the only thing protecting that stranger is the claim
invitation reaching them.

### 8. (Optional) Enable Google sign-in

Create an OAuth 2.0 Client ID (type: Web application) in Google Cloud Console,
add the redirect URI `https://<host>/api/auth/google/callback`, and set
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Leaving them blank hides the
feature completely.

Scope note, worth repeating to whoever asks for more: Google here is a
convenience credential. Identity is the phone number — the claim flow, the
contact reveal and duplicate detection all depend on it — so a Google account
can only ever be attached to an existing phone-verified profile, from the
profile page. It can never register.

### 9. Know the password-reset gap

Accounts are e-mail+password or Google. There is NO password reset — it needs
an e-mail provider nobody has chosen. Until one exists, a person who forgets a
non-Google password needs an admin to hear about it (no self-service exists,
deliberately: a reset flow that silently fails is worse than none). Choosing
an e-mail provider closes this; wire it the way SMS is wired, behind an
interface with the console stub for development.

### 10. Replace the consent text

`src/server/consent/versions.ts` currently references placeholder copy written
by the engineering team. It describes the system accurately but has not been
reviewed for DPDP Act 2023 compliance. Replace it, add a new version entry, and
bump `CURRENT_CONSENT_VERSION` — never edit a published version, because
existing records point at it.

### 11. Verify the checklist

```bash
npm run db:check
```

Confirms charset, collation, `lower_case_table_names`, and that real Malayalam
survives a round trip.

---

## Deploying

```bash
docker build -t koode:$(git rev-parse --short HEAD) .
```

Then, in order:

1. **Back up the database** (see below). Always, before migrations.
2. **Run migrations** as `koode_migrate`:
   `DATABASE_URL=<migrate-user-url> npm run db:deploy`
3. **Start the new container** with the application user's `DATABASE_URL`.
4. **Check health**: `curl -fsS https://<host>/api/health`

A healthy response:

```json
{ "status": "ok", "database": "up", "charset": "utf8mb4", "latencyMs": 4 }
```

`"status": "degraded"` returns HTTP 503. `"charset": "invalid"` means the
Malayalam round trip failed — treat that as an outage, not a warning, because
data written in that state is being corrupted.

---

## Scheduled jobs

One cron entry. It expires stale postings, purges unclaimed profiles, and clears
spent one-time passwords.

```
17 3 * * * curl -fsS -X POST -H "Authorization: Bearer $MAINTENANCE_SECRET" https://<host>/api/maintenance >> /var/log/koode-maintenance.log 2>&1
```

**This one matters legally.** Purging unclaimed profiles is how Koode honours
the promise that somebody who never responded to a recommendation ends up with
nothing of theirs retained. If this job stops running, that promise stops being
true. Check the log occasionally, and note that
`purgedUnclaimedProfiles` in the response is the number to watch.

If `MAINTENANCE_SECRET` is unset the endpoint returns 403 — it fails closed
rather than letting anyone trigger data purges.

---

## Backups

```bash
mysqldump --single-transaction --default-character-set=utf8mb4 \
  -u koode_backup -p Koode | gzip > koode-$(date +%F).sql.gz
```

`--single-transaction` gives a consistent snapshot without locking writes.
`--default-character-set=utf8mb4` is not optional: without it, the dump can
mangle Malayalam on the way out, and you discover this only when you restore.

**Test a restore into a scratch database and run `npm run db:check` against it.**
A backup nobody has restored is a hypothesis.

Restore:

```bash
gunzip < koode-2026-09-01.sql.gz | mysql --default-character-set=utf8mb4 -u root -p Koode
```

---

## A migration failed halfway

MySQL has no transactional DDL. A failed migration can leave the schema in a
partial state, and Prisma will refuse to continue.

1. **Do not re-run it** and do not edit the migration file. It may be recorded
   as partially applied, and editing an applied migration desynchronises every
   other environment.
2. Inspect what actually happened:
   ```sql
   SELECT migration_name, finished_at, rolled_back_at, logs
     FROM `Koode`._prisma_migrations ORDER BY started_at DESC LIMIT 5;
   ```
3. Compare the real schema against the expected one:
   ```bash
   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
   ```
4. Either finish the change by hand with the SQL from step 3, then
   `npx prisma migrate resolve --applied <migration_name>`, or undo the partial
   change by hand and `npx prisma migrate resolve --rolled-back <migration_name>`.
5. If the data is in doubt, restore the backup from before the deployment.

---

## Common problems

### Malayalam shows as `?????` or boxes

Charset. Run `npm run db:check`. Check in this order: the column collation, the
connection charset, then the browser's font. `?` characters mean the data was
destroyed on write and no amount of fixing the display will bring it back —
restore from a backup taken before the bad write.

### Nobody can sign in

Check the SMS provider first, then Redis.

Rate limiting **fails open** by design: if Redis is down, requests are allowed
rather than blocked, precisely so a cache outage cannot lock the town out. So
if sign-in is broken, Redis is not the cause — look at SMS delivery, then at
`SESSION_SECRET` (rotating it invalidates every session at once).

### "Too many attempts"

Per-phone limits: 3 OTP sends an hour, 5 verification attempts per 10 minutes.
An admin can clear a mistaken lockout with `resetRateLimit` from
`src/server/ratelimit`.

### Someone says their details are on Koode without permission

This is the complaint the whole claim flow exists for, and it must be handled
the same day.

1. Find them: the moderation console, or `person` by public id.
2. If they are `pending_claim`, they were added by a referrer and never
   accepted. Their profile is already invisible to everyone.
3. The clean path is to send them their claim link and let them press reject —
   that purges their data and blocks the referrer automatically.
4. If they cannot or will not use the link, a platform admin can suspend the
   person record, which hides everything immediately, and then anonymise it.
5. Look at the audit log for `claim.invited` and `recommendation.created` to
   see who added them, and act on the referrer if there is a pattern.

### The site is slow

At this scale — hundreds of users, tens of postings a week — slowness is almost
certainly not the database. Check, in order: the host's memory, whether the
maintenance job is running (an unbounded `otp_challenge` table will eventually
be felt), and the client JavaScript size with `npm run bundle:report`.

---

## What deliberately does not exist

Do not go looking for these; their absence is a decision, recorded in
`ARCHITECTURE.md`:

- **Free-text search.** MySQL full-text has no Malayalam tokenisation. Search
  is structured filtering. Adding keyword search means adding an external
  index, which is a project, not a config change.
- **Offline writes.** The service worker caches the app shell for reading only.
  A recommendation queued offline and synced three days later — after the
  subject rejected their claim — would be worse than an honest error.
- **Analytics.** The CSP allows no external origin at all. That is what makes
  "no trackers" a guarantee rather than a promise.
- **Public ratings.** Recommendations are named and textual. There are no
  stars, and outcomes are never shown as a score.
