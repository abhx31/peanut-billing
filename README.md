# Peanut Billing — Next.js port

Production port of the single-file Peanut Trading billing app (`../peanut-billing/src/index.html`) to:

- **Next.js 16** (App Router, Turbopack) + **React 19** + **Tailwind v4** + **shadcn/ui** (Base UI)
- **Neon** serverless Postgres + **Drizzle ORM** (SQL migrations in `drizzle/`)
- **Auth.js v5** (NextAuth beta) with Credentials provider + Drizzle adapter

The source of truth for business rules is still `../peanut-billing/README.md`.

## Setup

1. **Install deps**

   ```bash
   npm install
   ```

2. **Create a Neon database.** Grab the connection string (pooled or direct — pooled is fine for this app).

3. **Fill in `.env.local`** (copy from `.env.example`):

   ```env
   DATABASE_URL=postgresql://user:password@ep-example.region.neon.tech/peanut_billing?sslmode=require
   AUTH_SECRET=<openssl rand -base64 32>
   AUTH_URL=http://localhost:3000

   OWNER_EMAIL=you@yourfirm.com
   OWNER_PASSWORD=at-least-8-characters
   OWNER_NAME="Your Name"
   ```

4. **Run migrations** against that database:

   ```bash
   npm run db:migrate
   ```

   This applies every `.sql` file in `drizzle/` in order and tracks them in the `__drizzle_migrations` table — so pointing at a fresh database and re-running just works.

5. **Seed the owner account** (idempotent — re-run anytime):

   ```bash
   npm run db:seed
   ```

   This upserts the user from `OWNER_EMAIL` / `OWNER_PASSWORD` / `OWNER_NAME` and promotes them to `owner`. Re-running updates the password/name but keeps the account.

6. **Dev server**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000, sign in with the owner credentials you just seeded.

## Changing the database URL

1. Update `DATABASE_URL` in `.env.local` (or on Vercel).
2. `npm run db:migrate` — rebuild schema.
3. `npm run db:seed` — re-create the owner account.

## Adding staff accounts

Public signup is **disabled**. To create a staff account today, either:

- Run a quick INSERT in the Neon SQL editor (hash the password first with `node -e "console.log(require('bcryptjs').hashSync('their-password', 10))"`), or
- Extend the Settings page with an "invite staff" form (not shipped yet).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server with Turbopack |
| `npm run build` | Production build |
| `npm run db:generate` | Diff `src/db/schema.ts` → new SQL migration file |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Upsert the owner account from env vars |
| `npm run db:push` | Push schema directly without a migration file (dev only) |
| `npm run db:studio` | Open Drizzle Studio |

## Roles

- **owner** — sees cost/kg on lots, sees profit on the Profit tab, can set opening cash/bank balances, firm name, hamali default. Firm settings page is owner-only.
- **staff** — can create bills, add lots, receive payments, record expenses. Cost and profit values are never fetched for staff sessions.

Role enforcement is **application-level**: `src/lib/auth-helpers.ts` exposes `requireOwner()`, and every query that reads cost or profit must sit behind an owner check. There is no Postgres RLS because the app connects as a single Postgres role.

## Schema highlights

- `bills.fy` + `bills.no` has a `UNIQUE INDEX` + a `next_bill_no(fy text)` SQL function that uses a transaction-scoped advisory lock. This prevents the duplicate-bill-number race the original README flagged.
- Stock is **derived** (`SUM(stock_in.bags) - SUM(bills.bags)` per lot), not a mutable counter — multi-device safe.
- Payments live in a separate `payments` table, not as an array on the bill.
- `lot_costs` is a separate table; staff queries never join it.
- `lots.deleted_at` for soft-delete — bills keep their lot-name snapshot.
- Money columns use `numeric(14, 2)` (14, 3 for kg) — never floats.

## What's shipped

- **Auth** — sign-in only (no public signup); owner seeded via `db:seed`
- **Dashboard** — KPIs, 14-day sales chart, latest bills, stock snapshot, low-stock warning
- **New bill** — full form with weight shorthand (`50x40.5`), live preview, server-side bill numbering
- **Lots** — add lot, add bags, set cost (owner), soft-delete
- **Daily summary** — sales/cash/UPI/credit per date, bills table with actions
- **Stock** — current stock + latest 30 stock-in entries
- **Daily ledger** — opening/closing cash & bank, printable
- **Expenses** — add/list/delete with category suggestions
- **Balances** — customer-wise billed/paid/balance, receive flow (oldest-first), CSV / JSON backup
- **Profit** — owner-only, FY selector, by lot and per bill
- **Settings** — owner edits firm name, hamali default, opening cash/bank
- **Printable bill** — `/bills/[id]/print`
- Dark mode toggle, sidebar layout, status badges
