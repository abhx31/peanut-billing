"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";

/** Compact month picker for a card's header toolbar. Writes `?m=YYYY-MM`. */
export function MonthPicker({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <Input
      id="gp-month"
      type="month"
      aria-label="Month"
      title="Month"
      defaultValue={value}
      className="h-8 w-40 text-sm"
      onChange={(e) => {
        const p = new URLSearchParams(sp?.toString() ?? "");
        p.set("m", e.target.value);
        router.push(`${pathname}?${p.toString()}`);
      }}
    />
  );
}
