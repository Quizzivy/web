import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  Copy,
  Ellipsis,
  FilePlus,
  Library,
  ListX,
  Pencil,
  RotateCw,
  SearchX,
  Trash2,
  TriangleAlert,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { BulkActions, BulkBarButton } from "@/components/shared/BulkActions";
import { Callout } from "@/components/shared/Callout";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/ListState";
import { SearchInput } from "@/components/shared/SearchInput";
import { DataTable } from "@/components/shared/data/DataTable";
import { Pager } from "@/components/shared/data/Pager";
import { FormDialog } from "@/components/shared/form/FormDialog";
import { givenName } from "@/features/assignments/studentTime";
import {
  QUESTION_SETS_KEY,
  deleteQuestionSet,
  getQuestionSet,
  listQuestionSets,
  listQuestions,
  questionSetKey,
  removeQuestionSetItems,
  updateQuestionSet,
  type AdminQuestion,
  type QuestionSet,
} from "@/features/question-bank/api";
import { AddToTestDialog } from "@/features/question-bank/components/AddToTestDialog";
import {
  AccessPill,
  ShareDialog,
  copyQuestionSet,
  isOwner,
  useCanShare,
} from "@/features/sharing";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { trimmed, useDebouncedInput } from "@/hooks/useDebouncedInput";
import { useListFilters } from "@/hooks/useListFilters";
import { usePage, usePageSize } from "@/hooks/usePage";
import { PageHead } from "@/layouts/shell/PageHead";
import { useCrumbs } from "@/layouts/shell/crumbs";
import { ApiError } from "@/lib/api/errors";
import { formatAgo, useDisplayTimeZone } from "@/lib/i18n/datetime";
import { useLocale } from "@/lib/i18n/useLocale";
import { notify } from "@/lib/toast";
import { useAuthStore } from "@/stores/auth";
import { promptLine } from "./bankFilters";
import { bankColumns } from "./bankColumns";

const BANK = "/teacher/question-bank";
const SHARED = "/teacher/shared-with-me";

const SEARCH =
  "w-auto min-w-0 flex-[1_1_240px] [&_input]:bg-card [&_input]:border-border [&_input]:h-8.5 [&_input]:pl-8.5 [&_input]:text-sm [&_svg]:top-[9.5px] [&_svg]:size-3.75 max-[1023px]:[&_input]:h-11 max-[1023px]:[&_svg]:top-[14.5px]";

const HEAD_BUTTON = "shadow-card h-9 max-[1023px]:h-11";

const SKELETON_ROWS = [72, 58, 80, 64, 76, 52, 68, 60];

type Dialog = "share" | "rename" | "delete" | "copy" | "remove" | "addToTest" | null;

/** notFound tells the answer of a set that is gone, or never was, for this reader. */
function notFound(cause: unknown): boolean {
  return cause instanceof ApiError && (cause.status === 404 || cause.status === 400);
}

/**
 * QuestionSetPage is a question set's own page at
 * /teacher/question-bank/sets/:id (DG-90, interim; the proposal "R7 Question
 * Sets"): the bank's table with the set's name above it. The header gives
 * "{n} questions" and when it changed; a recipient also sees whose set it is
 * and their access, with one sentence on what that access allows, and the
 * owner sees the set's description. The header's buttons follow the access,
 * so nothing is offered that the server refuses: the owner shares, makes a
 * copy, renames and deletes; Can edit renames and makes a copy; Can use makes
 * a copy. With rows selected, "Add to test" is for everyone (a recipient's
 * first copies the questions to their own bank) and "Remove from set" for the
 * owner and Can edit. A row opens the question's editor in the set's context.
 * While the set loads it draws the heading's bars and eight rows; a failed
 * read is a block with Retry, and a set that is gone (deleted, or no longer
 * shared, which the server answers alike) is a block that leads back.
 */
export default function QuestionSetPage() {
  useDisplayTimeZone();
  const { t } = useTranslation();
  const { id = "" } = useParams<{ id: string }>();
  const location = useLocation();
  const client = useQueryClient();
  const set = useQuery({
    queryKey: questionSetKey(id),
    queryFn: ({ signal }) => getQuestionSet(id, signal),
  });
  // The owner's wording when the reader came from the bank (`from`), when the
  // set was last read as theirs, or when their own sets list it.
  const fromBank =
    (location.state as { from?: string } | null)?.from === "bank" ||
    set.data?.access === "owner" ||
    (client
      .getQueryData<Awaited<ReturnType<typeof listQuestionSets>>>(QUESTION_SETS_KEY)
      ?.items.some((own) => own.id === id) ??
      false);

  if (set.isPending) return <SetSkeleton />;
  if (set.isError) {
    if (notFound(set.error))
      return (
        <EmptyState
          icon={SearchX}
          hint={fromBank ? t("sets.goneBodyOwner") : t("sets.goneBody")}
          action={
            <Button asChild variant="outline" className={HEAD_BUTTON}>
              <Link to={fromBank ? BANK : SHARED}>
                <ArrowLeft aria-hidden="true" />
                {fromBank ? t("sets.backToBank") : t("sets.backToShared")}
              </Link>
            </Button>
          }
        >
          {t("sets.goneTitle")}
        </EmptyState>
      );
    return <RetryBlock onRetry={() => void set.refetch()} />;
  }
  return <SetView set={set.data} />;
}

function SetSkeleton() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t("common.loading")}
      className="flex min-w-0 flex-col gap-4"
    >
      <div className="flex flex-col gap-2 py-1">
        <Skeleton className="h-6.5 w-[min(280px,70%)]" />
        <Skeleton className="h-3.5 w-[min(200px,50%)]" />
      </div>
      <TableSkeleton />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="bg-card shadow-card overflow-hidden rounded-xl border"
    >
      <div className="bg-muted h-10" />
      {SKELETON_ROWS.map((width) => (
        <div key={width} className="flex items-center gap-3 border-t px-4 py-3">
          <Skeleton className="size-4 flex-none rounded-[0.25rem]" />
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3.5" style={{ width: `${width}%` }} />
            <Skeleton className="h-4.5 w-24 rounded-full" />
          </span>
        </div>
      ))}
    </div>
  );
}

function SetView({ set }: Readonly<{ set: QuestionSet }>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const navigate = useNavigate();
  const client = useQueryClient();
  const me = useAuthStore((state) => state.user);
  const canShare = useCanShare()(set);
  const mine = isOwner(set, me);
  const access = set.access;
  const owns = access === "owner";
  const edits = access !== "use";
  const ownerName = givenName(set.owner.name);
  useCrumbs([{ label: set.name }]);

  const { params, setParams, setFilter } = useListFilters();
  const query = params.get("q") ?? "";
  const [typed, setTyped] = useDebouncedInput(
    query,
    (value) => setFilter("q", value),
    trimmed,
  );
  const search = query.trim();
  const [size] = usePageSize();
  const [page] = usePage(JSON.stringify({ search, size }));
  const bulk = useBulkSelection<AdminQuestion>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);
  const more = useRef<HTMLButtonElement>(null);

  const list = useQuery({
    queryKey: ["teacher-questions", { setId: set.id, search, page, size }],
    queryFn: ({ signal }) =>
      listQuestions(
        { setId: set.id, limit: size, page, ...(search === "" ? {} : { q: search }) },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
  const columns = useMemo(() => bankColumns(t, 0, { used: owns }), [t, owns]);

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: questionSetKey(set.id) }),
      client.invalidateQueries({ queryKey: QUESTION_SETS_KEY }),
      client.invalidateQueries({ queryKey: ["teacher-questions"] }),
    ]);
  };
  const open = (next: Dialog) => {
    setError(null);
    setDialog(next);
  };
  const close = (next: boolean) => {
    if (!next) setDialog(null);
  };
  const failed = (cause: unknown) =>
    setError(cause instanceof ApiError ? cause.message : t("common.actionFailed"));

  const rename = useMutation({
    mutationFn: (values: { name: string; description: string }) =>
      updateQuestionSet(set.id, values.name, values.description),
    onSuccess: (saved) => {
      client.setQueryData(questionSetKey(set.id), saved);
      void client.invalidateQueries({ queryKey: QUESTION_SETS_KEY });
      setDialog(null);
    },
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: () => deleteQuestionSet(set.id),
    onSuccess: async () => {
      setDialog(null);
      notify.success(t("sets.toast.deleted", { name: set.name }));
      await navigate(BANK, { replace: true });
      client.removeQueries({ queryKey: questionSetKey(set.id) });
      void client.invalidateQueries({ queryKey: QUESTION_SETS_KEY });
    },
    onError: failed,
  });
  const copy = useMutation({
    mutationFn: () => copyQuestionSet(set.id),
    onSuccess: () => {
      setDialog(null);
      notify.success(t("sharing.withMe.toast.copied.question_set"));
      void client.invalidateQueries({ queryKey: QUESTION_SETS_KEY });
      void client.invalidateQueries({ queryKey: ["teacher-questions"] });
    },
    onError: failed,
  });
  const takeOut = useMutation({
    mutationFn: (ids: readonly string[]) => removeQuestionSetItems(set.id, ids),
    onSuccess: async (_, ids) => {
      setDialog(null);
      bulk.remove([...ids]);
      notify.success(t("sets.toast.removed", { count: ids.length }));
      await refresh();
    },
    onError: failed,
  });

  const data = list.data;
  const selected = [...bulk.selected.keys()];
  const count = t("sets.count", { count: set.questionCount });
  const updated = t("sets.updated", {
    when: formatAgo(set.updatedAt, locale, t("common.agoNow")),
  });

  const clearSearch = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("q");
        next.delete("page");
        return next;
      },
      { replace: true },
    );

  const table = () => {
    if (data !== undefined)
      return (
        <DataTable
          label={set.name}
          columns={columns}
          rows={data.items}
          rowSize={{ padY: 10 }}
          rowHref={(question) => `${BANK}/${question.id}?set=${set.id}`}
          selection={bulk}
          rowName={promptLine}
          empty={
            data.items.length === 0 ? (
              <SetEmpty owns={owns} searching={search !== ""} onClear={clearSearch} />
            ) : null
          }
          footer={
            data.items.length === 0 && search === "" ? undefined : (
              <Pager
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                noun={(n) => t("bank.questionsNoun", { count: n })}
              />
            )
          }
        />
      );
    if (list.isError) return <RetryBlock onRetry={() => void list.refetch()} />;
    return <TableSkeleton />;
  };
  const shareDescription = set.sharedWith > 0 ? count : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SetHead
        set={set}
        mine={mine}
        actions={
          <SetActions set={set} canShare={canShare} moreRef={more} onOpen={open} />
        }
      >
        {count} · {updated}
      </SetHead>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <SearchInput
            className={SEARCH}
            value={typed}
            onChange={setTyped}
            placeholder={t("bank.searchPlaceholder")}
          />
        </div>

        <BulkActions
          selected={[...bulk.selected.values()]}
          name={promptLine}
          actions={[]}
          onRemoved={bulk.remove}
          onClear={bulk.clear}
          onSettled={refresh}
        >
          <BulkBarButton icon={FilePlus} onClick={() => open("addToTest")}>
            {t("bank.addToTest")}
          </BulkBarButton>
          {edits ? (
            <BulkBarButton icon={ListX} onClick={() => open("remove")}>
              {t("sets.removeFromSet")}
            </BulkBarButton>
          ) : null}
        </BulkActions>

        {table()}
      </div>

      {canShare ? (
        <ShareDialog
          open={dialog === "share"}
          onOpenChange={close}
          kind="question_set"
          resourceId={set.id}
          name={set.name}
          description={shareDescription}
          onSharedChange={() => void refresh()}
        />
      ) : null}

      <FormDialog<{ name: string; description: string }>
        open={dialog === "rename"}
        onOpenChange={(next) => {
          if (!rename.isPending) close(next);
        }}
        width={440}
        icon={Pencil}
        title={t("sets.renameTitle")}
        initial={{ name: set.name, description: set.description ?? "" }}
        fields={[
          {
            kind: "text",
            name: "name",
            label: t("sets.nameLabel"),
            placeholder: t("sets.namePlaceholder"),
            maxLength: 120,
            required: true,
          },
          {
            kind: "area",
            name: "description",
            label: t("sets.descLabel"),
            placeholder: t("sets.descPlaceholder"),
            maxLength: 500,
          },
        ]}
        submitLabel={t("common.save")}
        pending={rename.isPending}
        error={error}
        returnFocus={more}
        onSubmit={(values) => rename.mutate(values)}
      />

      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(next) => {
          if (!remove.isPending) close(next);
        }}
        icon={Trash2}
        title={t("sets.deleteTitle", { name: set.name })}
        description={t("sets.deleteBody")}
        confirmLabel={t("sets.delete")}
        destructive
        pending={remove.isPending}
        error={error}
        returnFocus={more}
        onConfirm={() => remove.mutate()}
      />

      <ConfirmDialog
        open={dialog === "copy"}
        onOpenChange={(next) => {
          if (!copy.isPending) close(next);
        }}
        icon={Copy}
        title={t("sharing.withMe.copyTitle", { name: set.name })}
        description={
          mine
            ? t("sets.copyBodyOwner")
            : t("sharing.withMe.copyBody", { owner: set.owner.name })
        }
        confirmLabel={t("sharing.withMe.copy")}
        pending={copy.isPending}
        error={error}
        onConfirm={() => copy.mutate()}
      />

      <ConfirmDialog
        open={dialog === "remove"}
        onOpenChange={(next) => {
          if (!takeOut.isPending) close(next);
        }}
        icon={ListX}
        title={t("sets.removeTitle", { count: selected.length })}
        description={
          owns ? t("sets.removeBodyOwner") : t("sets.removeBody", { name: ownerName })
        }
        confirmLabel={t("sets.removeFromSet")}
        destructive
        pending={takeOut.isPending}
        error={error}
        onConfirm={() => takeOut.mutate(selected)}
      />

      <AddToTestDialog
        questionIds={selected}
        open={dialog === "addToTest"}
        onOpenChange={close}
        onAdded={bulk.clear}
        {...(owns
          ? {}
          : {
              copyFirst: async (ids: readonly string[]) =>
                (await copyQuestionSet(set.id, ids)).questionIds,
              addedMessage: (n: number, test: string) =>
                t("sets.toast.copiedToTest", { count: n, test }),
            })}
      />
    </div>
  );
}

/**
 * SetHead is the set's heading: its name, then the line that says whose it is
 * and the reader's access (for a recipient) beside `children`, the size and
 * when it changed; the owner also reads the description. A recipient gets
 * one sentence on what their access allows.
 */
function SetHead({
  set,
  mine,
  actions,
  children,
}: Readonly<{
  set: QuestionSet;
  mine: boolean;
  actions: ReactNode;
  children: ReactNode;
}>) {
  const { t } = useTranslation();
  const access = set.access;
  const name = givenName(set.owner.name);
  return (
    <>
      <PageHead
        title={set.name}
        actions={<div className="flex flex-wrap items-center gap-2">{actions}</div>}
      >
        <div className="mt-1 flex flex-col gap-1">
          <p className="text-muted-fg flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
            {mine ? null : (
              <span className="text-fg inline-flex items-center gap-2">
                <Avatar name={set.owner.name} size="sm" />
                {set.owner.name}
              </span>
            )}
            {access === "owner" ? null : <AccessPill access={access} />}
            <span>{children}</span>
          </p>
          {access === "owner" && set.description ? (
            <p className="text-fg max-w-[64ch] text-sm text-pretty">
              {set.description}
            </p>
          ) : null}
        </div>
      </PageHead>
      {access === "edit" ? (
        <Callout lead={t("sets.editLead", { name })}>
          {t("sets.editRest", { name })}
        </Callout>
      ) : null}
      {access === "use" ? (
        <Callout lead={t("sets.useLead")}>{t("sets.useRest")}</Callout>
      ) : null}
    </>
  );
}

/**
 * SetActions are the header's buttons by access: the owner's share button
 * ("Shared · {n}" once shared, for a holder of `content.share`), Make a copy
 * and "…" with Rename and Delete set; Can edit's Rename and Make a copy; Can
 * use's Make a copy.
 */
function SetActions({
  set,
  canShare,
  moreRef,
  onOpen,
}: Readonly<{
  set: QuestionSet;
  canShare: boolean;
  moreRef: RefObject<HTMLButtonElement | null>;
  onOpen: (dialog: Dialog) => void;
}>) {
  const { t } = useTranslation();
  const copy = (
    <Button variant="outline" className={HEAD_BUTTON} onClick={() => onOpen("copy")}>
      <Copy aria-hidden="true" />
      {t("sharing.withMe.copy")}
    </Button>
  );
  if (set.access === "use") return copy;
  if (set.access === "edit")
    return (
      <>
        <Button
          variant="outline"
          className={HEAD_BUTTON}
          onClick={() => onOpen("rename")}
        >
          <Pencil aria-hidden="true" />
          {t("sets.rename")}
        </Button>
        {copy}
      </>
    );
  const shared = set.sharedWith > 0;
  return (
    <>
      {canShare ? (
        <Button
          variant="outline"
          className={HEAD_BUTTON}
          onClick={() => onOpen("share")}
        >
          {shared ? <UsersRound aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
          {shared
            ? t("sharing.entry.shared", { count: set.sharedWith })
            : t("sharing.share")}
        </Button>
      ) : null}
      {copy}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={moreRef}
            variant="outline"
            size="icon"
            aria-label={t("sets.more")}
            className="shadow-card size-9 max-[1023px]:size-11"
          >
            <Ellipsis aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => onOpen("rename")}>
            <Pencil aria-hidden="true" />
            {t("sets.rename")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => onOpen("delete")}>
            <Trash2 aria-hidden="true" />
            {t("sets.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/**
 * SetEmpty is the table's one sentence when no row shows: no question
 * matches the search (with Clear filters), or the set holds none ("This set
 * has no questions yet.", and for the owner how to add some).
 */
function SetEmpty({
  owns,
  searching,
  onClear,
}: Readonly<{ owns: boolean; searching: boolean; onClear: () => void }>) {
  const { t } = useTranslation();
  if (searching)
    return (
      <span className="flex flex-col items-center gap-3">
        <span>{t("bank.noMatches")}</span>
        <Button variant="outline" className={HEAD_BUTTON} onClick={onClear}>
          {t("bank.clearFilters")}
        </Button>
      </span>
    );
  return (
    <span className="flex flex-col items-center gap-2">
      <span className="text-fg font-medium">{t("sets.empty")}</span>
      {owns ? (
        <>
          <span className="max-w-[46ch] text-pretty">{t("sets.emptyOwnerHint")}</span>
          <Button asChild variant="outline" className={`${HEAD_BUTTON} mt-2`}>
            <Link to={BANK}>
              <Library aria-hidden="true" />
              {t("sets.openBank")}
            </Link>
          </Button>
        </>
      ) : null}
    </span>
  );
}

/** RetryBlock is the empty-state block of a read that failed, with Retry. */
function RetryBlock({ onRetry }: Readonly<{ onRetry: () => void }>) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={TriangleAlert}
      tone="warning"
      action={
        <Button variant="outline" className={HEAD_BUTTON} onClick={onRetry}>
          <RotateCw aria-hidden="true" />
          {t("common.retry")}
        </Button>
      }
    >
      {t("sets.loadFailed")}
    </EmptyState>
  );
}
