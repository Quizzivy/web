import type { TFunction } from "i18next";
import type { DataColumn } from "@/components/shared/data/DataTable";
import type { Lead } from "@/features/leads/api";
import {
  InterestChips,
  PhoneLink,
  Received,
} from "@/features/leads/components/LeadCells";
import { LeadStatusBadge } from "@/features/leads/components/LeadStatusBadge";
import type { Locale } from "@/lib/i18n";
import { formatRelativeShort } from "@/lib/i18n/datetime";

/**
 * CARDS_BELOW is the content width under which each request is a card and not
 * a row, as the Users table's is.
 */
export const CARDS_BELOW = 560;

const MUTED = "text-muted-fg text-[13px]";

/**
 * leadColumns are the table's columns. Name, Phone and Status always show;
 * the others join by the content's width (`showFrom`): Received from 640,
 * Interested in from 820, For from 960 and Best time from 1100. While one of
 * those is folded away, the Name cell says what it would under the name. The
 * phone number is a `tel:` link, which does not open the row.
 */
export function leadColumns(t: TFunction, locale: Locale): DataColumn<Lead>[] {
  return [
    {
      id: "name",
      header: t("leads.column.name"),
      track: "minmax(160px,1.5fr)",
      cell: (lead, shown) => {
        const sub = [
          shown.has("interests")
            ? null
            : lead.interests
                .map((interest) => t(`leads.interest.${interest}`))
                .join(", "),
          shown.has("for") ? null : t(`leads.for.${lead.courseFor}`),
          shown.has("time") ? null : t(`leads.time.${lead.callTime}`),
          shown.has("received")
            ? null
            : formatRelativeShort(lead.createdAt, locale, t("common.agoNow")),
        ]
          .filter((part) => part !== null && part !== "")
          .join(" · ");
        return (
          <span className="block min-w-0 py-2">
            <span className="block truncate font-medium">{lead.fullName}</span>
            {sub === "" ? null : (
              <span className="text-muted-fg block truncate text-xs">{sub}</span>
            )}
          </span>
        );
      },
    },
    {
      id: "phone",
      header: t("leads.column.phone"),
      track: "124px",
      cell: (lead) => <PhoneLink phone={lead.phone} className="text-[13px]" />,
    },
    {
      id: "interests",
      header: t("leads.column.interests"),
      track: "minmax(160px,1.5fr)",
      showFrom: 820,
      cell: (lead) => (
        <span className="block py-2">
          <InterestChips interests={lead.interests} />
        </span>
      ),
    },
    {
      id: "for",
      header: t("leads.column.for"),
      track: "110px",
      showFrom: 960,
      cell: (lead) => <span className={MUTED}>{t(`leads.for.${lead.courseFor}`)}</span>,
    },
    {
      id: "time",
      header: t("leads.column.time"),
      track: "180px",
      showFrom: 1100,
      cell: (lead) => <span className={MUTED}>{t(`leads.time.${lead.callTime}`)}</span>,
    },
    {
      id: "received",
      header: t("leads.column.received"),
      track: "104px",
      showFrom: 640,
      cell: (lead) => (
        <span className={MUTED}>
          <Received at={lead.createdAt} locale={locale} />
        </span>
      ),
    },
    {
      id: "status",
      header: t("common.status"),
      track: "minmax(96px,124px)",
      cell: (lead) => <LeadStatusBadge status={lead.status} />,
    },
  ];
}
