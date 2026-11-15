import type { AiVariantChange } from "@/features/ai/api";
import { AiWriteError } from "@/features/ai/kind";
import {
  duplicateQuestion,
  getQuestion,
  toFormValues,
  updateQuestion,
  type AdminQuestion,
} from "@/features/question-bank/api";
import { withVariant } from "@/features/question-bank/aiDrafts";
import { questionSchema } from "@/features/question-bank/questionSchema";
import {
  getGroup,
  updateGroup,
  type StoredGroup,
} from "@/features/question-groups/api";
import { memberValues } from "@/features/question-groups/model";
import {
  duplicateTest,
  getTest,
  saveMixedOutline,
  toMixedOutline,
  type Test,
} from "./api";

const TITLE_MAX = 200;

type MemberInput = StoredGroup["bundle"]["questions"][number]["input"];

interface OptionHolder {
  options?: readonly { id?: string | null }[] | null;
}

function byQuestion(changes: readonly AiVariantChange[]) {
  const grouped = new Map<string, AiVariantChange[]>();
  for (const change of changes) {
    const list = grouped.get(change.questionId) ?? [];
    list.push(change);
    grouped.set(change.questionId, list);
  }
  return grouped;
}

function optionIds(from: OptionHolder, to: OptionHolder): Map<string, string> {
  const ids = new Map<string, string>();
  for (const [index, option] of (from.options ?? []).entries()) {
    const copy = to.options?.[index];
    if (option.id && copy?.id) ids.set(option.id, copy.id);
  }
  return ids;
}

function groupUnitIds(test: Test): string[] {
  return toMixedOutline(test).flatMap((section) =>
    section.units.filter((unit) => unit.kind === "group").map((unit) => unit.id),
  );
}

function questionUnitIds(test: Test): Set<string> {
  return new Set(
    toMixedOutline(test).flatMap((section) =>
      section.units.filter((unit) => unit.kind === "question").map((unit) => unit.id),
    ),
  );
}

function memberInput(group: StoredGroup, questionId: string): MemberInput | undefined {
  return group.bundle.questions.find((question) => question.id === questionId)?.input;
}

function memberIndex(group: StoredGroup, questionId: string): number {
  return group.bundle.group.members.findIndex(
    (member) => member.questionId === questionId,
  );
}

/** withoutIds is a value with every `id` taken out, which a copy renews. */
function withoutIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutIds);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "id")
        .map(([key, inner]) => [key, withoutIds(inner)]),
    );
  return value;
}

/**
 * sameOutline says whether `copy` is laid out as `original`: the same
 * sections with the same units in the same places, a standalone question by
 * its id (a copy names the same bank questions) and a group by its place.
 */
function sameOutline(original: Test, copy: Test): boolean {
  const from = toMixedOutline(original);
  const to = toMixedOutline(copy);
  return (
    from.length === to.length &&
    from.every((section, index) => {
      const units = to[index]?.units ?? [];
      return (
        section.units.length === units.length &&
        section.units.every((unit, at) => {
          const other = units[at];
          return (
            other?.kind === unit.kind && (unit.kind === "group" || other.id === unit.id)
          );
        })
      );
    })
  );
}

/**
 * sameMembers says whether the copy's group holds what the original holds,
 * member by member in order, ids aside. Only then is the member at a place in
 * the copy the copy of the member at that place in the original (VR-2).
 */
function sameMembers(original: StoredGroup, copy: StoredGroup): boolean {
  const from = original.bundle.group.members;
  const to = copy.bundle.group.members;
  return (
    from.length === to.length &&
    from.every((member, index) => {
      const a = memberInput(original, member.questionId);
      const b = to[index] && memberInput(copy, to[index].questionId);
      return (
        a !== undefined &&
        b !== undefined &&
        JSON.stringify(withoutIds(a)) === JSON.stringify(withoutIds(b))
      );
    })
  );
}

function canSave(values: Parameters<typeof withVariant>[0], list: AiVariantChange[]) {
  return questionSchema.safeParse(withVariant(values, list)).success;
}

async function groupsHolding(test: Test, ids: readonly string[]) {
  const holding = new Map<number, StoredGroup>();
  const left = new Set(ids);
  for (const [index, id] of groupUnitIds(test).entries()) {
    if (left.size === 0) break;
    const group = await getGroup(id);
    const members = group.bundle.group.members.filter((member) =>
      left.has(member.questionId),
    );
    if (members.length === 0) continue;
    holding.set(index, group);
    for (const member of members) left.delete(member.questionId);
  }
  return holding;
}

async function varyCopiedGroup(
  copyId: string,
  original: StoredGroup,
  grouped: ReadonlyMap<string, AiVariantChange[]>,
  changed: string,
) {
  const copy = await getGroup(copyId);
  if (!sameMembers(original, copy)) throw new AiWriteError(changed);
  const questions = copy.bundle.questions.map((question) => {
    const index = memberIndex(copy, question.id);
    const source = original.bundle.group.members[index]?.questionId;
    const list = source === undefined ? undefined : grouped.get(source);
    const from = source === undefined ? undefined : memberInput(original, source);
    if (!list || !from) return question;
    return {
      ...question,
      input: withVariant(
        memberValues(question.input),
        list,
        optionIds(from, question.input),
      ),
    };
  });
  await updateGroup(copyId, {
    bundle: { ...copy.bundle, questions },
    expectedRevision: copy.revision,
    expectedTestUpdatedAt: copy.testUpdatedAt ?? null,
  });
}

/**
 * copiedAsRead answers the ids of `copy`'s groups in outline order once the
 * copy is laid out as `current` and each group that has changes holds the
 * members of its original in order, and refuses with `changed` otherwise.
 */
async function copiedAsRead(
  current: Test,
  copy: Test,
  groups: ReadonlyMap<number, StoredGroup>,
  changed: string,
): Promise<string[]> {
  const copiedGroups = groupUnitIds(copy);
  if (!sameOutline(current, copy)) throw new AiWriteError(changed);
  for (const [index, original] of groups) {
    const copyId = copiedGroups[index];
    if (!copyId || !sameMembers(original, await getGroup(copyId)))
      throw new AiWriteError(changed);
  }
  return copiedGroups;
}

/**
 * VariantNames are the words a variant's writes need: the new test's title,
 * and the refusal for a change that cannot be saved, by the question's number.
 */
export interface VariantNames {
  title: string;
  invalid: (number: number) => string;
  /** The refusal when the test changed under the copy while it was made. */
  changed: string;
}

/**
 * saveVariant makes a variant of `test` from the kept `changes` through the
 * existing writes, and answers the new test's id. Every changed question is
 * checked first, so a change that cannot be saved stops it before anything
 * is written. Then `duplicateTest` copies the draft into a new draft test
 * named `names.title`. A copy's outline names the same bank questions as the
 * test it copies, so each changed standalone question is duplicated, the
 * changes are written to the duplicate with `updateQuestion`, and the copy's
 * outline is saved with the duplicate in its place. A copy's groups are its
 * own, so a changed member is written to the copy's group, found at the same
 * place in the outline and the member at the same place in the group, with
 * `updateGroup`. The test, its questions and its groups are never touched.
 *
 * The places are read from the test as it is now, not from the page's
 * `test`, which may predate a reorder (VR-2). Nothing ties a copy's group or
 * member to the one it was copied from, so before any group is written the
 * copy must be laid out as the test was read and each of its groups must hold
 * the same members in the same order; if the test changed between the read
 * and the copy, it stops with `names.changed` before it writes a change.
 */
export async function saveVariant(
  test: Test,
  changes: readonly AiVariantChange[],
  names: VariantNames,
): Promise<string> {
  const grouped = byQuestion(changes);
  const current = await getTest(test.id);
  const standalone = questionUnitIds(current);
  const memberIds = [...grouped.keys()].filter((id) => !standalone.has(id));
  const groups = await groupsHolding(current, memberIds);
  const sources = new Map<string, AdminQuestion>();
  for (const [questionId, list] of grouped) {
    const number = list[0]?.number ?? 0;
    if (standalone.has(questionId)) {
      const source = await getQuestion(questionId);
      if (!canSave(toFormValues(source), list))
        throw new AiWriteError(names.invalid(number));
      sources.set(questionId, source);
      continue;
    }
    const input = [...groups.values()]
      .map((group) => memberInput(group, questionId))
      .find((found) => found !== undefined);
    if (!input || !canSave(memberValues(input), list))
      throw new AiWriteError(names.invalid(number));
  }
  const copy = await duplicateTest(test.id);
  const copiedGroups = await copiedAsRead(current, copy, groups, names.changed);
  const swaps = new Map<string, string>();
  for (const [questionId, source] of sources) {
    const list = grouped.get(questionId) ?? [];
    const duplicate = await duplicateQuestion(questionId);
    const values = withVariant(
      toFormValues(duplicate),
      list,
      optionIds(source, duplicate),
    );
    const saved = await updateQuestion(duplicate.id, values);
    swaps.set(questionId, saved.id);
  }
  const sections = toMixedOutline(copy).map((section) => ({
    ...section,
    units: section.units.map((unit) =>
      unit.kind === "question" ? { ...unit, id: swaps.get(unit.id) ?? unit.id } : unit,
    ),
  }));
  await saveMixedOutline(
    copy.id,
    copy.updatedAt,
    names.title.slice(0, TITLE_MAX),
    sections,
  );
  for (const [index, original] of groups) {
    const copyId = copiedGroups[index];
    if (copyId) await varyCopiedGroup(copyId, original, grouped, names.changed);
  }
  return copy.id;
}
