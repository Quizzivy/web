import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Ellipsis,
  GripVertical,
  Layers,
  LogOut,
  Pencil,
  TextCursorInput,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/shared/Tooltip";
import { cn } from "@/lib/utils";
import type { GroupBundle } from "@/features/question-groups/api";
import { QUESTION_TYPE_ICONS } from "@/features/question-bank/components/questionTypeIcons";
import { KIND_ICONS } from "@/features/question-groups/kindIcons";
import {
  gapQuestions,
  unfinishedMember,
  type GapQuestion,
} from "@/features/question-groups/gapQuestions";
import {
  groupKind,
  type GroupKind,
  type GroupStart,
} from "@/features/question-groups/kinds";
import { gapBoundMembers } from "../outlineUnits";
import { draftUnkeyed } from "../publishProblem";

/**
 * OutlineGroupRow is a passage, a cloze or a recording in the builder's
 * outline, drawn in the outline's own rows: a header row with its grip,
 * disclosure, the icon of its kind, its title, a mark while one of its
 * questions is not finished, its question count and points, and its "…" menu
 * (Rename, Move up, Move down, Delete); while open, its members as numbered
 * question rows with the deck's type icons and points, indented under a rule.
 * A member that is a gap's question shows the gap's word for its title.
 * Pressing the title opens the group's pane. `start` is how an empty group
 * was started, which names it until it holds something. From 768px the
 * menu's trigger shows on hover, focus and while open, as a section's does;
 * below it the trigger shows at 44px only while the group or one of its
 * members is selected, as a question row's actions do (DG-135). It keeps the
 * members together while selecting, moving or removing it. Its header is
 * where a question is dropped into the group, tinted while `dropInto`; each
 * member row is sortable by its grip and draws the drop line `memberDrop`
 * names, and a member that answers a gap keeps its grip disabled, with the
 * reason. With `onMemberMove`, each member row has its own "…" menu with the
 * same moves (Move up, Move down, Move out, Move to another…), whose trigger
 * takes the place of the points on hover and focus from 768px and at 44px on
 * the selected member below it; a member that answers a gap has its two
 * moves out disabled, with the reason under them, and Move to another… needs
 * `canPickGroup`. `targets` turns off the drop targets the drag in progress
 * cannot use. The member `busyQuestionId` names is being moved and is drawn
 * faded and busy. `open` and `onToggle` are the disclosure, which the outline
 * owns so that a drop can open the group. Rename only asks the builder to
 * act: the group's title is written by its pane, never here, and it asks once
 * the menu has closed, so the focus it moves is not taken back by the menu.
 * Delete hands over the menu's trigger, where focus returns when its dialog
 * closes.
 */
export function OutlineGroupRow({
  id,
  group,
  numbering,
  start,
  drop,
  dropInto = false,
  memberDrop = null,
  busyQuestionId = null,
  targets = "all",
  canPickGroup = false,
  open,
  selected,
  selectedQuestionId,
  canUp,
  canDown,
  onToggle,
  onSelect,
  onRename,
  onStep,
  onRemove,
  onMemberMove,
}: Readonly<{
  id: string;
  group: GroupBundle | undefined;
  numbering: Map<string, number>;
  start?: GroupStart | undefined;
  drop?: "before" | "after" | undefined;
  dropInto?: boolean;
  memberDrop?: MemberDrop | null;
  busyQuestionId?: string | null;
  targets?: GroupTargets;
  canPickGroup?: boolean;
  open: boolean;
  selected: boolean;
  selectedQuestionId: string | null;
  canUp: boolean;
  canDown: boolean;
  onToggle: () => void;
  onSelect: (questionId?: string) => void;
  onRename: () => void;
  onStep: (direction: -1 | 1) => void;
  onRemove: (opener: HTMLElement | null) => void;
  onMemberMove?: MemberMover | undefined;
}>) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: `group:${id}`,
    data: { kind: "group" },
    disabled: { draggable: false, droppable: targets === "inside" },
    transition: null,
  });
  const { setNodeRef: setHeadNodeRef } = useDroppable({
    id: `group:${id}:head`,
    data: { kind: "group-head", groupId: id },
    disabled: targets === "unit",
  });
  const { kind, KindIcon, unfinished } = rowFacts(group, start);
  const title = group?.group.title || t(`groups.kind.${kind}.new`);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div
      ref={setNodeRef}
      data-outline-group={id}
      className={cn("relative flex flex-col gap-0.5", isDragging && "opacity-40")}
    >
      {drop ? (
        <span
          aria-hidden="true"
          data-outline-drop={drop}
          className={cn(
            "bg-primary pointer-events-none absolute inset-x-0 h-0.5",
            drop === "before" ? "top-0" : "bottom-0",
          )}
        />
      ) : null}
      <div ref={setHeadNodeRef}>
        <div
          data-outline-drop-into={dropInto ? "" : undefined}
          className={cn(
            "group/unit text-fg flex min-h-8 items-center gap-1 rounded-[7px] py-0.75 pr-1 pl-0.5 text-[13px] transition-colors duration-120 ease-[cubic-bezier(.25,.1,.25,1)] motion-reduce:transition-none",
            dropInto
              ? "bg-brand-soft"
              : "hover:bg-hover has-data-[state=open]:bg-hover",
            !dropInto && selected && !selectedQuestionId && "bg-secondary font-medium",
          )}
        >
          <button
            type="button"
            aria-label={t("builder.reorderGroup", { title })}
            data-outline-group-grip=""
            {...attributes}
            {...listeners}
            className="text-muted-fg flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center"
          >
            <GripVertical className="size-3.5 opacity-40" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={title}
            aria-expanded={open}
            className="text-muted-fg grid size-5 shrink-0 place-items-center rounded-[5px]"
            onClick={onToggle}
          >
            <Chevron className="size-3.5" aria-hidden="true" />
          </button>
          <KindIcon
            {...(group
              ? { role: "img", "aria-label": t(`groups.kind.${kind}.name`) }
              : { "aria-hidden": true })}
            className="text-muted-fg size-3.5 shrink-0"
          />
          <GroupHeading
            group={group}
            title={title}
            selected={selected}
            unfinished={unfinished}
            onSelect={() => onSelect()}
          />
          <GroupActions
            title={title}
            removeLabel={t(`groups.kind.${kind}.remove`)}
            disabled={!group}
            selected={selected}
            canUp={canUp}
            canDown={canDown}
            onRename={onRename}
            onStep={onStep}
            onRemove={onRemove}
          />
        </div>
      </div>
      {open && group ? (
        <GroupMembers
          group={group}
          numbering={numbering}
          selectedQuestionId={selected ? selectedQuestionId : null}
          memberDrop={memberDrop}
          busyQuestionId={busyQuestionId}
          targeted={targets !== "unit"}
          canPickGroup={canPickGroup}
          onSelect={onSelect}
          onMemberMove={onMemberMove}
        />
      ) : null}
    </div>
  );
}

function rowFacts(
  group: GroupBundle | undefined,
  start: GroupStart | undefined,
): { kind: GroupKind; KindIcon: LucideIcon; unfinished: boolean } {
  if (!group) return { kind: "reading", KindIcon: Layers, unfinished: false };
  const kind = groupKind(group, start);
  return {
    kind,
    KindIcon: KIND_ICONS[kind],
    unfinished: unfinishedMember(group) !== null,
  };
}

function GroupActions({
  title,
  removeLabel,
  disabled,
  selected,
  canUp,
  canDown,
  onRename,
  onStep,
  onRemove,
}: Readonly<{
  title: string;
  removeLabel: string;
  disabled: boolean;
  selected: boolean;
  canUp: boolean;
  canDown: boolean;
  onRename: () => void;
  onStep: (direction: -1 | 1) => void;
  onRemove: (opener: HTMLElement | null) => void;
}>) {
  const { t } = useTranslation();
  const trigger = useRef<HTMLButtonElement>(null);
  const afterClose = useRef<{ run: () => void; focusTrigger: boolean } | null>(null);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={trigger}
          variant="ghost"
          size="icon-xs"
          aria-label={t("builder.groupActions", { title })}
          disabled={disabled}
          className={cn(
            "text-muted-fg shrink-0 rounded-[6px] min-[768px]:opacity-0 min-[768px]:group-focus-within/unit:opacity-100 min-[768px]:group-hover/unit:opacity-100 min-[768px]:data-[state=open]:opacity-100",
            selected ? "max-[767px]:size-11" : "max-[767px]:hidden",
          )}
        >
          <Ellipsis aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-50 data-[state=closed]:animate-none! data-[state=open]:animate-none!"
        onCloseAutoFocus={(event) => {
          const next = afterClose.current;
          afterClose.current = null;
          if (!next) return;
          if (!next.focusTrigger) event.preventDefault();
          next.run();
        }}
      >
        <DropdownMenuItem
          onSelect={() => {
            afterClose.current = { run: onRename, focusTrigger: false };
          }}
        >
          <Pencil aria-hidden="true" />
          {t("builder.renameGroup")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canUp} onSelect={() => onStep(-1)}>
          <ChevronUp aria-hidden="true" />
          {t("builder.groupMoveUp")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canDown} onSelect={() => onStep(1)}>
          <ChevronDown aria-hidden="true" />
          {t("builder.groupMoveDown")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onRemove(trigger.current)}
        >
          <Trash2 aria-hidden="true" />
          {removeLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * GroupTargets says which of a group's drop targets the drag in progress can
 * land on: the whole group as one unit, its header and members, or all of them
 * while nothing is dragged.
 */
export type GroupTargets = "unit" | "inside" | "all";

/** MemberDrop names the member row a dragged question would land before or after. */
export interface MemberDrop {
  questionId: string;
  position: "before" | "after";
}

type MemberInput = GroupBundle["questions"][number]["input"];

function memberFace(
  input: MemberInput | undefined,
  gap: GapQuestion | undefined,
): { icon: LucideIcon; title: string } {
  if (gap)
    return {
      icon: gap.mode === "typed" ? TextCursorInput : QUESTION_TYPE_ICONS.single_choice,
      title: gap.word,
    };
  return {
    icon: QUESTION_TYPE_ICONS[input?.type ?? "single_choice"],
    title: input?.prompt ?? "",
  };
}

function GroupMembers({
  group,
  numbering,
  selectedQuestionId,
  memberDrop,
  busyQuestionId,
  targeted,
  canPickGroup,
  onSelect,
  onMemberMove,
}: Readonly<{
  group: GroupBundle;
  numbering: Map<string, number>;
  selectedQuestionId: string | null;
  memberDrop: MemberDrop | null;
  busyQuestionId: string | null;
  targeted: boolean;
  canPickGroup: boolean;
  onSelect: (questionId: string) => void;
  onMemberMove: MemberMover | undefined;
}>) {
  const { t } = useTranslation();
  const questions = new Map(
    group.questions.map((question) => [question.id, question.input]),
  );
  const bound = gapBoundMembers(group);
  const gaps = gapQuestions(group);
  const members = group.group.members;
  return (
    <SortableContext
      items={members.map((member) => `question:${member.questionId}`)}
      strategy={verticalListSortingStrategy}
    >
      <div className="ml-4.5 flex flex-col gap-px border-l pl-1.5">
        {members.map((member, index) => (
          <MemberRow
            key={member.questionId}
            groupId={group.group.id}
            questionId={member.questionId}
            index={index}
            count={members.length}
            canPickGroup={canPickGroup}
            input={questions.get(member.questionId)}
            gap={gaps.get(member.questionId)}
            number={numbering.get(member.questionId) ?? 0}
            bound={bound.has(member.questionId)}
            targeted={targeted}
            current={selectedQuestionId === member.questionId}
            busy={busyQuestionId === member.questionId}
            drop={
              memberDrop?.questionId === member.questionId
                ? memberDrop.position
                : undefined
            }
            onSelect={() => onSelect(member.questionId)}
            onMove={
              onMemberMove &&
              ((action, opener) =>
                onMemberMove(group.group.id, member.questionId, action, opener))
            }
          />
        ))}
        {members.length === 0 ? (
          <p className="text-muted-fg px-1.5 py-1.5 text-xs leading-normal">
            {t("builder.emptySharedGroup")}
          </p>
        ) : null}
      </div>
    </SortableContext>
  );
}

function MemberRow({
  groupId,
  questionId,
  index,
  count,
  canPickGroup,
  input,
  gap,
  number,
  bound,
  targeted,
  current,
  busy,
  drop,
  onSelect,
  onMove,
}: Readonly<{
  groupId: string;
  questionId: string;
  index: number;
  count: number;
  canPickGroup: boolean;
  input: MemberInput | undefined;
  gap: GapQuestion | undefined;
  number: number;
  bound: boolean;
  targeted: boolean;
  current: boolean;
  busy: boolean;
  drop: "before" | "after" | undefined;
  onSelect: () => void;
  onMove: ((action: MemberMoveAction, opener: HTMLElement | null) => void) | undefined;
}>) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: `question:${questionId}`,
    data: { kind: "member", groupId },
    disabled: { draggable: bound, droppable: !targeted },
    transition: null,
  });
  const face = memberFace(input, gap);
  const Icon = face.icon;
  const problemId = useId();
  const problem = input && draftUnkeyed(input) ? t("builder.noCorrectAnswer") : null;
  return (
    <div
      ref={setNodeRef}
      data-outline-row=""
      data-outline-question={questionId}
      aria-busy={busy || undefined}
      className={cn(
        "group/member hover:bg-hover text-fg relative flex min-h-8 min-w-0 items-center gap-1 rounded-[7px] py-0.75 pr-1 pl-0.5 text-[13px]",
        current && "bg-secondary font-medium",
        (isDragging || busy) && "opacity-40",
      )}
    >
      {drop ? (
        <span
          aria-hidden="true"
          data-outline-drop={drop}
          className={cn(
            "bg-primary pointer-events-none absolute inset-x-0 h-0.5",
            drop === "before" ? "top-0" : "bottom-0",
          )}
        />
      ) : null}
      {bound ? (
        <BoundGrip number={number} />
      ) : (
        <button
          type="button"
          data-outline-grip=""
          aria-label={t("builder.reorderMember", { number })}
          className="text-muted-fg flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5 opacity-40" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1 text-left"
        aria-describedby={problem ? problemId : undefined}
        onClick={onSelect}
      >
        <span className="text-muted-fg w-4.5 shrink-0 text-xs tabular-nums">
          {number}
        </span>
        <Icon className="text-muted-fg size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate px-1 py-0.75 leading-4">
          {face.title || t("builder.untitledQuestion")}
        </span>
        {problem ? (
          <CircleAlert className="text-warning size-3.5 shrink-0" aria-hidden="true">
            <title>{problem}</title>
          </CircleAlert>
        ) : null}
        {input ? (
          <span
            className={cn(
              "text-muted-fg shrink-0 pr-1 text-xs whitespace-nowrap tabular-nums",
              onMove &&
                "min-[768px]:group-hover/member:hidden min-[768px]:group-has-data-[state=open]/member:hidden min-[768px]:group-has-[:focus-visible]/member:hidden",
              onMove && current && "max-[767px]:hidden",
            )}
          >
            {t("builder.points", { count: input.points })}
          </span>
        ) : null}
      </button>
      {problem ? (
        <span id={problemId} className="sr-only">
          {problem}
        </span>
      ) : null}
      {onMove ? (
        <MemberActions
          number={number}
          bound={bound}
          current={current}
          canUp={index > 0}
          canDown={index < count - 1}
          canPickGroup={canPickGroup}
          onMove={onMove}
        />
      ) : null}
    </div>
  );
}

/** MemberMoveAction is one of a member's menu moves: within its group, out of it, or to another group. */
export type MemberMoveAction = "up" | "down" | "out" | "group";

/** MemberMover carries out a member's menu move; "group" names the menu's trigger, where focus returns. */
export type MemberMover = (
  groupId: string,
  questionId: string,
  action: MemberMoveAction,
  opener: HTMLElement | null,
) => void;

function MemberActions({
  number,
  bound,
  current,
  canUp,
  canDown,
  canPickGroup,
  onMove,
}: Readonly<{
  number: number;
  bound: boolean;
  current: boolean;
  canUp: boolean;
  canDown: boolean;
  canPickGroup: boolean;
  onMove: (action: MemberMoveAction, opener: HTMLElement | null) => void;
}>) {
  const { t } = useTranslation();
  const trigger = useRef<HTMLButtonElement>(null);
  const picking = useRef(false);
  const reason = useId();
  return (
    <span
      className={cn(
        "flex shrink-0 min-[768px]:pointer-events-none min-[768px]:-ml-1 min-[768px]:w-0 min-[768px]:overflow-hidden min-[768px]:opacity-0",
        "min-[768px]:group-hover/member:pointer-events-auto min-[768px]:group-hover/member:ml-0 min-[768px]:group-hover/member:w-auto min-[768px]:group-hover/member:overflow-visible min-[768px]:group-hover/member:opacity-100",
        "min-[768px]:group-has-[:focus-visible]/member:pointer-events-auto min-[768px]:group-has-[:focus-visible]/member:ml-0 min-[768px]:group-has-[:focus-visible]/member:w-auto min-[768px]:group-has-[:focus-visible]/member:overflow-visible min-[768px]:group-has-[:focus-visible]/member:opacity-100",
        "min-[768px]:has-data-[state=open]:pointer-events-auto min-[768px]:has-data-[state=open]:ml-0 min-[768px]:has-data-[state=open]:w-auto min-[768px]:has-data-[state=open]:overflow-visible min-[768px]:has-data-[state=open]:opacity-100",
        !current && "max-[767px]:hidden",
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            variant="ghost"
            size="icon-xs"
            aria-label={t("builder.memberActions", { number })}
            className="text-muted-fg shrink-0 rounded-[6px] max-[767px]:size-11"
          >
            <Ellipsis aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56 data-[state=closed]:animate-none! data-[state=open]:animate-none!"
          onCloseAutoFocus={() => {
            if (!picking.current) return;
            picking.current = false;
            onMove("group", trigger.current);
          }}
        >
          <DropdownMenuItem disabled={!canUp} onSelect={() => onMove("up", null)}>
            <ChevronUp aria-hidden="true" />
            {t("builder.memberMoveUp")}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canDown} onSelect={() => onMove("down", null)}>
            <ChevronDown aria-hidden="true" />
            {t("builder.memberMoveDown")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={bound}
            aria-describedby={bound ? reason : undefined}
            onSelect={() => onMove("out", null)}
          >
            <LogOut aria-hidden="true" />
            {t("builder.moveOutOfGroup")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={bound || !canPickGroup}
            aria-describedby={bound ? reason : undefined}
            onSelect={() => {
              picking.current = true;
            }}
          >
            <Layers aria-hidden="true" />
            {t("builder.moveToGroup")}
          </DropdownMenuItem>
          {bound ? (
            <p
              id={reason}
              className="text-muted-fg px-2 pt-1 pb-1.5 text-xs leading-normal"
            >
              {t("builder.memberGapBound")}
            </p>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

function BoundGrip({ number }: Readonly<{ number: number }>) {
  const { t } = useTranslation();
  const reason = useId();
  return (
    <>
      <Tooltip label={t("builder.memberGapBound")}>
        <button
          type="button"
          data-outline-grip=""
          aria-label={t("builder.reorderMember", { number })}
          aria-disabled="true"
          aria-describedby={reason}
          className="text-muted-fg flex h-6 w-5 shrink-0 cursor-not-allowed items-center justify-center"
        >
          <GripVertical className="size-3.5 opacity-20" aria-hidden="true" />
        </button>
      </Tooltip>
      <span id={reason} className="sr-only">
        {t("builder.memberGapBound")}
      </span>
    </>
  );
}

function groupPoints(group: GroupBundle): number {
  return group.questions.reduce((sum, question) => sum + question.input.points, 0);
}

function GroupHeading({
  group,
  title,
  selected,
  unfinished,
  onSelect,
}: Readonly<{
  group: GroupBundle | undefined;
  title: string;
  selected: boolean;
  unfinished: boolean;
  onSelect: () => void;
}>) {
  const { t } = useTranslation();
  const name = "min-w-0 flex-1 truncate px-1 py-0.75 text-left leading-4 font-medium";
  if (!group)
    return (
      <button type="button" className={name} disabled>
        <Skeleton className="h-3 w-full" />
      </button>
    );
  return (
    <>
      <button type="button" className={name} onClick={onSelect}>
        {title}
      </button>
      {unfinished ? (
        <CircleAlert
          role="img"
          aria-label={t("builder.groupNeedsWork")}
          className="text-warning-ink size-3.5 shrink-0"
        />
      ) : null}
      <span
        className={cn(
          "text-muted-fg shrink-0 text-xs whitespace-nowrap tabular-nums",
          selected && "max-[767px]:hidden",
        )}
      >
        {t("builder.sectionSummary", {
          questions: group.group.members.length,
          points: groupPoints(group),
        })}
      </span>
    </>
  );
}
