import { useMemo, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { FormDialog, type FormField } from "@/components/shared/form/FormDialog";
import { useAddCredits, useLatch } from "@/features/ai-credits/mutations";
import { credits } from "@/features/ai/credits";
import { failureMessage } from "@/lib/api/errors";
import { useLocale } from "@/lib/i18n/useLocale";
import { notify } from "@/lib/toast";

const ADDITIONS = [50_000, 100_000, 250_000] as const;

type Values = { amount: string };

const INITIAL: Values = { amount: String(ADDITIONS[0]) };

/**
 * AddCreditsDialog is the deck's "Add credits to this month": one of three
 * amounts, added to the centre pool at once. It is how an Admin approves use
 * beyond the plan, so the dialog says the extra is paid for outside Quizzivy
 * and does not carry over to next month (DG-196). The server records the
 * caller as the approver. An addition still in flight when the dialog closes
 * holds off the next one until it answers, and its answer goes to the Admin in
 * a notice, added or not: a dialog opened after it stays open and shows no
 * error of the earlier addition (QC-AC-11).
 */
export function AddCreditsDialog({
  open,
  onOpenChange,
  returnFocus,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus?: RefObject<HTMLElement | null> | undefined;
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const add = useAddCredits();
  const latch = useLatch();
  // Counts the times the dialog has left the screen, so that an addition's
  // answer can tell whether the dialog it was sent from is still the one open.
  const opening = useRef(0);
  const [failure, setFailure] = useState<string | null>(null);

  function close() {
    opening.current += 1;
    setFailure(null);
    onOpenChange(false);
  }

  const fields = useMemo<readonly FormField<Values>[]>(
    () => [
      {
        kind: "seg",
        name: "amount",
        label: t("aiCredits.add.amount"),
        options: ADDITIONS.map((amount) => ({
          value: String(amount),
          label: credits(amount, locale),
        })),
      },
    ],
    [t, locale],
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else close();
      }}
      title={t("aiCredits.add.title")}
      description={t("aiCredits.add.hint")}
      icon={Plus}
      initial={INITIAL}
      fields={fields}
      submitLabel={t("aiCredits.add.submit")}
      pending={add.isPending}
      error={failure}
      returnFocus={returnFocus}
      onSubmit={(values) => {
        if (!latch.take()) return;
        const amount = Number(values.amount);
        const sent = opening.current;
        setFailure(null);
        add.mutate(amount, {
          onSuccess: () => {
            if (opening.current === sent) close();
            notify.success(
              t("aiCredits.add.added", { amount: credits(amount, locale) }),
            );
          },
          onError: (cause) => {
            const reason = failureMessage(cause, t("aiCredits.add.failed"));
            if (opening.current === sent) setFailure(reason);
            else notify.error(reason);
          },
          onSettled: latch.release,
        });
      }}
    />
  );
}
