"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";

export function MonthPicker({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium" htmlFor="gp-month">
        Month
      </label>
      <Input
        id="gp-month"
        type="month"
        defaultValue={value}
        className="w-44"
        onChange={(e) => {
          const p = new URLSearchParams(sp?.toString() ?? "");
          p.set("m", e.target.value);
          router.push(`${pathname}?${p.toString()}`);
        }}
      />
    </div>
  );
}
