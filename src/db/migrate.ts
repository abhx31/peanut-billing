import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { pgConfig } from "./pg-config";

config({ path: ".env.local" });

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set in .env.local");
  }

  const pool = new Pool(pgConfig(process.env.DATABASE_URL));

  const db = drizzle(pool);
  console.log("Running migrations against", new URL(process.env.DATABASE_URL).host);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("Migrations complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
