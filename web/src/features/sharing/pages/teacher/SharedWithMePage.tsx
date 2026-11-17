import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Callout } from "@/components/shared/Callout";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { SearchInput } from "@/components/shared/SearchInput";
import { DataTable } from "@/components/shared/data/DataTable";
import { Pager } from "@/components/shared/data/Pager";
import { templateOf } from "@/components/shared/data/tableLayout";
import { useCan } from "@/features/auth/permissions";
import { dashboardKeys } from "@/features/dashboard/keys";
import { QUESTION_SETS_KEY } from "@/features/question-bank/api";
import { trimmed, useDebouncedInput } from "@/hooks/useDebouncedInput";
import { useListFilters } from "@/hooks/useListFilters";
import { usePage, usePageSize } from "@/hooks/usePage";
import { PageHead } from "@/layouts/shell/PageHead";
import { ApiError } from "@/lib/api/errors";
import { useDisplayTimeZone } from "@/lib/i18n/datetime";
import { useLocale } from "@/lib/i18n/useLocale";
import { notify } from "@/lib/toast";
import {
  SHARED_WITH_ME_KEY,
  copyShared,
  listSharedWithMe,
  removeSharedWithMe,
  type ShareKind,
} from "../../api";
import { sharedWithMeColumns } from "./sharedWithMeColumns";
import { openHref, type RowAct, type SharedRow } from "./sharedRow";

const KINDS = ["test", "question_set"] as const satisfies readonly ShareKind[];
const ALL = "all";

const SEARCH =
  "w-auto min-w-0 flex-[1_1_100%] min-[768px]:flex-[0_1_280px] [&_input]:bg-card [&_input]:border-border [&_input]:h-8.5 [&_input]:pl-8.5 [&_input]:text-sm [&_svg]:top-[9.5px] [&_svg]:size-3.75 max-[767px]:[&_input]:h-11 max-[767px]:[&_svg]:top-[14.5px]";

const SKELETON_ROWS = 5;

/** The queries a copy makes stale: the lists the copy lands in. */
const COPIED_INTO: Record<ShareKind, readonly (readonly string[])[]> = {
  test: [["teacher-tests"]],
  question_set: [["teacher-questions"], QUESTION_SETS_KEY],
};

type Acting = Readonly<{ act: RowAct; item: SharedRow }> | null;

function toKind(value: string | null): ShareKind | undefined {
  return KINDS.find((kind) => kind === value);
}

/** gone tells a 404 from the copy or the remove: the grant ended after the list was read. */
function gone(cause: unknown): boolean {
  return cause instanceof ApiError && cause.status === 404;
}

/**
 * TableMessage is the card's one sentence and at most one action, under the
 * table's header: nothing shared, nothing matching, or a list that cannot
 * load (the proposal's "card's four states").
 */
function TableMessage({
  children,
  action,
  alert = false,
}: Readonly<{ children: string; action?: ReactNode; alert?: boolean }>) {
  return (
    <span className="flex flex-col items-center gap-3">
      <span role={alert ? "alert" : undefined} className="max-w-[52ch] text-pretty">
        {children}
      </span>
      {action}
    </span>
  );
}

/** SkeletonRows are five rows of the table's own shape and a "Loading…" line. */
function SkeletonRows({ template }: Readonly<{ template: string }>) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t("common.loading")} className="min-w-min">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="grid min-h-14 items-center gap-3 border-t px-4"
          style={{ gridTemplateColumns: template }}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <Skeleton className="size-8 flex-none rounded-lg" />
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="h-2.5 w-2/5" />
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <Skeleton className="size-6.5 flex-none rounded-full" />
            <span className="min-w-0 flex-1">
              <Skeleton className="h-3 w-3/4" />
            </span>
          </span>
          <Skeleton className="h-5.5 w-21 rounded-full" />
          <Skeleton className="h-3 w-13" />
          <span className="flex justify-end">
            <Skeleton className="h-7.5 w-40" />
          </span>
        </div>
      ))}
      <p className="text-muted-fg text-meta sticky left-0 border-t py-2.5 text-center">
        {t("common.loading")}
      </p>
    </div>
  );
}

/**
 * SharedWithMePage is the deck's Shared with me (`shr.*`), as the R7
 * proposal ships it: what other teachers shared with the caller, in a table
 * that keeps 820px and scrolls inside its card on a narrow screen. The tab
 * (`kind`), the search (`q`), the page and its size live in the URL; the tabs
 * count what the search finds. A row's name and Open lead to the item; Make
 * a copy (for whoever may write that kind) and Remove from my list ask first,
 * and an item no longer shared answers with one toast and a fresh list.
 */
export default function SharedWithMePage() {
  useDisplayTimeZone();
  const { t } = useTranslation();
  const locale = useLocale();
  const client = useQueryClient();
  const writesTests = useCan("content.tests.write");
  const writesQuestions = useCan("content.questions.write");
  const { params, setParams, setFilter } = useListFilters();
  const kind = toKind(params.get("kind"));
  const applied = params.get("q") ?? "";
  const [typed, setTyped] = useDebouncedInput(
    applied,
    (value) => setFilter("q", value),
    trimmed,
  );
  const search = applied.trim();
  const [size] = usePageSize();
  const [page, setPage] = usePage(JSON.stringify({ kind, search, size }));
  const [acting, setActing] = useState<Acting>(null);
  // A confirm gives focus back to its row's button, or to the search once the row is gone.
  const [toSearch, setToSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const list = useQuery({
    queryKey: [...SHARED_WITH_ME_KEY, { kind, search, page, size }],
    queryFn: ({ signal }) =>
      listSharedWithMe({ kind, q: search, page, limit: size }, signal),
    placeholderData: keepPreviousData,
  });
  // The sidebar's muted count is the summary's `sharedWithMe`: a grant that
  // leaves the list leaves the count too.
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: SHARED_WITH_ME_KEY }),
      client.invalidateQueries({ queryKey: dashboardKeys.summary }),
    ]);
  const settle = () => {
    setToSearch(true);
    setActing(null);
  };
  const onGone = () => {
    settle();
    notify.error(t("sharing.withMe.toast.gone"));
    void refresh();
  };

  const copy = useMutation({
    mutationFn: (item: SharedRow) => copyShared(item),
    onSuccess: (_copy, item) => {
      setActing(null);
      notify.success(t(`sharing.withMe.toast.copied.${item.kind}`));
      for (const queryKey of COPIED_INTO[item.kind])
        void client.invalidateQueries({ queryKey });
    },
    onError: (cause) => {
      if (gone(cause)) onGone();
    },
  });
  const remove = useMutation({
    mutationFn: (item: SharedRow) => removeSharedWithMe(item.shareId),
    onSuccess: () => {
      settle();
      notify.success(t("sharing.withMe.toast.removed"));
      void refresh();
    },
    onError: (cause) => {
      if (gone(cause)) onGone();
    },
  });

  const canCopy = useMemo(() => {
    const writes: Record<ShareKind, boolean> = {
      test: writesTests,
      question_set: writesQuestions,
    };
    return (of: ShareKind) => writes[of];
  }, [writesTests, writesQuestions]);
  const { reset: resetCopy } = copy;
  const { reset: resetRemove } = remove;
  const columns = useMemo(
    () =>
      sharedWithMeColumns(t, locale, canCopy, (act, item) => {
        resetCopy();
        resetRemove();
        setToSearch(false);
        setActing({ act, item });
      }),
    [t, locale, canCopy, resetCopy, resetRemove],
  );
  const template = useMemo(
    () =>
      templateOf(columns, new Set(columns.map((column) => column.id)), {
        select: false,
      }),
    [columns],
  );

  const data = list.data;
  const lastPage =
    data === undefined || list.isPlaceholderData
      ? undefined
      : Math.max(1, Math.ceil(data.total / data.pageSize));
  useEffect(() => {
    if (lastPage !== undefined && page > lastPage) setPage(lastPage);
  }, [page, lastPage, setPage]);

  const rows = useMemo<SharedRow[]>(
    () => (data?.items ?? []).map((item) => ({ ...item, id: item.shareId })),
    [data],
  );
  const counts = data?.counts;
  const clearFilters = () => {
    setTyped("");
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete("q");
        next.delete("kind");
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  };

  let body: ReactNode = null;
  let footer: ReactNode = null;
  if (list.isError) {
    body = (
      <TableMessage
        alert
        action={
          <Button variant="outline" onClick={() => void list.refetch()}>
            <RotateCw aria-hidden="true" />
            {t("common.retry")}
          </Button>
        }
      >
        {t("sharing.withMe.loadFailed")}
      </TableMessage>
    );
  } else if (data === undefined) {
    footer = <SkeletonRows template={template} />;
  } else {
    if (rows.length === 0)
      body =
        search === "" && data.counts.all === 0 ? (
          <TableMessage>{t("sharing.withMe.empty")}</TableMessage>
        ) : (
          <TableMessage
            action={
              <Button variant="outline" onClick={clearFilters}>
                <X aria-hidden="true" />
                {t("sharing.withMe.clearFilters")}
              </Button>
            }
          >
            {t("sharing.withMe.noMatch")}
          </TableMessage>
        );
    footer = (
      <Pager
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        noun={(count) => t("sharing.withMe.noun", { count })}
      />
    );
  }

  const item = acting?.item;
  const failure = (cause: unknown) => {
    if (cause === null || gone(cause)) return null;
    return cause instanceof ApiError ? cause.message : t("common.actionFailed");
  };
  const returnFocus = toSearch ? { returnFocus: searchRef } : {};

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHead
        title={t("teacherShell.nav.sharedWithMe")}
        description={t("sharing.withMe.lead")}
      />
      <Callout className="[&>svg]:text-muted-fg">
        <strong className="font-semibold">{t("sharing.canUse")}</strong>{" "}
        {t("sharing.withMe.callout.use")}{" "}
        <strong className="font-semibold">{t("sharing.canEdit")}</strong>{" "}
        {t("sharing.withMe.callout.edit")}
      </Callout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label={t("sharing.withMe.kinds")}
          value={kind ?? ALL}
          scroll
          options={[
            { value: ALL, label: t("sharing.withMe.tab.all"), count: counts?.all },
            {
              value: "test",
              label: t("sharing.withMe.tab.test"),
              count: counts?.test,
            },
            {
              value: "question_set",
              label: t("sharing.withMe.tab.question_set"),
              count: counts?.questionSet,
            },
          ]}
          onChange={(value) => setFilter("kind", value === ALL ? null : value)}
        />
        <SearchInput
          className={SEARCH}
          inputRef={searchRef}
          value={typed}
          onChange={setTyped}
          placeholder={t("sharing.withMe.search")}
        />
      </div>
      <DataTable
        label={t("teacherShell.nav.sharedWithMe")}
        columns={columns}
        rows={list.isError ? [] : rows}
        rowSize={{ minHeight: 56 }}
        rowHref={openHref}
        empty={body}
        footer={footer}
      />
      <ConfirmDialog
        open={acting?.act === "copy"}
        {...returnFocus}
        onOpenChange={(open) => {
          if (!open && !copy.isPending) setActing(null);
        }}
        title={t("sharing.withMe.copyTitle", { name: item?.name ?? "" })}
        description={t("sharing.withMe.copyBody", { owner: item?.owner.name ?? "" })}
        confirmLabel={t("sharing.withMe.copy")}
        pending={copy.isPending}
        error={failure(copy.error)}
        onConfirm={() => {
          if (item !== undefined) copy.mutate(item);
        }}
      />
      <ConfirmDialog
        open={acting?.act === "remove"}
        {...returnFocus}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setActing(null);
        }}
        title={t("sharing.withMe.removeTitle", { name: item?.name ?? "" })}
        description={t(
          item?.owner.disabled === true
            ? "sharing.withMe.removeBodyDisabled"
            : "sharing.withMe.removeBody",
          { owner: item?.owner.name ?? "" },
        )}
        confirmLabel={t("sharing.withMe.removeConfirm")}
        destructive
        pending={remove.isPending}
        error={failure(remove.error)}
        onConfirm={() => {
          if (item !== undefined) remove.mutate(item);
        }}
      />
    </div>
  );
}
