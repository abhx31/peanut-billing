import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/auth-helpers";
import { getAllUsers, getSettings } from "@/lib/queries";
import { SettingsForm } from "./settings-form";
import { StaffList } from "./staff-list";
import { AddStaffForm } from "./add-staff-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireOwner();
  const [settings, users] = await Promise.all([getSettings(), getAllUsers()]);

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
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add staff</CardTitle>
          <p className="text-sm text-muted-foreground">
            Create a login for an employee. Staff can create bills and record payments but
            will never see cost or profit numbers. Share the password with them in person —
            they&apos;ll use it to sign in.
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
    </div>
  );
}
