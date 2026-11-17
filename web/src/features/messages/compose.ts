import type { KeyboardEvent } from "react";
import type { MessageAttachment } from "./api";
import type { Draft } from "./drafts";

/** BODY_MAX is the longest body a message may carry, after trimming. */
export const BODY_MAX = 4000;

/** Outgoing is what Send hands over: the trimmed text, or null, and the waiting file. */
export type Outgoing = Readonly<{
  body: string | null;
  attachment: MessageAttachment | null;
}>;

/** outgoingOf is what a draft sends, or null when it holds neither text nor a file. */
export function outgoingOf(draft: Draft): Outgoing | null {
  const body = draft.text.trim();
  if (body === "" && draft.attachment === null) return null;
  return { body: body === "" ? null : body, attachment: draft.attachment };
}

/**
 * sendsOnEnter is the composer's keyboard rule. In a direct thread Enter
 * sends and Shift+Enter adds a line; in a class channel Enter adds a line and
 * only Send posts (the owner, 2026-11-13, Q2), with no sentence that says so.
 * Nothing is sent while an input method is composing a word (Telex, VNI),
 * whose Enter only ends the composition.
 */
export function sendsOnEnter(
  event: Pick<KeyboardEvent, "key" | "shiftKey" | "altKey" | "ctrlKey" | "metaKey"> & {
    nativeEvent: { isComposing?: boolean; keyCode?: number };
  },
  enterSends: boolean,
): boolean {
  if (!enterSends || event.key !== "Enter") return false;
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
  return event.nativeEvent.isComposing !== true && event.nativeEvent.keyCode !== 229;
}
