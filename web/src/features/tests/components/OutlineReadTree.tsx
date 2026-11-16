import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ChevronDown, ChevronRight, Headphones, ScrollText } from "lucide-react";
import { MarqueeText } from "@/components/shared/MarqueeText";
import { QUESTION_TYPE_ICONS } from "@/features/question-bank/components/questionTypeIcons";
import type { GroupBundle } from "@/features/question-groups/api";
import { gapQuestions } from "@/features/question-groups/gapQuestions";
import { KIND_ICONS } from "@/features/question-groups/kindIcons";
import { groupKind } from "@/features/question-groups/kinds";
import { cn } from "@/lib/utils";
import type { OutlineSection } from "../outline";
import { sectionQuestionIds, unitsOf } from "../outlineUnits";
import type { OutlineQuestion } from "./OutlineTree";

const ROW =
  "hover:bg-hover text-fg flex min-h-8 w-full min-w-0 items-center gap-1 rounded-[7px] py-0.75 pr-1 pl-1.5 text-left text-[13px] max-[1023px]:min-h-11";

/**
 * OutlineReadTree is the builder's outline for a Can-use recipient (R7 Access
 * Modes, note 4): the same card, sections and rows as `OutlineTree`, with no
 * drag grips, no row or section menus and no add buttons. A section still
 * opens and closes, a question row opens the question, and a passage, a
 * cloze or a recording opens its pane, all read-only.
 */
export function OutlineReadTree({
  sections,
  questions,
  groups,
  selectedId,
  selectedGroupId,
  onSelect,
  onSelectGroup,
}: Readonly<{
  sections: readonly OutlineSection[];
  questions: ReadonlyMap<string, OutlineQuestion>;
  groups: Map<string, GroupBundle>;
  selectedId: string | null;
  selectedGroupId: string | null;
  onSelect: (questionId: string) => void;
  onSelectGroup: (groupId: string, questionId?: string) => void;
}>) {
  const { t } = useTranslation();
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const numbers = numberQuestions(sections, groups);
  const settled = sections.every((section) =>
    unitsOf(section).every((unit) =>
      unit.kind === "question" ? questions.has(unit.id) : groups.has(unit.id),
    ),
  );
  const total = sections.reduce(
    (sum, section) => sum + sectionPoints(section, questions, groups),
    0,
  );
  return (
    <nav
      aria-label={t("builder.outline")}
      className="bg-card shadow-card flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border"
    >
      <div className="flex shrink-0 items-center gap-2 border-b px-3.5 py-3">
        <p className="text-[13px] font-semibold">{t("builder.outline")}</p>
        <p className="text-muted-fg ml-auto shrink-0 text-xs leading-[18px] tabular-nums">
          {settled
            ? t("builder.outlineSummary", { questions: numbers.size, points: total })
            : t("common.loading")}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-1.5">
        {sections.map((section, index) => {
          const key = section.id ?? `section-${index}`;
          const open = !closed.has(key);
          const Chevron = open ? ChevronDown : ChevronRight;
          return (
            <div
              key={key}
              data-outline-section={section.id ?? undefined}
              className="pb-0.5"
            >
              <button
                type="button"
                aria-expanded={open}
                className="hover:bg-hover flex min-h-8 w-full min-w-0 items-center gap-1.25 rounded-[7px] px-2 py-1 text-left leading-4 max-[1023px]:min-h-11"
                onClick={() => setClosed((current) => toggle(current, key))}
              >
                <Chevron
                  aria-hidden="true"
                  className="text-muted-fg size-3.5 shrink-0"
                />
                <MarqueeText
                  text={section.title}
                  minSeconds={6}
                  gapPx={28}
                  maskPx={10}
                  className="text-meta min-w-0 flex-1 leading-4 font-semibold"
                />
                <span className="text-muted-fg ml-auto shrink-0 pl-1.5 text-xs leading-[15px] font-medium tabular-nums">
                  {settled
                    ? t("builder.sectionSummary", {
                        questions: sectionQuestionIds(section, groups).length,
                        points: sectionPoints(section, questions, groups),
                      })
                    : t("common.loading")}
                </span>
              </button>
              {open && section.instructions ? (
                <p className="text-muted-fg mb-1 ml-6.5 flex items-center gap-1.5 px-1.5 py-1 text-xs leading-[1.45]">
                  <ScrollText aria-hidden="true" className="size-3.25 shrink-0" />
                  <span className="min-w-0 truncate">{section.instructions}</span>
                </p>
              ) : null}
              {open ? (
                <ul className="ml-3.5 space-y-px border-l pl-1">
                  {unitsOf(section).map((unit) =>
                    unit.kind === "group" ? (
                      <GroupRow
                        key={`group:${unit.id}`}
                        group={groups.get(unit.id)}
                        numbers={numbers}
                        selected={selectedGroupId === unit.id}
                        selectedId={selectedId}
                        onSelect={(questionId) => onSelectGroup(unit.id, questionId)}
                      />
                    ) : (
                      <li key={`question:${unit.id}`} data-outline-question={unit.id}>
                        <QuestionRow
                          number={numbers.get(unit.id) ?? 0}
                          question={questions.get(unit.id)}
                          selected={selectedGroupId === null && selectedId === unit.id}
                          onSelect={() => onSelect(unit.id)}
                        />
                      </li>
                    ),
                  )}
                  {unitsOf(section).length === 0 ? (
                    <li className="text-muted-fg px-1.5 py-1.5 text-xs leading-normal">
                      {t("builder.sectionEmpty")}
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function QuestionRow({
  number,
  question,
  selected,
  onSelect,
}: Readonly<{
  number: number;
  question: OutlineQuestion | undefined;
  selected: boolean;
  onSelect: () => void;
}>) {
  const { t } = useTranslation();
  const Icon = question?.hasAudio
    ? Headphones
    : QUESTION_TYPE_ICONS[question?.type ?? "single_choice"];
  return (
    <button
      type="button"
      aria-current={selected || undefined}
      disabled={question === undefined}
      className={cn(ROW, selected && "bg-secondary font-medium")}
      onClick={onSelect}
    >
      <span className="text-muted-fg w-4.5 shrink-0 text-xs tabular-nums">
        {number}
      </span>
      {question === undefined ? (
        <span className="bg-muted inline-block h-3 w-full animate-pulse rounded" />
      ) : (
        <>
          <Icon aria-hidden="true" className="text-muted-fg size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate px-1 py-0.75 leading-4">
            {titleOf(question.prompt.trim(), t)}
          </span>
          <span className="text-muted-fg shrink-0 pr-1 text-xs whitespace-nowrap tabular-nums">
            {t("builder.points", { count: question.points })}
          </span>
        </>
      )}
    </button>
  );
}

function GroupRow({
  group,
  numbers,
  selected,
  selectedId,
  onSelect,
}: Readonly<{
  group: GroupBundle | undefined;
  numbers: ReadonlyMap<string, number>;
  selected: boolean;
  selectedId: string | null;
  onSelect: (questionId?: string) => void;
}>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  if (group === undefined)
    return (
      <li className={ROW}>
        <span className="bg-muted inline-block h-3 w-full animate-pulse rounded" />
      </li>
    );
  const kind = groupKind(group);
  const KindIcon = KIND_ICONS[kind];
  const title = group.group.title || t(`groups.kind.${kind}.new`);
  const inputs = new Map(
    group.questions.map((question) => [question.id, question.input]),
  );
  const gaps = gapQuestions(group);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <li data-outline-group={group.group.id} className="flex flex-col gap-0.5">
      <div
        className={cn(
          "hover:bg-hover flex min-h-8 min-w-0 items-center gap-1 rounded-[7px] py-0.75 pr-1 pl-0.5 text-[13px] max-[1023px]:min-h-11",
          selected && selectedId === null && "bg-secondary font-medium",
        )}
      >
        <button
          type="button"
          aria-label={title}
          aria-expanded={open}
          className="text-muted-fg grid size-5 shrink-0 place-items-center rounded-[5px] max-[1023px]:size-11"
          onClick={() => setOpen((current) => !current)}
        >
          <Chevron aria-hidden="true" className="size-3.5" />
        </button>
        <KindIcon
          role="img"
          aria-label={t(`groups.kind.${kind}.name`)}
          className="text-muted-fg size-3.5 shrink-0"
        />
        <button
          type="button"
          aria-current={(selected && selectedId === null) || undefined}
          className="min-w-0 flex-1 truncate px-1 py-0.75 text-left leading-4 font-medium"
          onClick={() => onSelect()}
        >
          {title}
        </button>
        <span className="text-muted-fg shrink-0 text-xs whitespace-nowrap tabular-nums">
          {t("builder.sectionSummary", {
            questions: group.group.members.length,
            points: group.questions.reduce((sum, item) => sum + item.input.points, 0),
          })}
        </span>
      </div>
      {open ? (
        <ul className="ml-4.5 flex flex-col gap-px border-l pl-1.5">
          {group.group.members.map((member) => {
            const input = inputs.get(member.questionId);
            const gap = gaps.get(member.questionId);
            const Icon = QUESTION_TYPE_ICONS[input?.type ?? "single_choice"];
            const current = selected && selectedId === member.questionId;
            return (
              <li key={member.questionId} data-outline-question={member.questionId}>
                <button
                  type="button"
                  aria-current={current || undefined}
                  className={cn(ROW, "pl-0.5", current && "bg-secondary font-medium")}
                  onClick={() => onSelect(member.questionId)}
                >
                  <span className="text-muted-fg w-4.5 shrink-0 text-xs tabular-nums">
                    {numbers.get(member.questionId) ?? 0}
                  </span>
                  <Icon
                    aria-hidden="true"
                    className="text-muted-fg size-3.5 shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate px-1 py-0.75 leading-4">
                    {titleOf(gap?.word ?? input?.prompt.trim() ?? "", t)}
                  </span>
                  {input ? (
                    <span className="text-muted-fg shrink-0 pr-1 text-xs whitespace-nowrap tabular-nums">
                      {t("builder.points", { count: input.points })}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
          {group.group.members.length === 0 ? (
            <li className="text-muted-fg px-1.5 py-1.5 text-xs leading-normal">
              {t("builder.emptySharedGroup")}
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

function numberQuestions(
  sections: readonly OutlineSection[],
  groups: Map<string, GroupBundle>,
): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const section of sections)
    for (const id of sectionQuestionIds(section, groups))
      numbers.set(id, numbers.size + 1);
  return numbers;
}

function sectionPoints(
  section: OutlineSection,
  questions: ReadonlyMap<string, OutlineQuestion>,
  groups: ReadonlyMap<string, GroupBundle>,
): number {
  return unitsOf(section).reduce(
    (sum, unit) =>
      sum +
      (unit.kind === "question"
        ? (questions.get(unit.id)?.points ?? 0)
        : (groups
            .get(unit.id)
            ?.questions.reduce(
              (points, question) => points + question.input.points,
              0,
            ) ?? 0)),
    0,
  );
}

function toggle(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(set);
  if (!next.delete(key)) next.add(key);
  return next;
}

function titleOf(label: string, t: TFunction): string {
  return label === "" ? t("builder.untitledQuestion") : label;
}
