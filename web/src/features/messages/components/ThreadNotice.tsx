import type { LucideIcon } from "lucide-react";

/**
 * ThreadNotice stands in the composer's place when nothing can be sent from
 * a thread: the other account is disabled, the class is archived, or the
 * reader may not announce (T-R7.20, T-R7.21).
 */
export function ThreadNotice({
  icon: Icon,
  text,
}: Readonly<{ icon: LucideIcon; text: string }>) {
  return (
    <div
      role="status"
      className="text-muted-fg flex flex-none items-center gap-3 border-t px-4 py-4 text-sm"
    >
      <Icon aria-hidden="true" className="size-4 flex-none" />
      <span className="min-w-0 flex-1 text-pretty">{text}</span>
    </div>
  );
}
