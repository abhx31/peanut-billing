"use client";

import { LogOut, Settings as SettingsIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  name: string | null;
  email: string;
  role: "owner" | "editor" | "staff";
};

export function UserMenu({ name, email, role }: Props) {
  const router = useRouter();
  const initials = (name ?? email)
    .split(/[\s@]+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border bg-background px-2 py-1 pr-3 text-sm hover:bg-accent transition-colors"
            aria-label="Open user menu"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
              {initials}
            </span>
            <span className="hidden sm:inline max-w-[160px] truncate">{name ?? email}</span>
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex items-center gap-3 px-1.5 py-1">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                {initials}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{name ?? "Account"}</div>
                <div className="truncate text-xs text-muted-foreground">{email}</div>
                <div className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {role}
                </div>
              </div>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {(role === "owner" || role === "editor") && (
            <DropdownMenuItem
              onClick={() => router.push("/settings")}
              className="cursor-pointer gap-2"
            >
              <SettingsIcon className="h-4 w-4" />
              Firm settings
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => signOut({ callbackUrl: "/signin" })}
            className="cursor-pointer gap-2 text-destructive focus:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
