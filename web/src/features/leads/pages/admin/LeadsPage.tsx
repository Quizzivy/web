import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router";
import { ADMIN_PATHS } from "@/app/adminPaths";
import { LoadError } from "@/components/shared/ListState";
import { SearchInput, TOOLBAR_SEARCH } from "@/components/shared/SearchInput";
import { Segmented } from "@/components/ui/segmented";
import {
  LEAD_PAGE_SIZES,
  LEAD_SEARCH_MAX,
  LEAD_TABS,
  leadsQuery,
} from "@/features/leads/api";
import { LeadSheet } from "@/features/leads/components/LeadSheet";
import { LeadsSkeleton, LeadsTable } from "@/features/leads/components/LeadsTable";
import { CARDS_BELOW } from "@/features/leads/components/leadColumns";
import {
  limitOf,
  pageOf,
  searchOf,
  tabOf,
  tabParam,
} from "@/features/leads/leadFilters";
import { useDebouncedInput } from "@/hooks/useDebouncedInput";
import { useListFilters } from "@/hooks/useListFilters";
import { usePage, usePageSize } from "@/hooks/usePage";
import { PageHead } from "@/layouts/shell/PageHead";
import { useContentWidthAtLeast } from "@/layouts/shell/contentWidth";
import { useDisplayTimeZone } from "@/lib/i18n/datetime";
import { useLocale } from "@/lib/i18n/useLocale";
import { pageRange } from "@/lib/pagination";

/**
 * LeadsPage is the Admin console's Consultation requests screen (T-R11.9):
 * the people who asked the centre to call them back through the landing
 * site's form, newest first, in a table the Admin narrows by status (New,
 * which it opens on, Contacted, Closed, or All) and by a search of the name
 * or the phone number. The status (`status`), the search (`q`), the page and
 * its size live in the URL; the search reaches it, and the request, once the
 * Admin has paused for 300 ms. A page past the end goes to the last one.
 * Below 560px of content each request is a card. A row opens the request's
 * sheet at the request's own address, the list's with the request's id after
 * it, which is where the notification email links to; closing the sheet goes
 * back to the list with its filters.
 */
export default function LeadsPage() {
  useDisplayTimeZone();
  const { t } = useTranslation();
  const locale = useLocale();
  const navigate = useNavigate();
  const { search } = useLocation();
  const { id } = useParams();
  const { params, setFilter } = useListFilters();
  const tab = tabOf(params.get("status"));
  const applied = params.get("q") ?? "";
  const applyQuery = useCallback((value: string) => setFilter("q", value), [setFilter]);
  const [typed, setTyped] = useDebouncedInput(applied, applyQuery, searchOf);
  const q = searchOf(applied);
  const [size] = usePageSize(LEAD_PAGE_SIZES);
  const [asked, setPage] = usePage(JSON.stringify({ tab, q, size }));
  const page = pageOf(asked);
  const cards = !useContentWidthAtLeast(CARDS_BELOW);

  const leads = useQuery({
    ...leadsQuery({ tab, q, page, limit: limitOf(size) }),
    placeholderData: keepPreviousData,
  });
  const data = leads.data;
  const pastEnd = data !== undefined && data.items.length === 0 && data.total > 0;
  const lastPage =
    pastEnd && !leads.isPlaceholderData
      ? pageRange(page, data.pageSize, data.total).page
      : null;
  const toLastPage = pastEnd && (leads.isPlaceholderData || lastPage !== page);
  useEffect(() => {
    if (lastPage !== null && lastPage !== page) setPage(lastPage);
  }, [lastPage, page, setPage]);

  const close = () =>
    void navigate({ pathname: ADMIN_PATHS.leads, search }, { replace: true });

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHead title={t("adminShell.nav.leads")} description={t("leads.lead")} />
      <LeadSheet leadId={id ?? null} onClose={close} onDeleted={close} />

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="max-w-full min-w-0">
          <Segmented
            label={t("common.status")}
            value={tab}
            options={LEAD_TABS.map((value) => ({
              value,
              label: value === "all" ? t("leads.all") : t(`leads.status.${value}`),
            }))}
            onChange={(value) => setFilter("status", tabParam(value))}
            scroll
          />
        </div>
        <SearchInput
          className={TOOLBAR_SEARCH}
          value={typed}
          onChange={setTyped}
          placeholder={t("leads.search")}
          maxCharacters={LEAD_SEARCH_MAX}
        />
      </div>

      {leads.isError ? (
        <LoadError error={leads.error} onRetry={() => void leads.refetch()}>
          {t("leads.loadFailed")}
        </LoadError>
      ) : null}
      {data === undefined || toLastPage ? (
        (leads.isPending || toLastPage) && <LeadsSkeleton />
      ) : (
        <LeadsTable
          leads={data.items}
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          cards={cards}
          empty={q === "" ? t("leads.empty") : t("leads.noMatch")}
          locale={locale}
          onOpen={(lead) =>
            void navigate({ pathname: `${ADMIN_PATHS.leads}/${lead.id}`, search })
          }
        />
      )}
    </div>
  );
}
