import { drizzle, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";
import { pgConfig } from "./pg-config";

declare global {
  var __pgPool: Pool | undefined;
}

const pool =
  global.__pgPool ??
  new Pool(process.env.DATABASE_URL ? pgConfig(process.env.DATABASE_URL) : {});

if (process.env.NODE_ENV !== "production") global.__pgPool = pool;

export const db = drizzle(pool, { schema });
export { schema };

/** `db` or a transaction handle — lets read helpers run inside a transaction. */
export type DbExecutor = PgDatabase<NodePgQueryResultHKT, typeof schema>;
