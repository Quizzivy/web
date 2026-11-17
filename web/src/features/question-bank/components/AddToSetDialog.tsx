import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListPlus, UserPlus } from "lucide-react";
import { FormDialog, type FormField } from "@/components/shared/form/FormDialog";
import { notify } from "@/lib/toast";
import { ApiError } from "@/lib/api/errors";
import {
  QUESTION_SETS_KEY,
  SET_LIMIT,
  addQuestionSetItems,
  createQuestionSet,
  questionSetKey,
  type QuestionSet,
  type QuestionSetSummary,
} from "@/features/question-bank/api";

/** AddToSetMode is which bulk-bar button opened the dialog: "Add to set" or "Share…". */
export type AddToSetMode = "add" | "share";

type Values = {
  pick: string;
  setId: string;
  name: string;
  description: string;
};

const EXISTING = "existing";
const NEW = "new";

/**
 * AddToSetDialog is the proposal's Add to set dialog (DG-90, interim), a
 * form dialog in four forms. From "Add to set" with sets to pick from, a
 * two-way switch chooses one of the caller's sets ("Questions already in the
 * set are skipped.") or names a new one with an optional description; a set
 * the selection would take past 500 questions says so under the field at
 * once, and the button stays dimmed and inert. With no set yet the switch is
 * not drawn and the dialog asks for a name. From "Share…" it asks for the
 * name only, and its button creates the set. `onDone` hears of the set the
 * questions went into, and whether it was made just now.
 */
export function AddToSetDialog({
  open,
  onOpenChange,
  mode,
  questionIds,
  sets,
  onDone,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: AddToSetMode;
  questionIds: readonly string[];
  sets: readonly QuestionSetSummary[];
  onDone: (set: QuestionSet, created: boolean) => void;
}>) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const count = questionIds.length;
  const picking = mode === "add" && sets.length > 0;
  const byId = new Map(sets.map((set) => [set.id, set]));

  const existing = (values: Values) => picking && values.pick === EXISTING;
  const full = (values: Values) => {
    const set = byId.get(values.setId);
    return existing(values) &&
      set !== undefined &&
      set.questionCount + count > SET_LIMIT
      ? set
      : null;
  };

  const save = useMutation({
    mutationFn: async (values: Values) => {
      if (existing(values)) {
        const before = byId.get(values.setId)?.questionCount ?? 0;
        const set = await addQuestionSetItems(values.setId, questionIds);
        return { set, created: false, added: set.questionCount - before };
      }
      const set = await createQuestionSet(values.name, values.description, questionIds);
      return { set, created: true, added: set.questionCount };
    },
    onSuccess: ({ set, created, added }) => {
      void client.invalidateQueries({ queryKey: QUESTION_SETS_KEY });
      void client.invalidateQueries({ queryKey: questionSetKey(set.id) });
      void client.invalidateQueries({ queryKey: ["teacher-questions"] });
      notify.success(
        created
          ? t("sets.toast.created", { count: added, name: set.name })
          : t("sets.toast.added", { count: added, name: set.name }),
      );
      onOpenChange(false);
      onDone(set, created);
    },
    onError: (cause) =>
      setError(cause instanceof ApiError ? cause.message : t("common.actionFailed")),
  });

  const fields: FormField<Values>[] = [
    {
      kind: "seg",
      name: "pick",
      label: t("sets.add.setLabel"),
      hideLabel: true,
      options: [
        { value: EXISTING, label: t("sets.add.existing") },
        { value: NEW, label: t("sets.add.new") },
      ],
      when: () => picking,
    },
    {
      kind: "select",
      name: "setId",
      label: t("sets.add.setLabel"),
      required: true,
      options: sets.map((set) => ({
        value: set.id,
        label: t("sets.add.option", { name: set.name, count: set.questionCount }),
      })),
      hint: (values) => (full(values) === null ? t("sets.add.dupNote") : undefined),
      when: existing,
    },
    {
      kind: "text",
      name: "name",
      label: t("sets.nameLabel"),
      placeholder: t("sets.namePlaceholder"),
      maxLength: 120,
      required: true,
      when: (values) => !existing(values),
    },
    {
      kind: "area",
      name: "description",
      label: t("sets.descLabel"),
      placeholder: t("sets.descPlaceholder"),
      maxLength: 500,
      when: (values) => mode === "add" && !existing(values),
    },
  ];

  return (
    <FormDialog<Values>
      open={open}
      onOpenChange={(next) => {
        if (save.isPending) return;
        if (next) setError(null);
        onOpenChange(next);
      }}
      width={440}
      icon={mode === "share" ? UserPlus : ListPlus}
      title={
        mode === "share"
          ? t("sets.shareSel.title", { count })
          : t("sets.add.title", { count })
      }
      description={mode === "share" ? t("sets.shareSel.desc") : t("sets.add.desc")}
      initial={{
        pick: picking ? EXISTING : NEW,
        setId: sets[0]?.id ?? "",
        name: "",
        description: "",
      }}
      fields={fields}
      liveErrors
      validate={(values) => {
        const set = full(values);
        return set === null
          ? null
          : { setId: t("sets.add.full", { count: set.questionCount }) };
      }}
      submitLabel={(values) => {
        if (mode === "share") return t("sets.shareSel.submit");
        return existing(values) ? t("sets.add.submit") : t("sets.add.create");
      }}
      pending={save.isPending}
      error={error}
      onSubmit={(values) => {
        setError(null);
        save.mutate(values);
      }}
    />
  );
}
