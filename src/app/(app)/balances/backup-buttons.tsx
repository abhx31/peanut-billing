"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function BackupButtons({ isOwner }: { isOwner: boolean }) {
  const [loading, setLoading] = useState<null | "csv" | "json">(null);

  async function download(kind: "csv" | "json") {
    setLoading(kind);
    try {
      const res = await fetch(`/api/backup?format=${kind}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const name =
        kind === "csv"
          ? `bills-${new Date().toISOString().slice(0, 10)}.csv`
          : `peanut-billing-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Download failed: " + (err instanceof Error ? err.message : "unknown"));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex gap-2 flex-wrap">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading !== null}
        onClick={() => download("csv")}
      >
        {loading === "csv" ? "Preparing…" : "Download all bills (CSV)"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading !== null}
        onClick={() => download("json")}
      >
        {loading === "json" ? "Preparing…" : "Download full backup (JSON)"}
      </Button>
      {!isOwner && (
        <span className="text-xs text-muted-foreground self-center">
          (profit / cost columns are not included for staff backups)
        </span>
      )}
    </div>
  );
}
