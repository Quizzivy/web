import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Info, Plus, TextCursorInput, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { RowMenu } from "@/components/shared/RowMenu";
import type { MediaAsset } from "@/features/media/api";
import { ExplanationField } from "@/features/question-bank/components/ExplanationField";
import { MarkVisual } from "@/features/question-bank/components/OptionsEditor";
import { QUESTION_TYPE_ICONS } from "@/features/question-bank/components/questionTypeIcons";
import { TagsField } from "@/features/question-bank/components/TagsField";
import type { QuestionValues } from "@/features/question-bank/questionSchema";
import { editorType, optionLetter } from "@/features/question-bank/questionType";
import { BuilderQuestionEditor } from "@/features/tests/components/BuilderQuestionEditor";
import { cn } from "@/lib/utils";
import type { GapQuestion, GapRow } from "../gapQuestions";
import { memberValues, type GroupQuestion } from "../model";

const NUMBER =
  "grid h-5.5 min-w-5.5 flex-none place-items-center rounded-[6px] px-1.25 text-xs font-semibold tabular-nums";

/**
 * ClosedCard is a question of the stack while another is open: its number in
 * the test, its type's icon, its prompt on one line, or for a gap its word
 * and how it is answered, and its points. Pressing it opens the card.
 */
export function ClosedCard({
  number,
  question,
  gap,
  onOpen,
}: Readonly<{
  number: number;
  question: GroupQuestion;
  gap: GapQuestion | undefined;
  onOpen: () => void;
}>) {
  const { t } = useTranslation();
  const Icon =
    gap?.mode === "typed"
      ? TextCursorInput
      : QUESTION_TYPE_ICONS[editorType(question.input.type)];
  return (
    <button
      type="button"
      data-group-card={question.id}
      className="bg-card shadow-card hover:bg-hover flex min-h-10.5 w-full items-center gap-2.25 rounded-[10px] border px-3 py-1.5 text-left transition-colors motion-reduce:transition-none max-[767px]:min-h-12"
      onClick={onOpen}
    >
      <span className={cn(NUMBER, "bg-muted")}>{number}</span>
      <Icon aria-hidden="true" className="text-muted-fg size-3.5 flex-none" />
      <span className="min-w-0 flex-1 truncate text-[13.5px]">
        {gap ? (
          <>
            <b className="font-semibold">{gap.word}</b>
            <span className="text-muted-fg">
              {" · "}
              {gap.mode === "typed"
                ? t("groups.pane.typedSummary")
                : gap.wrong.join(", ")}
            </span>
          </>
        ) : (
          question.input.prompt || t("builder.untitledQuestion")
        )}
      </span>
      <span className="text-muted-fg flex-none text-xs whitespace-nowrap">
        {t("builder.points", { count: question.input.points })}
      </span>
      <ChevronDown aria-hidden="true" className="text-muted-fg size-3.75 flex-none" />
    </button>
  );
}

/**
 * QuestionCard is an ordinary question of a group, open: the fields of a
 * question on its own, as the builder draws them (`BuilderQuestionEditor`),
 * numbered as in the test, with `menu` as its "…" menu.
 */
export function QuestionCard({
  number,
  question,
  assets,
  starter,
  menu,
  note,
  onChange,
  onAsset,
  onRefresh,
}: Readonly<{
  number: number;
  question: GroupQuestion;
  assets: ReadonlyMap<string, MediaAsset>;
  starter: boolean;
  menu: ReactNode;
  note?: ReactNode | undefined;
  onChange: (input: QuestionValues) => void;
  onAsset: (asset: MediaAsset) => void;
  onRefresh: () => void;
}>) {
  return (
    <div
      data-group-card={question.id}
      className="border-ring bg-card shadow-card min-w-0 rounded-xl border"
    >
      <BuilderQuestionEditor
        value={memberValues(question.input)}
        asset={assets.get(question.input.mediaAssetId ?? "") ?? null}
        number={number}
        clearPromptOnFocus={starter}
        menu={menu}
        assets={assets}
        onChange={onChange}
        onAssetChange={(asset) => {
          if (asset) onAsset(asset);
        }}
        onRefresh={onRefresh}
      />
      {note}
    </div>
  );
}

/**
 * GapCard is a gap's question, open: its number, its points and its menu
 * (keeping the options in order, for a chosen gap, and "Remove gap"); the
 * sentence the gap stands in; the option rows, of which the correct one holds
 * the gap's word; under them, for a typed gap, the line that says students
 * will type the word and the other answers it accepts; then the prompt, and
 * "More options" with the explanation and tags. It has no type: a wrong
 * option filled in makes the gap one students choose, and none makes it one
 * they type. Rows keep their places while the card is open, and every change
 * is handed to `onAnswer` whole.
 */
export function GapCard({
  number,
  question,
  gap,
  rows: initialRows,
  sentence,
  fixed,
  onAnswer,
  onInput,
  onFixed,
  onRemove,
}: Readonly<{
  number: number;
  question: GroupQuestion;
  gap: GapQuestion;
  rows: readonly GapRow[];
  sentence: { before: string; after: string } | null;
  fixed: boolean;
  onAnswer: (answer: {
    rows: readonly GapRow[];
    also: readonly string[];
    prompt: string;
  }) => void;
  onInput: (input: QuestionValues) => void;
  onFixed: (fixed: boolean) => void;
  onRemove: () => void;
}>) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<readonly GapRow[]>(initialRows);
  const [also, setAlso] = useState<readonly string[]>(gap.also);
  const [prompt, setPrompt] = useState(gap.prompt);
  const [mode, setMode] = useState(gap.mode);
  if (mode !== gap.mode) {
    setMode(gap.mode);
    setPrompt(gap.prompt);
  }
  const typed = !rows.some((row) => !row.isCorrect && row.text.trim() !== "");
  const values = memberValues(question.input);
  const name = `gap-correct-${question.id}`;

  function write(next: {
    rows?: readonly GapRow[];
    also?: readonly string[];
    prompt?: string;
  }) {
    if (next.rows) setRows(next.rows);
    if (next.also) setAlso(next.also);
    if (next.prompt !== undefined) setPrompt(next.prompt);
    onAnswer({
      rows: next.rows ?? rows,
      also: next.also ?? also,
      prompt: next.prompt ?? prompt,
    });
  }

  return (
    <div
      data-group-card={question.id}
      className="border-ring bg-card shadow-card min-w-0 rounded-xl border"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b px-3 py-2.25">
        <span className={cn(NUMBER, "bg-primary text-primary-foreground")}>
          {number}
        </span>
        <h3 className="text-[13px] font-semibold whitespace-nowrap">
          {t("groups.pane.gapHead", { number })}
        </h3>
        <label className="text-muted-fg ml-auto flex shrink-0 items-center gap-1.5 text-[12.5px] whitespace-nowrap">
          {t("questionEditor.points")}
          <Input
            type="number"
            min={0.01}
            step={0.5}
            value={question.input.points}
            aria-invalid={question.input.points <= 0}
            className="h-7.5 w-12 rounded-[7px] px-0.5 text-center max-[767px]:h-10 lg:text-[13px]"
            onChange={(event) =>
              onInput({ ...values, points: Number(event.target.value) })
            }
          />
        </label>
        <RowMenu label={t("builder.editor.more")}>
          {typed ? null : (
            <>
              <DropdownMenuCheckboxItem checked={fixed} onCheckedChange={onFixed}>
                {t("groups.fixedOptions")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem variant="destructive" onSelect={onRemove}>
            <Trash2 aria-hidden="true" />
            {t("groups.pane.removeGap")}
          </DropdownMenuItem>
        </RowMenu>
      </div>
      <div className="flex min-w-0 flex-col gap-3 p-3">
        {sentence ? (
          <p className="bg-muted text-muted-fg rounded-[9px] px-3 py-2 text-[13px] leading-[1.7]">
            {sentence.before}
            <span className="bg-primary text-primary-foreground mx-1 inline-grid h-5 min-w-5.5 place-items-center rounded-[6px] px-1.25 align-middle text-[11.5px] font-bold">
              {number}
            </span>
            {sentence.after}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium">
            {t("questionEditor.options")}
          </span>
          <div
            role="group"
            aria-label={t("questionEditor.options")}
            className="flex flex-col gap-1.5"
          >
            {rows.map((row, index) => {
              const letter = optionLetter(index);
              const filled = row.text.trim() !== "";
              return (
                <div
                  key={index}
                  className={cn(
                    "flex min-h-10 items-center gap-2 rounded-[9px] border py-0.75 pr-2.5 pl-0.75 max-[767px]:min-h-11.5",
                    row.isCorrect
                      ? "border-success bg-success-soft"
                      : "border-input bg-background",
                  )}
                >
                  <label
                    className={cn(
                      "has-[:focus-visible]:outline-focus grid size-7.5 flex-none place-items-center rounded-[7px] has-[:focus-visible]:outline-2",
                      filled && "cursor-pointer",
                    )}
                  >
                    <input
                      type="radio"
                      name={name}
                      className="peer sr-only"
                      checked={row.isCorrect}
                      disabled={!filled}
                      aria-label={t("questionEditor.markCorrect", { letter })}
                      onChange={() =>
                        write({
                          rows: rows.map((item, at) => ({
                            ...item,
                            isCorrect: at === index,
                          })),
                        })
                      }
                    />
                    <MarkVisual multiple={false} on={row.isCorrect} />
                  </label>
                  <span
                    aria-hidden="true"
                    className="text-muted-fg w-3.5 flex-none text-[12.5px] font-semibold"
                  >
                    {letter}
                  </span>
                  <Input
                    value={row.text}
                    placeholder={
                      row.isCorrect ? undefined : t("groups.pane.wrongPlaceholder")
                    }
                    aria-label={t("questionEditor.optionLetter", { letter })}
                    className="h-8 min-w-0 flex-1 rounded-[6px] border-transparent bg-transparent px-px shadow-none lg:text-[14px] dark:bg-transparent"
                    onChange={(event) =>
                      write({
                        rows: rows.map((item, at) =>
                          at === index ? { ...item, text: event.target.value } : item,
                        ),
                      })
                    }
                  />
                  {row.isCorrect ? (
                    <span
                      aria-hidden="true"
                      className="text-success-ink flex-none text-xs font-medium whitespace-nowrap"
                    >
                      {t("questionEditor.correct")}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          {typed ? (
            <p className="text-muted-fg flex items-start gap-1.75 text-[12.5px] leading-normal">
              <Info aria-hidden="true" className="mt-0.5 size-3.5 flex-none" />
              <span className="min-w-0 flex-1 text-pretty">
                {t("groups.pane.typedHelp")}
              </span>
            </p>
          ) : null}
          {typed
            ? also.map((answer, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={answer}
                    aria-label={t("questionEditor.gapAnswers.placeholderMore")}
                    placeholder={t("questionEditor.gapAnswers.placeholderMore")}
                    className="h-9 min-w-0 flex-1 max-[767px]:h-11"
                    onChange={(event) =>
                      write({
                        also: also.map((item, at) =>
                          at === index ? event.target.value : item,
                        ),
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-fg flex-none max-[767px]:size-11"
                    aria-label={t("questionEditor.gapAnswers.removeAnswer", {
                      value: answer,
                    })}
                    onClick={() =>
                      write({ also: also.filter((_, at) => at !== index) })
                    }
                  >
                    <X aria-hidden="true" />
                  </Button>
                </div>
              ))
            : null}
          {typed ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7.5 self-start px-2 text-[12.5px] font-medium max-[767px]:h-10"
              onClick={() => write({ also: [...also, ""] })}
            >
              <Plus aria-hidden="true" />
              {t("groups.pane.alsoAccept")}
            </Button>
          ) : null}
        </div>
        <label className="flex flex-col gap-1.5 text-[12.5px] font-medium">
          {t("questionEditor.prompt")}
          <Input
            value={prompt}
            aria-invalid={prompt.trim() === ""}
            className="h-9.5 font-normal max-[767px]:h-11"
            onChange={(event) => write({ prompt: event.target.value })}
          />
        </label>
        <details className="group/more border-t pt-3">
          <summary className="cursor-pointer rounded-[6px] text-[13px] font-medium">
            {t("builder.editor.moreOptions")}
          </summary>
          <div className="mt-3 flex flex-col gap-3.5">
            <ExplanationField value={values} onChange={onInput} />
            <TagsField
              tags={values.tags}
              onChange={(tags) => onInput({ ...values, tags })}
            />
          </div>
        </details>
      </div>
    </div>
  );
}
