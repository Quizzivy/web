import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ArrowRight, Info, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMediaQuery } from "@/hooks/useMediaQuery";

/** DetailRow is one line of the popover's short list: an icon and a text. */
export type DetailRow = Readonly<{ key: string; icon: LucideIcon; text: string }>;

/**
 * ThreadDetails is the thread header's Details (DG-91 sign-off): a popover
 * from 768px and a sheet from the bottom below, as the proposal draws it, not
 * a page. It repeats who the thread is with (`avatar`, `title`, `role`),
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
  const wide = useMediaQuery("(min-width: 768px)");
  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="data-[state=open]:bg-hover max-[767px]:size-11"
      aria-label={t("messages.details")}
    >
      <Info className="size-4" />
    </Button>
  );
  const head = (
    <div className="flex items-center gap-3">
      {avatar}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold">{title}</span>
        <span className="text-muted-fg text-meta block">{role}</span>
      </span>
    </div>
  );
  const body = (
    <>
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
    </>
  );
  if (!wide)
    return (
      <Dialog>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          className="bg-card data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 top-auto bottom-0 left-0 flex max-w-none translate-x-0 translate-y-0 flex-col gap-3 rounded-t-2xl rounded-b-none border-x-0 border-b-0 px-4 pt-2 pb-5 sm:max-w-none"
          style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        >
          <span
            aria-hidden="true"
            className="bg-border mx-auto mb-1 h-1 w-9 flex-none rounded-full"
          />
          <DialogTitle className="sr-only">{t("messages.details")}</DialogTitle>
          {head}
          {body}
        </DialogContent>
      </Dialog>
    );
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex w-[min(292px,calc(100vw-32px))] flex-col gap-3 rounded-xl p-4"
        aria-label={t("messages.details")}
      >
        {head}
        {body}
      </PopoverContent>
    </Popover>
  );
}
