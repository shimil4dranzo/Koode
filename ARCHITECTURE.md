# Koode — architecture and decisions

This file records what was decided and, more importantly, **why**. If you are
about to change something here, read the reasoning first — most of these
choices are cheap to make once and expensive to reverse.

Product context and scope live in the build brief. This file covers only
engineering decisions and the reasoning behind them.

---

## The rule that shapes everything else

**Business logic lives in framework-agnostic service modules. Route Handlers
under `/api` are the real API surface. Server Actions, if used at all, are a
thin wrapper that calls the same service function.**

This is not architectural taste. Two things already on the roadmap — a
Capacitor native wrapper and a WhatsApp bot — will need to talk to this system,
and neither can call a Server Action. If a capability exists only as a Server
Action, it does not exist for them.

Concretely:

```
src/app/api/**/route.ts     HTTP shape only: parse, authenticate, call, respond
src/server/services/**      orchestration: domain rules + database + audit
src/server/domain/**        pure rules, no I/O, no framework, fully unit-tested
src/server/db/**            Prisma access
```

A Route Handler must contain no business rule. A domain module must import
nothing from `next/*`. When you are tempted to put "just one check" in a route,
put it in the domain layer instead — that check is exactly what the bot will
need too.

### Layer directions

```
route handler ──> service ──> domain (pure)
                     │
                     └──────> repository / prisma
```

Domain never imports a service. Services never import a route. There is no
dependency injection container: services take `Db` as an optional argument so
a caller can compose them into one transaction, and that is the whole
mechanism.

---

## Database

### MySQL 8, charset and collation

Everything is `utf8mb4` / `utf8mb4_0900_ai_ci`, at server, database, table and
connection level. MySQL's legacy 3-byte `utf8` accepts Malayalam and silently
corrupts it, and the damage only becomes visible when a real user reads the
page.

Three separate controls, because one is not enough:

1. `docker-compose.yml` pins the server defaults, and
   `docker/mysql-init/01-charset.sql` creates the schema explicitly.
2. `scripts/normalize-migrations.ts` rewrites the collation Prisma emits
   (`utf8mb4_unicode_ci`, not configurable) and runs in CI with `--check`, so a
   migration with the wrong collation cannot reach `main`.
3. `scripts/check-db.ts` writes and reads back real Malayalam — including a
   4-byte emoji, which 3-byte `utf8` cannot store at all. Testing this with an
   English placeholder would prove nothing.

`/api/health` performs the same round trip on every check, so charset
corruption shows up as a failing health probe rather than as a support ticket.

### Identifier case — the works-on-my-machine trap

The schema name is capitalised `Koode`. MySQL's `lower_case_table_names`
defaults to `0` on Linux (names stored as written, compared **case-sensitively**)
and to `1` or `2` on macOS and Windows. A developer on a Mac will therefore not
notice a case mismatch that breaks the Linux server.

Mitigations:

- Every table and column is `lower_snake_case` via Prisma `@@map`/`@map`, so no
  table name can ever differ by case between environments.
- `docker-compose.yml` pins `--lower-case-table-names=0` so local development
  behaves like the server.
- `scripts/check-db.ts` prints the running value and warns when it is not `0`.
- The database name `Koode` stays capitalised, since it was specified that way.
  It must be created exactly as `Koode` on Linux.

**Confirm the value on the real development and production servers and record
it here.** It could not be verified during M0 because no MySQL host was
supplied.

### Primary keys

Every table has `id BIGINT AUTO_INCREMENT` as the clustered primary key, plus a
separate `public_id` (cuid2) used in URLs and API responses.

- A random UUIDv4 clustered PK fragments InnoDB and causes page splits, because
  InnoDB stores rows in primary-key order.
- A sequential id in a URL leaks the size of the dataset and lets anyone
  enumerate every record by counting.

cuid2 rather than ULID: collision-resistant, non-sequential, and shorter in a
URL. It is only ever a secondary index, so its randomness costs nothing on
insert.

**A deliberate side effect worth keeping:** Prisma maps `BIGINT` to JavaScript
`BigInt`, which throws on `JSON.stringify`. Accidentally serialising an internal
id is therefore a loud runtime error rather than a silent disclosure. Do not
"fix" this by converting ids to numbers or strings at the boundary.

### Enums

Status columns are `VARCHAR` with application-level validation, not MySQL
native `ENUM`. Altering a native `ENUM` rebuilds the table, and every one of
these lists will change. The allowed values live in
`src/server/domain/constants.ts` as `as const` arrays, so adding a value
produces exhaustiveness errors everywhere it needs handling.

### Prisma 7 and the driver adapter

Prisma 7 removed the bundled Rust query engine in favour of driver adapters,
and moved the datasource URL out of `schema.prisma` into `prisma.config.ts`.

We adopted 7 rather than staying on 6. Prisma 6 is more battle-tested today,
but 7 is the current stable major; starting a multi-year project on the
previous major guarantees a forced migration in year one. The cost is one extra
file and an explicit connection pool, both of which are visible rather than
magical.

`src/server/db/connection-url.ts` parses `DATABASE_URL` into pool config using
the WHATWG URL parser, so a password containing `@`, `/`, `#` or a
percent-escape survives. That failure mode surfaces only as "access denied",
with no hint about the real cause, so it is unit-tested.

### Locality hierarchy — measured, not assumed

The brief asked for recursive CTEs to be benchmarked rather than assumed. Two
decisions came out of that:

**Subtree queries use a materialised path**, not a recursive CTE. Every
`Locality` carries `path` (`/1/4/12/`) and `depth`. "Everything under this
block" is then one indexed `LIKE '/1/4/%'` rather than a recursive walk. The
tree is tiny and changes almost never, so maintaining the path on write is
close to free. A recursive CTE would work at this scale; the materialised path
is simply less code to read and one index lookup instead of a loop.

**"Nearby" needs its own table.** This is the correction to the brief worth
reading twice: *the hierarchy cannot answer adjacency*. Two panchayats under one
block do not necessarily border each other, and real adjacency crosses block and
district boundaries. `LocalityAdjacency` therefore stores hand-curated
"borders on" edges, symmetrically (both directions inserted) so a nearby query
is a single index lookup.

The seeded adjacency data is approximate and **must be reviewed by someone with
local knowledge of Edakkara before launch.** It cannot be derived from anything
in the database.

### Search

Structured filtering only: locality, category, engagement type, status. There is
no free-text search in Stage 1.

MySQL full-text indexing has no meaningful Malayalam tokenisation — it cannot
segment Malayalam words, so a full-text index over Malayalam job descriptions
would return approximately nothing and look broken. Structured filtering is both
what these users actually need and index-friendly. **If a requirement drifts
toward free-text search, that is a real project with a real cost (an external
index), not a flag to switch on.**

### Money and time

`DECIMAL(12,2)`, never `FLOAT`. Timestamps stored UTC, rendered in
`Asia/Kolkata` — configured once in `src/i18n/request.ts` rather than at each
call site.

### Migrations

Prisma Migrate from the first commit. Never edit an applied migration.

MySQL has no transactional DDL, so a failed migration can leave a partial
state. Each migration must therefore be individually safe to re-run or to
recover from. Recovery procedure is in `docs/RUNBOOK.md`.

---

## Privacy

These are the rules the product's premise depends on. They are enforced in
code, not by convention.

### Phone numbers

- `Person.phone` is never selected into a list response, a Server Component's
  props, or a client bundle. It is read only on the audited reveal path.
- The reveal is rate-limited (`contactReveal`) and written to `AuditEvent`.
- `CurrentPerson` — the session object passed into Server Components — has **no
  phone field at all**. The type makes the leak impossible rather than
  discouraged.
- Logs never contain a number. `phoneLogRef()` produces a keyed hash prefix so
  an operator can correlate one user's requests across log lines while the log
  itself discloses nothing. `redactPhonesInText()` scrubs numbers out of
  anything not written by us, including ORM error messages.
- `sanitizeMetadata()` in the audit layer redacts forbidden keys by name and
  scrubs numbers pasted into free-text fields, because relying on every future
  call site to remember is not a control.

`Person.phone` is nullable **only** so anonymisation can null it while keeping
the row and its recommendation edges. MySQL allows many NULLs under a unique
index, which is exactly the behaviour required.

### Third-party data — the claim flow

A referrer enters another person's name and number. That person is not present
and has not consented. Therefore:

1. The subject is created `pending_claim`: not listed, not searchable, not
   contactable.
2. An OTP-verified invitation states who recommended them and what was written.
3. The profile becomes public only on an active claim.
4. One-tap reject deletes the details and writes a `RecommendationBlock` that
   stops the same referrer re-creating them.
5. Unclaimed profiles expire and their personal data is purged.

**`ALLOW_RECOMMENDING_NON_USERS` defaults to `false`.** This is the fail-closed
switch for the one legally sensitive capability in the product. The claim flow
protects a third party *only if the invitation actually reaches them*, and with
`SMS_PROVIDER=console` it does not. Recommending a person who is already a
Koode user works regardless; recommending a stranger requires a real SMS
provider and this flag turned on deliberately.

### Deletion and export

Deletion anonymises: personal columns are nulled, sessions revoked, the row and
its edges retained so recommendation history stays statistically intact without
identifying anyone. Nothing in this system is hard-deleted.

### No third parties

The Content-Security-Policy in `src/proxy.ts` allows no external origin at all
— no CDN, no font host, no analytics. This makes "no trackers, no PII leaving
the platform" a technical guarantee rather than a promise, and it means adding
any third-party script requires a visible, reviewable CSP change.

---

## Rate limiting

Fixed-window, Redis-backed, in `src/server/ratelimit/`. A fixed window can
admit up to 2× the limit across a boundary; at this scale that is irrelevant,
and a sliding window costs more round trips and much more code.

**It fails open.** If Redis is unavailable the request is allowed. This is a
deliberate trade-off: failing closed would lock every user out of signing in,
turning a Redis blip into a total outage. These limits guard against nuisance
and cost, not against a determined attacker with a working exploit, and the
audit log still records what happened. Production refuses to boot without
`REDIS_URL` precisely because the in-process fallback protects one process only.

---

## Authentication

Phone + OTP. No password anywhere, so there is no password hash, no reset flow,
and no credential-stuffing surface.

- The session cookie holds an opaque 256-bit secret; only its HMAC is stored, so
  a database leak does not hand over live sessions.
- `hashToken` uses keyed SHA-256 rather than a slow KDF. These are
  machine-generated 256-bit secrets — there is nothing to brute-force, and
  paying bcrypt on every request would be cost with no benefit. This reasoning
  does **not** transfer to anything user-chosen.
- Session TTL is 90 days, sliding. There is no password to fall back on: an
  expired session means another SMS, which costs money and loses the user.
  Server-side revocation is the control that matters.
- `SameSite=Lax`, not `Strict`: the claim link arrives by SMS and is opened from
  another app, and `Strict` would drop the session on that navigation.

CSRF has two layers: `SameSite=Lax` blocks cross-site form posts, and
`src/proxy.ts` compares `Origin` against the served host on every unsafe method.

---

## Frontend

Server Components by default. The only Client Components are those that
genuinely need interactivity — currently the language switcher.

**No webfont is downloaded.** Every Android and iOS device that renders
Malayalam already ships a Malayalam font. Pulling a ~400 KB Malayalam webfont
over patchy mobile data to replace one the phone already has would be the single
most expensive thing on the page. `globals.css` names the system Malayalam
families for Android, iOS, Windows and Linux.

Base font size is 17px, not 16px: Malayalam glyphs carry more vertical detail
than Latin ones and become hard to read at Latin-first sizes. Line height is
correspondingly generous.

Native form controls throughout. A native `<select>` on Android opens the
platform picker — bigger, properly scrolling, already working with TalkBack.
Every custom dropdown is a downgrade for these users.

Minimum tap target 44px (`--spacing-touch`), referenced rather than repeated so
it cannot drift. Badges pair colour with a glyph and a word, because colour
alone fails for colour-blind users and in sunlight on a cheap screen.

JS budget is printed by `npm run bundle:report` and runs in CI.

---

## Deviations from the brief

| Brief said | What was built | Why |
|---|---|---|
| Locality hierarchy supports "this panchayat and adjacent ones" | Added a `LocalityAdjacency` edge table | A tree cannot express adjacency; neighbours cross block and district boundaries |
| Benchmark recursive CTEs for subtree queries | Materialised path + depth instead | Same result, one indexed `LIKE`, less code; tree is tiny and near-static |
| Prisma (unversioned) | Prisma 7 with a driver adapter | Current stable major; starting on 6 would force a migration in year one |
| `middleware.ts` | `src/proxy.ts` | Next 16 renamed the convention and deprecates the old name |
| Redis for rate limiting | Redis, with an in-process fallback in development | Local development should not require Redis; production refuses to boot without it |
| — | `ALLOW_RECOMMENDING_NON_USERS` defaults to off | The claim flow cannot protect a third party while SMS is a console stub |

---

## Open decisions — these are yours, not mine

These were flagged before M0 and have not been answered. Each has a default
recorded in code so work could continue; each is cheap to change now and
expensive later.

1. **Referrer eligibility.** Currently: any `active` person may recommend, with
   verified membership shown as a badge. The brief proposed restricting
   recommendation rights to verified KVVES members. That is defensible for
   trust and fatal for cold start — at launch there are no verified members, so
   there would be no recommendations and no reason for anyone to return. The
   gate exists in one place (`canRecommend` in the domain layer) and can be
   tightened with a one-line change.
2. **Default language.** Currently Malayalam, because the users are in Edakkara.
3. **Unclaimed profile expiry.** Currently 30 days, then personal data purged.
4. **Requirement expiry.** Currently 30 days, extendable by the poster.
5. **Employer verification before posting.** Currently not required — any
   person with a verified phone may post.
6. **SMS provider and budget.** Console stub only.
7. **`lower_case_table_names`** on the real development and production servers.
8. **Production hosting and who operates it after handover.**
9. **Native app within 12 months.** Assumed yes; the API is Route-Handler-first
   regardless.

---

## Security posture before deployment

- [ ] Rotate the database password that was circulated in the build brief.
      Treat it as compromised.
- [ ] Create a dedicated application user scoped to the `Koode` schema:
      `SELECT, INSERT, UPDATE, DELETE`, plus DDL only in environments where
      migrations run. Never `GRANT ALL`, never `WITH GRANT OPTION`, never a
      wildcard host. `root` is for local development only.
- [ ] Generate fresh `SESSION_SECRET` and `IP_HASH_SECRET`.
- [ ] Configure a real SMS provider, then turn on
      `ALLOW_RECOMMENDING_NON_USERS`.
- [ ] Provision Redis; production will refuse to start without it.
- [ ] Confirm `lower_case_table_names` matches between environments.
- [ ] Replace the placeholder consent text with copy approved for DPDP Act 2023.
