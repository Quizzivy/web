import { useEffect, useEffectEvent, useReducer, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, Timer } from "lucide-react";
import { closeMoment } from "@/features/assignments/studentRules";
import type { Locale } from "@/lib/i18n";
import { clockTime, countdown, sameAppDay } from "@/lib/i18n/datetime";
import { cn } from "@/lib/utils";
import { usePaper } from "../paper";
import { serverNow, timeLeft } from "../timeLeft";

const LOW_MS = 5 * 60_000;
const LAST_MS = 60_000;
const HOUR_MS = 60 * 60_000;
const PILL =
  "text-md mx-auto inline-flex h-9 flex-none items-center gap-[7px] rounded-full px-3.5 font-semibold whitespace-nowrap";

function minutesToSay(
  before: number,
  left: number,
  said: number | null,
): number | null {
  if (left > LOW_MS) return null;
  if (before > LAST_MS && left <= LAST_MS && left > 0) return 1;
  if (before > LOW_MS && left > LAST_MS) return Math.ceil(left / 60_000);
  return Math.ceil(left / 60_000) === said ? said : null;
}

function cells(text: string) {
  return Array.from(text, (char, at) => ({
    char,
    id: `c${at}`,
    digit: char >= "0" && char <= "9",
  }));
}

/**
 * Clock is the engine's timer pill, read from the server's time rather than
 * the device's. Under five minutes it takes the danger tones. It is a
 * `timer`, which a screen reader does not read as it ticks; a polite live
 * region beside it says the time left once when it passes five minutes and
 * once when it passes one, and again if a later deadline lets it pass them
 * again. The region holds that line only for the minute it is true of and is
 * empty otherwise, so it never reads a time that has gone. A paper opened
 * with less than that left is not told a time it never crossed. Once the
 * server has said the time is up it stands at 00:00 in the danger tones and
 * says nothing. Each digit sits in a cell one zero wide, because the typeface
 * has no tabular figures and the pill would otherwise change width, and move,
 * every second. Under a flexible assignment (F1) there is no time limit: until
 * the last hour the pill shows when the test closes instead, with the
 * calendar icon and no seconds, and from 768px the word "Closes"; from the
 * last hour it is the countdown, as under strict.
 */
export function Clock({ wide = true }: Readonly<{ wide?: boolean }>) {
  const { t } = useTranslation();
  const paper = usePaper();
  const { deadlineAt, offsetMs } = paper;
  const over = paper.lock === "deadline";
  const [said, setSaid] = useState<number | null>(null);
  const [, repaint] = useReducer((n: number) => n + 1, 0);
  const readTimeLeft = useEffectEvent(() => paper.timeLeft());
  useEffect(() => {
    let before = readTimeLeft();
    const tick = setInterval(() => {
      const was = before;
      const left = readTimeLeft();
      before = left;
      setSaid((current) => minutesToSay(was, left, current));
      repaint();
    }, 1000);
    return () => clearInterval(tick);
  }, []);
  const left = timeLeft({ deadlineAt, offsetMs, lock: over ? "deadline" : null });
  const announcement = (
    <span role="status" className="sr-only">
      {said === null ? "" : t("takeTest.minutesLeft", { count: said })}
    </span>
  );
  if (paper.mode === "flexible" && left > HOUR_MS)
    return (
      <>
        <ClosesPill deadlineAt={deadlineAt} offsetMs={offsetMs} wide={wide} />
        {announcement}
      </>
    );
  return (
    <>
      <span
        role="timer"
        aria-label={t("takeTest.timeLeft")}
        className={cn(
          PILL,
          "tabular-nums",
          left < LOW_MS ? "bg-danger-soft text-danger-ink" : "bg-muted text-fg",
        )}
      >
        <Timer aria-hidden="true" className="size-4" />
        <span>
          {cells(countdown(left)).map((cell) =>
            cell.digit ? (
              <span key={cell.id} className="inline-block w-[1ch] text-center">
                {cell.char}
              </span>
            ) : (
              cell.char
            ),
          )}
        </span>
      </span>
      {announcement}
    </>
  );
}

/**
 * ClosesPill is the flexible paper's header pill while the close is more than
 * an hour away: "Đóng 22:00, 26/09", or "Đóng 22:00 hôm nay" on the day, read
 * on the server's clock. Below 768px the word goes and the icon says it. It
 * is an image named "Bài đóng lúc 22:00, Thứ 6, 26/09" (the time alone on the
 * day), not a timer: nothing in it ticks.
 */
function ClosesPill({
  deadlineAt,
  offsetMs,
  wide,
}: Readonly<{ deadlineAt: number; offsetMs: number; wide: boolean }>) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const now = serverNow(offsetMs);
  const closes = new Date(deadlineAt);
  const when = clockTime(closes, now, locale);
  let shown = when;
  if (wide)
    shown = sameAppDay(closes, now)
      ? t("takeTest.closesToday", { time: when })
      : t("takeTest.closes", { when });
  // The name reads the long form the rules and the leave dialog use; only the
  // pill's own text is short.
  const label = t("takeTest.closesName", {
    when: closeMoment(closes, now, t, locale),
  });
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(PILL, "bg-muted text-fg")}
    >
      <CalendarClock aria-hidden="true" className="size-4" />
      <span aria-hidden="true">{shown}</span>
    </span>
  );
}
