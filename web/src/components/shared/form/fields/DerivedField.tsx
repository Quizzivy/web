import { Link } from "react-router";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormDerivedAction } from "./types";

/**
 * DerivedField shows a value worked out elsewhere, which cannot be typed
 * here: a read-only field, muted, with `icon` before the value and, beside
 * it, the link to where it is changed (Edit class's Schedule once the class
 * has repeating sessions, with "Đổi trong Lịch"). It stays focusable, so the
 * value is read with its label and its hint.
 */
export function DerivedField({
  id,
  label,
  value,
  icon: Icon,
  action,
  describedBy,
}: Readonly<{
  id: string;
  label: string;
  value: string;
  icon: LucideIcon;
  action?: FormDerivedAction | undefined;
  describedBy?: string | undefined;
}>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="relative flex min-w-0 flex-[1_1_200px]">
        <Icon
          aria-hidden="true"
          className="text-muted-fg pointer-events-none absolute top-1/2 left-3 size-3.75 -translate-y-1/2"
        />
        <Input
          id={id}
          aria-label={label}
          value={value}
          readOnly
          aria-describedby={describedBy}
          className="bg-muted dark:bg-muted truncate border-transparent pl-8.5"
        />
      </span>
      {action ? (
        <Button asChild variant="outline" size="md" className="flex-none">
          <Link to={action.to}>
            <action.icon aria-hidden="true" />
            {action.label}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
