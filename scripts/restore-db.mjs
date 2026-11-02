// Restore a backup made by `npm run db:backup`. This REPLACES all data in the
// target database with the contents of the backup file.
//
// Target: RESTORE_DATABASE_URL if set, otherwise DATABASE_URL (.env.local).
// To restore into a brand-new Neon project, set RESTORE_DATABASE_URL to it —
// the schema is created automatically.
//
// What it does, in order:
//   1. Asks you to type the target host to confirm.
//   2. Saves a safety backup of the target first (backups/pre-restore-*.json),
//      so a restore can itself be undone.
//   3. Runs the drizzle migrations so the schema matches the current code.
//   4. In ONE transaction: empties every table and inserts the backup's rows,
//      parents before children. If anything fails, nothing is changed.
//
// Run with:   npm run db:restore -- backups/backup-<date>_<time>.json

import fs from "node:fs";
import readline from "node:readline/promises";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  FORMAT,
  backupToFile,
  fullError,
  insertOrder,
  insertRows,
  listMigrations,
  listTables,
  poolFor,
  quoteIdent,
  tableColumns,
} from "./lib/backup-lib.mjs";

config({ path: ".env.local" });

const file = process.argv[2];
const url = process.env.RESTORE_DATABASE_URL || process.env.DATABASE_URL;

if (!file) {
  console.error("Usage: npm run db:restore -- backups/<file>.json");
  process.exit(1);
}
if (!url) {
  console.error("Set DATABASE_URL (or RESTORE_DATABASE_URL) in .env.local");
  process.exit(1);
}

async function main() {
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  if (backup.format !== FORMAT) {
    throw new Error(`${file} is not a Peanut Billing backup file`);
  }
  const host = new URL(url).host;
  const backupTables = Object.keys(backup.tables);
  const backupRows = Object.values(backup.tables).reduce((n, t) => n + t.rows.length, 0);

  console.log(`Backup file : ${file}`);
  console.log(`  taken     : ${new Date(backup.createdAt).toLocaleString()} from ${backup.host}`);
  console.log(`  contents  : ${backupRows} rows in ${backupTables.length} tables`);
  console.log(`\nTarget      : ${host}`);
  console.log("ALL current data in the target will be replaced by the backup.\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Type the target host to confirm (${host}): `);
  rl.close();
  if (answer.trim() !== host) {
    console.log("Host did not match — nothing changed.");
    return;
  }

  const pool = poolFor(url);
  let client;
  try {
    console.log("\n[1/3] Saving a safety backup of the target…");
    const safety = await backupToFile(pool, host, "pre-restore");
    console.log(`      Saved ${safety.rowCount} rows to ${safety.file}`);

    console.log("\n[2/3] Running migrations on the target…");
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });

    client = await pool.connect();
    const applied = await listMigrations(client);
    if (backup.migrations.length > applied.length) {
      throw new Error(
        `The backup was taken on a newer version of the app (${backup.migrations.length} ` +
          `migrations vs ${applied.length} here). Pull the latest code and try again.`,
      );
    }

    console.log("\n[3/3] Replacing data (one transaction)…");
    const targetTables = new Set(await listTables(client));
    const missing = backupTables.filter((t) => !targetTables.has(t));
    if (missing.length) {
      console.log(`  ignoring tables no longer in schema: ${missing.join(", ")}`);
    }
    const tables = backupTables.filter((t) => targetTables.has(t));

    await client.query("BEGIN");
    await client.query(
      `TRUNCATE TABLE ${[...targetTables].map(quoteIdent).join(", ")} CASCADE`,
    );
    let total = 0;
    for (const table of await insertOrder(client, tables)) {
      const { columns, rows } = backup.tables[table];
      const n = await insertRows(client, table, columns, rows, await tableColumns(client, table));
      console.log(`  ${table.padEnd(22)} ${n} rows`);
      total += n;
    }
    await client.query("COMMIT");
    console.log(`\nRestored ${total} rows into ${host}.`);
    console.log(`If this was a mistake, restore ${safety.file} the same way.`);
  } catch (err) {
    await client?.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client?.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("\nRestore failed — the target's data was not changed:\n ", fullError(err));
  process.exit(1);
});
