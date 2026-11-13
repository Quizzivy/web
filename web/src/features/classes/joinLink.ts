import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "@/components/ui/sonner";
import { studentOrigin } from "@/app/host";

/**
 * joinLinkOf is the one join link format (DG-01): the student host's origin,
 * whatever host the teacher has open (§5.8), `/join/` and the code as it is
 * grouped, dash kept, so a link and a card read alike. The join page reads it
 * with or without the dash.
 */
export function joinLinkOf(code: string): string {
  return `${studentOrigin()}/join/${code}`;
}

/** joinSite is the student host as a person types it: no scheme. */
export function joinSite(): string {
  return new URL(studentOrigin()).host;
}

/**
 * joinLinkLabel is a code's join link as a card or a QR shows it under the
 * code: the link without its scheme, so it reads as the deck draws it.
 */
export function joinLinkLabel(code: string): string {
  return `${joinSite()}/join/${code}`;
}

/**
 * useCopyJoinLink returns a function that copies a code's join link and
 * says so in a toast naming the link, or that the copy failed. Neither the
 * code nor the link is kept.
 */
export function useCopyJoinLink(): (code: string) => void {
  const { t } = useTranslation();
  return useCallback(
    (code: string) => {
      const link = joinLinkOf(code);
      void Promise.resolve()
        .then(() => navigator.clipboard.writeText(link))
        .then(
          () => toast(t("classes.linkCopied", { url: link })),
          () => toast.error(t("classes.copyFailed")),
        );
    },
    [t],
  );
}

/**
 * useCopyJoinCode returns a function that copies a code as it is grouped and
 * says so in a toast, or that the copy failed. The code is not kept.
 */
export function useCopyJoinCode(): (code: string) => void {
  const { t } = useTranslation();
  return useCallback(
    (code: string) => {
      void Promise.resolve()
        .then(() => navigator.clipboard.writeText(code))
        .then(
          () => toast(t("classDetail.codeCopied")),
          () => toast.error(t("classDetail.copyFailed")),
        );
    },
    [t],
  );
}
