"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { PageSize } from "@/lib/print-size";

export function PrintSizeToggle({ current }: { current: PageSize }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function go(size: PageSize) {
    const p = new URLSearchParams(sp?.toString() ?? "");
    p.set("size", size);
    router.replace(`${pathname}?${p.toString()}`);
  }

  return (
    <div className="print:hidden fixed top-3 right-3 z-50 flex gap-1 bg-white/90 border border-gray-300 rounded-md p-1 shadow">
      <Button
        type="button"
        size="sm"
        variant={current === "A4" ? "default" : "outline"}
        onClick={() => go("A4")}
      >
        A4
      </Button>
      <Button
        type="button"
        size="sm"
        variant={current === "A5" ? "default" : "outline"}
        onClick={() => go("A5")}
      >
        A5
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => window.print()}
      >
        Print
      </Button>
    </div>
  );
}

export function PrintSizeChooser({ recommended }: { recommended: PageSize }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function pick(size: PageSize) {
    const p = new URLSearchParams(sp?.toString() ?? "");
    p.set("size", size);
    router.replace(`${pathname}?${p.toString()}`);
  }

  return (
    <div className="print:hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-[90%]">
        <h2 className="text-lg font-semibold mb-4">Choose paper size</h2>
        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            size="lg"
            variant={recommended === "A4" ? "default" : "outline"}
            onClick={() => pick("A4")}
            className="h-16 text-base font-semibold"
          >
            A4
          </Button>
          <Button
            type="button"
            size="lg"
            variant={recommended === "A5" ? "default" : "outline"}
            onClick={() => pick("A5")}
            className="h-16 text-base font-semibold"
          >
            A5
          </Button>
        </div>
      </div>
    </div>
  );
}
