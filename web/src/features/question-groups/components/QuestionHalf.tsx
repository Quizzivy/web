import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronUp,
  Ellipsis,
  Layers,
  ListPlus,
  LogOut,
  MousePointerClick,
  Plus,
  TextCursorInput,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { MediaAsset } from "@/features/media/api";
import { QUESTION_TYPE_ICONS } from "@/features/question-bank/components/questionTypeIcons";
import type {
  QuestionType,
  QuestionValues,
} from "@/features/question-bank/questionSchema";
import { QUESTION_TYPES } from "@/features/question-bank/questionType";
import type { GroupBundle } from "../api";
import { gapRows, gapSentence, type GapQuestion, type GapRow } from "../gapQuestions";
import type { GroupKind } from "../kinds";
import { hasOptionOrderChoice, type GroupQuestion } from "../model";
import { ClosedCard, GapCard, QuestionCard } from "./QuestionCards";

type Member = GroupBundle["group"]["members"][number];

const QUICK_TYPES: readonly QuestionType[] = [
  "single_choice",
  "multiple_choice",
  "true_false",
  "fill_blank",
  "short_answer",
];
const CHIP =
  "bg-card h-7.5 gap-1.5 rounded-[8px] px-2.5 text-[12.5px] font-medium shadow-none max-[767px]:h-10 [&_svg]:text-muted-fg";

/**
 * GroupMoves are the moves of a member that leave its group, which only a
 * host that holds the test can carry out: out to the section, and to another
 * group, left out when the test has none.
 */
export interface GroupMoves {
  out: (questionId: string) => void;
  toAnother?: ((questionId: string) => void) | undefined;
}

/** QuestionActions are what the right half asks of the pane. */
export interface QuestionActions {
  open: (questionId: string) => void;
  answer: (
    gap: GapQuestion,
    answer: { rows: readonly GapRow[]; also: readonly string[]; prompt: string },
  ) => void;
  changeQuestion: (questionId: string, input: QuestionValues) => void;
  keepOrder: (questionId: string, fixed: boolean) => void;
  moveMember: (questionId: string, direction: -1 | 1) => void;
  removeGap: (gap: GapQuestion) => void;
  askRemoveQuestion: (questionId: string) => void;
  addQuestion: (type: QuestionType) => void;
  onAsset: (asset: MediaAsset) => void;
  onRefresh: () => void;
}

/**
 * StackView is what the right half needs to know of the group beside the
 * bundle: each member's number in the test, the members that are a gap's
 * question, the members some gap points at, the card that is open and the
 * questions still holding their starter prompt.
 */
export interface StackView {
  numbers: ReadonlyMap<string, number>;
  gaps: ReadonlyMap<string, GapQuestion>;
  bound: ReadonlySet<string>;
  openId: string | null;
  starters: ReadonlySet<string>;
}

/**
 * QuestionHalf is the right half of a group's pane: its questions as a stack
 * of cards, one open and the rest a line each, numbered as in the test; under
 * them the row that adds a question by type, or, when every question answers
 * a gap (`gapsOnly`), the line that says how the next gap is made. `heading`
 * names the half and is read out only while the halves stand side by side
 * (`shown`), since a tab carries it otherwise.
 */
export function QuestionHalf({
  hidden,
  shown,
  heading,
  bundle,
  kind,
  gapsOnly,
  view,
  assets,
  moves,
  actions,
}: Readonly<{
  hidden: boolean;
  shown: boolean;
  heading: string;
  bundle: GroupBundle;
  kind: GroupKind;
  gapsOnly: boolean;
  view: StackView;
  assets: ReadonlyMap<string, MediaAsset>;
  moves: GroupMoves | undefined;
  actions: QuestionActions;
}>) {
  const { t } = useTranslation();
  const { members } = bundle.group;
  const questions = new Map(bundle.questions.map((item) => [item.id, item]));
  return (
    <section
      aria-label={heading}
      hidden={hidden}
      className={cn(
        "min-w-0 flex-1 basis-0 flex-col gap-2",
        hidden ? "hidden" : "flex",
      )}
    >
      <h3
        className={cn(
          "min-h-5.5 items-center px-0.5 text-[13px] font-semibold",
          shown ? "flex" : "sr-only",
        )}
      >
        {heading}
      </h3>
      {members.length === 0 ? (
        <EmptyStack
          icon={gapsOnly ? TextCursorInput : ListPlus}
          text={t(gapsOnly ? "groups.pane.gapsEmpty" : "groups.pane.questionsEmpty")}
        />
      ) : null}
      {members.map((member, index) => {
        const question = questions.get(member.questionId);
        return question ? (
          <MemberCard
            key={member.questionId}
            bundle={bundle}
            kind={kind}
            member={member}
            question={question}
            place={{ index, count: members.length }}
            view={view}
            assets={assets}
            moves={moves}
            actions={actions}
          />
        ) : null;
      })}
      {gapsOnly ? null : (
        <AddQuestion
          label={t(`groups.kind.${kind}.addQuestion`)}
          full={members.length >= 200}
          onAdd={actions.addQuestion}
        />
      )}
      {gapsOnly && members.length > 0 ? (
        <div className="bg-muted text-muted-fg flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-[12.5px] leading-normal">
          <MousePointerClick aria-hidden="true" className="mt-px size-3.75 flex-none" />
          <span className="min-w-0 flex-1 text-pretty">{t("groups.pane.gapHint")}</span>
        </div>
      ) : null}
    </section>
  );
}

function EmptyStack({
  icon: Icon,
  text,
}: Readonly<{ icon: typeof ListPlus; text: string }>) {
  return (
    <div className="border-ring flex flex-col items-center gap-2 rounded-xl border border-dashed px-5 py-8 text-center max-[767px]:px-4 max-[767px]:py-6">
      <span className="bg-muted grid size-10 place-items-center rounded-[11px]">
        <Icon aria-hidden="true" className="size-4.75" />
      </span>
      <span className="text-muted-fg max-w-[34ch] text-[13.5px] text-pretty">
        {text}
      </span>
    </div>
  );
}

function sentenceOf(bundle: GroupBundle, gap: GapQuestion, view: StackView) {
  const source = bundle.group.stimuli.find((item) => item.id === gap.materialId);
  if (source?.content.format !== "semantic_v1") return null;
  return gapSentence(source.content, gap.gapId, (id) => {
    const other = source.gaps.find((item) => item.gapId === id);
    return (other && view.gaps.get(other.questionId)?.word) || "___";
  });
}

function MemberCard({
  bundle,
  kind,
  member,
  question,
  place,
  view,
  assets,
  moves,
  actions,
}: Readonly<{
  bundle: GroupBundle;
  kind: GroupKind;
  member: Member;
  question: GroupQuestion;
  place: { index: number; count: number };
  view: StackView;
  assets: ReadonlyMap<string, MediaAsset>;
  moves: GroupMoves | undefined;
  actions: QuestionActions;
}>) {
  const { t } = useTranslation();
  const id = member.questionId;
  const number = view.numbers.get(id) ?? place.index + 1;
  const gap = view.gaps.get(id);
  if (id !== view.openId)
    return (
      <ClosedCard
        number={number}
        question={question}
        gap={gap}
        onOpen={() => actions.open(id)}
      />
    );
  if (gap)
    return (
      <GapCard
        number={number}
        question={question}
        gap={gap}
        rows={gapRows(bundle, gap)}
        sentence={sentenceOf(bundle, gap, view)}
        fixed={member.optionOrder === "fixed"}
        onAnswer={(answer) => actions.answer(gap, answer)}
        onInput={(input) => actions.changeQuestion(id, input)}
        onFixed={(fixed) => actions.keepOrder(id, fixed)}
        onRemove={() => actions.removeGap(gap)}
      />
    );
  const held = view.bound.has(id);
  return (
    <QuestionCard
      number={number}
      question={question}
      assets={assets}
      starter={view.starters.has(id)}
      note={
        held ? (
          <p className="text-muted-fg border-t px-4 py-2.5 text-xs">
            {t("groups.removeBoundHint")}
          </p>
        ) : null
      }
      menu={
        <MemberMenu
          kind={kind}
          member={member}
          question={question}
          place={place}
          held={held}
          moves={moves}
          actions={actions}
        />
      }
      onChange={(input) => actions.changeQuestion(id, input)}
      onAsset={actions.onAsset}
      onRefresh={actions.onRefresh}
    />
  );
}

function MemberMenu({
  kind,
  member,
  question,
  place,
  held,
  moves,
  actions,
}: Readonly<{
  kind: GroupKind;
  member: Member;
  question: GroupQuestion;
  place: { index: number; count: number };
  held: boolean;
  moves: GroupMoves | undefined;
  actions: QuestionActions;
}>) {
  const { t } = useTranslation();
  const id = member.questionId;
  const toAnother = moves?.toAnother;
  return (
    <>
      <DropdownMenuItem
        disabled={held || place.index === 0}
        onSelect={() => actions.moveMember(id, -1)}
      >
        <ChevronUp aria-hidden="true" />
        {t("groups.moveMemberUp")}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={held || place.index === place.count - 1}
        onSelect={() => actions.moveMember(id, 1)}
      >
        <ChevronDown aria-hidden="true" />
        {t("groups.moveMemberDown")}
      </DropdownMenuItem>
      {moves ? (
        <DropdownMenuItem disabled={held} onSelect={() => moves.out(id)}>
          <LogOut aria-hidden="true" />
          {t(`groups.kind.${kind}.moveOut`)}
        </DropdownMenuItem>
      ) : null}
      {toAnother ? (
        <DropdownMenuItem disabled={held} onSelect={() => toAnother(id)}>
          <Layers aria-hidden="true" />
          {t("builder.moveToGroup")}
        </DropdownMenuItem>
      ) : null}
      {hasOptionOrderChoice(question.input.type) ? (
        <KeepOrder
          checked={member.optionOrder === "fixed"}
          onChange={(fixed) => actions.keepOrder(id, fixed)}
        />
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabled={held}
        onSelect={() => actions.askRemoveQuestion(id)}
      >
        <Trash2 aria-hidden="true" />
        {t("groups.removeQuestion")}
      </DropdownMenuItem>
    </>
  );
}

function KeepOrder({
  checked,
  onChange,
}: Readonly<{ checked: boolean; onChange: (fixed: boolean) => void }>) {
  const { t } = useTranslation();
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuCheckboxItem checked={checked} onCheckedChange={onChange}>
        {t("groups.fixedOptions")}
      </DropdownMenuCheckboxItem>
    </>
  );
}

function AddQuestion({
  label,
  full,
  onAdd,
}: Readonly<{ label: string; full: boolean; onAdd: (type: QuestionType) => void }>) {
  const { t } = useTranslation();
  const item = (type: QuestionType): ReactNode => {
    const Icon = QUESTION_TYPE_ICONS[type];
    return (
      <>
        <Icon aria-hidden="true" />
        {t(`questionEditor.type.${type}`)}
      </>
    );
  };
  return (
    <div className="bg-muted flex flex-col gap-2 rounded-xl px-3 py-2.5">
      <span className="flex items-center gap-2 text-[12.5px] font-semibold">
        <Plus aria-hidden="true" className="size-3.5" />
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_TYPES.map((type) => (
          <Button
            key={type}
            type="button"
            variant="outline"
            className={CHIP}
            disabled={full}
            onClick={() => onAdd(type)}
          >
            {item(type)}
          </Button>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className={CHIP} disabled={full}>
              <Ellipsis aria-hidden="true" />
              {t("groups.pane.moreTypes")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-55">
            {QUESTION_TYPES.filter((type) => !QUICK_TYPES.includes(type)).map(
              (type) => (
                <DropdownMenuItem key={type} onSelect={() => onAdd(type)}>
                  {item(type)}
                </DropdownMenuItem>
              ),
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
