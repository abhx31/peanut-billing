import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export async function getPattiBillsByDate(date: string) {
  return db
    .select()
    .from(schema.pattiBills)
    .where(eq(schema.pattiBills.date, date))
    .orderBy(desc(schema.pattiBills.createdAt));
}

export async function getPattiLotNameSuggestions() {
  const rows = await db
    .selectDistinct({ lotName: schema.pattiBills.lotName })
    .from(schema.pattiBills);
  return rows
    .map((r) => r.lotName)
    .filter((x): x is string => !!x)
    .sort();
}
