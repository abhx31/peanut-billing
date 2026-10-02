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

export function FYFilter({ options, value }: { options: string[]; value: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  function onChange(v: string) {
    const next = new URLSearchParams(sp);
    next.set("fy", v);
    router.replace(`?${next.toString()}`);
  }

  return (
    <div className="space-y-2 max-w-xs">
      <Label>Accounting period (1 Apr – 31 Mar)</Label>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
          <SelectItem value="all">All periods</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
