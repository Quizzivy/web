import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, Eye, History } from "lucide-react";
import { SplitPane } from "@/components/shared/SplitPane";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { StickyAside } from "@/components/shared/StickyAside";
import { Button } from "@/components/ui/button";
import { getQuestion, toFormValues } from "@/features/question-bank/api";
import {
  QuestionReadBody,
  QuestionReadSettings,
} from "@/features/question-bank/components/QuestionReadView";
import { getGroup, type GroupBundle } from "@/features/question-groups/api";
import type { Test } from "@/features/tests/api";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useContentWidthAtLeast } from "@/layouts/shell/contentWidth";
import { useCrumbs } from "@/layouts/shell/crumbs";
import { nfc } from "@/lib/nfc";
import { cn } from "@/lib/utils";
import { useTestAccess } from "../../access";
import { AccessBanner, AccessOwnerLine } from "../../components/AccessBanner";
import { DraftPreviewDialog } from "../../components/DraftPreviewDialog";
import { MakeCopyAction } from "../../components/MakeCopyAction";
import { GroupReadPane } from "../../components/GroupReadPane";
import { OutlineReadTree } from "../../components/OutlineReadTree";
import type { OutlineQuestion } from "../../components/OutlineTree";
import { editableOutline, sectionQuestionIds, unitsOf } from "../../outlineUnits";

const HEAD_BUTTON = "shadow-card h-9 max-[1023px]:h-11";

/**
 * ReadOnlyBuilder is the builder for a Can-use recipient (T-R7.18, R7 Access
 * Modes › Builder · Can use). It shows what the owner's builder edits and
 * changes none of it: the title bar gives the owner and the pill, Preview,
 * Make a copy and Assign; the band says what Can use means; the outline has
 * no grips, menus or add buttons; a question or a passage opens read-only.
 * It holds no autosave and no group editor, so it never sends a write.
 */
export function ReadOnlyBuilder({ test }: Readonly<{ test: Test }>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const access = useTestAccess(test);
  const title = nfc(test.title) || t("tests.untitled");
  useCrumbs([{ label: title }]);
  const wide = useMediaQuery("(min-width: 768px)");
  const room = useContentWidthAtLeast(594);
  const split = wide && room;
  const sections = useMemo(() => editableOutline(test), [test]);
  const first = test.sections[0]?.units?.[0];
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    first?.kind === "group" ? first.id : null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    first?.kind === "group" ? null : (test.sections[0]?.questionIds[0] ?? null),
  );
  const [previewing, setPreviewing] = useState(false);

  const questionIds = useMemo(
    () => sections.flatMap((section) => section.questionIds),
    [sections],
  );
  const loaded = useQueries({
    queries: questionIds.map((questionId) => ({
      queryKey: ["teacher-question", questionId],
      queryFn: ({ signal }: { signal: AbortSignal }) => getQuestion(questionId, signal),
      staleTime: 60_000,
    })),
  });
  const groupIds = useMemo(
    () =>
      sections.flatMap((section) =>
        unitsOf(section)
          .filter((unit) => unit.kind === "group")
          .map((unit) => unit.id),
      ),
    [sections],
  );
  const loadedGroups = useQueries({
    queries: groupIds.map((id) => ({
      queryKey: ["teacher-group", id],
      refetchOnWindowFocus: false,
      queryFn: ({ signal }: { signal: AbortSignal }) => getGroup(id, signal),
      staleTime: 60_000,
    })),
  });
  const groups = new Map(
    loadedGroups.flatMap((result) =>
      result.data ? [[result.data.bundle.group.id, result.data.bundle] as const] : [],
    ),
  );
  const questions = new Map<string, OutlineQuestion>();
  for (const [index, result] of loaded.entries()) {
    const id = questionIds[index];
    if (id === undefined || !result.data) continue;
    questions.set(id, {
      id,
      prompt: result.data.prompt,
      points: result.data.points,
      type: result.data.type,
      hasAudio: result.data.media?.kind === "audio",
      problem: null,
    });
  }

  const locked = assignLockedKey(test);
  const assignLocked = locked === null ? null : t(locked);
  const groupSection = sections.find((section) =>
    unitsOf(section).some(
      (unit) => unit.kind === "group" && unit.id === selectedGroupId,
    ),
  );

  function pane() {
    if (selectedGroupId !== null)
      return (
        <GroupReadPane
          id={selectedGroupId}
          selectedQuestionId={selectedId}
          section={groupSection?.title}
          firstNumber={firstNumberOf(sections, selectedGroupId, groups)}
        />
      );
    if (selectedId === null)
      return (
        <p className="text-muted-fg text-sm">
          {questionIds.length === 0 ? t("builder.empty") : t("builder.noSelection")}
        </p>
      );
    return (
      <QuestionReadPane
        key={selectedId}
        questionId={selectedId}
        number={positionOf(sections, selectedId, groups)}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("common.back")}
              title={t("common.back")}
              onClick={() => void navigate("/teacher/shared-with-me")}
            >
              <ArrowLeft aria-hidden="true" />
            </Button>
            <h1 className="text-stat min-w-0 truncate leading-[34px] font-semibold tracking-[-0.02em]">
              {title}
            </h1>
            <StatusBadge
              kind="test"
              status={test.status}
              className={
                test.status === "draft"
                  ? "border-border text-muted-fg h-5.5 shrink-0 rounded-full bg-transparent px-2 text-xs leading-[18px] font-medium"
                  : "shrink-0"
              }
            />
          </div>
          <div className="pl-12">
            <AccessOwnerLine access={access} />
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            aria-label={t("builder.versions")}
            title={t("builder.versions")}
            onClick={() => void navigate(`/teacher/tests/${test.id}#versions`)}
          >
            <History aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            className={HEAD_BUTTON}
            onClick={() => setPreviewing(true)}
          >
            <Eye aria-hidden="true" />
            {t("builder.preview")}
          </Button>
          <MakeCopyAction test={test} className={HEAD_BUTTON} />
          {assignLocked === null ? (
            <Button asChild className="h-9 max-[1023px]:h-11">
              <Link to={`/teacher/assignments/new?test=${test.id}`}>
                <ClipboardList aria-hidden="true" />
                {t("builder.assign")}
              </Link>
            </Button>
          ) : (
            <Button
              className="h-9 aria-disabled:cursor-default max-[1023px]:h-11"
              aria-disabled="true"
              title={assignLocked}
            >
              <ClipboardList aria-hidden="true" />
              {t("builder.assign")}
            </Button>
          )}
        </div>
      </div>

      <AccessBanner
        access={access}
        stale={null}
        onReload={() => window.location.reload()}
      />

      <SplitPane
        label={t("builder.outlineWidth")}
        unit="px"
        defaultSize={300}
        min={220}
        max={Number.MAX_SAFE_INTEGER}
        minSecond={360}
        storageKey="quizzivy.builder.outline"
        split={split}
        className="items-stretch gap-y-3.5"
        secondClassName="flex min-w-0 items-start"
        first={
          <StickyAside as="div" docked={split}>
            <OutlineReadTree
              sections={sections}
              questions={questions}
              groups={groups}
              selectedId={selectedId}
              selectedGroupId={selectedGroupId}
              onSelect={(questionId) => {
                setSelectedGroupId(null);
                setSelectedId(questionId);
              }}
              onSelectGroup={(groupId, questionId) => {
                setSelectedGroupId(groupId);
                setSelectedId(questionId ?? null);
              }}
            />
          </StickyAside>
        }
        second={
          <div data-columns className="flex min-w-0 flex-1 items-start">
            <div
              data-resize-middle
              className={cn(
                "min-w-0 flex-1",
                selectedGroupId === null &&
                  cn(
                    "bg-card shadow-card rounded-xl border",
                    selectedId === null ? "p-4" : "p-0",
                  ),
              )}
            >
              {pane()}
            </div>
          </div>
        }
      />

      <DraftPreviewDialog
        open={previewing}
        title={title}
        questions={sections.flatMap((section) =>
          section.questionIds.flatMap((questionId) => {
            const found = loaded[questionIds.indexOf(questionId)]?.data;
            return found ? [{ sectionId: section.id ?? "", question: found }] : [];
          }),
        )}
        sections={sections}
        groups={loadedGroups.flatMap((result) => (result.data ? [result.data] : []))}
        onOpenChange={setPreviewing}
      />
    </div>
  );
}

/**
 * QuestionReadPane is the builder's question pane for Can use: "Question {n}",
 * then the bank's read view of the question and its settings, with no
 * control that changes it.
 */
function QuestionReadPane({
  questionId,
  number,
}: Readonly<{ questionId: string; number: number | null }>) {
  const { t } = useTranslation();
  const question = useQuery({
    queryKey: ["teacher-question", questionId],
    queryFn: ({ signal }) => getQuestion(questionId, signal),
  });
  if (question.isPending)
    return (
      <p role="status" aria-live="polite" className="text-muted-fg p-4 text-sm">
        {t("common.loading")}
      </p>
    );
  if (question.isError)
    return (
      <p role="alert" className="text-danger-ink p-4 text-sm">
        {t("questionEditor.loadFailed")}
      </p>
    );
  const values = toFormValues(question.data);
  const refresh = () => void question.refetch();
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex min-w-0 items-center gap-2.5 border-b px-4 py-3">
        <h2 className="shrink-0 text-[13px] font-semibold whitespace-nowrap">
          {number === null
            ? t("builder.editor.question")
            : t("builder.editor.questionNumber", { number })}
        </h2>
      </div>
      <div data-field-size="page" className="flex min-w-0 flex-col gap-4 p-4">
        <QuestionReadBody
          value={values}
          assets={question.data.contentAssets ?? []}
          promptLabel={t("questionEditor.question")}
          onRefresh={refresh}
        />
        <hr className="border-border" />
        <QuestionReadSettings
          value={values}
          asset={question.data.media ?? null}
          onRefresh={refresh}
        />
      </div>
    </div>
  );
}

/** assignLockedKey is why Assign is off: an archived test, or one never published. */
function assignLockedKey(test: Test): string | null {
  if (test.status === "archived") return "tests.detail.history.restoreLocked";
  if (test.currentVersion === 0) return "tests.detail.assignLocked";
  return null;
}

function firstNumberOf(
  sections: readonly ReturnType<typeof editableOutline>[number][],
  groupId: string,
  groups: Map<string, GroupBundle>,
): number {
  let before = 0;
  for (const section of sections)
    for (const unit of unitsOf(section)) {
      if (unit.kind === "group" && unit.id === groupId) return before + 1;
      before +=
        unit.kind === "group" ? (groups.get(unit.id)?.group.members.length ?? 0) : 1;
    }
  return before + 1;
}

function positionOf(
  sections: readonly ReturnType<typeof editableOutline>[number][],
  questionId: string,
  groups: Map<string, GroupBundle>,
): number | null {
  const index = sections
    .flatMap((section) => sectionQuestionIds(section, groups))
    .indexOf(questionId);
  return index < 0 ? null : index + 1;
}
