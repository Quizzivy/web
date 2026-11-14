import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleSlash, Hash, Shapes } from "lucide-react";
import { BulkActions, BulkBarButton } from "@/components/shared/BulkActions";
import { Callout } from "@/components/shared/Callout";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ImportDraftQuestion } from "../../api";
import { EDITABLE_TYPES, planTypeChange, type QuestionType } from "../../draft";

type EditableType = (typeof EDITABLE_TYPES)[number];

function editable(value: string): EditableType | null {
  return (EDITABLE_TYPES as readonly string[]).includes(value)
    ? (value as EditableType)
    : null;
}

/**
 * ReviewBulkBar is the bar the review's test pane shows while questions are
 * selected, the product's bulk bar: how many are selected, the three edits
 * that apply to all of them at once (their type, their points, leaving them
 * out of the test), each of which opens its own dialog, and a button that
 * clears the selection.
 */
export function ReviewBulkBar({
  questions,
  onType,
  onPoints,
  onExclude,
  onClear,
}: Readonly<{
  questions: readonly ImportDraftQuestion[];
  onType: () => void;
  onPoints: () => void;
  onExclude: () => void;
  onClear: () => void;
}>) {
  const { t } = useTranslation();
  return (
    <BulkActions
      selected={questions}
      selectionLabel={t("imports.review.bulkSelected", { count: questions.length })}
      name={(question) => question.label}
      actions={[]}
      onRemoved={() => undefined}
      onClear={onClear}
      onSettled={() => Promise.resolve()}
      className="shadow-card"
    >
      <BulkBarButton icon={Shapes} onClick={onType}>
        {t("imports.review.bulkType")}
      </BulkBarButton>
      <BulkBarButton icon={Hash} onClick={onPoints}>
        {t("imports.review.bulkPoints")}
      </BulkBarButton>
      <BulkBarButton icon={CircleSlash} onClick={onExclude}>
        {t("imports.review.bulkExclude")}
      </BulkBarButton>
    </BulkActions>
  );
}

/**
 * BulkTypeDialog changes the type of every selected question to one type. As
 * soon as a type is chosen it says what the change does before it is done: how
 * many questions change, how many already are of that type and stay, and which
 * ones lose options, answers or answer settings, by their printed labels,
 * since no dialog asks about each of them as a single change does. It also
 * says what becomes of the gaps a fill in the blank leaves in its prompt: they
 * are written out (`settleGaps`), except in the questions of `bound`, whose
 * gaps a passage answers through. The change can be made only once a type is
 * chosen that at least one question is not.
 */
export function BulkTypeDialog({
  questions,
  bound,
  open,
  onOpenChange,
  onApply,
}: Readonly<{
  questions: readonly ImportDraftQuestion[];
  bound: ReadonlySet<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (type: QuestionType, changing: readonly ImportDraftQuestion[]) => void;
}>) {
  const { t } = useTranslation();
  const id = useId();
  const [chosen, setChosen] = useState<EditableType | null>(null);
  const plan = chosen === null ? null : planTypeChange(questions, chosen, bound);
  const changes = plan !== null && plan.changing.length > 0;
  const close = (next: boolean) => {
    if (!next) setChosen(null);
    onOpenChange(next);
  };
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={close}
      icon={Shapes}
      title={t("imports.review.bulkTypeTitle", { count: questions.length })}
      description={t("imports.review.bulkTypeBody")}
      confirmLabel={
        changes
          ? t("imports.review.bulkTypeApply", { count: plan.changing.length })
          : t("imports.review.bulkTypeApplyPlain")
      }
      disabled={!changes}
      onConfirm={() => {
        if (chosen === null || plan === null || plan.changing.length === 0) return;
        setChosen(null);
        onApply(chosen, plan.changing);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id} className="text-meta font-medium">
          {t("imports.review.bulkTypeField")}
        </Label>
        <Select
          value={chosen ?? ""}
          onValueChange={(value) => setChosen(editable(value))}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder={t("imports.review.bulkTypePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {EDITABLE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`imports.type.${type}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {plan === null || chosen === null ? null : (
        <div role="status" className="flex flex-col gap-2.5">
          <p className="m-0 text-sm">
            {changes
              ? t("imports.review.bulkTypeChanging", {
                  count: plan.changing.length,
                  type: t(`imports.type.${chosen}`),
                })
              : t("imports.review.bulkTypeNone")}
            {changes && plan.unchanged.length > 0
              ? ` ${t("imports.review.bulkTypeSame", { count: plan.unchanged.length })}`
              : null}
          </p>
          {plan.settling.length > 0 ? (
            <p className="text-muted-fg m-0 text-sm">
              {t("imports.review.bulkTypeSettling", { count: plan.settling.length })}
            </p>
          ) : null}
          {plan.keeping.length > 0 ? (
            <Callout tone="info" size="sm">
              {t("imports.review.bulkTypeKeeping", {
                count: plan.keeping.length,
                labels: plan.keeping.map((question) => question.label).join(", "),
              })}
            </Callout>
          ) : null}
          {plan.dropping.length > 0 ? (
            <Callout tone="warning" size="sm">
              {t("imports.review.bulkTypeDropping", {
                count: plan.dropping.length,
                labels: plan.dropping.map((question) => question.label).join(", "),
              })}
            </Callout>
          ) : null}
        </div>
      )}
    </ConfirmDialog>
  );
}
