import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import * as schema from "./schema";
import { pgConfig } from "./pg-config";

config({ path: ".env.local" });

async function main() {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD;
  const name = process.env.OWNER_NAME?.trim();

  if (!email || !password || !name) {
    console.error(
      "Seed aborted: OWNER_EMAIL, OWNER_PASSWORD, and OWNER_NAME must all be set in .env.local",
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Seed aborted: OWNER_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("Seed aborted: DATABASE_URL is not set.");
    process.exit(1);
  }

  const pool = new Pool(pgConfig(process.env.DATABASE_URL));
  const db = drizzle(pool, { schema });

  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });

  if (existing) {
    await db
      .update(schema.users)
      .set({ name, passwordHash, role: "owner" })
      .where(eq(schema.users.id, existing.id));
    console.log(`Owner "${name}" (${email}) updated and promoted to owner.`);
  } else {
    await db.insert(schema.users).values({
      name,
      email,
      passwordHash,
      role: "owner",
    });
    console.log(`Owner "${name}" (${email}) created.`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
