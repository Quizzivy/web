import { useCallback, useSyncExternalStore } from "react";
import type { MessageAttachment } from "./api";

/**
 * Draft is what a composer holds for one thread before Send: the text, and a
 * file that is uploaded and waits to leave with it (the owner, 2026-11-13,
 * Q3). A file waits here, not in the dialog, until Send or its ×.
 */
export type Draft = Readonly<{ text: string; attachment: MessageAttachment | null }>;

const EMPTY: Draft = { text: "", attachment: null };

const drafts = new Map<string, Draft>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** readDraft is the draft kept for `key`, or the empty one. */
export function readDraft(key: string): Draft {
  return drafts.get(key) ?? EMPTY;
}

/**
 * writeDraft keeps `draft` for `key` in memory, for this tab's life: a page
 * left and opened again finds it, a reload does not (T-R7.20). An empty draft
 * is forgotten.
 */
export function writeDraft(key: string, draft: Draft): void {
  if (draft.text === "" && draft.attachment === null) drafts.delete(key);
  else drafts.set(key, draft);
  for (const listener of [...listeners]) listener();
}

/** clearDrafts forgets every draft, as signing out must. */
export function clearDrafts(): void {
  drafts.clear();
  for (const listener of [...listeners]) listener();
}

/** useDraft reads and writes the draft of one thread. */
export function useDraft(key: string): readonly [Draft, (draft: Draft) => void] {
  const draft = useSyncExternalStore(
    subscribe,
    () => readDraft(key),
    () => EMPTY,
  );
  const set = useCallback((next: Draft) => writeDraft(key, next), [key]);
  return [draft, set] as const;
}
