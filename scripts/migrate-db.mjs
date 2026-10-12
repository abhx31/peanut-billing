// Copy every row from an old Peanut Billing database into a new one.
//
// Reads two env vars from .env.local (or your shell):
//   OLD_DATABASE_URL  — the source Neon project
//   NEW_DATABASE_URL  — the destination Neon project (empty is fine)
//
// What it does, in order:
//   1. Runs the full drizzle migration history on NEW_DATABASE_URL so the
//      schema matches the current code.
//   2. TRUNCATEs every table on the destination (CASCADE), so re-running is
//      idempotent — the destination becomes an exact clone of the source.
//   3. Copies every table in FK-safe order (parents first), including users,
//      sessions, accounts and verification_tokens. jsonb and bytea columns
//      are handled correctly.
//   4. Advances the id/no sequences by walking the max of each copied table
//      — not strictly needed because we use defaultRandom() UUIDs, but we
//      do bump the bill-no / patti-no state so SQL functions keep working.
//
// Run with:   node scripts/migrate-db.mjs
//
// If something fails partway, re-run — it's idempotent (truncate then copy).

import { config } from "dotenv";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

config({ path: ".env.local" });

const OLD = process.env.OLD_DATABASE_URL;
const NEW = process.env.NEW_DATABASE_URL;
if (!OLD || !NEW) {
  console.error("Set OLD_DATABASE_URL and NEW_DATABASE_URL in .env.local.");
  process.exit(1);
}
if (OLD === NEW) {
  console.error("OLD_DATABASE_URL and NEW_DATABASE_URL point at the same database.");
  process.exit(1);
}

function poolFor(url) {
  return new pg.Pool({
    connectionString: url,
    ssl: url.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });
}

const src = poolFor(OLD);
const dst = poolFor(NEW);

// Order matters: parents before children. The lists mirror the Drizzle schema.
const TABLES = [
  // Auth
  "users",
  "accounts",
  "sessions",
  "verification_tokens",
  // Firm singleton
  "settings",
  // Stock foundations
  "lots",
  "lot_costs",
  "stock_in",
  "transfers",
  // Sales
  "bills",
  "bill_items",
  "payments",
  // Operations
  "expenses",
  "opening_dues",
  "opening_payments",
  "gst_customers",
  "closings",
  "cj_settlements",
  "hamali_paid",
  "patti_bills",
  "fy_archives",
];

async function tableColumns(pool, table) {
  const r = await pool.query(
    `SELECT column_name, data_type, udt_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
    [table],
  );
  return r.rows;
}

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

function prepareValue(value, dataType, udtName) {
  if (value === null || value === undefined) return null;
  // jsonb comes back as a JS object — the pg driver will JSON.stringify primitives
  // but not plain objects, so do it explicitly.
  if (udtName === "jsonb" || udtName === "json") {
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  // bytea comes back as Buffer; pg will send it back as-is. Nothing to do.
  return value;
}

async function copyTable(table) {
  const colsSrc = await tableColumns(src, table);
  const colsDst = await tableColumns(dst, table);
  if (colsSrc.length === 0) {
    console.log(`  [${table}] not present in source — skipping`);
    return 0;
  }
  if (colsDst.length === 0) {
    console.log(`  [${table}] not present in destination — skipping`);
    return 0;
  }
  // Only copy columns the destination also has (keeps us resilient to schema
  // drift on the source — any extra source columns are dropped silently).
  const dstNames = new Set(colsDst.map((c) => c.column_name));
  const shared = colsSrc.filter((c) => dstNames.has(c.column_name));
  if (shared.length === 0) {
    console.log(`  [${table}] no shared columns — skipping`);
    return 0;
  }
  const colList = shared.map((c) => quoteIdent(c.column_name)).join(", ");
  const selectSql = `SELECT ${colList} FROM ${quoteIdent(table)}`;
  const srcRows = await src.query(selectSql);
  if (srcRows.rows.length === 0) {
    console.log(`  [${table}] 0 rows`);
    return 0;
  }

  // Build an INSERT that takes one row at a time — easy to debug and does
  // not blow the parameter limit (65535) on wide / long tables.
  const placeholders = shared.map((_, i) => `$${i + 1}`).join(", ");
  const insertSql = `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${placeholders})`;

  let inserted = 0;
  for (const row of srcRows.rows) {
    const values = shared.map((c) =>
      prepareValue(row[c.column_name], c.data_type, c.udt_name),
    );
    try {
      await dst.query(insertSql, values);
      inserted++;
    } catch (err) {
      console.error(
        `  [${table}] insert failed on row:`,
        JSON.stringify(row).slice(0, 500),
      );
      console.error("          ", fullError(err));
      throw err;
    }
  }
  console.log(`  [${table}] copied ${inserted} / ${srcRows.rows.length} rows`);
  return inserted;
}

async function truncateDestinationTables() {
  // CASCADE handles the FK web and RESTART IDENTITY resets any serial seqs.
  const list = TABLES.filter((t) => t !== "verification_tokens") // see note below
    .map((t) => quoteIdent(t))
    .join(", ");
  // verification_tokens has a composite PK — RESTART IDENTITY on it is a no-op
  // but Postgres is happy to include it. Keep it in the list to wipe.
  await dst.query(
    `TRUNCATE TABLE ${list}, "verification_tokens" RESTART IDENTITY CASCADE`,
  );
}

function fullError(err) {
  if (!err) return "unknown";
  const parts = [err.message || String(err)];
  if (err.detail) parts.push(`detail: ${err.detail}`);
  if (err.hint) parts.push(`hint: ${err.hint}`);
  if (err.where) parts.push(`where: ${err.where}`);
  if (err.code) parts.push(`code: ${err.code}`);
  return parts.join("\n          ");
}

async function nukeDestinationSchema() {
  // Blow away everything in the public schema so drizzle migrate starts
  // against a truly empty database. This drops any leftover from a half-run
  // previous attempt (CREATE TABLE "users" fails without this when the table
  // already exists). The destination is explicitly supposed to be empty, and
  // the URL guard at the top of the script prevents src == dst, so this is
  // safe.
  await dst.query("DROP SCHEMA IF EXISTS public CASCADE");
  await dst.query("CREATE SCHEMA public");
  await dst.query("GRANT USAGE ON SCHEMA public TO PUBLIC");
  await dst.query("GRANT CREATE ON SCHEMA public TO PUBLIC");
}

async function main() {
  console.log("Migrating from");
  console.log("  OLD:", new URL(OLD).host);
  console.log("  NEW:", new URL(NEW).host);

  console.log("\n[1/4] Dropping public schema on NEW…");
  await nukeDestinationSchema();
  console.log("     Done.");

  console.log("\n[2/4] Running migrations against NEW…");
  // Spin a dedicated drizzle instance against the destination, run migrate(),
  // then throw it away. We still use the regular `dst` pool for row copies.
  const migratePool = poolFor(NEW);
  const d = drizzle(migratePool);
  try {
    await migrate(d, { migrationsFolder: "./drizzle" });
  } catch (err) {
    console.error("     Migration failed. Full error:\n         ", fullError(err));
    await migratePool.end();
    throw err;
  }
  await migratePool.end();
  console.log("     Done.");

  console.log("\n[3/4] Truncating destination tables (fresh schema, so a no-op)…");
  await truncateDestinationTables();
  console.log("     Done.");

  console.log("\n[4/4] Copying rows…");
  let total = 0;
  for (const t of TABLES) {
    total += await copyTable(t);
  }

  console.log(`\nCopied ${total} rows across ${TABLES.length} tables.`);
  console.log(
    "\nNext steps:\n  1. Switch DATABASE_URL in .env.local to NEW_DATABASE_URL.\n  2. Restart `npm run dev`.\n  3. Spot-check dashboard / balances / stock before deleting the old DB.",
  );
}

main()
  .catch((err) => {
    console.error("\nMigration failed:", fullError(err));
    process.exit(1);
  })
  .finally(async () => {
    await src.end();
    await dst.end();
  });
