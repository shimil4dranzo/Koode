# Deploying Koode on cPanel / WHM

Koode is a Next.js server application — a long-running Node process, not static
files in `public_html`. It needs Node ≥ 20.11, MySQL, and Redis. This is the
runbook for bringing it up on a cPanel account (`/home/koodeorg`) from the
`koode-deploy.zip` you upload to the home directory.

Build happens **on the server**, on purpose: Prisma's query engine is compiled
per-platform, so a bundle built on a Mac will not run on the Linux host. The
zip is clean source; the server builds it.

---

## 0. Before you start

- **Node**: a WHM/cPanel Node.js version ≥ 20.11 must be selectable.
- **MySQL**: create a database and user in cPanel → *MySQL Databases*, and
  "Add User To Database" with **All Privileges** on that one schema. Note the
  names — cPanel prefixes them, e.g. `koodeorg_koode` and `koodeorg_app`.
- **Redis**: needed. On a WHM (root) box you can install it (step 4). On a
  shared account with no Redis, stop and read *If there is no Redis* at the end.
- **Domain + SSL**: the site must be reachable over https (cPanel AutoSSL).

All commands below are for the **cPanel account's** terminal (or WHM → Terminal,
then `su - koodeorg`). Replace `koodeorg` / `koode.org` with your real values.

---

## 1. Unzip into a clean app directory

Do NOT unzip into `public_html` — that folder is the web docroot and this app
does not serve from it. Use a sibling directory.

```
cd ~
rm -rf koode-app && mkdir koode-app
cd koode-app
unzip ~/koode-deploy.zip
ls package.json    # sanity: you should see it here
```

## 2. Pick the Node version and install

Use the cPanel-managed Node so `node`/`npm` are on PATH. In cPanel → *Setup
Node.js App*, or via the version manager on the box:

```
node -v        # must be >= 20.11
npm ci         # installs everything, including build + migration tools
```

If `npm ci` runs out of memory on a small plan, use `npm install --no-audit`.

## 3. Create the environment file

```
cp .env.production.example .env.local
# generate two distinct secrets:
echo "SESSION_SECRET=$(openssl rand -base64 48)"
echo "IP_HASH_SECRET=$(openssl rand -base64 48)"
nano .env.local     # paste the secrets, set DATABASE_URL, NEXT_PUBLIC_APP_URL
```

`DATABASE_URL` uses the cPanel DB + user you made, host `127.0.0.1`:

```
DATABASE_URL="mysql://koodeorg_app:THE_PASSWORD@127.0.0.1:3306/koodeorg_koode"
```

## 4. Redis

Check first — it may already be running:

```
redis-cli ping        # PONG means it is up; skip the install
```

If missing and you have **root** (WHM → Terminal, as root):

```
# AlmaLinux / CloudLinux / CentOS
dnf install -y redis && systemctl enable --now redis
redis-cli ping        # PONG
```

Leave `REDIS_URL="redis://127.0.0.1:6379"` in `.env.local`.

## 5. Database: migrate and seed

Migrations create the schema; the seed loads the real taxonomy, localities and
the launch anchor orgs (it skips the sample people/postings when
`NODE_ENV=production`).

```
export NODE_ENV=production
npx prisma generate          # fetches the LINUX query engine
npx prisma migrate deploy    # creates all tables
npm run db:seed              # taxonomy, localities, anchor orgs, admins
```

To make yourself an admin, put your phone in `SEED_ADMIN_PHONES` in
`.env.local` before `db:seed` (that account must already exist, or create it
after first sign-up and re-run the seed).

## 6. Build

```
export NODE_ENV=production
npm run build
```

This produces `.next/` and, because the app is configured `output: 'standalone'`,
a self-contained server at `.next/standalone/server.js`. Copy the static assets
next to it (Next does not do this step for you):

```
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
```

## 7. Run it on your assigned port

Use the port this account is allotted (the one already reverse-proxied to your
domain — check *Setup Node.js App* or ask your host; do not invent one). Call
it `PORT` below.

Keep it alive with pm2 (survives logout and reboots):

```
npm i -g pm2 2>/dev/null || npx pm2 --version
cd ~/koode-app
PORT=XXXXX NODE_ENV=production pm2 start .next/standalone/server.js --name koode
pm2 save
pm2 startup      # run the line it prints, as root, to start on boot
```

`server.js` listens on `$PORT`. Confirm:

```
curl -sI http://127.0.0.1:XXXXX/en | head -1     # HTTP/1.1 200 OK
pm2 logs koode --lines 40                          # watch for boot errors
```

If env is wrong the process exits immediately with a clear message naming the
variable (that is `env.ts` doing its job). Fix `.env.local` and
`pm2 restart koode`.

## 8. Point the domain at it

The domain must reverse-proxy to `127.0.0.1:XXXXX`. If you used cPanel's *Setup
Node.js App*, set the **Application startup file** to
`.next/standalone/server.js` and it wires the proxy for you (it also sets
`PORT`, so you can skip pm2 and let Passenger run it). Otherwise your host's
proxy (Application Manager / a proxy rule) should already send the domain to the
assigned port.

Then open `https://koode.org/en` — you should see the home page with live data.

---

## Updating later

```
cd ~/koode-app
unzip -o ~/koode-deploy.zip        # overwrite with the new build
npm ci
export NODE_ENV=production
npx prisma migrate deploy          # applies any new migrations
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
pm2 restart koode
```

## If there is no Redis

Production deliberately refuses to boot without Redis, because the rate limiter
is otherwise per-process and protects nothing behind more than one instance.
The right fix is to install Redis (step 4). If your host cannot, that is a
decision to make with eyes open — a single-instance deploy with an in-process
limiter is weaker but not nothing. It needs a small code change to `env.ts`,
not an env var; ask before shipping that, and never do it behind a load
balancer.

## The three things that stop a boot (by design)

- `REDIS_URL` unset → refused. Install Redis.
- `NEXT_PUBLIC_APP_URL` not `https://` → refused. Use your real https domain.
- `ALLOW_RECOMMENDING_NON_USERS=true` with `SMS_PROVIDER=console` → refused.
  Leave the claim flow off for launch (it needs a real SMS provider).
