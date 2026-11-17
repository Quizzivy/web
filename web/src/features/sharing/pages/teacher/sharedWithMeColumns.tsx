import type { TFunction } from "i18next";
import { formatInTimeZone } from "date-fns-tz";
import { FileText, Library, type LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { IconTile } from "@/components/shared/IconTile";
import type { DataColumn } from "@/components/shared/data/DataTable";
import type { Locale } from "@/lib/i18n";
import {
  dayMonth,
  dayMonthYear,
  formatDate,
  getDisplayTimeZone,
} from "@/lib/i18n/datetime";
import type { ShareKind, SharedWithMeItem } from "../../api";
import { AccessPill } from "../../components/AccessPill";
import { SharedRowActions } from "./SharedRowActions";
import type { RowAct, SharedRow } from "./sharedRow";

const KIND_ICON: Record<ShareKind, LucideIcon> = {
  test: FileText,
  question_set: Library,
};

/** sharedOn is the day of the grant, with its year only when that is not this year. */
function sharedOn(at: string, locale: Locale): string {
  const zone = getDisplayTimeZone();
  const year = (moment: string | Date) => formatInTimeZone(moment, zone, "yyyy");
  return year(at) === year(new Date())
    ? dayMonth(at, locale)
    : dayMonthYear(at, locale);
}

/** kindLine is the line under a name: "Đề thi", or a set's "Bộ câu hỏi · 48 câu" (Q2). */
export function kindLine(t: TFunction, item: SharedWithMeItem): string {
  return item.kind === "test"
    ? t("sharing.withMe.kind.test")
    : t("sharing.withMe.kind.question_set", { count: item.questionCount ?? 0 });
}

/**
 * sharedWithMeColumns are the deck's five columns (`shr.*`) at the plan's
 * 820px: Name (kind tile, name, kind line), Shared by (initials, name, and
 * "Account disabled" under it when so), Access (the pencil or eye pill),
 * Shared (the day) and the row's Open, Make a copy (for whoever may write
 * that kind) and Remove. Every column always shows: below 820px the table
 * scrolls inside its card (Q1).
 */
export function sharedWithMeColumns(
  t: TFunction,
  locale: Locale,
  canCopy: (kind: ShareKind) => boolean,
  onAct: (act: RowAct, item: SharedRow) => void,
): DataColumn<SharedRow>[] {
  return [
    {
      id: "name",
      header: t("sharing.withMe.column.name"),
      track: "minmax(184px,2fr)",
      cell: (item) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <IconTile icon={KIND_ICON[item.kind]} size={32} />
          <span className="min-w-0">
            <span className="block truncate font-medium">{item.name}</span>
            <span className="text-muted-fg block truncate text-xs">
              {kindLine(t, item)}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: "owner",
      header: t("sharing.withMe.column.owner"),
      track: "minmax(140px,1.2fr)",
      cell: (item) => (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={item.owner.name} src={item.owner.avatarUrl} size="26" />
          <span className="min-w-0">
            <span className="block truncate">{item.owner.name}</span>
            {item.owner.disabled ? (
              <span className="text-muted-fg block truncate text-xs">
                {t("sharing.accountDisabled")}
              </span>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      id: "access",
      header: t("sharing.withMe.column.access"),
      track: "112px",
      cell: (item) => <AccessPill access={item.access} />,
    },
    {
      id: "sharedAt",
      header: t("sharing.withMe.column.sharedAt"),
      track: "92px",
      cell: (item) => (
        <time
          dateTime={item.sharedAt}
          title={formatDate(item.sharedAt, locale)}
          className="text-muted-fg text-sm whitespace-nowrap"
        >
          {sharedOn(item.sharedAt, locale)}
        </time>
      ),
    },
    {
      id: "actions",
      header: t("common.actions"),
      hideHeader: true,
      track: "212px",
      align: "end",
      cell: (item) => (
        <SharedRowActions item={item} canCopy={canCopy(item.kind)} onAct={onAct} />
      ),
    },
  ];
}
