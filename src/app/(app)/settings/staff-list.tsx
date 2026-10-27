"use client";

import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { ToggleDisabledButton } from "./toggle-disabled-button";
import { deleteStaff } from "./actions";

type User = {
  id: string;
  name: string | null;
  email: string;
  role: "owner" | "editor" | "staff";
  disabled: boolean;
  createdAt: Date;
};

type Props = { users: User[]; currentUserId: string };

export function StaffList({ users, currentUserId }: Props) {
  if (users.length === 0) {
    return <p className="text-sm text-muted-foreground">No accounts yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground border-b">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Role</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Created</th>
            <th className="py-2 pr-0" />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isSelf = u.id === currentUserId;
            const isOwner = u.role === "owner";
            const isEditor = u.role === "editor";
            // Owners cannot be deleted or disabled; editors can.
            const canModify = !isOwner && !isSelf;
            return (
              <tr key={u.id} className={`border-b last:border-0 ${u.disabled ? "opacity-60" : ""}`}>
                <td className="py-2 pr-4">
                  {u.name ?? <span className="text-muted-foreground">—</span>}
                  {isSelf && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      You
                    </Badge>
                  )}
                </td>
                <td className="py-2 pr-4 font-mono text-xs">{u.email}</td>
                <td className="py-2 pr-4">
                  {isOwner ? (
                    <Badge className="bg-primary/15 text-primary border-0">Owner</Badge>
                  ) : isEditor ? (
                    <Badge className="bg-primary/10 text-primary border border-primary/20">
                      Editor
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Staff</Badge>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {u.disabled ? (
                    <Badge variant="destructive" className="text-[10px]">
                      Disabled
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-success/40 text-success bg-success/10"
                    >
                      Active
                    </Badge>
                  )}
                </td>
                <td className="py-2 pr-4 text-xs text-muted-foreground">
                  {u.createdAt.toISOString().slice(0, 10)}
                </td>
                <td className="py-2 pr-0 text-right">
                  <div className="flex gap-1 justify-end items-center">
                    <ResetPasswordDialog userId={u.id} userName={u.name ?? u.email} />
                    {canModify && (
                      <ToggleDisabledButton
                        userId={u.id}
                        userName={u.name ?? u.email}
                        disabled={u.disabled}
                      />
                    )}
                    {canModify && (
                      <ConfirmDestructive
                        title={`Delete ${u.name ?? u.email}?`}
                        description="Permanent removal — their login is gone forever. Bills they created stay in the system. Prefer Disable if they might return."
                        confirmLabel="Delete permanently"
                        successMessage="User deleted"
                        onConfirm={() => deleteStaff({ userId: u.id })}
                        trigger={
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            className="text-destructive" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        }
                      />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
