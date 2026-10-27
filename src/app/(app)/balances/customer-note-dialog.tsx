"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { StickyNote, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { setCustomerNote } from "./notes-actions";

type Props = {
  customer: string;
  note: string;
};

export function CustomerNoteDialog({ customer, note }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(note);

  // Load the row's current note into the textarea each time the dialog opens
  // (it may have changed since, e.g. another tab saved one).
  function onOpenChange(next: boolean) {
    if (next) setDraft(note);
    setOpen(next);
  }

  function save() {
    startTransition(async () => {
      const res = await setCustomerNote({ customer, note: draft });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(draft.trim() === "" ? "Note removed" : "Note saved");
      setOpen(false);
      router.refresh();
    });
  }

  const hasNote = note.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            aria-label={hasNote ? "Edit note" : "Add note"}
          >
            {hasNote ? (
              <>
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </>
            ) : (
              <>
                <StickyNote className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Add note</span>
              </>
            )}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Note for {customer}</DialogTitle>
          <DialogDescription>
            A short reminder that only shows up here on Balances. Clearing the
            box deletes the note.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. &quot;Pays on 10th each month&quot; or &quot;Call before supplying&quot;"
          autoFocus
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
