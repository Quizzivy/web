import { useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { AttendanceStatus } from "@/features/attendance/api";
import { STATUSES } from "@/features/attendance/register";
import { cn } from "@/lib/utils";

const TONES: Record<AttendanceStatus, string> = {
  present: "bg-success-soft text-success-ink",
  late: "bg-warning-soft text-warning-ink",
  absent: "bg-danger-soft text-danger-ink",
};

const STEP: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * StatusRadio is a student's mark, the deck's `radiogroup` "Attendance": a
 * track of Present, Late and Absent, 68 by 30px each, the chosen one in its
 * tone with a ring of `border`. Choosing the chosen one again clears it, so
 * a student goes back to unmarked. The arrow keys move along the track and
 * choose, as a radio group does; one option takes Tab, the chosen one or the
 * first. While `disabled` the track is faded and takes no press.
 */
export function StatusRadio({
  value,
  onChange,
  describedBy,
  disabled = false,
}: Readonly<{
  value: AttendanceStatus | null;
  onChange: (next: AttendanceStatus | null) => void;
  describedBy?: string | undefined;
  disabled?: boolean | undefined;
}>) {
  const { t } = useTranslation();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const tabStop = value === null ? 0 : STATUSES.indexOf(value);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = STEP[event.key];
    if (step === undefined || disabled) return;
    event.preventDefault();
    const next = (index + step + STATUSES.length) % STATUSES.length;
    buttons.current[next]?.focus();
    onChange(STATUSES[next] ?? null);
  };

  return (
    <div
      role="radiogroup"
      aria-label={t("attendance.radioLabel")}
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
      className={cn(
        "bg-muted rounded-ctl flex flex-none gap-0.5 p-[0.1875rem]",
        disabled && "opacity-45",
      )}
    >
      {STATUSES.map((status, index) => {
        const on = value === status;
        return (
          <button
            key={status}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => onChange(on ? null : status)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "rounded-seg text-meta h-7.5 w-17 border-0 font-medium whitespace-nowrap transition-colors",
              on
                ? `${TONES[status]} ring-border ring-1`
                : "text-muted-fg bg-transparent",
              disabled ? "cursor-default" : "cursor-pointer",
            )}
          >
            {t(`attendance.status.${status}`)}
          </button>
        );
      })}
    </div>
  );
}
