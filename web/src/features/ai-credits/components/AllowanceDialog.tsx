import { useMemo, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { FormDialog, type FormField } from "@/components/shared/form/FormDialog";
import type { AiTeacherMonth } from "@/features/ai-credits/api";
import {
  MAX_ALLOWANCE,
  MIN_ALLOWANCE,
  allowanceBody,
  baseAllowance,
  type AllowanceValues,
} from "@/features/ai-credits/allowance";
import { useLatch, useSaveAllowance } from "@/features/ai-credits/mutations";
import { credits } from "@/features/ai/credits";
import { ApiError, failureMessage } from "@/lib/api/errors";
import { useLocale } from "@/lib/i18n/useLocale";
import { notify } from "@/lib/toast";

/**
 * AllowanceDialog is the deck's "AI allowance" for one teacher, open while
 * `teacher` is set: the default allowance or a custom figure of at least
 * 1,000, and a switch that pauses their AI. It sends only what the Admin
 * changed against the row it opened on, so a dialog saved without a change
 * sends nothing and never undoes what another Admin set meanwhile. A figure
 * below what the teacher has used is the server's refusal, shown in the
 * dialog. A save still in flight when the dialog closes holds off the next
 * one until it answers, and its answer goes to the Admin in a notice, never
 * to a dialog opened after it: that one stays open and shows no error of the
 * earlier save (QC-AC-11).
 */
export function AllowanceDialog({
  teacher,
  defaultAllowance,
  onClose,
  returnFocus,
}: Readonly<{
  teacher: AiTeacherMonth | null;
  defaultAllowance: number;
  onClose: () => void;
  returnFocus?: RefObject<HTMLElement | null> | undefined;
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const save = useSaveAllowance();
  const latch = useLatch();
  // Counts the times the dialog has left the screen, so that a save's answer
  // can tell whether the dialog it was sent from is still the one open.
  const opening = useRef(0);
  const [failure, setFailure] = useState<string | null>(null);
  const bounds = {
    min: credits(MIN_ALLOWANCE, locale),
    max: credits(MAX_ALLOWANCE, locale),
  };

  const fields = useMemo<readonly FormField<AllowanceValues>[]>(
    () => [
      {
        kind: "seg",
        name: "mode",
        label: t("aiCredits.allowance.mode"),
        options: [
          {
            value: "default",
            label: t("aiCredits.allowance.default", {
              n: credits(defaultAllowance, locale),
            }),
          },
          { value: "custom", label: t("aiCredits.allowance.custom") },
        ],
      },
      {
        kind: "number",
        name: "credits",
        label: t("aiCredits.allowance.credits"),
        hint: t("aiCredits.allowance.creditsHint"),
        inputMode: "numeric",
        autoComplete: "off",
        when: (values) => values.mode === "custom",
      },
      {
        kind: "toggle",
        name: "paused",
        text: t("aiCredits.allowance.paused"),
        sub: t("aiCredits.allowance.pausedHint"),
      },
    ],
    [t, locale, defaultAllowance],
  );

  const initial = useMemo<AllowanceValues>(
    () => ({
      mode: teacher?.custom === true ? "custom" : "default",
      credits: String(
        teacher?.custom === true ? baseAllowance(teacher) : defaultAllowance,
      ),
      paused: teacher?.paused ?? false,
    }),
    [teacher, defaultAllowance],
  );

  function validate(values: AllowanceValues) {
    if (values.mode !== "custom") return null;
    const figure = Number(values.credits.trim());
    if (Number.isNaN(figure) || figure < MIN_ALLOWANCE)
      return { credits: t("aiCredits.allowance.min", bounds) };
    if (!Number.isInteger(figure)) return { credits: t("aiCredits.allowance.whole") };
    if (figure > MAX_ALLOWANCE)
      return { credits: t("aiCredits.allowance.max", bounds) };
    return null;
  }

  function close() {
    opening.current += 1;
    setFailure(null);
    onClose();
  }

  function submit(values: AllowanceValues) {
    if (teacher === null || !latch.take()) return;
    const body = allowanceBody(teacher, values);
    if (body === null) {
      latch.release();
      close();
      return;
    }
    const sent = opening.current;
    setFailure(null);
    save.mutate(
      { userId: teacher.userId, body },
      {
        onSuccess: () => {
          if (opening.current === sent) close();
          notify.success(t("aiCredits.allowance.saved", { name: teacher.name }));
        },
        onError: (cause) => {
          if (opening.current === sent) {
            setFailure(failureMessage(cause, t("aiCredits.allowance.failed")));
            return;
          }
          const unsaved = t("aiCredits.allowance.failedFor", { name: teacher.name });
          notify.error(
            cause instanceof ApiError ? `${unsaved} ${cause.message}` : unsaved,
          );
        },
        onSettled: latch.release,
      },
    );
  }

  return (
    <FormDialog
      open={teacher !== null}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={t("aiCredits.allowance.title", { name: teacher?.name ?? "" })}
      description={t("aiCredits.allowance.used", {
        used: credits(teacher?.used ?? 0, locale),
      })}
      icon={Sparkles}
      initial={initial}
      fields={fields}
      validate={validate}
      submitLabel={t("common.save")}
      pending={save.isPending}
      error={failure}
      returnFocus={returnFocus}
      onSubmit={submit}
    />
  );
}
