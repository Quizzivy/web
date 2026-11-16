import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import { Callout } from "@/components/shared/Callout";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AccessPill, type Stale } from "@/features/sharing";
import { clockTime } from "@/lib/i18n/datetime";
import { useLocale } from "@/lib/i18n/useLocale";
import { nfc } from "@/lib/nfc";
import type { TestAccess } from "../access";

/**
 * AccessOwnerLine is the line under a shared test's title, in the builder and
 * on test detail (R7 Access Modes, note 1): the owner's initials and name,
 * then Shared with me's pill for a recipient (an admin reading someone
 * else's test gets no pill). It draws nothing on the caller's own test;
 * `children` add the page's facts after it.
 */
export function AccessOwnerLine({
  access,
  children,
}: Readonly<{ access: TestAccess; children?: ReactNode }>) {
  if (access.mine) return null;
  return (
    <p className="text-muted-fg flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="text-fg inline-flex items-center gap-2">
        <Avatar name={access.owner.name} size="sm" />
        {nfc(access.owner.name)}
      </span>
      {access.access === "owner" ? null : <AccessPill access={access.access} />}
      {children}
    </p>
  );
}

/**
 * BuilderStale is a refused save the builder names: who saved first and
 * when, and whether it was the test (its outline or a group) or the question
 * open in the pane. "unnamed" is a refusal that named nobody.
 */
export type BuilderStale = (Stale & { what: "test" | "question" }) | "unnamed";

/**
 * AccessBanner is the one band under the builder's title bar (note 3): a
 * refused save, which names who saved first and when and offers Reload;
 * else, for a recipient, what their access means here. The owner sees only
 * the first. With nobody to name it keeps the builder's sentence of before.
 */
export function AccessBanner({
  access,
  stale,
  onReload,
}: Readonly<{
  access: TestAccess;
  stale: BuilderStale | null;
  onReload: () => void;
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  if (stale !== null) {
    const named = stale === "unnamed" || stale.name === null ? null : stale;
    const key =
      named?.what === "question"
        ? "questionEditor.stale.title"
        : "builder.staleBy.title";
    return (
      <Callout
        tone="warning"
        icon={TriangleAlert}
        announce
        lead={
          named === null
            ? undefined
            : t(key, {
                name: nfc(named.name ?? ""),
                time: clockTime(named.at, new Date(), locale),
              })
        }
        actions={
          <Button variant="outline" size="sm" className="bg-card" onClick={onReload}>
            {t("builder.reload")}
          </Button>
        }
      >
        {named === null ? t("builder.staleBody") : t("questionEditor.stale.body")}
      </Callout>
    );
  }
  if (access.readOnly)
    return (
      <Callout className="[&>svg]:text-muted-fg" lead={t("builder.access.useLead")}>
        {t("builder.access.useRest")}
      </Callout>
    );
  if (access.mine) return null;
  return (
    <Callout
      className="[&>svg]:text-muted-fg"
      lead={t("sets.editLead", { name: access.ownerGiven })}
    >
      {t("builder.access.editRest", { name: access.ownerGiven })}
    </Callout>
  );
}
