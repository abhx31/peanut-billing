// Wipes all business data while keeping user auth intact.
// Reads DATABASE_URL from .env.local.
// Run with:  npm run db:clean
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL is not set. Put it in .env.local and try again.",
  );
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: url.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : undefined,
});

try {
  console.log("Cleaning business data…");
  await pool.query(`
    BEGIN;
    TRUNCATE TABLE
      fy_archives,
      closings,
      hamali_paid,
      cj_settlements,
      opening_payments,
      opening_dues,
      payments,
      bill_items,
      bills,
      patti_bills,
      expenses,
      transfers,
      stock_in,
      lot_costs,
      lots,
      gst_customers,
      settings
    RESTART IDENTITY CASCADE;
    COMMIT;
  `);

  const { rows } = await pool.query(`
    SELECT 'users'              AS t, COUNT(*)::int AS c FROM users
    UNION ALL SELECT 'accounts',       COUNT(*)::int FROM accounts
    UNION ALL SELECT 'sessions',       COUNT(*)::int FROM sessions
    UNION ALL SELECT 'bills',          COUNT(*)::int FROM bills
    UNION ALL SELECT 'bill_items',     COUNT(*)::int FROM bill_items
    UNION ALL SELECT 'payments',       COUNT(*)::int FROM payments
    UNION ALL SELECT 'lots',           COUNT(*)::int FROM lots
    UNION ALL SELECT 'stock_in',       COUNT(*)::int FROM stock_in
    UNION ALL SELECT 'transfers',      COUNT(*)::int FROM transfers
    UNION ALL SELECT 'expenses',       COUNT(*)::int FROM expenses
    UNION ALL SELECT 'patti_bills',    COUNT(*)::int FROM patti_bills
    UNION ALL SELECT 'hamali_paid',    COUNT(*)::int FROM hamali_paid
    UNION ALL SELECT 'cj_settlements', COUNT(*)::int FROM cj_settlements
    UNION ALL SELECT 'opening_dues',   COUNT(*)::int FROM opening_dues
    UNION ALL SELECT 'opening_payments', COUNT(*)::int FROM opening_payments
    UNION ALL SELECT 'gst_customers',  COUNT(*)::int FROM gst_customers
    UNION ALL SELECT 'closings',       COUNT(*)::int FROM closings
    UNION ALL SELECT 'fy_archives',    COUNT(*)::int FROM fy_archives
    UNION ALL SELECT 'settings',       COUNT(*)::int FROM settings
    UNION ALL SELECT 'lot_costs',      COUNT(*)::int FROM lot_costs
    ORDER BY t;
  `);

  console.log("\nRow counts after cleanup:");
  for (const r of rows) {
    console.log(`  ${r.t.padEnd(20)} ${r.c}`);
  }
  console.log("\nDone. Users and sessions preserved.");
} catch (err) {
  console.error("Cleanup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await pool.end();
}
