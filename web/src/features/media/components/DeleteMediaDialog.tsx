import type { RefObject } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  deleteMedia,
  type LibraryAsset,
  type MediaRetirement,
} from "@/features/media/api";
import { RetentionNote } from "@/features/media/components/RetentionNote";
import {
  ApiError,
  failureMessage,
  referencingTests,
  type ReferencingTest,
} from "@/lib/api/errors";

/**
 * usedElsewhere reads a 409 MEDIA_IN_USE_ELSEWHERE: `count` is how many of
 * other teachers' live bank questions or draft groups use the file (through
 * a copy or a share), or undefined when `details.count` is missing or not a
 * positive whole number, so no figure is made up. It is null for any other
 * failure. Nothing of theirs is named.
 */
function usedElsewhere(cause: unknown): Readonly<{ count?: number }> | null {
  if (!(cause instanceof ApiError) || cause.code !== "MEDIA_IN_USE_ELSEWHERE")
    return null;
  const count = cause.details?.["count"];
  return typeof count === "number" && Number.isInteger(count) && count > 0
    ? { count }
    : {};
}

/**
 * DeleteMediaDialog asks before a library file is deleted, or, when a
 * published version uses it, says it cannot be and names those versions
 * (DG-09). Before it asks, it says that the file is deleted for good seven
 * days later and cannot be restored, with its download (DG-206). A refusal
 * from the server that names versions turns the dialog into the notice; one
 * that says another teacher's questions use it (409 MEDIA_IN_USE_ELSEWHERE)
 * says how many in the dialog, and Delete stays off.
 * `onDeleted` runs once the file is gone, before the dialog closes, with what
 * the server says became of it, so it can point `returnFocus` at what
 * survives the file.
 */
export function DeleteMediaDialog({
  returnFocus,
  asset,
  onOpenChange,
  onDeleted,
}: Readonly<{
  asset: LibraryAsset | null;
  returnFocus: RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
  onDeleted: (retired: MediaRetirement | undefined) => void;
}>) {
  const { t } = useTranslation();
  const remove = useMutation({
    mutationFn: (id: string) => deleteMedia(id),
    onSuccess: (retired: MediaRetirement | undefined) => {
      onDeleted(retired);
      onOpenChange(false);
    },
  });
  const close = (open: boolean) => {
    remove.reset();
    onOpenChange(open);
  };
  const refused = referencingTests(remove.error);
  const holders = refused.length > 0 ? refused : (asset?.usedIn ?? []);
  const blocked = refused.length > 0 || (asset?.usageCount ?? 0) > 0;
  const elsewhere = usedElsewhere(remove.error);
  const name = asset?.displayName ?? "";

  function deleteError(): string | null {
    if (!remove.isError) return null;
    if (elsewhere !== null)
      return elsewhere.count === undefined
        ? t("media.deleteInUseElsewhereUncounted")
        : t("media.deleteInUseElsewhere", { count: elsewhere.count });
    return failureMessage(remove.error, t("media.deleteFailed"));
  }

  if (blocked)
    return (
      <ConfirmDialog
        returnFocus={returnFocus}
        open={asset !== null}
        onOpenChange={close}
        title={t("media.deleteBlockedTitle")}
        description={t("media.deleteBlockedBody", { name })}
        confirmLabel={t("media.understood")}
      >
        <VersionList tests={holders} />
      </ConfirmDialog>
    );

  return (
    <ConfirmDialog
      returnFocus={returnFocus}
      open={asset !== null}
      onOpenChange={close}
      title={t("media.deleteTitle", { name })}
      description={
        (asset?.questionCount ?? 0) > 0
          ? t("media.deleteUsedBody", { count: asset?.questionCount ?? 0 })
          : t("media.deleteUnusedBody")
      }
      confirmLabel={t("media.delete")}
      destructive
      pending={remove.isPending}
      disabled={elsewhere !== null}
      error={deleteError()}
      onConfirm={() => {
        if (asset !== null) remove.mutate(asset.id);
      }}
    >
      {asset === null ? null : (
        <RetentionNote asset={asset}>{t("media.deleteGone")}</RetentionNote>
      )}
    </ConfirmDialog>
  );
}

function VersionList({ tests }: Readonly<{ tests: readonly ReferencingTest[] }>) {
  const { t } = useTranslation();
  if (tests.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {tests.map((test) => (
        <li key={`${test.id}-${test.version ?? 0}`} className="min-w-0 break-words">
          <Link
            to={`/teacher/tests/${test.id}`}
            className="font-medium underline underline-offset-4"
          >
            {test.title}
          </Link>
          {test.version === undefined ? null : (
            <span className="text-muted-fg ml-1.5 tabular-nums">
              {t("tests.versionNumber", { n: test.version })}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
