// Save a full copy of the database (every table, every row) to a JSON file.
//
// Reads DATABASE_URL from .env.local. Writes backups/backup-<date>_<time>.json.
// The backups/ folder is gitignored — the file contains customer data and
// password hashes, so copy it somewhere safe (Google Drive, a pen drive)
// rather than committing it.
//
// Run with:   npm run db:backup
// Restore:    npm run db:restore -- backups/backup-<date>_<time>.json

import fs from "node:fs";
import { config } from "dotenv";
import { backupToFile, formatBytes, fullError, poolFor } from "./lib/backup-lib.mjs";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set in .env.local");
  process.exit(1);
}

async function main() {
  const host = new URL(url).host;
  console.log("Backing up", host, "…");
  const pool = poolFor(url);
  const { file, tables, rowCount } = await backupToFile(pool, host).finally(() => pool.end());
  for (const [name, t] of Object.entries(tables)) {
    console.log(`  ${name.padEnd(22)} ${t.rows.length} rows`);
  }
  console.log(
    `\nSaved ${rowCount} rows from ${Object.keys(tables).length} tables to ${file}` +
      ` (${formatBytes(fs.statSync(file).size)}).`,
  );
}

main().catch((err) => {
  console.error("\nBackup failed:", fullError(err));
  process.exit(1);
});
