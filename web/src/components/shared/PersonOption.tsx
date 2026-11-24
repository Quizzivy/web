import type { ComponentProps, ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * PersonOption is one person in a picker's listbox, as the share dialog's
 * PeoplePicker first drew it and New message (DG-233) reuses it: DG-22's
 * initials or the photo, the name, a sub-line under it, and an optional
 * caption at the end. It is a button with the `option` role inside an item
 * that presents nothing, so the list keeps its roles; the picker that owns
 * it moves `active` and says which option is active through
 * `aria-activedescendant`. A pointer press never takes focus from the
 * picker's field. A disabled option is drawn faded and is not picked.
 */
export function PersonOption({
  id,
  name,
  avatarUrl,
  sub,
  end,
  active,
  disabled = false,
  avatarSize = "28",
  onPick,
  className,
  ...props
}: Readonly<
  Omit<ComponentProps<"button">, "id" | "onClick" | "children"> & {
    id: string;
    name: string;
    avatarUrl: string | null;
    sub: string;
    end?: ReactNode;
    active: boolean;
    disabled?: boolean;
    avatarSize?: "28" | "default";
    onPick: () => void;
  }
>) {
  return (
    <li role="presentation">
      <button
        type="button"
        id={id}
        role="option"
        tabIndex={-1}
        aria-selected={active}
        aria-disabled={disabled || undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left",
          disabled
            ? "text-fg/50 [&_[data-slot=avatar]]:text-fg/50 cursor-default"
            : "hover:bg-hover cursor-pointer",
          active && "bg-hover",
          className,
        )}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (!disabled) onPick();
        }}
        {...props}
      >
        <Avatar name={name} src={avatarUrl} size={avatarSize} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="text-muted-fg block truncate text-xs">{sub}</span>
        </span>
        {end}
      </button>
    </li>
  );
}
