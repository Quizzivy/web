import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  CloudOff,
  Megaphone,
  MessageSquare,
  RotateCw,
  SearchX,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IconTile } from "@/components/shared/IconTile";
import { cn } from "@/lib/utils";

/**
 * ListRow is one row of a Messages list, as the caller words it: a class
 * channel (a square megaphone) or a person (round DG-22 initials, or their
 * photo), the title, a sub-line, the time of the last message, and the
 * unread count, which weights the title and lights the sub-line.
 */
export type ListRow = Readonly<{
  key: string;
  to: string;
  kind: "class" | "direct";
  title: string;
  sub: string;
  avatarUrl: string | null;
  time: string | null;
  unread: number;
  active: boolean;
}>;

/** ListState is what the list pane shows: its rows, or the first read loading or failed. */
export type ListState = "loading" | "error" | "ready";

/** The staff list's six skeleton rows; a caller may name other kinds, row by row. */
const SKELETON_KINDS: readonly ListRow["kind"][] = [
  "direct",
  "class",
  "direct",
  "class",
  "direct",
  "class",
];
const SKELETON_WIDTHS = [
  ["w-1/2", "w-4/5"],
  ["w-2/3", "w-3/4"],
  ["w-2/5", "w-5/6"],
  ["w-3/5", "w-3/5"],
  ["w-1/2", "w-3/4"],
  ["w-3/5", "w-4/5"],
] as const;

function RowAvatar({
  row,
}: Readonly<{ row: Pick<ListRow, "kind" | "title" | "avatarUrl"> }>) {
  if (row.kind === "class")
    return <IconTile icon={Megaphone} size={36} tone="accent" />;
  return <Avatar name={row.title} src={row.avatarUrl} size="36" />;
}

function Row({ row }: Readonly<{ row: ListRow }>) {
  const { t } = useTranslation();
  const unread = row.unread > 0;
  return (
    <li>
      <Link
        to={row.to}
        aria-current={row.active ? "page" : undefined}
        className={cn(
          "hover:bg-muted flex w-full gap-3 border-b p-3 text-left -outline-offset-2!",
          row.active && "bg-muted",
        )}
      >
        <RowAvatar row={row} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                "text-ui min-w-0 flex-1 truncate",
                unread ? "font-semibold" : "font-medium",
              )}
            >
              {row.title}
            </span>
            {row.time !== null && (
              <span className="text-muted-fg text-caption whitespace-nowrap">
                {row.time}
              </span>
            )}
          </span>
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "text-meta min-w-0 flex-1 truncate",
                unread ? "text-fg" : "text-muted-fg",
              )}
            >
              {row.sub}
            </span>
            {unread && (
              <Badge variant="count-brand">
                <span aria-hidden="true">{row.unread > 99 ? "99+" : row.unread}</span>
                <span className="sr-only">
                  {t("messages.list.unread", { count: row.unread })}
                </span>
              </Badge>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

function Message({
  icon,
  text,
  action,
}: Readonly<{ icon: LucideIcon; text: string; action?: ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-6 text-center">
      <IconTile icon={icon} size={40} />
      <p className="text-muted-fg text-ui max-w-[30ch] text-pretty">{text}</p>
      {action}
    </div>
  );
}

/**
 * ThreadList is the list pane of Messages: `tools` on top (the staff search
 * and tabs), then the rows, then, while a search is typed, `candidates` under
 * their own label ("Students not messaged yet"), whose rows open a thread
 * that exists from its first message. Its other states are the proposal's:
 * skeleton rows of its own shape (six, or the kinds `skeleton` names: the
 * student's three), one sentence with Retry, the empty
 * sentence, and the no-match sentence. It fills the pane below 760px of
 * content (`single`), and is 320px (`width`) beside the thread above it.
 */
export function ThreadList({
  label,
  tools,
  rows,
  candidates = [],
  candidatesLabel,
  state,
  onRetry,
  emptyText,
  noMatchText,
  single,
  width = "w-80",
  skeleton = SKELETON_KINDS,
}: Readonly<{
  label: string;
  tools?: ReactNode;
  rows: readonly ListRow[];
  candidates?: readonly ListRow[];
  candidatesLabel?: string | undefined;
  state: ListState;
  onRetry: () => void;
  emptyText: string;
  noMatchText?: string | null | undefined;
  single: boolean;
  width?: string;
  skeleton?: readonly ListRow["kind"][];
}>) {
  const { t } = useTranslation();
  const candidatesId = useId();
  const nothing = rows.length === 0 && candidates.length === 0;
  return (
    <aside
      aria-label={label}
      className={cn(
        "flex min-h-0 flex-col",
        single ? "w-full" : `${width} flex-none border-r`,
      )}
    >
      {tools !== undefined && (
        <div className="flex flex-col gap-3 border-b p-3">{tools}</div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {state === "loading" && (
          <div role="status" aria-label={t("common.loading")}>
            {skeleton.slice(0, SKELETON_WIDTHS.length).map((kind, index) => {
              const [first, second] = SKELETON_WIDTHS[index]!;
              return (
                <div key={index} className="flex gap-3 border-b p-3">
                  <Skeleton
                    className={cn(
                      "size-9 flex-none",
                      kind === "class" ? "rounded-ctl" : "rounded-full",
                    )}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
                    <Skeleton className={cn("h-3", first)} />
                    <Skeleton className={cn("h-2.5", second)} />
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {state === "error" && (
          <Message
            icon={CloudOff}
            text={t("messages.list.error")}
            action={
              <Button variant="outline" onClick={onRetry} className="max-[767px]:h-11">
                <RotateCw />
                {t("common.retry")}
              </Button>
            }
          />
        )}
        {state === "ready" && nothing && (
          <Message
            icon={noMatchText ? SearchX : MessageSquare}
            text={noMatchText ?? emptyText}
          />
        )}
        {state === "ready" && !nothing && (
          <>
            <ul>
              {rows.map((row) => (
                <Row key={row.key} row={row} />
              ))}
            </ul>
            {candidates.length > 0 && (
              <>
                <h3
                  id={candidatesId}
                  className="text-muted-fg text-caption border-b px-3 pt-4 pb-2 font-semibold tracking-wide uppercase"
                >
                  {candidatesLabel}
                </h3>
                <ul aria-labelledby={candidatesId}>
                  {candidates.map((row) => (
                    <Row key={row.key} row={row} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
