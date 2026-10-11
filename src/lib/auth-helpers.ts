import { auth } from "@/auth";
import { redirect } from "next/navigation";

export type Role = "owner" | "editor" | "staff";

export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return session;
}

/** Owner-only (highest privilege). Editors do NOT pass this check. */
export async function requireOwner() {
  const session = await requireSession();
  if (session.user.role !== "owner") {
    throw new Error("Forbidden: owner role required");
  }
  return session;
}

/** Owner or editor — i.e. anyone with full data access (cost, profit, patti, etc.). */
export async function requireOwnerOrEditor() {
  const session = await requireSession();
  if (session.user.role !== "owner" && session.user.role !== "editor") {
    throw new Error("Forbidden: owner or editor role required");
  }
  return session;
}

/** True when the session can see cost / profit / patti data (owner or editor). */
export function canSeePrivate(role: Role | undefined): boolean {
  return role === "owner" || role === "editor";
}

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}
