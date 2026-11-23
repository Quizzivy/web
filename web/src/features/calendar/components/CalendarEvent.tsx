import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import {
  assignmentHref,
  itemTime,
  itemTitle,
  toneOf,
  type OpenSession,
} from "../items";
import type { Box, CalendarItem, Lane } from "../week";

/** The place of a block in its day: its box, in a lane of the column's width. */
function placement(box: Box, lane: Lane): CSSProperties {
  const share = `(100% - 8px) / ${lane.count}`;
  return {
    top: box.top,
    height: box.height,
    left: `calc(4px + ${share} * ${lane.index})`,
    width: lane.count === 1 ? "calc(100% - 8px)" : `calc(${share} - 2px)`,
  };
}

/**
 * CalendarEvent is one block of the week grid, as the deck draws it: a 6px
 * rounded tint, the title at 12/600 and the time at 11.5 under it, both cut
 * with an ellipsis. A session is a button that opens its popover; an
 * assignment's opening or closing is a link to the assignment.
 */
export function CalendarEvent({
  item,
  box,
  lane,
  onOpenSession,
}: Readonly<{
  item: CalendarItem;
  box: Box;
  lane: Lane;
  onOpenSession?: OpenSession | undefined;
}>) {
  const { t } = useTranslation();
  const cancelled = item.kind === "session" && item.session.cancelled;
  const className = cn(
    "absolute z-1 flex flex-col justify-center overflow-hidden rounded-sm px-1.75 py-0.75 text-left",
    toneOf(item).block,
  );
  const body = (
    <>
      <span
        className={cn(
          "block truncate text-xs leading-[1.3] font-semibold",
          cancelled && "line-through",
        )}
      >
        {itemTitle(item, t)}
      </span>{" "}
      <span className="text-caption block truncate leading-[1.3] opacity-85">
        {itemTime(item, t)}
      </span>
    </>
  );
  const style = placement(box, lane);
  const href = assignmentHref(item);
  if (href !== null)
    return (
      <Link to={href} data-kind={item.kind} className={className} style={style}>
        {body}
      </Link>
    );
  return (
    <button
      type="button"
      data-kind="session"
      className={cn(className, "cursor-pointer border-0")}
      style={style}
      onClick={(event) => {
        if (item.kind === "session") onOpenSession?.(item.session, event.currentTarget);
      }}
    >
      {body}
    </button>
  );
}
