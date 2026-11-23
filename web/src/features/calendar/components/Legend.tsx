import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { TONES } from "../items";

const ENTRIES = [
  { key: "calendar.legend.session", bar: TONES.session.bar },
  { key: "calendar.legend.closes", bar: TONES.closes.bar },
  { key: "calendar.legend.opens", bar: TONES.opens.bar },
] as const;

/**
 * Legend names the grid's three colours as the deck does: a 10px swatch with
 * a 3px radius before each name, at 12.5 in the muted ink, wrapping on a
 * narrow screen.
 */
export function Legend() {
  const { t } = useTranslation();
  return (
    <ul
      aria-label={t("calendar.legend.label")}
      className="text-muted-fg text-meta flex flex-wrap gap-3.5"
    >
      {ENTRIES.map((entry) => (
        <li key={entry.key} className="flex items-center gap-1.5 whitespace-nowrap">
          <span
            aria-hidden="true"
            className={cn("size-2.5 flex-none rounded-[3px]", entry.bar)}
          />
          {t(entry.key)}
        </li>
      ))}
    </ul>
  );
}
