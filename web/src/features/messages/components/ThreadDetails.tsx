import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ArrowRight, Info, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** DetailRow is one line of the popover's short list: an icon and a text. */
export type DetailRow = Readonly<{ key: string; icon: LucideIcon; text: string }>;

/**
 * ThreadDetails is the thread header's Details (DG-91 sign-off): a popover,
 * not a page. It repeats who the thread is with (`avatar`, `title`, `role`),
 * then a short list under `label` and one link, or, for a former student,
 * one sentence (`note`) and no link, since Students no longer lists them.
 */
export function ThreadDetails({
  avatar,
  title,
  role,
  label,
  rows,
  note,
  link,
}: Readonly<{
  avatar: ReactNode;
  title: string;
  role: string;
  label?: string | undefined;
  rows?: readonly DetailRow[] | undefined;
  note?: string | undefined;
  link?: Readonly<{ to: string; label: string }> | undefined;
}>) {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="data-[state=open]:bg-hover max-[767px]:size-11"
          aria-label={t("messages.details")}
        >
          <Info className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex w-[min(292px,calc(100vw-32px))] flex-col gap-3 rounded-xl p-4"
        aria-label={t("messages.details")}
      >
        <div className="flex items-center gap-3">
          {avatar}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold">{title}</span>
            <span className="text-muted-fg text-meta block">{role}</span>
          </span>
        </div>
        {rows !== undefined && rows.length > 0 && (
          <div className="flex flex-col gap-2">
            {label !== undefined && (
              <span className="text-muted-fg text-xs font-medium">{label}</span>
            )}
            <ul className="flex flex-col gap-2">
              {rows.map((row) => (
                <li key={row.key} className="flex items-center gap-2 text-sm">
                  <row.icon
                    aria-hidden="true"
                    className="text-muted-fg size-3.5 flex-none"
                  />
                  <span className="min-w-0 truncate">{row.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {note !== undefined && (
          <p className="text-muted-fg text-sm text-pretty">{note}</p>
        )}
        {link !== undefined && (
          <Button asChild variant="outline" className="w-full max-[767px]:h-11">
            <Link to={link.to}>
              {link.label}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
