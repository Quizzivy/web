import { useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Link,
  useBeforeUnload,
  useBlocker,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Copy, TriangleAlert } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Callout } from "@/components/shared/Callout";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState, LoadError } from "@/components/shared/ListState";
import { StickyAside } from "@/components/shared/StickyAside";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import type { MediaAsset } from "@/features/media/api";
import {
  createQuestion,
  duplicateQuestion,
  getQuestion,
  getQuestionSet,
  questionSetKey,
  toFormValues,
  updateQuestion,
  type AdminQuestion,
} from "@/features/question-bank/api";
import { givenName } from "@/features/assignments/studentTime";
import { AccessPill, copyQuestionSet } from "@/features/sharing";
import { QuestionEditorMenu } from "@/features/question-bank/components/QuestionEditorMenu";
import { QuestionMediaField } from "@/features/question-bank/components/QuestionMediaField";
import { ExplanationField } from "@/features/question-bank/components/ExplanationField";
import { QuestionPromptAnswers } from "@/features/question-bank/components/QuestionPromptAnswers";
import { QuestionSettingsFields } from "@/features/question-bank/components/QuestionSettingsFields";
import { QuestionTypeControl } from "@/features/question-bank/components/QuestionTypeControl";
import { QuestionUsageBanner } from "@/features/question-bank/components/QuestionUsageBanner";
import { useProseMedia } from "@/features/question-bank/useProseMedia";
import { ProseMediaContext } from "@/components/shared/content/editor/proseMedia";
import { ContentReadOnlyContext } from "@/components/shared/content/editor/readOnly";
import { aiReadsOf, type QuestionAi } from "@/features/question-bank/questionAi";
import {
  blockingIssue,
  emptyQuestion,
  issueKey,
  questionSchema,
  type QuestionValues,
} from "@/features/question-bank/questionSchema";
import { PageHead } from "@/layouts/shell/PageHead";
import { ApiError, fieldMessages } from "@/lib/api/errors";
import { clockTime } from "@/lib/i18n/datetime";
import { useLocale } from "@/lib/i18n/useLocale";
import { notify } from "@/lib/toast";

const BANK = "/teacher/question-bank";
const FRAME = "@container/qe flex w-full min-w-0 flex-col gap-4.5";
const CARD =
  "bg-card shadow-card flex min-w-0 flex-col gap-4.5 rounded-xl border p-4.5";
const GROUP_LABEL =
  "text-muted-fg text-[11.5px] font-semibold tracking-[0.06em] uppercase";
const GRID = "grid items-start gap-4.5 @min-[900px]/qe:grid-cols-[minmax(0,1fr)_300px]";

/** Stale is the last change a refused save names: who made it, when. */
type Stale = Readonly<{ name: string | null; at: string }>;

/** staleOf reads a 409 `STALE_WRITE`'s details: `updatedBy` (or null) and `updatedAt`. */
function staleOf(cause: unknown): Stale | null {
  if (!(cause instanceof ApiError) || cause.code !== "STALE_WRITE") return null;
  const by = cause.details?.["updatedBy"] as { name?: unknown } | null | undefined;
  const at = cause.details?.["updatedAt"];
  return {
    name: typeof by?.name === "string" ? by.name : null,
    at: typeof at === "string" ? at : new Date().toISOString(),
  };
}

/**
 * FormArea holds the editor's two columns. For a Can-use reader it is a
 * disabled fieldset whose rich fields render read-only and whose formatting
 * toolbars are not drawn, so the question reads in full and nothing in it can
 * be changed.
 */
function FormArea({
  readOnly,
  children,
}: Readonly<{ readOnly: boolean; children: ReactNode }>) {
  if (!readOnly) return <div className={GRID}>{children}</div>;
  return (
    <ContentReadOnlyContext value>
      <fieldset
        disabled
        className={`${GRID} m-0 min-w-0 border-0 p-0 [&_[role=toolbar]]:hidden`}
      >
        {children}
      </fieldset>
    </ContentReadOnlyContext>
  );
}

/**
 * QuestionEditorPage is the bank's Question editor at
 * /teacher/question-bank/new and /teacher/question-bank/:id, with its
 * loading skeleton, its not-found state (for a 404, and for the 400 an address
 * that is not an id gets) and its load error. `?set={id}` opens a question in
 * a set's context (T-R7.19): the page leads back to that set, and an edit
 * grantee's save is made in it, where the server may answer with a copy.
 * The editor follows the caller's `access`: Can use reads the question and
 * may make a copy of it, Can edit saves to the owner's question, and the
 * owner edits as before. Every save sends the `updatedAt` it last read, and
 * a refused stale save names who changed the question.
 */
export default function QuestionEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const setId = search.get("set");
  const [epoch, setEpoch] = useState(0);
  const existing = useQuery({
    queryKey: ["teacher-question", id],
    queryFn: ({ signal }) => getQuestion(id ?? "", signal),
    enabled: id !== undefined,
  });

  if (id !== undefined && existing.isPending) return <EditorSkeleton />;
  if (existing.isError) {
    if (
      existing.error instanceof ApiError &&
      (existing.error.status === 404 || existing.error.status === 400)
    )
      return (
        <div className="w-full min-w-0">
          <EmptyState
            action={
              <Button asChild size="sm" variant="outline">
                <Link to={BANK}>{t("questionEditor.backToBank")}</Link>
              </Button>
            }
          >
            {t("questionEditor.notFound")}
          </EmptyState>
        </div>
      );
    return (
      <div className="w-full min-w-0">
        <LoadError error={existing.error} onRetry={() => void existing.refetch()}>
          {t("questionEditor.loadFailed")}
        </LoadError>
      </div>
    );
  }

  const question = existing.data ?? null;
  async function refreshAsset(): Promise<MediaAsset | null> {
    const { data } = await existing.refetch();
    return data?.media ?? null;
  }
  return (
    <Editor
      key={`${question?.id ?? "new"}:${epoch}`}
      question={question}
      setId={setId}
      onRefreshAsset={refreshAsset}
      onReload={() => {
        void existing.refetch().then(() => setEpoch((value) => value + 1));
      }}
    />
  );
}

function EditorSkeleton() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-label={t("common.loading")}
      className={`${FRAME} focus-within:[&_[data-slot=skeleton]]:[animation-play-state:paused]! hover:[&_[data-slot=skeleton]]:[animation-play-state:paused]!`}
    >
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-8 w-60" />
      <div className={GRID}>
        <Skeleton className="h-96 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </div>
  );
}

function Editor({
  question,
  setId,
  onRefreshAsset,
  onReload,
}: Readonly<{
  question: AdminQuestion | null;
  setId: string | null;
  onRefreshAsset: () => Promise<MediaAsset | null>;
  onReload: () => void;
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const access = question?.access ?? "owner";
  const readOnly = access === "use";
  const owner = question?.owner;
  const ownerGiven = givenName(owner?.name ?? "");
  const [base, setBase] = useState(question?.updatedAt);
  const [stale, setStale] = useState<Stale | null>(null);
  const set = useQuery({
    queryKey: questionSetKey(setId ?? ""),
    queryFn: ({ signal }) => getQuestionSet(setId ?? "", signal),
    enabled: setId !== null,
  });
  const back =
    setId === null
      ? { to: BANK, label: t("teacherShell.nav.questionBank") }
      : {
          to: `${BANK}/sets/${setId}`,
          label: set.data?.name ?? t("bank.sets.title"),
        };
  const [values, setValues] = useState<QuestionValues>(() =>
    question === null ? emptyQuestion() : toFormValues(question),
  );
  const [asset, setAsset] = useState<MediaAsset | null>(question?.media ?? null);
  const [dirty, setDirty] = useState(false);
  const [storedReads, setStoredReads] = useState(() => aiReadsOf(values));
  const [error, setError] = useState<string | null>(null);
  const leaving = useRef(false);
  const [leaveThen, setLeaveThen] = useState<(() => void) | null>(null);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useBeforeUnload((event) => {
    if (dirty) event.preventDefault();
  });

  const save = useMutation({
    mutationFn: (body: QuestionValues) =>
      question === null
        ? createQuestion(body)
        : updateQuestion(question.id, body, {
            expectedUpdatedAt: base,
            setId: access === "edit" && setId !== null ? setId : undefined,
          }),
    onSuccess: async (saved, body) => {
      setDirty(false);
      setStoredReads(aiReadsOf(body));
      setBase(saved.updatedAt);
      const forked = question !== null && saved.id !== question.id;
      if (forked) queryClient.setQueryData(["teacher-question", saved.id], saved);
      await queryClient.invalidateQueries({ queryKey: ["teacher-questions"] });
      await queryClient.invalidateQueries({ queryKey: ["teacher-question", saved.id] });
      if (setId !== null)
        void queryClient.invalidateQueries({ queryKey: questionSetKey(setId) });
      if (forked) {
        // Copy-on-write (T-R7.6): the owner uses the question elsewhere, so
        // the set now holds a copy; the page carries on with the copy.
        notify.info(t("questionEditor.forked", { name: ownerGiven }));
        leaving.current = true;
        void navigate(`${BANK}/${saved.id}?set=${setId ?? ""}`, { replace: true });
        return;
      }
      toast(t("questionEditor.saved"));
      if (question === null) {
        leaving.current = true;
        void navigate(`${BANK}/${saved.id}`, { replace: true });
      }
    },
    // A refusal's field reasons follow its message, so one only the server
    // catches ("İdea" beside "idea") still says what to fix (QC-R6AC-4).
    onError: (cause) => {
      const changed = staleOf(cause);
      if (changed !== null) {
        setStale(changed);
        return;
      }
      setError(
        cause instanceof ApiError
          ? (contentRefusal(cause) ??
              [cause.message, ...fieldMessages(cause)].join(" "))
          : t("questionEditor.saveFailed"),
      );
    },
  });

  const copy = useMutation({
    mutationFn: async (source: AdminQuestion) =>
      setId === null
        ? (await duplicateQuestion(source.id)).id
        : (await copyQuestionSet(setId, [source.id])).questionIds[0],
    onSuccess: async (copyId) => {
      await queryClient.invalidateQueries({ queryKey: ["teacher-questions"] });
      notify.success(t("sharing.withMe.toast.copied.question_set"));
      if (copyId !== undefined) void navigate(`${BANK}/${copyId}`);
    },
    onError: (cause) =>
      setError(cause instanceof ApiError ? cause.message : t("common.actionFailed")),
  });

  const blocked = blockingIssue(values, "questionEditor.saveFailed");
  const canSave =
    blocked === null &&
    (dirty || question === null) &&
    !save.isPending &&
    stale === null;

  function update(next: QuestionValues) {
    if (readOnly) return;
    setValues(next);
    setDirty(true);
  }

  const contentAssets = useMemo(
    () =>
      new Map(
        (question?.contentAssets ?? []).map((file) => [file.id.toLowerCase(), file]),
      ),
    [question?.contentAssets],
  );
  const refresh = () => {
    void onRefreshAsset().then((fresh) => {
      if (fresh) setAsset(fresh);
    });
  };
  const media = useProseMedia({
    value: values,
    onChange: update,
    asset,
    onAssetChange: setAsset,
    assets: contentAssets,
    onRefresh: refresh,
  });
  const change = media.change;

  function submit() {
    setError(null);
    const parsed = questionSchema.safeParse(values);
    if (!parsed.success) {
      setError(t(issueKey(parsed.error, "questionEditor.saveFailed")));
      return;
    }
    save.mutate(parsed.data);
  }

  // Recipients get no AI (the proposal's Q1): it spends the caller's credits on the owner's question.
  const ai: QuestionAi | undefined =
    access !== "owner"
      ? undefined
      : {
          prepare: () =>
            Promise.resolve(
              question === null || aiReadsOf(values) !== storedReads
                ? { refusal: t("ai.guard.save") }
                : { id: question.id },
            ),
        };

  function confirmLeave(proceed: () => void) {
    if (dirty) setLeaveThen(() => proceed);
    else proceed();
  }

  function leaveFor(to: string) {
    leaving.current = true;
    void navigate(to);
  }

  /**
   * notice is the band under the heading: a refused stale save, which names
   * who changed the question and offers Reload; else, for a recipient, what
   * their access means; else the owner's usage line.
   */
  function notice() {
    if (stale !== null) {
      const time = clockTime(stale.at, new Date(), locale);
      return (
        <Callout
          tone="warning"
          icon={TriangleAlert}
          announce
          lead={
            stale.name === null
              ? t("questionEditor.stale.titleUnknown", { time })
              : t("questionEditor.stale.title", { name: stale.name, time })
          }
          actions={
            <Button variant="outline" size="sm" onClick={onReload}>
              {t("builder.reload")}
            </Button>
          }
        >
          {t("questionEditor.stale.body")}
        </Callout>
      );
    }
    if (question === null) return null;
    if (access === "edit")
      return (
        <Callout lead={t("sets.editLead", { name: ownerGiven })}>
          {t("questionEditor.access.editRest", { name: ownerGiven })}
        </Callout>
      );
    if (access === "use")
      return (
        <Callout lead={t("questionEditor.access.useLead")}>
          {t("questionEditor.access.useRest")}
        </Callout>
      );
    return <QuestionUsageBanner question={question} />;
  }

  return (
    <div className={FRAME}>
      <PageHead
        title={editorTitle(t, question, readOnly)}
        crumb={readOnly}
        back={back}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            {readOnly || blocked === null ? null : (
              <span className="text-muted-fg inline-flex items-center gap-1.5 text-[12.5px]">
                <CircleAlert
                  aria-hidden="true"
                  className="text-warning-ink size-3.5 shrink-0"
                />
                {t(blocked)}
              </span>
            )}
            {question === null || access !== "owner" ? null : (
              <QuestionEditorMenu
                question={question}
                confirmLeave={confirmLeave}
                onOpen={(copy) => leaveFor(`${BANK}/${copy}`)}
                onDeleted={() => leaveFor(BANK)}
              />
            )}
            {readOnly && question !== null ? (
              <Button
                variant="outline"
                className="shadow-card h-9"
                disabled={copy.isPending}
                onClick={() => copy.mutate(question)}
              >
                <Copy aria-hidden="true" />
                {t("sharing.withMe.copy")}
              </Button>
            ) : (
              <Button className="h-9 px-4" disabled={!canSave} onClick={submit}>
                {save.isPending ? t("common.saving") : t("common.save")}
              </Button>
            )}
          </div>
        }
      >
        {owner === undefined || access === "owner" ? null : (
          <p className="text-muted-fg mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
            <span className="text-fg inline-flex items-center gap-2">
              <Avatar name={owner.name} size="sm" />
              {owner.name}
            </span>
            <AccessPill access={access} />
          </p>
        )}
      </PageHead>

      {error === null ? null : (
        <p role="alert" className="text-danger-ink text-sm">
          {error}
        </p>
      )}

      {notice()}

      <ProseMediaContext value={media.host}>
        <FormArea readOnly={readOnly}>
          <div data-field-size="page" className={CARD}>
            <QuestionTypeControl value={values} onChange={change} />
            <QuestionPromptAnswers
              value={values}
              promptLabel={t("questionEditor.question")}
              ai={ai}
              onChange={change}
            />
            <ExplanationField value={values} ai={ai} onChange={change} />
          </div>
          <StickyAside
            aria-label={t("questionEditor.settings")}
            className="@min-[900px]/qe:sticky-column min-w-0"
          >
            <div className={CARD}>
              <div className="flex flex-col gap-3">
                <p className={GROUP_LABEL}>{t("questionEditor.settingsLabel")}</p>
                <QuestionSettingsFields value={values} onChange={change} />
              </div>
              {readOnly && asset === null ? null : (
                <>
                  <hr className="border-border" />
                  <div className="flex flex-col gap-3">
                    <p className={GROUP_LABEL}>{t("questionEditor.mediaLabel")}</p>
                    <QuestionMediaField
                      value={values}
                      asset={asset}
                      onChange={change}
                      onAssetChange={setAsset}
                      onRefresh={refresh}
                      onMedia={media.media}
                    />
                  </div>
                </>
              )}
            </div>
          </StickyAside>
        </FormArea>
      </ProseMediaContext>
      {media.dialogs}

      <ConfirmDialog
        open={blocker.state === "blocked" || leaveThen !== null}
        onOpenChange={(open) => {
          if (open) return;
          setLeaveThen(null);
          if (blocker.state === "blocked") blocker.reset();
        }}
        title={t("questionEditor.leaveTitle")}
        description={t("questionEditor.leaveBody")}
        confirmLabel={t("questionEditor.leave")}
        cancelLabel={t("questionEditor.stay")}
        destructive
        onConfirm={() => {
          if (leaveThen !== null) {
            setLeaveThen(null);
            leaveThen();
          } else if (blocker.state === "blocked") blocker.proceed();
        }}
      />
    </div>
  );
}

function editorTitle(
  t: (key: string) => string,
  question: AdminQuestion | null,
  readOnly: boolean,
): string {
  if (question === null) return t("questionEditor.newTitle");
  return readOnly ? t("questionEditor.viewTitle") : t("questionEditor.editTitle");
}

function contentRefusal(cause: ApiError): string | null {
  const reason =
    cause.details?.["promptContent"] ?? cause.details?.["explanationContent"];
  return typeof reason === "string" ? reason : null;
}
