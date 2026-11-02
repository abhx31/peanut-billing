// Shared helpers for scripts/backup-db.mjs and scripts/restore-db.mjs.
//
// A backup is one JSON file:
//   {
//     format: "peanut-billing-backup", version: 1,
//     createdAt, host,
//     migrations: [{ hash, created_at }],   // drizzle.__drizzle_migrations
//     tables: { [name]: { columns: [...], rows: [[...], ...] } }
//   }
//
// Every value is stored as Postgres's own text form (the type parsers are
// switched off while reading), so timestamps, numerics, jsonb and bytea
// round-trip exactly — nothing passes through JS Date / Number.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

export const FORMAT = "peanut-billing-backup";
export const BACKUP_DIR = "backups";

// Same TLS handling as src/db/pg-config.ts: strip sslmode from the URL and
// apply it as a verified-certificate `ssl` option instead.
export function poolFor(databaseUrl) {
  const url = new URL(databaseUrl);
  const mode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  return new pg.Pool({
    connectionString: url.toString(),
    ssl: mode && mode !== "disable" ? { rejectUnauthorized: true } : undefined,
  });
}

// Return every value as the raw text Postgres sent.
const RAW = { getTypeParser: () => (value) => value };

export function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

export async function listTables(client) {
  const r = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  return r.rows.map((row) => row.table_name);
}

// Writable columns of a public table with their full SQL type, e.g. numeric(12,2).
export async function tableColumns(client, table) {
  const r = await client.query(
    `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = $1
        AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
      ORDER BY a.attnum`,
    [table],
  );
  return r.rows;
}

export async function listMigrations(client) {
  // Checked up front rather than try/catch: a failed query would abort the
  // surrounding transaction in dumpDatabase.
  const exists = await client.query(
    `SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS ok`,
  );
  if (!exists.rows[0].ok) return []; // brand-new database
  const r = await client.query(
    `SELECT hash, created_at::text AS created_at
       FROM drizzle.__drizzle_migrations ORDER BY created_at`,
  );
  return r.rows;
}

// All rows of one public table as { columns, rows }, values in raw text form.
export async function readTable(client, table) {
  const columns = (await tableColumns(client, table)).map((c) => c.name);
  const r = await client.query({
    text: `SELECT ${columns.map(quoteIdent).join(", ")} FROM ${quoteIdent(table)}`,
    rowMode: "array",
    types: RAW,
  });
  return { columns, rows: r.rows };
}

// Read every public table inside one REPEATABLE READ snapshot so the backup
// is consistent even if someone is saving a bill while it runs.
export async function dumpDatabase(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const migrations = await listMigrations(client);
    const tables = {};
    for (const table of await listTables(client)) {
      tables[table] = await readTable(client, table);
    }
    await client.query("COMMIT");
    return { migrations, tables };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Postgres caps a statement at 65535 parameters; stay well under it.
const MAX_PARAMS = 30000;

// Order tables so every table comes after the tables its foreign keys point at.
export async function insertOrder(client, tables) {
  const r = await client.query(
    `SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
       FROM pg_constraint c
       JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'f' AND n.nspname = 'public'`,
  );
  const unquote = (name) => name.replace(/^"|"$/g, "");
  const parents = new Map(tables.map((t) => [t, new Set()]));
  for (const { child, parent } of r.rows) {
    const c = unquote(child);
    const p = unquote(parent);
    if (c !== p && parents.has(c) && parents.has(p)) parents.get(c).add(p);
  }
  const order = [];
  const done = new Set();
  const visit = (t, stack = new Set()) => {
    if (done.has(t)) return;
    if (stack.has(t)) throw new Error(`Foreign-key cycle involving ${t}`);
    stack.add(t);
    for (const p of parents.get(t)) visit(p, stack);
    stack.delete(t);
    done.add(t);
    order.push(t);
  };
  tables.forEach((t) => visit(t));
  return order;
}

export async function insertRows(client, table, columns, rows, targetColumns) {
  const types = new Map(targetColumns.map((c) => [c.name, c.type]));
  // Only columns the target still has; a column added since the backup gets its default.
  const keep = columns
    .map((name, i) => ({ name, i }))
    .filter((c) => types.has(c.name));
  const dropped = columns.filter((name) => !types.has(name));
  if (dropped.length) {
    console.log(`  [${table}] ignoring columns no longer in schema: ${dropped.join(", ")}`);
  }
  if (rows.length === 0 || keep.length === 0) return 0;

  const colList = keep.map((c) => quoteIdent(c.name)).join(", ");
  const chunkSize = Math.max(1, Math.min(1000, Math.floor(MAX_PARAMS / keep.length)));
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const values = [];
    const tuples = chunk.map((row) => {
      const placeholders = keep.map((c) => {
        values.push(row[c.i]);
        return `$${values.length}::${types.get(c.name)}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    await client.query(
      `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES ${tuples.join(", ")}`,
      values,
    );
  }
  return rows.length;
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
  );
}

// Dump the database behind `pool` to backups/<prefix>-<timestamp>.json.
export async function backupToFile(pool, host, prefix = "backup") {
  const { migrations, tables } = await dumpDatabase(pool);
  const backup = {
    format: FORMAT,
    version: 1,
    createdAt: new Date().toISOString(),
    host,
    migrations,
    tables,
  };
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `${prefix}-${timestamp()}.json`);
  fs.writeFileSync(file, JSON.stringify(backup));
  const rowCount = Object.values(tables).reduce((n, t) => n + t.rows.length, 0);
  return { file, tables, rowCount };
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function fullError(err) {
  if (!err) return "unknown";
  const parts = [err.message || String(err)];
  if (err.detail) parts.push(`detail: ${err.detail}`);
  if (err.hint) parts.push(`hint: ${err.hint}`);
  if (err.code) parts.push(`code: ${err.code}`);
  // Drizzle wraps driver errors; the useful message is on err.cause.
  if (err.cause?.message) parts.push(`cause: ${err.cause.message}`);
  if (err.cause?.code === "ENOTFOUND") {
    parts.push("hint: DNS could not resolve the database host — check your DNS / network");
  }
  return parts.join("\n  ");
}
