"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

/**
 * Compact date picker for a card's header toolbar — same height as the small
 * buttons beside it. Writes the picked date to the `paramKey` URL param.
 */
export function DateFilter({
  paramKey,
  value,
  label = "Date",
}: {
  paramKey: string;
  value: string;
  label?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function onChange(v: string) {
    const next = new URLSearchParams(sp);
    if (v) next.set(paramKey, v);
    else next.delete(paramKey);
    router.replace(`?${next.toString()}`);
  }

  return (
    <Input
      id={`date-${paramKey}`}
      type="date"
      aria-label={label}
      title={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-40 text-sm"
    />
  );
}
