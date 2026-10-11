import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth-helpers";
import { db, schema } from "@/db";
import { asc } from "drizzle-orm";
import { GstCustomerForm } from "./gst-customer-form";
import { FirmGstProfileForm } from "./firm-gst-profile-form";
import { DeleteGstCustomerButton } from "./delete-gst-customer-button";
import { fyOf, today } from "@/lib/format";
import type { GstProfile } from "@/lib/gst-types";

export const dynamic = "force-dynamic";

export default async function GstCustomersPage() {
  const session = await requireSession();
  const isOwner = session.user.role === "owner";

  const [customers, settingsRow] = await Promise.all([
    db
      .select()
      .from(schema.gstCustomers)
      .orderBy(asc(schema.gstCustomers.name)),
    db.query.settings.findFirst(),
  ]);
  const profile = (settingsRow?.gstProfile ?? null) as GstProfile | null;
  const startMap = (settingsRow?.gstStart ?? {}) as Record<string, number>;
  const fy = fyOf(today());

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Add / edit GST customer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <GstCustomerForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GST customers</CardTitle>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No GST customers yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">GSTIN</th>
                    <th className="py-2 pr-4">State (code)</th>
                    <th className="py-2 pr-4">Phone</th>
                    <th className="py-2 pr-0" />
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{c.name}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{c.gstin ?? ""}</td>
                      <td className="py-2 pr-4">
                        {c.state ?? ""}
                        {c.stateCode ? ` (${c.stateCode})` : ""}
                      </td>
                      <td className="py-2 pr-4">{c.phone ?? ""}</td>
                      <td className="py-2 pr-0 text-right">
                        {isOwner && (
                          <DeleteGstCustomerButton id={c.id} name={c.name} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>My firm details (printed on GST invoices)</CardTitle>
          </CardHeader>
          <CardContent>
            <FirmGstProfileForm
              profile={profile ?? ({} as GstProfile)}
              fy={fy}
              nextInvoiceNo={startMap[fy] ?? null}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
