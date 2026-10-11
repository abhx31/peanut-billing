"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FormActions, FormGrid } from "@/components/form";
import { createUser } from "./actions";

type Role = "owner" | "editor" | "staff";

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  editor: "Editor",
  staff: "Staff",
};

const ROLE_DESC: Record<Role, string> = {
  owner: "Full access, including cost / profit / patti and user management.",
  editor: "Same data access as owner (cost / profit / patti), but cannot manage users.",
  staff: "Bills, stock and payments only. No cost or profit visibility.",
};

export function AddStaffForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("staff");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || password.length < 8) {
      toast.error("Fill name, email, and 8+ character password.");
      return;
    }
    if (
      role === "owner" &&
      !confirm(
        `Create a second OWNER account for ${name.trim()}? Owners can see cost / profit and manage all users.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await createUser({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${ROLE_LABEL[role]} account created for ${name.trim()}`);
      setName("");
      setEmail("");
      setPassword("");
      setRole("staff");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <FormGrid cols={4}>
        <Field label="Name" htmlFor="user-name" required>
          <Input
            id="user-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
          />
        </Field>
        <Field label="Email" htmlFor="user-email" required>
          <Input
            id="user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@example.com"
            autoComplete="off"
          />
        </Field>
        <Field
          label="Password"
          htmlFor="user-password"
          required
          hint="Min 8 characters. Share with them in person."
        >
          <Input
            id="user-password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Role" required hint={ROLE_DESC[role]}>
          <Select value={role} onValueChange={(v) => setRole((v as Role) ?? "staff")}>
            <SelectTrigger className="w-full">
              <SelectValue>{(v) => ROLE_LABEL[(v as Role) ?? "staff"]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(["staff", "editor", "owner"] as const).map((r) => (
                <SelectItem key={r} value={r} label={ROLE_LABEL[r]}>
                  {ROLE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FormGrid>
      <FormActions>
        <Button type="submit" disabled={pending}>
          <UserPlus className="mr-2 h-4 w-4" />
          {pending ? "Creating…" : `Create ${ROLE_LABEL[role].toLowerCase()} account`}
        </Button>
      </FormActions>
    </form>
  );
}
