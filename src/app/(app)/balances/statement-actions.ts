"use server";

import { requireSession } from "@/lib/auth-helpers";
import { getCustomerStatement } from "@/lib/queries";

export async function fetchStatement(customer: string) {
  await requireSession();
  return getCustomerStatement(customer);
}
