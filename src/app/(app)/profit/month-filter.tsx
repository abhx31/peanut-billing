"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Option = { value: string; label: string };

/** Compact month picker for a card's header toolbar. */
export function MonthFilter({ options, value }: { options: Option[]; value: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  function onChange(v: string) {
    const next = new URLSearchParams(sp);
    next.set("m", v);
    router.replace(`?${next.toString()}`);
  }

  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger aria-label="Month" title="Month" className="min-w-36">
        <SelectValue>
          {(v) =>
            !v || v === "all"
              ? "All months"
              : (options.find((o) => o.value === v)?.label ?? (v as string))
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all" label="All months">
          All months
        </SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} label={o.label}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
