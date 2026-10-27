"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { today } from "@/lib/format";
import { REPORT_FILE, type Report } from "@/lib/excel-reports";

/**
 * Downloads a page as an Excel file. Pass `date` for date-based pages; with `pickDate`
 * the button gets its own date box (for pages that have no date filter).
 */
export function ExcelButton({
  report,
  date,
  pickDate,
  label = "Download Excel",
  variant = "outline",
}: {
  report: Report;
  date?: string;
  pickDate?: boolean;
  label?: string;
  variant?: "outline" | "default";
}) {
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState(date ?? today());
  const d = pickDate ? picked : (date ?? today());

  async function download() {
    setLoading(true);
    try {
      const res = await fetch(`/api/export?report=${report}&d=${d}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${REPORT_FILE[report]}-${d}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Download failed: " + (err instanceof Error ? err.message : "unknown"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {pickDate && (
        <Input
          type="date"
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          className="h-8 w-40 text-sm"
          aria-label="Date"
        />
      )}
      <Button type="button" variant={variant} size="sm" disabled={loading} onClick={download}>
        <FileSpreadsheet className="mr-1.5 h-4 w-4" />
        {loading ? "Preparing…" : label}
      </Button>
    </div>
  );
}
