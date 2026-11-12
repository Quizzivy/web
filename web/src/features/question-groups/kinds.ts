import type { TFunction } from "i18next";
import type { GroupBundle } from "./api";
import { boundQuestionIds } from "./gapQuestions";
import { emptyGroup, emptyMaterial } from "./model";

/** GroupKind is what a group is called on screen, worked out from what it holds. */
export type GroupKind = "reading" | "cloze" | "listening";

/**
 * GroupStart is one of the four ways a group is started from the menu. It is
 * never stored: it only says what an empty group opens as until it holds
 * something.
 */
export type GroupStart = "reading" | "cloze" | "listening" | "listeningCloze";

/** GROUP_STARTS lists the starts in the menu's order. */
export const GROUP_STARTS: readonly GroupStart[] = [
  "reading",
  "cloze",
  "listening",
  "listeningCloze",
];

function startKind(start: GroupStart | undefined): GroupKind {
  if (start === "listening" || start === "listeningCloze") return "listening";
  return start === "cloze" ? "cloze" : "reading";
}

/**
 * answersOnlyGaps says whether the group's right half lists gaps: every
 * member answers a gap, or the group has no member yet and was started as a
 * cloze.
 */
export function answersOnlyGaps(bundle: GroupBundle, start?: GroupStart): boolean {
  const { members } = bundle.group;
  if (members.length === 0) return start === "cloze" || start === "listeningCloze";
  const bound = boundQuestionIds(bundle);
  return members.every((member) => bound.has(member.questionId));
}

/**
 * groupKind names a group: a recording makes it "listening", whatever else it
 * holds; with none, "cloze" when every member answers a gap, else "reading".
 * A group that holds nothing yet takes the name of `start`.
 */
export function groupKind(bundle: GroupBundle, start?: GroupStart): GroupKind {
  const { recordings, stimuli, members } = bundle.group;
  if (recordings.length > 0) return "listening";
  if (members.length > 0) return answersOnlyGaps(bundle) ? "cloze" : "reading";
  if (stimuli.length === 0 || start !== undefined) return startKind(start);
  return "reading";
}

/**
 * startBundle is the group a start makes: titled for its kind, with an empty
 * text in place unless it starts from a recording alone, whose file is
 * attached when it is chosen.
 */
export function startBundle(start: GroupStart, t: TFunction): GroupBundle {
  const title = t(`groups.kind.${startKind(start)}.new`);
  const bundle = emptyGroup(title);
  if (start === "listening") return bundle;
  return { ...bundle, group: { ...bundle.group, stimuli: [emptyMaterial(title)] } };
}
