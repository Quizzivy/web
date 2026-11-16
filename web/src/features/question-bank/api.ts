import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import type { QuestionValues } from "@/features/question-bank/questionSchema";

export type AdminQuestion = components["schemas"]["AdminQuestion"];
export type QuestionType = components["schemas"]["QuestionType"];

export interface ListQuestionsParams {
  /** A set's questions instead of the caller's bank, in set order (DG-90). */
  setId?: string;
  /** Repeatable. Several types widen the results; see A-06's rail. */
  type?: QuestionType[];
  tag?: string[];
  level?: components["schemas"]["QuestionLevel"][];
  skill?: components["schemas"]["QuestionSkill"][];
  tagMatch?: "any" | "all";
  hasAudio?: boolean;
  q?: string;
  page?: number;
  limit?: number;
}

export function listQuestions(params: ListQuestionsParams = {}, signal?: AbortSignal) {
  const query: Record<string, unknown> = {};
  if (params.setId) query["setId"] = params.setId;
  if (params.type?.length) query["type"] = params.type;
  if (params.tag?.length) query["tag"] = params.tag;
  if (params.level?.length) query["level"] = params.level;
  if (params.skill?.length) query["skill"] = params.skill;
  if (params.tagMatch !== undefined) query["tagMatch"] = params.tagMatch;
  if (params.hasAudio !== undefined) query["hasAudio"] = params.hasAudio;
  if (params.q) query["q"] = params.q;
  if (params.page && params.page > 1) query["page"] = params.page;
  if (params.limit) query["limit"] = params.limit;
  return api("get", "/teacher/questions", signal ? { query, signal } : { query });
}

export function getQuestion(id: string, signal?: AbortSignal) {
  return api(
    "get",
    "/teacher/questions/{id}",
    signal ? { path: { id }, signal } : { path: { id } },
  );
}

/**
 * ForTest names the test a new question is made for when the caller is not
 * that test's owner: the question lands in the owner's bank, so the draft can
 * hold it (T-R7.5's copy-on-add).
 */
export type ForTest = Readonly<{ forTestId?: string | undefined }>;

export function createQuestion(body: QuestionValues, { forTestId }: ForTest = {}) {
  return api("post", "/teacher/questions", {
    query: forTestId === undefined ? {} : { forTestId },
    body: { ...body, level: body.level ?? null, skill: body.skill ?? null },
  });
}

/**
 * QuestionWriteContext is what an edit sends beside the question: the
 * `updatedAt` the editor last read, which the server compares to refuse a
 * stale write (T-R7.5), and the set it is edited in, for an edit grantee
 * (T-R7.6). A set edit may answer with a copy, whose `id` differs.
 */
export type QuestionWriteContext = Readonly<{
  expectedUpdatedAt?: string | undefined;
  setId?: string | undefined;
}>;

export function updateQuestion(
  id: string,
  body: QuestionValues,
  { expectedUpdatedAt, setId }: QuestionWriteContext = {},
) {
  return api("patch", "/teacher/questions/{id}", {
    path: { id },
    query: setId === undefined ? {} : { setId },
    body: {
      ...body,
      level: body.level ?? null,
      skill: body.skill ?? null,
      ...(expectedUpdatedAt === undefined ? {} : { expectedUpdatedAt }),
    },
  });
}

/**
 * The response shape and the form shape differ on purpose: the response embeds
 * the whole `media` asset, the request sends only its id. This is the one place
 * that knows both.
 */
export function toFormValues(question: AdminQuestion): QuestionValues {
  return {
    type: question.type,
    level: question.level,
    skill: question.skill,
    prompt: question.prompt,
    promptContent: question.promptContent ?? null,
    explanationContent: question.explanationContent ?? null,
    mediaAssetId: question.media?.id ?? null,
    mediaAlt: question.mediaAlt ?? null,
    audio: question.audio ?? null,
    transcript: question.transcript ?? null,
    options: (question.options ?? []).map((option) => ({
      id: option.id,
      text: option.text,
      content: option.content ?? null,
      isCorrect: option.isCorrect,
    })),
    blanks: (question.blanks ?? []).map((blank) => ({
      id: blank.id,
      ordinal: blank.ordinal,
      gapId: blank.gapId ?? null,
      acceptedAnswers: blank.acceptedAnswers,
      caseSensitive: blank.caseSensitive ?? false,
    })),
    points: question.points,
    explanation: question.explanation ?? null,
    sampleAnswer: question.sampleAnswer ?? null,
    ...typeFields(question),
    tags: question.tags,
  };
}

/**
 * typeFields are the R6 settings a stored question carries, in the form's
 * shape: a matching item names its option by index, as the request does,
 * where the response names it by id. Each appears only on its own type.
 */
function typeFields(
  question: AdminQuestion,
): Pick<
  QuestionValues,
  | "selectCount"
  | "maxWords"
  | "essayMaxWords"
  | "matchAllowReuse"
  | "matchItems"
  | "rubric"
> {
  switch (question.type) {
    case "multiple_choice":
      return question.selectCount == null ? {} : { selectCount: question.selectCount };
    case "short_answer":
      return question.maxWords == null ? {} : { maxWords: question.maxWords };
    case "essay":
      return {
        rubric: (question.rubric ?? []).map(({ id, label }) => ({ id, label })),
        ...(question.essayMaxWords == null
          ? {}
          : { essayMaxWords: question.essayMaxWords }),
      };
    case "matching": {
      const ids = (question.options ?? []).map((option) => option.id);
      return {
        matchAllowReuse: question.matchAllowReuse ?? false,
        matchItems: (question.matchItems ?? []).map((item) => ({
          id: item.id,
          text: item.text,
          correctOption: ids.indexOf(item.correctOptionId),
        })),
      };
    }
    default:
      return {};
  }
}

/** A-06's bulk "Gắn thẻ". Additive and idempotent; see the contract. */
export function tagQuestions(questionIds: string[], tags: string[]) {
  return api("post", "/teacher/questions/tags", { body: { questionIds, tags } });
}

export function duplicateQuestion(id: string, { forTestId }: ForTest = {}) {
  return api("post", "/teacher/questions/{id}/duplicate", {
    path: { id },
    query: forTestId === undefined ? {} : { forTestId },
  });
}

export function deleteQuestion(id: string) {
  return api("delete", "/teacher/questions/{id}", { path: { id } });
}

export type QuestionSet = components["schemas"]["QuestionSet"];
export type QuestionSetSummary = components["schemas"]["QuestionSetSummary"];

/** QUESTION_SETS_KEY heads the caller's own sets: the bank's Sets group and Add to set. */
export const QUESTION_SETS_KEY = ["teacher-question-sets"] as const;

/** QUESTION_SET_PREFIX heads every set's header query (questionSetKey). */
export const QUESTION_SET_PREFIX = ["teacher-question-set"] as const;

/** questionSetKey is the query key of one set's header. */
export function questionSetKey(id: string) {
  return [...QUESTION_SET_PREFIX, id] as const;
}

/** SET_LIMIT is how many questions a set holds at most (the contract's 500). */
export const SET_LIMIT = 500;

/** listQuestionSets reads the caller's own sets, most recently changed first. */
export function listQuestionSets(signal?: AbortSignal) {
  return api("get", "/teacher/question-sets", signal ? { signal } : {});
}

export function getQuestionSet(id: string, signal?: AbortSignal) {
  return api(
    "get",
    "/teacher/question-sets/{id}",
    signal ? { path: { id }, signal } : { path: { id } },
  );
}

/** trimmedOrNull is a description as the contract stores it: trimmed, and null when empty. */
function trimmedOrNull(text: string): string | null {
  const value = text.trim();
  return value === "" ? null : value;
}

/** createQuestionSet names a set made of `questionIds`, in that order. */
export function createQuestionSet(
  name: string,
  description: string,
  questionIds: readonly string[],
) {
  return api("post", "/teacher/question-sets", {
    body: {
      name: name.trim(),
      description: trimmedOrNull(description),
      questionIds: [...questionIds],
    },
  });
}

/** updateQuestionSet renames a set; an empty description removes it. */
export function updateQuestionSet(id: string, name: string, description: string) {
  return api("patch", "/teacher/question-sets/{id}", {
    path: { id },
    body: { name: name.trim(), description: trimmedOrNull(description) },
  });
}

export function deleteQuestionSet(id: string) {
  return api("delete", "/teacher/question-sets/{id}", { path: { id } });
}

/** addQuestionSetItems appends questions to a set; one it already holds is skipped. */
export function addQuestionSetItems(id: string, questionIds: readonly string[]) {
  return api("post", "/teacher/question-sets/{id}/items", {
    path: { id },
    body: { questionIds: [...questionIds] },
  });
}

/** removeQuestionSetItems takes questions out of a set; they stay in the bank. */
export function removeQuestionSetItems(id: string, questionIds: readonly string[]) {
  return api("post", "/teacher/question-sets/{id}/items/remove", {
    path: { id },
    body: { questionIds: [...questionIds] },
  });
}
