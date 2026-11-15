import type { Lead } from "@/features/leads/api";
import { InterestChips, Received } from "@/features/leads/components/LeadCells";
import { LeadStatusBadge } from "@/features/leads/components/LeadStatusBadge";
import { phoneText } from "@/features/leads/leadFilters";
import type { Locale } from "@/lib/i18n";

/**
 * LeadCard is a request where the list is too narrow for columns: the name
 * and the status, under them the phone number and when the request was sent,
 * and then the courses asked about. The whole card opens the request, so the
 * number is text here and a link in the sheet.
 */
export function LeadCard({ lead, locale }: Readonly<{ lead: Lead; locale: Locale }>) {
  return (
    <span className="flex w-full min-w-0 flex-col gap-1.5">
      <span className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium">{lead.fullName}</span>
        <span className="flex-none">
          <LeadStatusBadge status={lead.status} />
        </span>
      </span>
      <span className="text-muted-fg flex flex-wrap items-center gap-x-1.5 text-[12.5px]">
        <span className="whitespace-nowrap tabular-nums">{phoneText(lead.phone)}</span>
        <span aria-hidden="true">·</span>
        <Received at={lead.createdAt} locale={locale} />
      </span>
      {lead.interests.length === 0 ? null : (
        <InterestChips interests={lead.interests} />
      )}
    </span>
  );
}
