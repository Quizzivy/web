import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ShareAccess } from "../api";

const LEVELS = ["use", "edit"] as const satisfies readonly ShareAccess[];

const LABEL = { use: "sharing.canUse", edit: "sharing.canEdit" } as const;

/**
 * AccessSelect is the share dialog's Can use / Can edit select: the deck's
 * 32px trigger with its up-down chevrons, 44px on a phone. `label` names it
 * for a screen reader, since the dialog draws no label beside it.
 */
export function AccessSelect({
  value,
  onChange,
  label,
  disabled = false,
  className,
}: Readonly<{
  value: ShareAccess;
  onChange: (access: ShareAccess) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}>) {
  const { t } = useTranslation();
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const level = LEVELS.find((item) => item === next);
        if (level !== undefined && level !== value) onChange(level);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        aria-label={label}
        className={cn(
          "bg-card dark:bg-card dark:hover:bg-card rounded-seg text-meta flex-none gap-2 px-3 max-[767px]:h-11",
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {LEVELS.map((level) => (
          <SelectItem key={level} value={level}>
            {t(LABEL[level])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
