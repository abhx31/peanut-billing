// Quick read-only probe: list every user row with their role, disabled flag,
// and whether a password hash exists. Uses DATABASE_URL from .env.local, so
// make sure that's pointed at the DB you want to inspect before running.

import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set in .env.local");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

try {
  const { rows } = await pool.query(
    `SELECT email, role, disabled, (password_hash IS NOT NULL) AS has_pw,
            created_at
       FROM users
       ORDER BY created_at`,
  );
  if (rows.length === 0) {
    console.log("(no users in this DB)");
  } else {
    console.table(rows);
  }
} catch (err) {
  console.error("Query failed:", err.message, err.code ? `(${err.code})` : "");
  process.exit(1);
} finally {
  await pool.end();
}
