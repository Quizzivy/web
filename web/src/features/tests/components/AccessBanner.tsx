import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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
 * BuilderStale is a refused save the builder names: who saved first (or
 * nobody) and when, and whether it was the test (its outline or a group) or
 * the question open in the pane. "unnamed" is a refusal that carried no
 * details at all.
 */
export type BuilderStale = (Stale & { what: "test" | "question" }) | "unnamed";

/**
 * staleLead is the band's first sentence for a refused save: who changed the
 * test or the question and when; for a question with nobody named, only when.
 * A refusal of the test with nobody to name has none.
 */
function staleLead(
  stale: BuilderStale,
  t: TFunction,
  locale: ReturnType<typeof useLocale>,
): string | undefined {
  if (stale === "unnamed") return undefined;
  const time = clockTime(stale.at, new Date(), locale);
  if (stale.name !== null)
    return t(
      stale.what === "question"
        ? "questionEditor.stale.title"
        : "builder.staleBy.title",
      { name: nfc(stale.name), time },
    );
  return stale.what === "question"
    ? t("questionEditor.stale.titleUnknown", { time })
    : undefined;
}

/**
 * AccessBanner is the one band under the builder's title bar (note 3): a
 * refused save, which names who saved first and when and offers Reload;
 * else, for a recipient, what their access means here. The owner sees only
 * the first. A refused question edit that names nobody still says when; a
 * refusal of the test with nobody to name keeps the builder's sentence of
 * before.
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
    const lead = staleLead(stale, t, locale);
    return (
      <Callout
        tone="warning"
        icon={TriangleAlert}
        announce
        lead={lead}
        actions={
          <Button variant="outline" size="sm" className="bg-card" onClick={onReload}>
            {t("builder.reload")}
          </Button>
        }
      >
        {lead === undefined ? t("builder.staleBody") : t("questionEditor.stale.body")}
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
