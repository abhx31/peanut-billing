"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createStaff } from "./actions";

export function AddStaffForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || password.length < 8) {
      toast.error("Fill name, email, and 8+ character password.");
      return;
    }
    startTransition(async () => {
      const res = await createStaff({ name: name.trim(), email: email.trim(), password });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Staff account created for ${name.trim()}`);
      setName("");
      setEmail("");
      setPassword("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-3 items-end">
      <div className="space-y-2">
        <Label htmlFor="staff-name">Name</Label>
        <Input
          id="staff-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="staff-email">Email</Label>
        <Input
          id="staff-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="employee@example.com"
          autoComplete="off"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="staff-password">Password (min 8)</Label>
        <Input
          id="staff-password"
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Share with staff in person"
          autoComplete="off"
        />
      </div>
      <div className="sm:col-span-3">
        <Button type="submit" disabled={pending}>
          <UserPlus className="mr-2 h-4 w-4" />
          {pending ? "Creating…" : "Create staff account"}
        </Button>
      </div>
    </form>
  );
}
