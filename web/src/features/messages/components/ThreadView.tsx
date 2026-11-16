import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowUp, CloudOff, RotateCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IconTile } from "@/components/shared/IconTile";
import { cn } from "@/lib/utils";

/** NEAR_BOTTOM_PX is how close to the end a reader must be for a new message to scroll into view. */
const NEAR_BOTTOM_PX = 48;

/** ThreadState is what the thread pane shows: the stream, or its first read loading or failed. */
export type ThreadState = "loading" | "error" | "ready";

/**
 * ThreadView is the thread pane of Messages: the header (the back arrow when
 * one pane shows at a time, the avatar, the name, the sub-line, `details`),
 * the stream on `--sidebar`, and `footer`, the composer or the sentence that
 * stands in its place. The stream starts at its end, keeps the reader's place
 * when Load earlier adds older messages above, follows new messages while the
 * reader is at the end, and tells `onSeen` the newest message while the end
 * is in view and the tab is visible. Its other states are the proposal's:
 * three bubble skeletons, one sentence with Retry, and the empty sentence.
 */
export function ThreadView({
  threadKey,
  avatar,
  title,
  sub,
  onBack,
  details,
  state,
  onRetry,
  children,
  count,
  emptyIcon,
  emptyText,
  canLoadEarlier,
  earlier,
  onLoadEarlier,
  latestId,
  onSeen,
  footer,
}: Readonly<{
  threadKey: string;
  avatar: ReactNode;
  title: string;
  sub: string;
  onBack?: (() => void) | undefined;
  details?: ReactNode;
  state: ThreadState;
  onRetry: () => void;
  children: ReactNode;
  count: number;
  emptyIcon: LucideIcon;
  emptyText: string;
  canLoadEarlier: boolean;
  earlier: "idle" | "loading" | "failed";
  onLoadEarlier: () => void;
  latestId: string | null;
  onSeen: (messageId: string) => void;
  footer: ReactNode;
}>) {
  const { t } = useTranslation();
  const stream = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  const anchor = useRef<{ key: string; fromBottom: number } | null>(null);
  const placed = useRef<string | null>(null);
  const [endInView, setEndInView] = useState(false);
  const titleId = useId();

  const onScroll = () => {
    const node = stream.current;
    if (node === null) return;
    atEnd.current =
      node.scrollHeight - node.scrollTop - node.clientHeight <= NEAR_BOTTOM_PX;
  };

  // A new thread starts at its end; Load earlier keeps the reader's place; a
  // new message is followed while the reader is at the end.
  useLayoutEffect(() => {
    const node = stream.current;
    if (node === null || state !== "ready") return;
    const held = anchor.current;
    if (held !== null && held.key === threadKey) {
      node.scrollTop = node.scrollHeight - held.fromBottom;
      anchor.current = null;
      return;
    }
    if (placed.current !== threadKey || atEnd.current) {
      node.scrollTop = node.scrollHeight;
      placed.current = threadKey;
      atEnd.current = true;
    }
  }, [threadKey, state, count]);

  useEffect(() => {
    const node = end.current;
    if (node === null || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      setEndInView(entries.some((entry) => entry.isIntersecting));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [state, threadKey]);

  const tell = useEffectEvent(() => {
    if (latestId !== null && document.visibilityState === "visible") onSeen(latestId);
  });
  useEffect(() => {
    if (endInView && state === "ready") tell();
  }, [endInView, state, latestId, threadKey]);
  useEffect(() => {
    const visible = () => {
      if (endInView) tell();
    };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, [endInView]);

  const loadEarlier = () => {
    const node = stream.current;
    if (node !== null)
      anchor.current = {
        key: threadKey,
        fromBottom: node.scrollHeight - node.scrollTop,
      };
    onLoadEarlier();
  };

  return (
    <section aria-label={title} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex min-h-15 flex-none items-center gap-3 border-b px-4 py-2">
        {onBack !== undefined && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-ml-2 max-[767px]:size-11"
            aria-label={t("messages.back")}
            onClick={onBack}
          >
            <ArrowLeft className="size-4" />
          </Button>
        )}
        {avatar}
        <span className="min-w-0 flex-1">
          <span id={titleId} className="block truncate text-base font-semibold">
            {title}
          </span>
          <span className="text-muted-fg text-meta block truncate">{sub}</span>
        </span>
        {details}
      </header>
      <div
        ref={stream}
        onScroll={onScroll}
        role="log"
        aria-labelledby={titleId}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Scroll regions need keyboard access independently of their content.
        tabIndex={0}
        data-slot="message-stream"
        className="bg-sidebar flex min-h-0 flex-1 flex-col overflow-y-auto p-4 -outline-offset-2!"
      >
        {state === "loading" && (
          <div
            role="status"
            aria-label={t("common.loading")}
            className="mt-auto flex flex-col gap-3"
          >
            <Skeleton className="h-10 w-1/2 self-start rounded-2xl" />
            <Skeleton className="h-10 w-1/3 self-start rounded-2xl" />
            <Skeleton className="h-10 w-2/5 self-end rounded-2xl" />
          </div>
        )}
        {state === "error" && (
          <Centre icon={CloudOff} text={t("messages.thread.error")}>
            <Button variant="outline" onClick={onRetry} className="max-[767px]:h-11">
              <RotateCw />
              {t("common.retry")}
            </Button>
          </Centre>
        )}
        {state === "ready" && count === 0 && (
          <Centre icon={emptyIcon} text={emptyText} />
        )}
        {state === "ready" && count > 0 && (
          <div className="mt-auto flex flex-col gap-3">
            {canLoadEarlier && (
              <div className="flex flex-col items-center gap-2 self-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full max-[767px]:h-10"
                  aria-disabled={earlier === "loading" || undefined}
                  onClick={() => {
                    if (earlier !== "loading") loadEarlier();
                  }}
                >
                  <ArrowUp />
                  {t("messages.loadEarlier")}
                </Button>
                {earlier === "failed" && (
                  <p role="alert" className="text-danger-ink text-xs">
                    {t("messages.earlierFailed")}
                  </p>
                )}
              </div>
            )}
            {children}
          </div>
        )}
        <div
          ref={end}
          aria-hidden="true"
          className={cn("h-px flex-none", state !== "ready" && "hidden")}
        />
      </div>
      {state === "ready" && footer}
    </section>
  );
}

function Centre({
  icon,
  text,
  children,
}: Readonly<{ icon: LucideIcon; text: string; children?: ReactNode }>) {
  return (
    <div className="m-auto flex flex-col items-center gap-3 text-center">
      <IconTile icon={icon} size={40} className="bg-card border" />
      <p className="text-muted-fg text-ui max-w-[32ch] text-pretty">{text}</p>
      {children}
    </div>
  );
}
