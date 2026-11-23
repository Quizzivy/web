import { useTranslation } from "react-i18next";
import type { Counts, Filter } from "@/features/attendance/register";
import { cn } from "@/lib/utils";

const BAR: readonly { key: Filter; fill: string }[] = [
  { key: "present", fill: "bg-success" },
  { key: "late", fill: "bg-warning" },
  { key: "absent", fill: "bg-danger" },
];

const LEGEND: readonly { key: Filter; dot: string }[] = [
  ...BAR.map(({ key, fill }) => ({ key, dot: fill })),
  { key: "none", dot: "bg-border" },
];

/**
 * ProgressRow heads the register: "{k} of {n} marked", or "All {n} marked",
 * a bar of three segments (present, late, absent) over the roster, and the
 * legend, whose entries filter the rows. Each entry is a toggle button with
 * its count (DG-17); pressing the pressed one shows everyone again. "Not
 * marked" is left out once everyone is marked. Without `onFilter` the
 * legend only reads.
 */
export function ProgressRow({
  counts,
  total,
  filter,
  onFilter,
}: Readonly<{
  counts: Counts;
  total: number;
  filter: Filter | null;
  onFilter?: ((next: Filter | null) => void) | undefined;
}>) {
  const { t } = useTranslation();
  const marked = total - counts.none;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3">
      <span className="text-ui font-semibold whitespace-nowrap tabular-nums">
        {counts.none > 0
          ? t("attendance.progress", { k: marked, n: total })
          : t("attendance.progressAll", { n: total })}
      </span>
      <span
        aria-hidden="true"
        className="bg-muted flex h-2 min-w-30 flex-[1_1_160px] overflow-hidden rounded-md"
      >
        {BAR.map(({ key, fill }) => (
          <span
            key={key}
            data-status={key}
            className={cn("h-full transition-[width] duration-200", fill)}
            style={{ width: `${total === 0 ? 0 : (counts[key] / total) * 100}%` }}
          />
        ))}
      </span>
      <span
        role="group"
        aria-label={t("attendance.filterLabel")}
        className="flex flex-wrap items-center gap-0.5"
      >
        {LEGEND.filter(({ key }) => key !== "none" || counts.none > 0).map(
          ({ key, dot }) => {
            const on = filter === key;
            const content = (
              <>
                <span
                  aria-hidden="true"
                  className={cn("size-2 flex-none rounded-full", dot)}
                />
                {t(`attendance.status.${key}`)}
                <span className="text-fg font-semibold tabular-nums">
                  {counts[key]}
                </span>
              </>
            );
            const look = cn(
              "text-muted-fg text-meta rounded-seg inline-flex h-7 items-center gap-1.5 border px-2.25 whitespace-nowrap",
              on ? "bg-muted border-border" : "border-transparent bg-transparent",
            );
            return onFilter === undefined ? (
              <span key={key} className={look}>
                {content}
              </span>
            ) : (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                className={cn(look, "hover:bg-muted cursor-pointer")}
                onClick={() => onFilter(on ? null : key)}
              >
                {content}
              </button>
            );
          },
        )}
      </span>
    </div>
  );
}
