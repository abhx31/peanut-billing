import { auth } from "@/auth";
import { redirect } from "next/navigation";

export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return session;
}

export async function requireOwner() {
  const session = await requireSession();
  if (session.user.role !== "owner") {
    throw new Error("Forbidden: owner role required");
  }
  return session;
}

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}
