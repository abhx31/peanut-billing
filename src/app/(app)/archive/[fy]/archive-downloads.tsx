"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadArchive } from "../../settings/year-close-card";

export function ArchiveDownloads({ fy }: { fy: string }) {
  const [loading, setLoading] = useState<null | "csv" | "json">(null);

  async function get(format: "csv" | "json") {
    setLoading(format);
    await downloadArchive(fy, format);
    setLoading(null);
  }

  return (
    <div className="flex gap-2 flex-wrap">
      <Button type="button" variant="outline" size="sm" disabled={loading !== null} onClick={() => get("csv")}>
        {loading === "csv" ? "Preparing…" : "Bills (CSV)"}
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={loading !== null} onClick={() => get("json")}>
        {loading === "json" ? "Preparing…" : "Full archive (JSON)"}
      </Button>
    </div>
  );
}
