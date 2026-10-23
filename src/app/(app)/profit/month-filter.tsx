"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Option = { value: string; label: string };

export function MonthFilter({ options, value }: { options: Option[]; value: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  function onChange(v: string) {
    const next = new URLSearchParams(sp);
    next.set("m", v);
    router.replace(`?${next.toString()}`);
  }

  return (
    <div className="space-y-2 max-w-xs">
      <Label>Month</Label>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All months</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} label={o.label}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
