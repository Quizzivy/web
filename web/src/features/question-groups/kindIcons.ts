import {
  AudioLines,
  BookOpenText,
  Headphones,
  TextCursorInput,
  type LucideIcon,
} from "lucide-react";
import type { GroupKind, GroupStart } from "./kinds";

/** KIND_ICONS are the icons a group's kind is drawn with, in the pane and in the outline. */
export const KIND_ICONS: Readonly<Record<GroupKind, LucideIcon>> = {
  reading: BookOpenText,
  cloze: TextCursorInput,
  listening: AudioLines,
};

/** START_ICONS are the icons of the four ways to start a passage, a cloze or a recording. */
export const START_ICONS: Readonly<Record<GroupStart, LucideIcon>> = {
  reading: BookOpenText,
  cloze: TextCursorInput,
  listening: AudioLines,
  listeningCloze: Headphones,
};
