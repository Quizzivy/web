import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { Lead } from "@/features/leads/api";
import { phoneText } from "@/features/leads/leadFilters";
import type { Locale } from "@/lib/i18n";
import { formatDateTime, formatRelativeShort } from "@/lib/i18n/datetime";
import { cn } from "@/lib/utils";

/**
 * PhoneLink is a request's phone number as a `tel:` link, which a phone
 * dials: the number as a person reads it, and its digits as the address.
 */
export function PhoneLink({
  phone,
  className,
}: Readonly<{ phone: string; className?: string }>) {
  return (
    <a
      href={`tel:${phone}`}
      className={cn(
        "rounded-sm whitespace-nowrap tabular-nums underline-offset-4 hover:underline",
        className,
      )}
    >
      {phoneText(phone)}
    </a>
  );
}

/**
 * InterestChips are the courses a request asked about, one chip each in the
 * order the form offers them, wrapping when they do not fit and, with `end`,
 * kept to the end of the line; a request that named none reads "—".
 */
export function InterestChips({
  interests,
  end = false,
}: Readonly<{ interests: Lead["interests"]; end?: boolean }>) {
  const { t } = useTranslation();
  if (interests.length === 0) return <span className="text-muted-fg">—</span>;
  return (
    <span className={cn("flex min-w-0 flex-wrap gap-1", end && "justify-end")}>
      {interests.map((interest) => (
        <Badge key={interest} className="text-fg max-w-full px-2 font-medium">
          <span className="min-w-0 truncate">{t(`leads.interest.${interest}`)}</span>
        </Badge>
      ))}
    </span>
  );
}

/**
 * Received is when a request was sent: the bare short value (D-017) in a
 * `<time>` whose title is the exact moment. The cell never wraps.
 */
export function Received({ at, locale }: Readonly<{ at: string; locale: Locale }>) {
  const { t } = useTranslation();
  return (
    <time
      dateTime={at}
      title={formatDateTime(at, locale)}
      className="whitespace-nowrap"
    >
      {formatRelativeShort(at, locale, t("common.agoNow"))}
    </time>
  );
}
