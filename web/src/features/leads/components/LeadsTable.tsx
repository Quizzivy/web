import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { DataTable } from "@/components/shared/data/DataTable";
import { Pager } from "@/components/shared/data/Pager";
import { Skeleton } from "@/components/ui/skeleton";
import { LEAD_PAGE_SIZES, type Lead } from "@/features/leads/api";
import { LeadCard } from "@/features/leads/components/LeadCard";
import { leadColumns } from "@/features/leads/components/leadColumns";
import type { Locale } from "@/lib/i18n";

const SKELETON_ROWS = 6;

/** LeadsSkeleton stands for the table while its first page is on its way. */
export function LeadsSkeleton() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t("common.loading")}
      className="bg-card shadow-card overflow-hidden rounded-xl border"
    >
      <div className="bg-muted h-10" />
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <div key={index} className="flex h-13 items-center gap-3 border-t px-4">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24 flex-none" />
          <Skeleton className="h-4 w-20 flex-none" />
        </div>
      ))}
    </div>
  );
}

/**
 * LeadsTable is a page of consultation requests: a table whose columns join
 * as the content widens, or a list of cards when `cards` says the content is
 * narrower than CARDS_BELOW, and under it the pager. A row or a card opens
 * its request through `onOpen`. `empty` is what an empty page says.
 */
export function LeadsTable({
  leads,
  page,
  pageSize,
  total,
  cards,
  empty,
  locale,
  onOpen,
}: Readonly<{
  leads: readonly Lead[];
  page: number;
  pageSize: number;
  total: number;
  cards: boolean;
  empty: ReactNode;
  locale: Locale;
  onOpen: (lead: Lead) => void;
}>) {
  const { t } = useTranslation();
  const columns = useMemo(() => leadColumns(t, locale), [t, locale]);
  return (
    <DataTable
      label={t("adminShell.nav.leads")}
      columns={columns}
      rows={leads}
      rowSize={{ minHeight: 52 }}
      card={(lead) => <LeadCard lead={lead} locale={locale} />}
      cardLayout="joined"
      cards={cards}
      empty={empty}
      onOpen={onOpen}
      footer={
        <Pager
          page={page}
          pageSize={pageSize}
          total={total}
          sizes={LEAD_PAGE_SIZES}
          noun={(count) => t("leads.noun", { count })}
        />
      }
    />
  );
}
