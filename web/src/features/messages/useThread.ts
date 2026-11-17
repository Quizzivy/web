import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useIdlePolling, useRefetchOnResume } from "@/hooks/useIdlePolling";
import type { ContextEvent, Cursor, ThreadPage } from "./api";
import type { Outgoing } from "./compose";
import { merged, newestId, type Dated, type PendingMessage } from "./stream";

/** POLL_MS is how often an open thread asks for what is new (DG-91: polling, not push). */
export const POLL_MS = 10_000;
/** READ_DEBOUNCE_MS is how long the newest message must stay in view before the pointer moves. */
export const READ_DEBOUNCE_MS = 1_000;

/** ThreadRead is one answer of a thread's read: its header, its page and, on the staff side, its attempt events. */
export type ThreadRead<M, H> = Readonly<{
  head: H;
  page: ThreadPage<M>;
  events?: readonly ContextEvent[] | undefined;
}>;

/** ThreadPost is what a send asks the server for. */
export type ThreadPost = Readonly<{
  clientId: string;
  body: string | null;
  attachmentId: string | null;
}>;

/**
 * ThreadSource is how one side reaches one thread: the staff side and the
 * student side each give theirs, so the hook and the components serve both
 * (T-R7.21).
 */
export type ThreadSource<M extends Dated, H> = Readonly<{
  key: QueryKey;
  read: (cursor: Cursor, signal?: AbortSignal) => Promise<ThreadRead<M, H>>;
  post: (message: ThreadPost) => Promise<M>;
  markRead: (messageId: string) => Promise<unknown>;
}>;

/**
 * ThreadData is what the cache holds of an open thread. `latestId` is the
 * newest message held, the reader's own sends included, which is what the
 * read pointer moves to. `after` is where the next poll starts: the newest
 * message a read returned. A send never moves it, so a message the other
 * side wrote just before the reader's own post still comes with the next
 * poll.
 */
export type ThreadData<M, H> = Readonly<{
  head: H;
  messages: readonly M[];
  events: readonly ContextEvent[];
  nextBefore: string | null;
  latestId: string | null;
  after: string | null;
}>;

function withEvents(
  held: readonly ContextEvent[],
  incoming: readonly ContextEvent[] | undefined,
): readonly ContextEvent[] {
  if (incoming === undefined || incoming.length === 0) return held;
  const byId = new Map(held.map((event) => [event.attemptId, event]));
  for (const event of incoming) byId.set(event.attemptId, event);
  return [...byId.values()];
}

/**
 * folded puts a read into what is held: its messages once each, the header
 * it brought, `latestId`, the newest message held, and `after`, the newest
 * message this read or an earlier one returned, from which the next poll
 * asks. A newest page sets `nextBefore`; a poll keeps it.
 */
export function folded<M extends Dated, H>(
  held: ThreadData<M, H> | undefined,
  read: ThreadRead<M, H>,
  newest: boolean,
): ThreadData<M, H> {
  const messages = merged(held?.messages ?? [], read.page.messages);
  return {
    head: read.head,
    messages,
    events: withEvents(held?.events ?? [], read.events),
    nextBefore: newest || held === undefined ? read.page.nextBefore : held.nextBefore,
    latestId: messages.at(-1)?.id ?? null,
    after: newestId(
      newest ? null : (held?.after ?? null),
      read.page.messages.at(-1)?.id ?? null,
    ),
  };
}

type Outbox = readonly PendingMessage[];

/**
 * useThread reads one thread and keeps it current while somebody is there:
 * the newest page first, then every POLL_MS a read `after` the newest
 * message a read returned, through useIdlePolling, so the poll stops after ten idle
 * minutes and a hidden tab, and starts again when the reader comes back.
 *
 * `send` is optimistic: the message stands in the stream at once, "Sending…",
 * under a `clientId` made here; a refusal leaves it with Retry, which sends
 * the same `clientId`, so the server never posts it twice. `loadEarlier`
 * adds the page before the oldest held. `seen` is called with the newest
 * message on the reader's screen and moves the read pointer once it has
 * stayed there READ_DEBOUNCE_MS, never backwards. A write into the cache
 * first cancels a poll in flight, which would otherwise put back what it read
 * before the write; a poll it cancels is asked again at once, from the
 * same `after`.
 */
export function useThread<M extends Dated, H>(
  source: ThreadSource<M, H>,
  options: Readonly<{
    enabled?: boolean;
    onSent?: (message: M) => void;
    onRefused?: (cause: unknown) => void;
    onRead?: (messageId: string) => void;
  }> = {},
) {
  const enabled = options.enabled ?? true;
  const client = useQueryClient();
  const { key } = source;
  const hash = JSON.stringify(key);
  const outboxKey = [...key, "outbox"];

  const interval = useIdlePolling(POLL_MS, enabled);
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }): Promise<ThreadData<M, H>> => {
      const held = client.getQueryData<ThreadData<M, H>>(key);
      const after = held?.after ?? null;
      const read = await source.read(after === null ? {} : { after }, signal);
      return folded(client.getQueryData<ThreadData<M, H>>(key), read, after === null);
    },
    enabled,
    staleTime: POLL_MS,
    refetchInterval: interval,
    refetchIntervalInBackground: false,
    retry: false,
  });
  useRefetchOnResume(query.refetch, enabled);

  const outbox =
    useQuery({
      queryKey: outboxKey,
      queryFn: () => [] as Outbox,
      initialData: [] as Outbox,
      enabled: false,
      staleTime: Infinity,
      gcTime: Infinity,
    }).data ?? [];

  const setOutbox = (change: (held: Outbox) => Outbox) =>
    client.setQueryData<Outbox>(outboxKey, (held) => change(held ?? []));

  const deliver = async (item: PendingMessage) => {
    setOutbox((held) =>
      held.map((x) => (x.clientId === item.clientId ? { ...x, status: "sending" } : x)),
    );
    try {
      const message = await source.post({
        clientId: item.clientId,
        body: item.body,
        attachmentId: item.attachment?.id ?? null,
      });
      const polling = client.isFetching({ queryKey: key, exact: true }) > 0;
      await client.cancelQueries({ queryKey: key, exact: true });
      client.setQueryData<ThreadData<M, H>>(key, (held) => {
        if (held === undefined) return held;
        const messages = merged(held.messages, [message]);
        return { ...held, messages, latestId: messages.at(-1)?.id ?? null };
      });
      if (polling) void client.refetchQueries({ queryKey: key, exact: true });
      setOutbox((held) => held.filter((x) => x.clientId !== item.clientId));
      options.onSent?.(message);
    } catch (cause) {
      setOutbox((held) =>
        held.map((x) =>
          x.clientId === item.clientId ? { ...x, status: "failed" } : x,
        ),
      );
      options.onRefused?.(cause);
    }
  };

  const send = (outgoing: Outgoing) => {
    const item: PendingMessage = {
      clientId: crypto.randomUUID(),
      body: outgoing.body,
      attachment: outgoing.attachment,
      createdAt: new Date().toISOString(),
      status: "sending",
    };
    setOutbox((held) => [...held, item]);
    void deliver(item);
  };

  const retry = (clientId: string) => {
    const item = outbox.find((x) => x.clientId === clientId);
    if (item !== undefined && item.status === "failed") void deliver(item);
  };

  const [earlier, setEarlier] = useState<{
    hash: string;
    state: "idle" | "loading" | "failed";
  }>({
    hash,
    state: "idle",
  });
  const earlierState = earlier.hash === hash ? earlier.state : "idle";
  const loadEarlier = async () => {
    const held = client.getQueryData<ThreadData<M, H>>(key);
    if (held?.nextBefore == null || earlierState === "loading") return;
    const at = hash;
    setEarlier({ hash: at, state: "loading" });
    try {
      const read = await source.read({ before: held.nextBefore });
      await client.cancelQueries({ queryKey: key, exact: true });
      client.setQueryData<ThreadData<M, H>>(key, (now) =>
        now === undefined
          ? now
          : {
              ...now,
              head: read.head,
              messages: merged(now.messages, read.page.messages),
              events: withEvents(now.events, read.events),
              nextBefore: read.page.nextBefore,
            },
      );
      setEarlier({ hash: at, state: "idle" });
    } catch {
      setEarlier({ hash: at, state: "failed" });
    }
  };

  const readTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const readSent = useRef<{ hash: string; id: string } | null>(null);
  const markRead = (id: string) => {
    const before = readSent.current;
    if (before !== null && before.hash === hash && before.id >= id) return;
    readSent.current = { hash, id };
    source.markRead(id).then(
      () => options.onRead?.(id),
      () => {
        if (readSent.current?.id === id) readSent.current = before;
      },
    );
  };
  const seen = (id: string) => {
    clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => markRead(id), READ_DEBOUNCE_MS);
  };
  useEffect(() => () => clearTimeout(readTimer.current), [hash]);

  return {
    data: query.data,
    isPending: query.isPending,
    isError: query.isError && query.data === undefined,
    error: query.error,
    refetch: query.refetch,
    pending: outbox,
    send,
    retry,
    loadEarlier: () => void loadEarlier(),
    earlier: earlierState,
    seen,
  } as const;
}
