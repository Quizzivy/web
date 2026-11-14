import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { RetentionImpact } from "@/features/organization/api";

function lines(
  impact: RetentionImpact,
): { key: string; values: Record<string, number> }[] {
  const found: { key: string; values: Record<string, number> }[] = [];
  if (impact.answers !== null && impact.answers.attempts > 0) {
    found.push({
      key: "answers",
      values: { count: impact.answers.attempts, answers: impact.answers.answers },
    });
  }
  if (impact.focusEvents > 0)
    found.push({ key: "focus", values: { count: impact.focusEvents } });
  if (impact.accounts !== null && impact.accounts.anonymise > 0) {
    found.push({ key: "accounts", values: { count: impact.accounts.anonymise } });
  }
  if (impact.accounts !== null && impact.accounts.skippedOwners > 0) {
    found.push({ key: "owners", values: { count: impact.accounts.skippedOwners } });
  }
  return found;
}

/**
 * RetentionConfirm is the question asked before a shorter retention is saved:
 * what tonight's sweep would delete under it, counted by the server. A
 * policy that deletes nothing yet says so. The question is answered before
 * the save, so Cancel leaves the form as it was. It is an alert dialog: what
 * the sweep deletes cannot be brought back. Closed, it gives focus back to
 * the button that asked, or to `returnFocus` when that holds a control, which
 * the caller sets once the save has taken the button away.
 */
export function RetentionConfirm({
  impact,
  pending,
  returnFocus,
  onConfirm,
  onCancel,
}: Readonly<{
  impact: RetentionImpact | null;
  pending: boolean;
  returnFocus?: RefObject<HTMLElement | null> | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}>) {
  const { t } = useTranslation();
  const shown = impact === null ? [] : lines(impact);
  return (
    <ConfirmDialog
      open={impact !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={t("systemSettings.retentionConfirm.title")}
      description={t("systemSettings.retentionConfirm.hint")}
      confirmLabel={t("systemSettings.retentionConfirm.confirm")}
      destructive
      alert
      pending={pending}
      returnFocus={returnFocus}
      onConfirm={onConfirm}
    >
      {shown.length === 0 ? (
        <p className="text-muted-fg text-sm">
          {t("systemSettings.retentionConfirm.nothing")}
        </p>
      ) : (
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
          {shown.map(({ key, values }) => (
            <li key={key}>{t(`systemSettings.retentionConfirm.${key}`, values)}</li>
          ))}
        </ul>
      )}
    </ConfirmDialog>
  );
}
