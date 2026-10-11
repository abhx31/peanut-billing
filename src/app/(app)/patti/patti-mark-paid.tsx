"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { money } from "@/lib/format";
import { markPattiPaid, unmarkPattiPaid } from "./actions";

type Props = {
  id: string;
  party: string;
  net: number;
  paidMode: "Cash" | "UPI" | null;
};

export function PattiMarkPaid({ id, party, net, paidMode }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (paidMode) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Undo payment to ${party}? ${money(net)} will show as not paid.`))
            return;
          startTransition(async () => {
            const res = await unmarkPattiPaid({ id });
            if (!res.ok && "error" in res) {
              toast.error(res.error);
              return;
            }
            toast.success("Marked as not paid");
            router.refresh();
          });
        }}
      >
        <Undo2 className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only sm:ml-1">Undo paid</span>
      </Button>
    );
  }

  function pay(mode: "Cash" | "UPI") {
    startTransition(async () => {
      const res = await markPattiPaid({ id, mode });
      if (!res.ok && "error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`Marked paid ${money(net)} (${mode})`);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" size="sm" variant="outline" disabled={pending}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:ml-1">Mark paid</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => pay("Cash")} className="cursor-pointer">
            Paid in cash
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => pay("UPI")} className="cursor-pointer">
            Paid in UPI
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
