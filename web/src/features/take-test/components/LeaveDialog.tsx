import { useTranslation } from "react-i18next";
import { LoaderCircle } from "lucide-react";
import {
  DeckDialog,
  DeckDialogActions,
  DeckDialogCancel,
} from "@/components/shared/DeckDialog";
import { Button } from "@/components/ui/button";
import { closeMoment } from "@/features/assignments/studentRules";
import type { Locale } from "@/lib/i18n";
import { useTakeTestStore } from "../store";
import { serverNow } from "../timeLeft";
import type { Leave } from "../useLeave";

/**
 * LeaveDialog asks "Leave the test?" in the deck's dialog, with Stay and
 * Leave. While an answer is unsaved it says the answer will be saved first
 * rather than that it is saved, and Leave shows the save in progress. When
 * that save fails it says the answers are not saved, aloud as well, since
 * the words change under a screen reader's focus, and offers Stay and "Try
 * saving again"; it never offers to leave without them. Esc and the backdrop
 * mean Stay. Under a flexible assignment (F1) it is a break: "Take a break?",
 * the answers saved and the paper there to carry on, on another device too,
 * until the close, with Stay and "Take a break"; it says nothing of a clock.
 */
export function LeaveDialog({ leave }: Readonly<{ leave: Leave }>) {
  const { t, i18n } = useTranslation();
  const flexible = useTakeTestStore((s) => s.mode === "flexible");
  const deadlineAt = useTakeTestStore((s) => s.deadlineAt);
  const offsetMs = useTakeTestStore((s) => s.offsetMs);
  const { phase, pending } = leave;
  const failed = phase === "failed";
  const saving = phase === "saving";
  const copy = flexible ? BREAK : LEAVE;
  const body = pending ? copy.pending : copy.body;
  const when = flexible
    ? closeMoment(new Date(deadlineAt), serverNow(offsetMs), t, i18n.language as Locale)
    : "";

  return (
    <DeckDialog
      open={phase !== "idle"}
      onOpenChange={(open) => {
        if (!open) leave.stay();
      }}
      title={t(failed ? "takeTest.leaveUnsavedTitle" : copy.title)}
      description={t(failed ? copy.unsaved : body, { when })}
    >
      <span role="alert" className="sr-only">
        {failed ? t("takeTest.leaveUnsavedTitle") : ""}
      </span>
      <DeckDialogActions>
        <DeckDialogCancel onClick={leave.stay}>
          {t("takeTest.leaveStay")}
        </DeckDialogCancel>
        <Button
          size="lg"
          aria-busy={saving || undefined}
          aria-disabled={saving || undefined}
          onClick={() => {
            if (!saving) leave.confirm();
          }}
        >
          {saving && (
            <LoaderCircle aria-hidden="true" className="size-[17px] animate-spin" />
          )}
          {t(failed ? "takeTest.retrySave" : copy.confirm)}
        </Button>
      </DeckDialogActions>
    </DeckDialog>
  );
}

const LEAVE = {
  title: "takeTest.leaveTitle",
  body: "takeTest.leaveBody",
  pending: "takeTest.leavePending",
  unsaved: "takeTest.leaveUnsavedDescription",
  confirm: "takeTest.leaveConfirm",
} as const;

const BREAK = {
  title: "takeTest.breakTitle",
  body: "takeTest.breakBody",
  pending: "takeTest.breakPending",
  unsaved: "takeTest.breakUnsaved",
  confirm: "takeTest.breakConfirm",
} as const;
