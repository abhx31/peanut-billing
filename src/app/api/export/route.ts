import { getCurrentUser } from "@/lib/auth-helpers";
import { today } from "@/lib/format";
import { buildReport } from "@/lib/excel-export";
import { getCurrentLoc } from "@/lib/loc";
import { REPORTS, REPORT_FILE, type Report } from "@/lib/excel-reports";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const isOwner = user.role === "owner";
  const isPrivileged = isOwner || user.role === "editor";

  const sp = new URL(req.url).searchParams;
  const report = sp.get("report") as Report | null;
  if (!report || !REPORTS.includes(report)) return new Response("Unknown report", { status: 400 });
  const d = sp.get("d");
  const date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today();
  // Patti bills show purchase prices: owner and editor only, like the Patti page.
  if (report === "patti" && !isPrivileged) return new Response("Forbidden", { status: 403 });

  // Reports are for the store the user is working at.
  const loc = await getCurrentLoc();
  const file = await buildReport(report, date, { isOwner, isPrivileged }, loc);
  const store = loc === "NM" ? "new-mahavir" : "main-store";
  return new Response(new Uint8Array(file), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${REPORT_FILE[report]}-${store}-${date}.xlsx"`,
    },
  });
}
