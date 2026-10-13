import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/auth-helpers";
import { cashBalanceBefore, getAllUsers, getSettings } from "@/lib/queries";
import { fyBounds, listArchives, nextFyToClose } from "@/lib/year-close";
import { SettingsForm } from "./settings-form";
import { StaffList } from "./staff-list";
import { AddStaffForm } from "./add-staff-form";
import { YearCloseCard } from "./year-close-card";

export const dynamic = "force-dynamic";
// Closing a financial year runs as a server action from this page.
export const maxDuration = 60;

export default async function SettingsPage() {
  const session = await requireOwner();
  const [settings, users, next, archives] = await Promise.all([
    getSettings(),
    getAllUsers(),
    nextFyToClose(),
    listArchives(),
  ]);
  // Book balance at the end of the year to close, used to prefill the owner's count.
  const [closeCash, closeBank] = next?.canClose
    ? await Promise.all([
        cashBalanceBefore("Cash", fyBounds(next.fy).nextStart),
        cashBalanceBefore("UPI", fyBounds(next.fy).nextStart),
      ])
    : [0, 0];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Firm settings</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm
            firm={settings.firm}
            hamaliDefault={Number(settings.hamaliDefault)}
            openingCash={Number(settings.openingCash)}
            openingBank={Number(settings.openingBank)}
            letterheadImage={settings.letterheadImage ?? null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add user</CardTitle>
          <p className="text-sm text-muted-foreground">
            Create a login for an employee or co-owner. Pick <b>Staff</b> for someone who
            will bill and record payments (no cost or profit visibility), or <b>Owner</b>{" "}
            to grant full access including cost, profit, and user management. Share the
            password with them in person.
          </p>
        </CardHeader>
        <CardContent>
          <AddStaffForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <p className="text-sm text-muted-foreground">
            {users.length} account{users.length === 1 ? "" : "s"} total.
          </p>
        </CardHeader>
        <CardContent>
          <StaffList users={users} currentUserId={session.user.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Close financial year</CardTitle>
          <p className="text-sm text-muted-foreground">
            After 31 March, archive the finished year, check the archive, and then remove its
            settled bills, expenses and stock entries. Bills with a balance, old dues and unpaid
            patti are never removed, so customer credit stays exactly as it is. Archived years
            stay viewable here.
          </p>
        </CardHeader>
        <CardContent>
          <YearCloseCard
            next={next}
            cash={closeCash}
            bank={closeBank}
            archives={archives.map((a) => {
              const counts = a.counts as {
                removed?: { bills?: number };
                stillOpen?: { bills?: number; billsDue?: number };
              };
              return {
                fy: a.fy,
                status: a.status,
                createdAt: a.createdAt.toISOString(),
                bills: counts.removed?.bills ?? 0,
                owedBills: counts.stillOpen?.bills ?? 0,
                owedDue: counts.stillOpen?.billsDue ?? 0,
                archiveBytes: a.archiveBytes,
              };
            })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
