import type { TFunction } from "i18next";
import type { ImportDraftGroup } from "./api";

/**
 * importGroupName names a group of the draft by the owner's names (Q2 of
 * DG-231): a cloze when its passage has gaps, else a passage, with its printed
 * label when it has one.
 */
export function importGroupName(
  group: Pick<ImportDraftGroup, "label" | "gaps">,
  t: TFunction,
): string {
  const kind = t(`groups.kind.${group.gaps.length > 0 ? "cloze" : "reading"}.name`);
  return group.label
    ? t("imports.review.groupLabel", { kind, label: group.label })
    : t("imports.review.group", { kind });
}
