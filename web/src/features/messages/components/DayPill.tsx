/**
 * DayPill heads the first line of a day in a thread's stream: "Today",
 * "Yesterday", a weekday, or a date (`dayLabel`).
 */
export function DayPill({ label }: Readonly<{ label: string }>) {
  return (
    <p
      data-slot="day-pill"
      className="bg-card text-muted-fg text-caption self-center rounded-full border px-3"
    >
      {label}
    </p>
  );
}
