import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { useCan } from "@/features/auth/permissions";
import { copyTest } from "@/features/sharing";
import type { Test } from "@/features/tests/api";
import { ApiError } from "@/lib/api/errors";
import { nfc } from "@/lib/nfc";
import { notify } from "@/lib/toast";

/**
 * MakeCopyAction is "Make a copy" for a test shared with the caller (R7
 * Access Modes): in a Can-use builder's title bar and on test detail for
 * both access levels. It asks first, with Shared with me's sentence, then
 * copies the draft into the caller's Tests and opens the copy's builder. A
 * caller without `content.tests.write` gets nothing.
 */
export function MakeCopyAction({
  test,
  className,
}: Readonly<{ test: Pick<Test, "id" | "title" | "owner">; className?: string }>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const writes = useCan("content.tests.write");
  const [asking, setAsking] = useState(false);
  const title = nfc(test.title) || t("tests.untitled");
  const copy = useMutation({
    mutationFn: () => copyTest(test.id),
    onSuccess: async (made) => {
      setAsking(false);
      notify.success(t("sharing.withMe.toast.copied.test"));
      await client.invalidateQueries({ queryKey: ["teacher-tests"] });
      await navigate(`/teacher/tests/${made.id}/edit`);
    },
  });
  if (!writes) return null;
  return (
    <>
      <Button
        variant="outline"
        className={className}
        onClick={() => {
          copy.reset();
          setAsking(true);
        }}
      >
        <Copy aria-hidden="true" />
        {t("sharing.withMe.copy")}
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={(open) => {
          if (!open && !copy.isPending) setAsking(false);
        }}
        title={t("sharing.withMe.copyTitle", { name: title })}
        description={t("sharing.withMe.copyBody", { owner: nfc(test.owner.name) })}
        confirmLabel={t("sharing.withMe.copy")}
        pending={copy.isPending}
        error={copyError(copy.error, t)}
        onConfirm={() => copy.mutate()}
      />
    </>
  );
}

function copyError(
  error: Error | null,
  t: ReturnType<typeof useTranslation>["t"],
): string | null {
  if (error === null) return null;
  if (error instanceof ApiError && error.status === 404)
    return t("sharing.withMe.toast.gone");
  return error instanceof ApiError ? error.message : t("common.actionFailed");
}
