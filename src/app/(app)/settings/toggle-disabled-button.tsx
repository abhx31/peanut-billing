"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setStaffDisabled } from "./actions";

type Props = {
  userId: string;
  userName: string;
  disabled: boolean;
};

export function ToggleDisabledButton({ userId, userName, disabled }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    const nextDisabled = !disabled;
    const verb = nextDisabled ? "Disable" : "Re-enable";
    if (
      nextDisabled &&
      !confirm(
        `${verb} ${userName}? They will no longer be able to sign in. Their past bills stay in the system.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await setStaffDisabled({ userId, disabled: nextDisabled });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(nextDisabled ? `${userName} disabled` : `${userName} re-enabled`);
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={onClick}
      className={disabled ? "text-success" : "text-warning"}
    >
      {disabled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
      <span className="sr-only sm:not-sr-only sm:ml-1">
        {disabled ? "Enable" : "Disable"}
      </span>
    </Button>
  );
}
