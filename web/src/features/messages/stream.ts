import type { TFunction } from "i18next";
import type { Locale } from "@/lib/i18n";
import type { ContextEvent, MessageAttachment } from "./api";
import { dayLabel, daysAgo } from "./time";

/**
 * PendingMessage is a message the reader sent that the server has not
 * answered for yet, or refused. It keeps its `clientId`, so Retry sends the
 * same message again and the server, which has seen the id, never posts it
 * twice.
 */
export type PendingMessage = Readonly<{
  clientId: string;
  body: string | null;
  attachment: MessageAttachment | null;
  createdAt: string;
  status: "sending" | "failed";
}>;

/** Dated is what the stream needs of a message: its id, in uuidv7 order, and when it was sent. */
export type Dated = Readonly<{ id: string; createdAt: string }>;

/** StreamEntry is one line of a thread's stream, in the order drawn. */
export type StreamEntry<M extends Dated> =
  | Readonly<{ kind: "day"; key: string; label: string }>
  | Readonly<{ kind: "message"; key: string; message: M }>
  | Readonly<{ kind: "event"; key: string; event: ContextEvent }>
  | Readonly<{ kind: "pending"; key: string; pending: PendingMessage }>;

type Timed<M extends Dated> = Readonly<{ at: string; entry: StreamEntry<M> }>;

/**
 * buildStream lays a thread out as the deck draws it: messages oldest first,
 * the staff side's attempt-event cards at their moment among them, the
 * reader's unsent messages last, and a day pill before the first line of each
 * day. An event older than the oldest message shown waits until the earlier
 * messages are loaded, so a card never sits above a gap.
 */
export function buildStream<M extends Dated>(
  messages: readonly M[],
  events: readonly ContextEvent[],
  pending: readonly PendingMessage[],
  options: Readonly<{ now: Date; locale: Locale; t: TFunction; complete: boolean }>,
): StreamEntry<M>[] {
  const oldest = messages[0]?.createdAt;
  const timed: Timed<M>[] = [
    ...messages.map((message) => ({
      at: message.createdAt,
      entry: { kind: "message", key: message.id, message } as const,
    })),
    ...events
      .filter(
        (event) => options.complete || (oldest !== undefined && event.at >= oldest),
      )
      .map((event) => ({
        at: event.at,
        entry: { kind: "event", key: `event:${event.attemptId}`, event } as const,
      })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const item of pending)
    timed.push({
      at: item.createdAt,
      entry: { kind: "pending", key: `pending:${item.clientId}`, pending: item },
    });

  const out: StreamEntry<M>[] = [];
  let day: number | null = null;
  for (const { at, entry } of timed) {
    const ago = daysAgo(at, options.now);
    if (ago !== day) {
      day = ago;
      out.push({
        kind: "day",
        key: `day:${at}`,
        label: dayLabel(at, options.now, options.locale, options.t),
      });
    }
    out.push(entry);
  }
  return out;
}

/** merged puts `incoming` into `held` once each, by id, in uuidv7 order. */
export function merged<M extends Dated>(
  held: readonly M[],
  incoming: readonly M[],
): M[] {
  const byId = new Map(held.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id, "en"));
}

/** newestId is the later of two message ids in uuidv7 order. */
export function newestId(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}
