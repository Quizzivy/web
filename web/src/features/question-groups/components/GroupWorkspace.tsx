import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { Editor } from "@tiptap/react";
import { List, Plus, TextCursorInput, type LucideIcon } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { SemanticContent } from "@/components/shared/content/model";
import type { QuestionContent } from "@/components/shared/content/questionContent";
import { useWidthAtLeast } from "@/hooks/useWidthAtLeast";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { LibraryAsset, MediaAsset } from "@/features/media/api";
import type {
  QuestionType,
  QuestionValues,
} from "@/features/question-bank/questionSchema";
import { retype } from "@/features/question-bank/questionType";
import type { GroupBundle } from "../api";
import {
  makeGap,
  refreshGapFaces,
  showGapFaces,
  unmakeGap,
  type GapFace,
} from "../gapEditing";
import {
  boundQuestionIds,
  gapQuestions,
  unfinishedMember,
  withGapAnswer,
  withMaterialContent,
  type GapPrompts,
  type GapQuestion,
  type MaterialContext,
  type RemovedGap,
} from "../gapQuestions";
import { KIND_ICONS } from "../kindIcons";
import { answersOnlyGaps, groupKind, type GroupStart } from "../kinds";
import {
  hasText,
  leadAudio,
  transcriptText,
  withLeadRecording,
  withRecordings,
  withText,
  withoutLeadRecording,
} from "../materialParts";
import {
  memberOptionOrder,
  memberValues,
  newGroupQuestion,
  withMembers,
  type GroupGapBinding,
  type GroupMaterial,
  type GroupQuestion,
  type GroupRecording,
} from "../model";
import { materialView } from "../paneView";
import { GroupHeading } from "./GroupHeading";
import { MaterialHalf, type MaterialActions } from "./MaterialHalf";
import { QuestionHalf, type GroupMoves, type QuestionActions } from "./QuestionHalf";

const HALVES_MIN = 560;
const EMPTY_TEXT: SemanticContent = {
  format: "semantic_v1",
  blocks: [{ type: "paragraph", content: [] }],
};

type Asking =
  | { kind: "question"; id: string }
  | { kind: "recording" }
  | { kind: "text"; gaps: number };

function useGapPrompts(): GapPrompts {
  const { t, i18n } = useTranslation();
  return useMemo(() => {
    const defaults = new Set<string>();
    for (const language of ["vi", "en"]) {
      const fixed = i18n.getFixedT(language);
      defaults.add(fixed("groups.pane.gapPromptTyped"));
      defaults.add(fixed("groups.pane.gapPromptChoice"));
    }
    return {
      typed: t("groups.pane.gapPromptTyped"),
      choice: t("groups.pane.gapPromptChoice"),
      defaults,
    };
  }, [t, i18n]);
}

function isBlank(text: SemanticContent): boolean {
  return text.blocks.every(
    (block) =>
      block.type === "paragraph" &&
      block.content.every((node) => node.type === "text" && node.text.trim() === ""),
  );
}

function awaitsText(bundle: GroupBundle, material: GroupMaterial | null): boolean {
  if (bundle.group.members.length > 0) return false;
  return material === null || !hasText(material);
}

function confirmCopy(asking: Asking | null, t: TFunction) {
  if (asking?.kind === "recording")
    return {
      title: t("groups.pane.removeAudio"),
      description: t("groups.pane.removeAudioBody"),
    };
  if (asking?.kind === "text")
    return {
      title: t("groups.pane.removeText"),
      description: t("groups.pane.removeTextBody", { count: asking.gaps }),
    };
  return {
    title: t("groups.removeTitle"),
    description: t("groups.removeQuestionBody"),
  };
}

function wordAt(
  bundle: GroupBundle,
  gaps: ReadonlyMap<string, GapQuestion>,
  gapId: string,
): { questionId: string; word: string } | null {
  for (const material of bundle.group.stimuli) {
    const binding = material.gaps.find((item) => item.gapId === gapId);
    if (!binding) continue;
    const gap = gaps.get(binding.questionId);
    if (gap) return { questionId: binding.questionId, word: gap.word };
    const input = bundle.questions.find(
      (item) => item.id === binding.questionId,
    )?.input;
    const blank =
      binding.kind === "blank"
        ? input?.blanks?.find((item) => item.gapId === binding.blankGapId)
        : undefined;
    const option = input?.options?.find((item) => item.isCorrect);
    return {
      questionId: binding.questionId,
      word: blank?.acceptedAnswers[0] ?? option?.text ?? "",
    };
  }
  return null;
}

function withoutText(
  bundle: GroupBundle,
  material: GroupMaterial,
  context: MaterialContext,
) {
  const sync = withMaterialContent(
    bundle,
    material.id,
    withText(material, EMPTY_TEXT),
    context,
  );
  const { stimuli } = sync.bundle.group;
  const emptied = stimuli.find((item) => item.id === material.id);
  const dropped = stimuli.length > 1 && emptied !== undefined && !leadAudio(emptied);
  const next = dropped
    ? {
        ...sync.bundle,
        group: {
          ...sync.bundle.group,
          stimuli: stimuli.filter((item) => item !== emptied),
        },
      }
    : sync.bundle;
  return { bundle: withRecordings(next), dropped, removed: sync.removed };
}

function PaneTabs({
  tabs,
  selected,
  onSelect,
}: Readonly<{
  tabs: ReadonlyArray<{
    value: "material" | "questions";
    label: string;
    icon: LucideIcon;
  }>;
  selected: "material" | "questions";
  onSelect: (value: "material" | "questions") => void;
}>) {
  return (
    <div role="tablist" className="bg-muted flex gap-0.5 rounded-[9px] p-0.75">
      {tabs.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={selected === value}
          className={cn(
            "flex h-9.5 flex-1 items-center justify-center gap-1.5 rounded-[7px] text-[13px] font-medium whitespace-nowrap",
            selected === value ? "bg-card text-fg shadow-card" : "text-muted-fg",
          )}
          onClick={() => onSelect(value)}
        >
          <Icon aria-hidden="true" className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

function ClozeSteps() {
  const { t } = useTranslation();
  return (
    <div className="bg-muted flex flex-col gap-2.5 rounded-[10px] px-4 py-3.5">
      <span className="text-[13px] font-semibold">{t("groups.pane.stepsTitle")}</span>
      {(["step1", "step2", "step3"] as const).map((step, index) => (
        <span
          key={step}
          className="flex items-start gap-2.5 text-[13px] leading-normal"
        >
          <span className="bg-card grid size-5 flex-none place-items-center rounded-full border text-[11px] font-semibold">
            {index + 1}
          </span>
          <span className="text-pretty">{t(`groups.pane.${step}`)}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * GroupWorkspace edits a group as one pane: its heading; in the left half its
 * material, a recording's card above a text; in the right half its questions
 * as a stack of cards, one open and the rest a line each. Under 560px of its
 * own width the halves are two tabs. A word selected in the text becomes a
 * gap with "Make a gap", and the gap's question is made in the same change;
 * a gap's card removes both, and while it is open its material is the one in
 * front. The title is also the title of the group's one material while that
 * carries no title of its own. Every change is handed to `onChange` whole.
 *
 * `selectedQuestionId` opens that question's card, and `onSelectedQuestionChange`
 * hears which card is open. `start` is how an empty group was started, which
 * names it and decides what its halves open with until it holds something.
 * `section` and `firstNumber` place the group in a test: the section's title
 * for the heading and the number of the group's first question, 1 unless
 * given. `titleFocus` is a request: each new value puts focus in the title.
 * `status` is drawn at the heading's end and `menu` adds items to the pane's
 * "…" menu. `moves` gives the cards' menus the moves out of the group.
 */
export function GroupWorkspace({
  bundle,
  assets,
  onChange,
  onAsset,
  onRefresh,
  selectedQuestionId,
  onSelectedQuestionChange,
  start,
  titleFocus,
  section,
  firstNumber = 1,
  status,
  menu,
  moves,
}: Readonly<{
  bundle: GroupBundle;
  assets: MediaAsset[];
  onChange: (bundle: GroupBundle) => void;
  onAsset: (asset: MediaAsset) => void;
  onRefresh: () => void;
  selectedQuestionId?: string | undefined;
  onSelectedQuestionChange?: ((id: string | null) => void) | undefined;
  start?: GroupStart | undefined;
  titleFocus?: number | undefined;
  section?: string | undefined;
  firstNumber?: number | undefined;
  status?: ReactNode;
  menu?: ReactNode;
  moves?: GroupMoves | undefined;
}>) {
  const { t } = useTranslation();
  const prompts = useGapPrompts();
  const [measure, halves] = useWidthAtLeast<HTMLDivElement>(HALVES_MIN);
  const [openId, setOpenId] = useState<string | null>(selectedQuestionId ?? null);
  const [requested, setRequested] = useState(selectedQuestionId);
  const [tab, setTab] = useState<"material" | "questions">(
    selectedQuestionId === undefined ? "material" : "questions",
  );
  if (requested !== selectedQuestionId) {
    setRequested(selectedQuestionId);
    setOpenId(selectedQuestionId ?? null);
    if (selectedQuestionId !== undefined) setTab("questions");
  }
  const [materialId, setMaterialId] = useState(bundle.group.stimuli[0]?.id ?? null);
  const [textOpen, setTextOpen] = useState(start === "listeningCloze");
  const [picking, setPicking] = useState(false);
  const [textEpoch, setTextEpoch] = useState(0);
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [starters, setStarters] = useState<ReadonlySet<string>>(new Set());
  const [asking, setAsking] = useState<Asking | null>(null);

  const latest = useRef(bundle);
  useEffect(() => {
    latest.current = bundle;
  }, [bundle]);
  const words = useRef(new Map<string, string>());
  const restore = useRef(new Map<string, RemovedGap>());
  const bindings = useRef(new Map<string, GroupGapBinding>());
  const knownRecordings = useRef(new Map<string, GroupRecording>());
  const editor = useRef<Editor | null>(null);
  const faces = useRef<(gapId: string) => GapFace | undefined>(() => undefined);
  const press = useRef<(gapId: string) => void>(() => undefined);
  const drawn = useRef("");

  const { group } = bundle;
  const gaps = useMemo(() => gapQuestions(bundle), [bundle]);
  const inFront = gaps.get(openId ?? "")?.materialId ?? materialId;
  const material =
    group.stimuli.find((item) => item.id === inFront) ?? group.stimuli[0] ?? null;
  const kind = groupKind(bundle, start);
  const gapsOnly = answersOnlyGaps(bundle, start);
  const bound = useMemo(() => boundQuestionIds(bundle), [bundle]);
  const assetById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  );
  const numbers = useMemo(
    () =>
      new Map(
        group.members.map((member, index) => [member.questionId, firstNumber + index]),
      ),
    [group.members, firstNumber],
  );
  const unfinished = unfinishedMember(bundle);
  const view = materialView(bundle, material, gaps, { start, textOpen, picking });
  const context = (): MaterialContext => ({
    words: words.current,
    restore: restore.current,
    bindings: bindings.current,
    prompts,
  });

  function commit(next: GroupBundle) {
    latest.current = next;
    onChange(next);
  }
  function open(id: string | null) {
    setOpenId(id);
    if (id !== null) setTab("questions");
    onSelectedQuestionChange?.(id);
  }
  function remember(current: GroupBundle) {
    for (const item of current.group.recordings)
      knownRecordings.current.set(item.assetId, item);
  }
  function closeIfGone(removed: readonly RemovedGap[]) {
    if (removed.some((item) => item.question.id === openId)) open(null);
  }

  useEffect(() => {
    faces.current = (gapId) => {
      const found = wordAt(bundle, gaps, gapId);
      if (!found) return undefined;
      const number = numbers.get(found.questionId) ?? null;
      return {
        number,
        word: found.word,
        open: openId === found.questionId,
        label: t("groups.pane.gapAria", { number: number ?? "", word: found.word }),
      };
    };
    press.current = (gapId) => {
      const found = wordAt(bundle, gaps, gapId);
      if (found) open(found.questionId);
    };
    const next = JSON.stringify([
      openId,
      bundle.group.stimuli.flatMap((item) =>
        item.gaps.map((binding) => {
          const found = wordAt(bundle, gaps, binding.gapId);
          return [binding.gapId, numbers.get(binding.questionId), found?.word];
        }),
      ),
    ]);
    if (drawn.current === next) return;
    drawn.current = next;
    if (editor.current) refreshGapFaces(editor.current);
  });

  const takeEditor = useCallback((next: Editor | null) => {
    editor.current = next;
    drawn.current = "";
    if (next)
      showGapFaces(
        next,
        (gapId) => faces.current(gapId),
        (gapId) => press.current(gapId),
      );
  }, []);

  function changeText(text: SemanticContent) {
    const current = latest.current;
    let target = current.group.stimuli.find((item) => item.id === material?.id);
    let base = current;
    if (!target) {
      if (isBlank(text)) return;
      target = {
        id: draftId,
        title: current.group.title,
        content: EMPTY_TEXT,
        gaps: [],
      };
      base = {
        ...current,
        group: { ...current.group, stimuli: [...current.group.stimuli, target] },
      };
      setMaterialId(target.id);
    }
    const sync = withMaterialContent(
      base,
      target.id,
      withText(target, text),
      context(),
    );
    for (const item of sync.removed) restore.current.set(item.binding.gapId, item);
    for (const item of sync.unbound) bindings.current.set(item.gapId, item);
    remember(current);
    setTextOpen(true);
    commit(withRecordings(sync.bundle, knownRecordings.current));
    const made = sync.made[0];
    if (made === undefined) closeIfGone(sync.removed);
    else open(made);
  }

  function changeStimuli(change: (item: GroupMaterial) => GroupMaterial) {
    const current = latest.current;
    commit({
      ...current,
      group: { ...current.group, stimuli: current.group.stimuli.map(change) },
    });
  }

  function changeTitle(title: string) {
    const current = latest.current;
    const [only, ...others] = current.group.stimuli;
    const follows =
      only !== undefined &&
      others.length === 0 &&
      (only.title === current.group.title || only.title.trim() === "");
    commit({
      ...current,
      group: {
        ...current.group,
        title,
        stimuli: follows ? [{ ...only, title }] : current.group.stimuli,
      },
    });
  }

  function changeMembers(
    id: string,
    change: (
      member: GroupBundle["group"]["members"][number],
    ) => GroupBundle["group"]["members"][number],
    questions = latest.current.questions,
  ) {
    const current = latest.current;
    commit({
      ...current,
      questions,
      group: {
        ...current.group,
        members: current.group.members.map((member) =>
          member.questionId === id ? change(member) : member,
        ),
      },
    });
  }

  function changeQuestion(id: string, input: QuestionValues) {
    const current = latest.current;
    const before = current.questions.find((question) => question.id === id);
    changeMembers(
      id,
      (member) => ({
        ...member,
        optionOrder: memberOptionOrder(
          input.type,
          member.optionOrder,
          before?.input.type,
        ),
      }),
      current.questions.map((question) =>
        question.id === id ? { ...question, input } : question,
      ),
    );
  }

  function addQuestion(type: QuestionType) {
    const starter = newGroupQuestion(t);
    const question: GroupQuestion =
      type === "single_choice"
        ? starter
        : { ...starter, input: retype(memberValues(starter.input), type) };
    commit(withMembers(latest.current, [question]));
    setStarters((current) => new Set([...current, question.id]));
    open(question.id);
  }

  function moveMember(id: string, direction: -1 | 1) {
    const current = latest.current;
    const members = [...current.group.members];
    const index = members.findIndex((member) => member.questionId === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= members.length) return;
    [members[index], members[target]] = [members[target]!, members[index]!];
    const byId = new Map(current.questions.map((question) => [question.id, question]));
    commit({
      ...current,
      questions: members.flatMap((member) => {
        const question = byId.get(member.questionId);
        return question ? [question] : [];
      }),
      group: { ...current.group, members },
    });
  }

  function removeQuestion(id: string) {
    const current = latest.current;
    commit({
      ...current,
      questions: current.questions.filter((question) => question.id !== id),
      group: {
        ...current.group,
        members: current.group.members.filter((member) => member.questionId !== id),
      },
    });
    if (openId === id) open(null);
  }

  function removeGap(gap: GapQuestion) {
    const live = editor.current;
    if (live === null || material?.id !== gap.materialId) return;
    if (!unmakeGap(live, gap.gapId, gap.word)) return;
    const number = numbers.get(gap.questionId) ?? "";
    notify.success(t("groups.pane.removeGapDone", { number, word: gap.word }), {
      duration: 6000,
      action: {
        label: t("common.undo"),
        onClick: () => {
          if (!live.isDestroyed) live.chain().focus().undo().run();
        },
      },
    });
  }

  function attach(asset: MediaAsset | LibraryAsset) {
    onAsset(asset as MediaAsset);
    setPicking(false);
    const next = withLeadRecording(
      latest.current,
      material?.id ?? null,
      asset,
      t("groups.audio"),
    );
    if (material === null) setMaterialId(next.group.stimuli.at(-1)?.id ?? null);
    commit(next);
  }

  function changeRecording(next: GroupRecording) {
    const current = latest.current;
    commit({
      ...current,
      group: {
        ...current.group,
        recordings: current.group.recordings.map((item) =>
          item.id === next.id ? next : item,
        ),
      },
    });
  }

  function removeText(target: GroupMaterial) {
    const result = withoutText(latest.current, target, context());
    commit(result.bundle);
    if (result.dropped) setMaterialId(null);
    setDraftId(crypto.randomUUID());
    setTextOpen(false);
    setTextEpoch((epoch) => epoch + 1);
    closeIfGone(result.removed);
  }

  function confirm() {
    const current = latest.current;
    if (asking?.kind === "question") removeQuestion(asking.id);
    if (asking?.kind === "recording" && material) {
      remember(current);
      commit(withoutLeadRecording(current, material.id));
      setDraftId(crypto.randomUUID());
    }
    if (asking?.kind === "text" && material) removeText(material);
    setAsking(null);
  }

  function copyTranscript() {
    if (!material || !view.recording) return;
    const text = transcriptText(view.recording.transcript ?? "");
    const sync = withMaterialContent(
      latest.current,
      material.id,
      withText(material, text),
      context(),
    );
    commit(sync.bundle);
    setTextOpen(true);
    setTextEpoch((epoch) => epoch + 1);
  }

  const materialActions: MaterialActions = {
    selectMaterial: (id) => {
      setMaterialId(id);
      setTextOpen(false);
      if (gaps.has(openId ?? "")) open(null);
    },
    renameMaterial: (id, title) =>
      changeStimuli((item) => (item.id === id ? { ...item, title } : item)),
    changeMaterial: (next) =>
      changeStimuli((item) => (item.id === next.id ? next : item)),
    changeRecording,
    attach,
    askRemoveRecording: () => setAsking({ kind: "recording" }),
    askRemoveText: () => setAsking({ kind: "text", gaps: material?.gaps.length ?? 0 }),
    showPicker: setPicking,
    openText: () => setTextOpen(true),
    copyTranscript,
    changeText,
    takeEditor,
    makeGap: (live) => {
      makeGap(live, (gapId, word) => words.current.set(gapId, word));
    },
    onAsset,
    onRefresh,
  };
  const questionActions: QuestionActions = {
    open,
    answer: (gap, answer) =>
      commit(
        withGapAnswer(
          latest.current,
          gapQuestions(latest.current).get(gap.questionId) ?? gap,
          answer,
          prompts,
        ),
      ),
    changeQuestion,
    keepOrder: (id, fixed) =>
      changeMembers(id, (member) => ({
        ...member,
        optionOrder: fixed ? "fixed" : "shuffle",
      })),
    moveMember,
    removeGap,
    askRemoveQuestion: (id) => setAsking({ kind: "question", id }),
    addQuestion,
    onAsset,
    onRefresh,
  };

  const kindName = t(`groups.kind.${kind}.name`);
  const heading = gapsOnly
    ? t("groups.pane.gapsHeading")
    : t(`groups.kind.${kind}.questions`);
  const shown = halves ? "both" : tab;
  const stepsShown = gapsOnly && awaitsText(bundle, material);
  const copy = confirmCopy(asking, t);
  const unfinishedNumber = unfinished
    ? (numbers.get(unfinished.questionId) ?? null)
    : null;

  return (
    <div ref={measure} className="flex min-w-0 flex-col gap-3">
      <GroupHeading
        kind={kind}
        section={section}
        title={group.title}
        instructions={group.instructions as QuestionContent | null | undefined}
        questions={group.members.length}
        points={bundle.questions.reduce((sum, item) => sum + item.input.points, 0)}
        unfinished={unfinishedNumber}
        titleFocus={titleFocus}
        status={status}
        menu={
          <>
            <DropdownMenuItem onSelect={() => addQuestion("single_choice")}>
              <Plus aria-hidden="true" />
              {t("builder.addQuestion")}
            </DropdownMenuItem>
            {menu}
          </>
        }
        onTitle={changeTitle}
        onInstructions={(instructions) =>
          commit({
            ...latest.current,
            group: { ...latest.current.group, instructions },
          })
        }
        onOpenUnfinished={() => unfinished && open(unfinished.questionId)}
      />
      {halves ? null : (
        <PaneTabs
          selected={tab}
          onSelect={setTab}
          tabs={[
            { value: "material", label: kindName, icon: KIND_ICONS[kind] },
            {
              value: "questions",
              label: t(gapsOnly ? "groups.pane.tabGaps" : "groups.pane.tabQuestions", {
                count: group.members.length,
              }),
              icon: gapsOnly ? TextCursorInput : List,
            },
          ]}
        />
      )}
      <div className="flex min-w-0 items-start gap-3.5">
        <MaterialHalf
          hidden={shown === "questions"}
          label={kindName}
          stimuli={group.stimuli}
          material={material}
          view={view}
          assets={assetById}
          textKey={`${material?.id ?? draftId}:${textEpoch}`}
          placeholder={t(
            kind === "reading"
              ? "groups.pane.passagePlaceholder"
              : "groups.pane.clozePlaceholder",
          )}
          steps={stepsShown ? <ClozeSteps /> : null}
          actions={materialActions}
        />
        <QuestionHalf
          hidden={shown === "material"}
          shown={halves}
          heading={heading}
          bundle={bundle}
          kind={kind}
          gapsOnly={gapsOnly}
          view={{ numbers, gaps, bound, openId, starters }}
          assets={assetById}
          moves={moves}
          actions={questionActions}
        />
      </div>
      <ConfirmDialog
        open={asking !== null}
        onOpenChange={(next) => !next && setAsking(null)}
        title={copy.title}
        description={copy.description}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={confirm}
      />
    </div>
  );
}
