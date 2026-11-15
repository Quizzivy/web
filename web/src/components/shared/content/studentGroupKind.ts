import type { components } from "@/lib/api/schema";

type StudentGroup = components["schemas"]["StudentGroup"];

/** StudentGroupKind is the owner's name for a group (Q2 of DG-231): a passage, a cloze or a recording. */
export type StudentGroupKind = "reading" | "cloze" | "listening";

/**
 * studentGroupKind names a group as the builder does (`groupKind`), from what
 * a student's paper carries: a recording makes it a recording, gaps that
 * answer every one of its questions a cloze, and anything else a passage.
 */
export function studentGroupKind(group: StudentGroup): StudentGroupKind {
  if (group.recordings.length > 0) return "listening";
  const answered = new Set(
    group.stimuli.flatMap((stimulus) => stimulus.gaps.map((gap) => gap.questionId)),
  );
  return group.questionIds.length > 0 &&
    group.questionIds.every((id) => answered.has(id))
    ? "cloze"
    : "reading";
}
