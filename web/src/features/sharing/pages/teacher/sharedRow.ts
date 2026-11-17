import type { SharedWithMeItem } from "../../api";

/** SharedRow is one grant of Shared with me, keyed by its share for the table. */
export type SharedRow = SharedWithMeItem & { readonly id: string };

/** RowAct is what a row's buttons ask the page to confirm. */
export type RowAct = "copy" | "remove";

/**
 * openHref is where Open, and the row's name, lead: a test's builder (read-only
 * for Can use, T-R7.18) or a question set's page (T-R7.19).
 */
export function openHref(item: Pick<SharedWithMeItem, "kind" | "resourceId">): string {
  return item.kind === "test"
    ? `/teacher/tests/${item.resourceId}/edit`
    : `/teacher/question-bank/sets/${item.resourceId}`;
}
