"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export function DateFilter({ paramKey, value }: { paramKey: string; value: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  function onChange(v: string) {
    const next = new URLSearchParams(sp);
    if (v) next.set(paramKey, v);
    else next.delete(paramKey);
    router.replace(`?${next.toString()}`);
  }

  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div className="space-y-2">
        <Label htmlFor={`date-${paramKey}`}>Date</Label>
        <Input
          id={`date-${paramKey}`}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}
