"use server";

import { requireSession } from "@/lib/auth-helpers";
import { getCustomerStatement } from "@/lib/queries";
import { getCurrentLoc } from "@/lib/loc";

export async function fetchStatement(customer: string) {
  await requireSession();
  return getCustomerStatement(customer, await getCurrentLoc());
}
