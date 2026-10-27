"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const fyLabel = (v: string) => (v === "all" ? "All periods" : `FY ${v}`);

/** Compact financial-year picker (1 Apr – 31 Mar) for a card's header toolbar. */
export function FYFilter({ options, value }: { options: string[]; value: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  function onChange(v: string) {
    const next = new URLSearchParams(sp);
    next.set("fy", v);
    router.replace(`?${next.toString()}`);
  }

  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger
        aria-label="Accounting period (1 Apr – 31 Mar)"
        title="Accounting period (1 Apr – 31 Mar)"
        className="min-w-32"
      >
        <SelectValue>{(v) => fyLabel((v as string) ?? value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o} label={fyLabel(o)}>
            {fyLabel(o)}
          </SelectItem>
        ))}
        <SelectItem value="all" label="All periods">
          All periods
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
