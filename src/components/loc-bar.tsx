"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Store } from "lucide-react";
import { setLoc } from "@/app/(app)/loc/actions";
import { cn } from "cn";
import type { Loc } from "@/lib/loc";

type Props = { loc: Loc };

export function LocBar({ loc }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  // Hide on print pages — they're meant to render just the printable content.
  if (pathname?.endsWith("/print") || pathname?.includes("/print/")) {
    return null;
  }

  function switchTo(next: Loc) {
    if (next === loc || pending) return;
    startTransition(async () => {
      await setLoc(next);
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "border-b transition-colors",
        loc === "NM"
          ? "bg-primary text-primary-foreground"
          : "bg-muted/40 text-foreground",
      )}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-2 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Store className="h-4 w-4 shrink-0" />
          <span>
            Working at <b>{loc === "NM" ? "New Mahavir" : "Main store"}</b>
          </span>
        </div>
        <div className="flex gap-1 rounded-md bg-background/20 p-0.5">
          <button
            type="button"
            onClick={() => switchTo("")}
            disabled={pending}
            className={cn(
              "px-3 py-1 rounded text-xs transition-colors",
              loc === ""
                ? "bg-background text-foreground font-semibold shadow-sm"
                : "hover:bg-background/40",
            )}
          >
            Main store
          </button>
          <button
            type="button"
            onClick={() => switchTo("NM")}
            disabled={pending}
            className={cn(
              "px-3 py-1 rounded text-xs transition-colors",
              loc === "NM"
                ? "bg-background text-foreground font-semibold shadow-sm"
                : "hover:bg-background/40",
            )}
          >
            New Mahavir
          </button>
        </div>
      </div>
    </div>
  );
}
