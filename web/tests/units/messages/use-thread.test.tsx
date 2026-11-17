import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Cursor } from "@/features/messages/api";
import {
  POLL_MS,
  READ_DEBOUNCE_MS,
  useThread,
  type ThreadPost,
} from "@/features/messages/useThread";
import { IDLE_AFTER_MS } from "@/hooks/useIdlePolling";
import { ApiError } from "@/lib/api/errors";
import { message, type Message } from "./support";

function advance(ms: number) {
  return act(() => vi.advanceTimersByTimeAsync(ms));
}

/** Server is a thread's other end: what it holds and what it was asked. */
function server() {
  const held: Message[] = [
    message(10, false, "Em chào thầy cô."),
    message(11, true, "Chào em."),
  ];
  const reads: Cursor[] = [];
  const posts: ThreadPost[] = [];
  const marks: string[] = [];
  let failNext = 0;
  let gate: Promise<void> | null = null;
  const source = {
    key: ["test-thread"],
    read: vi.fn(async (cursor: Cursor) => {
      reads.push(cursor);
      const after = cursor.after;
      const messages = held.filter((m) => after === undefined || m.id > after);
      return {
        head: "head",
        page: { messages, nextBefore: null, latestId: held.at(-1)?.id ?? null },
      };
    }),
    post: vi.fn(async (body: ThreadPost) => {
      posts.push(body);
      if (gate !== null) await gate;
      if (failNext > 0) {
        failNext -= 1;
        throw new ApiError({ status: 503, code: "UNKNOWN", message: "down" });
      }
      const made = message(50 + posts.length, true, body.body);
      held.push(made);
      return made;
    }),
    markRead: vi.fn(async (id: string) => {
      marks.push(id);
    }),
  };
  return {
    source,
    held,
    reads,
    posts,
    marks,
    fail(times: number) {
      failNext = times;
    },
    hold() {
      let open = () => {};
      gate = new Promise<void>((resolve) => {
        open = resolve;
      });
      return () => {
        gate = null;
        open();
      };
    },
  };
}

function mount(source: ReturnType<typeof server>["source"]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useThread(source), { wrapper }) };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("an open thread (T-R7.20)", () => {
  it("polls after the newest message every 10 s, and stops after ten idle minutes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const end = server();
    const { result } = mount(end.source);
    await waitFor(() => expect(result.current.data?.messages).toHaveLength(2));
    expect(end.reads).toEqual([{}]);

    end.held.push(message(12, false, "Dạ em cảm ơn."));
    await advance(POLL_MS + 100);
    await waitFor(() => expect(result.current.data?.messages).toHaveLength(3));
    expect(end.reads[1]).toEqual({ after: end.held[1]!.id });

    await advance(IDLE_AFTER_MS);
    const whenIdle = end.reads.length;
    await advance(5 * POLL_MS);
    expect(end.reads).toHaveLength(whenIdle);

    fireEvent.pointerDown(window);
    await waitFor(() => expect(end.reads).toHaveLength(whenIdle + 1));
    expect(end.reads.at(-1)).toEqual({ after: end.held[2]!.id });
  });

  it("shows a send at once, keeps a failed one with its words, and Retry sends the same clientId", async () => {
    const end = server();
    end.fail(1);
    const { result } = mount(end.source);
    await waitFor(() => expect(result.current.data).toBeDefined());

    const release = end.hold();
    act(() =>
      result.current.send({ body: "Lần sau em bật 4G nhé.", attachment: null }),
    );
    await waitFor(() =>
      expect(result.current.pending).toMatchObject([
        { body: "Lần sau em bật 4G nhé.", status: "sending" },
      ]),
    );
    release();
    await waitFor(() =>
      expect(result.current.pending).toMatchObject([{ status: "failed" }]),
    );
    const clientId = result.current.pending[0]!.clientId;
    expect(clientId).toMatch(/^[0-9a-f-]{36}$/);

    act(() => result.current.retry(clientId));
    await waitFor(() => expect(result.current.pending).toEqual([]));
    expect(end.posts.map((p) => p.clientId)).toEqual([clientId, clientId]);
    expect(result.current.data?.messages.at(-1)?.body).toBe("Lần sau em bật 4G nhé.");
    expect(result.current.data?.latestId).toBe(
      result.current.data?.messages.at(-1)?.id,
    );
  });

  it("still brings a message the student wrote just before the reader's own send", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const end = server();
    const { result } = mount(end.source);
    await waitFor(() => expect(result.current.data?.messages).toHaveLength(2));
    const lastSeen = end.held[1]!.id;

    // The student writes 12 after the last poll; the reader posts 51 before the next.
    end.held.push(message(12, false, "Em gửi bài rồi ạ."));
    act(() => result.current.send({ body: "Thầy nhận rồi.", attachment: null }));
    await waitFor(() => expect(result.current.pending).toEqual([]));
    expect(result.current.data?.messages.map((m) => m.body)).toEqual([
      "Em chào thầy cô.",
      "Chào em.",
      "Thầy nhận rồi.",
    ]);

    await advance(POLL_MS + 100);
    await waitFor(() =>
      expect(result.current.data?.messages.map((m) => m.body)).toEqual([
        "Em chào thầy cô.",
        "Chào em.",
        "Em gửi bài rồi ạ.",
        "Thầy nhận rồi.",
      ]),
    );
    expect(end.reads.at(-1)).toEqual({ after: lastSeen });
    expect(result.current.data?.latestId).toBe(end.held.at(-1)!.id);
  });

  it("moves the read pointer once the newest message has stayed in view for a second, never back", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const end = server();
    const { result } = mount(end.source);
    await waitFor(() => expect(result.current.data).toBeDefined());
    const [older, newer] = end.held.map((m) => m.id);

    act(() => result.current.seen(older!));
    await advance(READ_DEBOUNCE_MS - 400);
    act(() => result.current.seen(newer!));
    await advance(READ_DEBOUNCE_MS - 1);
    expect(end.marks).toEqual([]);
    await advance(1);
    await waitFor(() => expect(end.marks).toEqual([newer]));

    act(() => result.current.seen(older!));
    act(() => result.current.seen(newer!));
    await advance(READ_DEBOUNCE_MS * 2);
    expect(end.marks).toEqual([newer]);
  });
});
