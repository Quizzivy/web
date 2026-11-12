import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { START_ICONS } from "../kindIcons";
import { GROUP_STARTS, type GroupStart } from "../kinds";

/**
 * StartChoice is one choice of the start menu: its icon on a tile, its name
 * and a line on what it gives.
 */
export function StartChoice({
  icon: Icon,
  label,
  description,
}: Readonly<{ icon: LucideIcon; label: string; description: string }>) {
  return (
    <>
      <span className="bg-muted grid size-8.5 flex-none place-items-center rounded-[9px]">
        <Icon aria-hidden="true" className="text-fg size-4.25" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold">{label}</span>
        <span className="text-muted-fg block text-[12.5px] font-normal text-pretty">
          {description}
        </span>
      </span>
    </>
  );
}

/**
 * StartMenuItems are a dropdown menu's four ways to start a passage, a cloze
 * or a recording, the builder's and the bank's alike; `onPick` receives the
 * one chosen.
 */
export function StartMenuItems({
  onPick,
}: Readonly<{ onPick: (start: GroupStart) => void }>) {
  const { t } = useTranslation();
  return GROUP_STARTS.map((start) => (
    <DropdownMenuItem
      key={start}
      className="h-auto items-start gap-2.75 rounded-[8px] px-2.5 py-2.25"
      onSelect={() => onPick(start)}
    >
      <StartChoice
        icon={START_ICONS[start]}
        label={t(`groups.start.${start}.label`)}
        description={t(`groups.start.${start}.description`)}
      />
    </DropdownMenuItem>
  ));
}
