// Wipe EVERY opening_payment row and clean up orphaned Advance-received
// markers. Keeps bill payments and real old-due rows intact.
//
// Run with:  node scripts/wipe-opening-payments.mjs            (dry run)
//            node scripts/wipe-opening-payments.mjs --apply    (actually delete)

import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const apply = process.argv.includes("--apply");

const pool = new pg.Pool({
  connectionString: url,
  ssl: url.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
});

try {
  console.log("DB:", new URL(url).host);
  console.log("Mode:", apply ? "APPLY (destructive)" : "DRY RUN");
  console.log("");

  const r = await pool.query(
    `select date::text as date, mode, amount::numeric as amount, customer
       from opening_payments
       order by date desc, created_at desc`,
  );
  console.log(`=== opening_payment rows to delete (${r.rows.length}) ===`);
  if (r.rows.length === 0) console.log("  (none)");
  else
    for (const row of r.rows) {
      console.log(
        `  ${row.date}  ${row.mode.padEnd(4)}  ₹${String(row.amount).padStart(10)}  ${row.customer}`,
      );
    }

  const markers = await pool.query(
    `select id, customer, date::text as date
       from opening_dues
       where amount = 0
         and note = 'Advance received'`,
  );
  console.log(
    `\n=== Advance-received markers that would become orphaned (${markers.rows.length}) ===`,
  );
  if (markers.rows.length === 0) console.log("  (none)");
  else
    for (const m of markers.rows) {
      console.log(`  ${m.id.slice(0, 8)}  ${m.customer}  ${m.date}`);
    }

  if (!apply) {
    console.log(
      "\nDry run — nothing was deleted. Re-run with:  node scripts/wipe-opening-payments.mjs --apply",
    );
    process.exit(0);
  }

  if (r.rows.length === 0 && markers.rows.length === 0) {
    console.log("\nNothing to delete.");
    process.exit(0);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const del1 = await client.query("DELETE FROM opening_payments");
    console.log(`\n  Deleted ${del1.rowCount} opening_payment row(s)`);
    const del2 = await client.query(
      `DELETE FROM opening_dues
         WHERE amount = 0
           AND note = 'Advance received'
           AND NOT EXISTS (SELECT 1 FROM opening_payments WHERE opening_due_id = opening_dues.id)`,
    );
    console.log(`  Deleted ${del2.rowCount} orphaned Advance-received marker(s)`);
    await client.query("COMMIT");
    console.log(
      "\nDone. Reload the app — Receivables' Received columns reset to ₹0, Daily ledger's Money-received drops back to just bill payments.",
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\nRolled back:", err);
    process.exit(1);
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
