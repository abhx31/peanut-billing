import { getCurrentUser } from "@/lib/auth-helpers";
import { pad2, r2 } from "@/lib/format";
import { FY_RE, archiveBills, readArchive } from "@/lib/year-close";

export const dynamic = "force-dynamic";

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request, ctx: { params: Promise<{ fy: string }> }) {
  const user = await getCurrentUser();
  if (user?.role !== "owner") return new Response("Forbidden", { status: 403 });
  const { fy } = await ctx.params;
  if (!FY_RE.test(fy)) return new Response("Not found", { status: 404 });
  const row = await readArchive(fy);
  if (!row) return new Response("Not found", { status: 404 });
  const { data } = row;

  if (new URL(req.url).searchParams.get("format") === "csv") {
    const header = [
      "Bill no",
      "Kind",
      "Period",
      "Date",
      "Customer",
      "Store",
      "Lot",
      "Bags",
      "Kg",
      "Amount",
      "Hamali",
      "GST",
      "Total",
      "Paid",
      "Balance",
      "Status",
    ];
    const lines = [header.join(",")];
    for (const b of archiveBills(data)) {
      lines.push(
        [
          pad2(b.no),
          b.kind,
          b.fy,
          b.date,
          csvEscape(b.customer),
          b.loc === "NM" ? "New Mahavir" : "Main",
          csvEscape(b.lots),
          b.bags,
          r2(b.kg),
          r2(Number(b.amount)),
          r2(Number(b.hamali)),
          r2(Number(b.gst)),
          r2(Number(b.total)),
          r2(b.paid),
          r2(b.balance),
          b.settled ? "Settled (archived)" : "Still owed at close",
        ].join(","),
      );
    }
    return new Response(lines.join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="bills-${fy}.csv"`,
      },
    });
  }

  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="archive-${fy}.json"`,
    },
  });
}
