// Remove duplicate opening_payment rows (same opening_due_id + customer + date
// + mode + amount, created within the same session — the signature of a
// double-click Save). The oldest row of each pair is kept; later copies are
// deleted. Also cleans up any "Advance received" marker opening_due that ends
// up with no payments linked.
//
// Run with:  node scripts/dedupe-receipts.mjs
//            node scripts/dedupe-receipts.mjs --apply   (actually delete)
//
// Without --apply it only PRINTS what would be deleted (dry run). Use the dry
// run first, inspect, then re-run with --apply.

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

  const dupSql = `
    WITH ranked AS (
      SELECT
        id, opening_due_id, customer, date, mode, amount, created_at,
        ROW_NUMBER() OVER (
          PARTITION BY opening_due_id, customer, date, mode, amount
          ORDER BY created_at ASC
        ) AS rn
      FROM opening_payments
    )
    SELECT id, opening_due_id, customer, date::text as date, mode,
           amount::numeric as amount, created_at
    FROM ranked
    WHERE rn > 1
    ORDER BY customer, date, created_at
  `;

  const dupRes = await pool.query(dupSql);
  console.log(`=== opening_payment extras to remove (${dupRes.rows.length}) ===`);
  if (dupRes.rows.length === 0) {
    console.log("  (none)");
  } else {
    for (const r of dupRes.rows) {
      console.log(
        `  ${r.id.slice(0, 8)}  due=${r.opening_due_id.slice(0, 8)}  ${r.customer.padEnd(20)}  ${r.date}  ${r.mode}  ₹${r.amount}  created=${r.created_at.toISOString().slice(0, 19)}`,
      );
    }
  }

  const markerSql = `
    SELECT id, customer, date::text as date, note
    FROM opening_dues
    WHERE amount = 0
      AND note = 'Advance received'
      AND NOT EXISTS (
        SELECT 1 FROM opening_payments op
        WHERE op.opening_due_id = opening_dues.id
          AND op.id NOT IN (${dupRes.rows.length ? dupRes.rows.map((_, i) => `$${i + 1}`).join(",") : "NULL"})
      )
  `;
  const markerParams = dupRes.rows.map((r) => r.id);
  const markerRes = await pool.query(markerSql, markerParams);
  console.log(
    `\n=== Advance-received markers that would become orphaned (${markerRes.rows.length}) ===`,
  );
  if (markerRes.rows.length === 0) {
    console.log("  (none)");
  } else {
    for (const r of markerRes.rows) {
      console.log(`  ${r.id.slice(0, 8)}  ${r.customer.padEnd(20)}  ${r.date}`);
    }
  }

  if (!apply) {
    console.log(
      "\nDry run — nothing was deleted. Re-run with:  node scripts/dedupe-receipts.mjs --apply",
    );
    process.exit(0);
  }

  if (dupRes.rows.length === 0 && markerRes.rows.length === 0) {
    console.log("\nNothing to delete.");
    process.exit(0);
  }

  console.log("\nDeleting…");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (dupRes.rows.length > 0) {
      const ids = dupRes.rows.map((r) => r.id);
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
      const del = await client.query(
        `DELETE FROM opening_payments WHERE id IN (${placeholders})`,
        ids,
      );
      console.log(`  Deleted ${del.rowCount} duplicate opening_payment row(s)`);
    }
    const delMarker = await client.query(
      `DELETE FROM opening_dues
         WHERE amount = 0
           AND note = 'Advance received'
           AND NOT EXISTS (
             SELECT 1 FROM opening_payments WHERE opening_due_id = opening_dues.id
           )`,
    );
    console.log(`  Deleted ${delMarker.rowCount} orphaned Advance-received marker(s)`);
    await client.query("COMMIT");
    console.log("\nDone. Reload the app to see the clean state.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\nRolled back. Nothing was deleted. Error:", err);
    process.exit(1);
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
