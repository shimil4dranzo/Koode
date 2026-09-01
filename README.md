# Koode

A community employment platform for Edakkara, Kerala. A not-for-profit
initiative by **KVVES Edakkara**, with **Dranzo Techlabs LLP** as technology
partner.

Hiring in a small town runs on personal contacts: an employer fills a vacancy by
phoning a few people they happen to know, and a good worker's local reputation
leaves no record any new employer can check. Koode puts that spoken reference on
the record — who was recommended, by whom, and how the work turned out.

The unit that matters here is the **recommendation**, not the job post.

Next.js (App Router) · TypeScript · MySQL 8 · Prisma · installable PWA ·
English and Malayalam.

---

## Getting started

### What you need

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20.11+ (22 LTS recommended) | CI runs 22 |
| Docker | any recent | for MySQL 8 and Redis |
| Git | any recent | |

### Setup

```bash
git clone https://github.com/shimil4dranzo/Koode.git
cd Koode
npm install
```

Create your local environment file:

```bash
cp .env.example .env.local
```

Generate the two secrets it needs and paste them in:

```bash
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"
```

```bash
node -e "console.log('IP_HASH_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"
```

Set `DATABASE_URL`. For the bundled Docker stack:

```
DATABASE_URL="mysql://root:koode_local_dev@127.0.0.1:3306/Koode"
```

> `.env.local` is gitignored and must stay that way. No credential belongs in
> any committed file — not in the Prisma schema, not in Docker Compose, not in
> a test fixture, not in this README.

### Start the database

```bash
docker compose up -d
```

This starts MySQL 8.4 and Redis, with the charset, collation and
`lower_case_table_names` settings the app requires already pinned.

### Create the schema and seed it

```bash
npm run db:deploy && npm run db:seed
```

Then confirm the database really stores Malayalam:

```bash
npm run db:check
```

This writes real Malayalam — and a 4-byte emoji — to the database and reads it
back. It also prints `lower_case_table_names`, which is the most common cause
of a project working on macOS and failing on a Linux server. **Do not skip it,
and do not work around a failure.**

### Run it

```bash
npm run dev
```

Open <http://localhost:3000>. You will be redirected to `/ml` — Malayalam is the
default language; switch to English in the header.

### Signing in without an SMS provider

No SMS provider is configured. `SMS_PROVIDER=console` prints the one-time
password to the terminal running `npm run dev`, inside a box like this:

```
┌─ SMS (not sent — console provider) ───────────
│ kind : otp
│ to   : phone:a1b2c3d4e5  (+91 •••••• 2345)
│ body : Your Koode code is 123456
└───────────────────────────────────────────────
```

Copy the code into the browser. The app refuses to start in production with
this provider.

---

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run verify` | Typecheck, lint, migration charset check, unit tests |
| `npm test` | Unit tests |
| `npm run test:integration` | Integration tests (needs `TEST_DATABASE_URL`) |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run db:migrate` | Create and apply a migration, then normalise its collation |
| `npm run db:deploy` | Apply existing migrations (use this in deployment) |
| `npm run db:seed` | Load localities, categories and sample people |
| `npm run db:check` | Verify charset, collation and Malayalam round trip |
| `npm run db:studio` | Browse the database |
| `npm run bundle:report` | Print client JavaScript size against the budget |

### After changing `prisma/schema.prisma`

```bash
npm run db:migrate
```

`db:migrate` runs `prisma migrate dev` and then `scripts/normalize-migrations.ts`.
The second step is not optional: Prisma emits `utf8mb4_unicode_ci` and offers no
way to configure it, but Koode requires `utf8mb4_0900_ai_ci`. CI fails a
migration with the wrong collation.

---

## How the code is laid out

```
src/
  app/
    [locale]/          pages, locale-prefixed
    api/               Route Handlers — the real API surface
  components/          UI; Server Components unless interactivity is needed
    ui/                hand-built primitives (button, field, badge, card)
  i18n/                routing, request config, locale-aware navigation
  lib/                 tiny shared helpers
  server/
    domain/            pure business rules. No I/O, no framework, unit-tested
    services/          orchestration: domain + database + audit
    db/                Prisma client and connection handling
    auth/              sessions and OTP
    audit/             append-only event log
    ratelimit/         Redis-backed limiter
    sms/               sender interface and console stub
    http/              request parsing and the error-to-HTTP mapping
prisma/
  schema.prisma        the data model, heavily commented
  migrations/          never edit an applied migration
  seed.ts              seed runner
messages/
  en.json  ml.json     every user-facing string
scripts/               operator tools
docs/                  runbook and reference material
```

**The one architectural rule to know before you write anything:** business logic
belongs in `src/server/services` and `src/server/domain`, and every capability
must be reachable through a Route Handler under `/api`. A Capacitor wrapper and
a WhatsApp bot are both on the roadmap, and neither can call a Server Action.
`ARCHITECTURE.md` explains this and the rest of the reasoning.

---

## Working on the interface

Test at **360px**. Most users arrive on a low-end Android phone over patchy
mobile data.

Check both languages. Malayalam strings are typically longer than their English
equivalents and will overflow a component sized against English — this is a real
task, not a formality. The unit tests in `tests/i18n.test.ts` enforce that both
catalogues stay in step, that ICU placeholders match, and that Malayalam
strings actually contain Malayalam script.

Every user-facing string goes through `next-intl`. There are no exceptions, and
retrofitting one later is the single most expensive mistake available in this
codebase.

---

## Contributing

- Never commit to `main`. One branch per milestone: `feat/m1-identity`, etc.
- Small conventional commits: `feat:`, `fix:`, `chore:`, `test:`, `docs:`.
- Run `npm run verify` before pushing.
- Where you deviate from the build brief, record it in `ARCHITECTURE.md` with
  the reasoning.
- If you find a credential anywhere in the working tree, stop and raise it
  rather than committing.

---

## Documentation

| File | Contents |
|---|---|
| `ARCHITECTURE.md` | Decisions and reasoning; open questions; pre-deployment security checklist |
| `docs/RUNBOOK.md` | Deployment, backups, migration recovery |
| `prisma/schema.prisma` | The data model — commented as reference documentation |
