import { z } from "zod";

import type { LeadInput } from "./api";
import { PRIVACY_NOTICE } from "./site";

/** INTERESTS are the courses the form offers, in the order it shows them. */
export const INTERESTS = [
  "ielts",
  "toeic",
  "communication",
  "kids",
  "business",
] as const;

/** COURSE_FOR is who a course is for; the first is the form's own answer. */
export const COURSE_FOR = ["self", "child", "company"] as const;

/** CALL_TIMES are the times to call; the first is the form's own answer. */
export const CALL_TIMES = ["any", "morning", "afternoon", "evening"] as const;

const PHONE = /^[0-9 +().-]{9,20}$/;

function digits(phone: string): number {
  return phone.replace(/\D/g, "").length;
}

/**
 * leadSchema is the consultation form's input as the contract takes it. A
 * message is the key of the line the form shows for that field.
 */
export const leadSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "landing.consult.errName")
    .max(120, "landing.consult.errName"),
  phone: z
    .string()
    .trim()
    .refine(
      (phone) => PHONE.test(phone) && digits(phone) >= 9 && digits(phone) <= 15,
      "landing.consult.errPhone",
    ),
  interests: z.array(z.enum(INTERESTS)),
  courseFor: z.enum(COURSE_FOR),
  callTime: z.enum(CALL_TIMES),
  locale: z.enum(["vi", "en"]),
  consent: z.literal(true, "landing.consult.errConsent"),
  privacyNoticeVersion: z.literal(PRIVACY_NOTICE.version),
});

/** LeadValues is what the form holds once it is valid. */
export type LeadValues = z.infer<typeof leadSchema>;

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/**
 * Fails `tsc` when the form and the contract disagree about the request. The
 * field no person fills, `website`, is added when the request is sent.
 */
export type LeadValuesMatchTheContract = Expect<
  Equal<LeadValues, Omit<LeadInput, "website">>
>;

/** FIELD_ORDER is the order the form names its mistakes in, one at a time. */
const FIELD_ORDER = ["fullName", "phone", "consent"] as const;

/** LeadField is a field the form can mark as wrong. */
export type LeadField = (typeof FIELD_ORDER)[number];

/**
 * firstMistake names the first field that is wrong, in the form's order, with
 * the key of its line; null when the form can be sent.
 */
export function firstMistake(
  input: unknown,
): { field: LeadField; message: string } | null {
  const result = leadSchema.safeParse(input);
  if (result.success) return null;
  for (const field of FIELD_ORDER) {
    const issue = result.error.issues.find((candidate) => candidate.path[0] === field);
    if (issue) return { field, message: issue.message };
  }
  return { field: "fullName", message: "landing.consult.errName" };
}
