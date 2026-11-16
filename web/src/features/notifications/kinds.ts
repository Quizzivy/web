import type { TFunction } from "i18next";
import {
  CircleCheck,
  ClipboardList,
  Clock,
  FileCheck,
  Flag,
  FileText,
  FolderInput,
  Hand,
  LayoutDashboard,
  MessageSquare,
  RotateCw,
  Sparkles,
  SquarePen,
  UserPlus,
  UserRoundCog,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { FLAGGED } from "@/features/integrity/tones";
import { threadPath } from "@/features/messages/api";
import { studentThreadPath } from "@/features/messages/studentApi";
import { formatDateTime } from "@/lib/i18n/datetime";
import type { Locale } from "@/lib/i18n";
import type {
  Notification,
  NotificationEvent,
  NotificationKind,
  NotificationParams,
  NotificationTarget,
} from "./api";

/** NotificationTone names the semantic soft and ink colours a reader draws. */
export type NotificationTone = "neutral" | "info" | "success" | "warning" | "danger";
/** NotificationView supplies plain text, a look and a safe optional local destination. */
export type NotificationView = Readonly<{
  icon: LucideIcon;
  tone: NotificationTone;
  text: string;
  to: string | null;
}>;
/** KIND_LOOK is the exhaustive shared look per kind, with submitted papers awaiting grading as its default. */
export const KIND_LOOK: Record<
  NotificationKind,
  Readonly<{ icon: LucideIcon; tone: NotificationTone }>
> = {
  "attempt.submitted": { icon: SquarePen, tone: "warning" },
  "attempt.flagged": { icon: Flag, tone: FLAGGED.tone },
  "assignment.closing": { icon: Clock, tone: "warning" },
  "class.joined": { icon: UserPlus, tone: "neutral" },
  "join_codes.rotated": { icon: RotateCw, tone: "info" },
  "assignment.opened": { icon: ClipboardList, tone: "info" },
  "assignment.due_soon": { icon: Clock, tone: "warning" },
  "assignment.extended": { icon: Clock, tone: "info" },
  "result.ready": { icon: CircleCheck, tone: "success" },
  "ai.allowance_warning": { icon: Sparkles, tone: "warning" },
  "ai.credit_request": { icon: Hand, tone: "warning" },
  "ai.credit_request.decided": { icon: Sparkles, tone: "info" },
  "content.transferred": { icon: FolderInput, tone: "info" },
  "class.teacher_changed": { icon: UserRoundCog, tone: "info" },
  "content.shared": { icon: UsersRound, tone: "info" },
  "test.published_by_collaborator": { icon: FileText, tone: "info" },
  "message.received": { icon: MessageSquare, tone: "info" },
  "message.from_teacher": { icon: MessageSquare, tone: "info" },
  "summary.weekly": { icon: LayoutDashboard, tone: "neutral" },
};
/**
 * TEACHER_EVENTS lists the teacher's switches in the deck's order (Settings
 * › Notifications): A student submits, An attempt is flagged, New message,
 * An assignment is about to close, Weekly summary.
 */
export const TEACHER_EVENTS = [
  "attempt.submitted",
  "attempt.flagged",
  "message.received",
  "assignment.closing",
  "summary.weekly",
] as const satisfies readonly NotificationEvent[];
/**
 * STUDENT_EVENTS lists the student's switches in the deck's order: Test due
 * soon, Result ready, Messages from teachers. `message.received` is both
 * lists' (the contract's "New message" for a teacher, "Messages from
 * teachers" for a student).
 */
export const STUDENT_EVENTS = [
  "assignment.due_soon",
  "result.ready",
  "message.received",
] as const satisfies readonly NotificationEvent[];

const teacherKinds = new Set<NotificationKind>([
  "attempt.submitted",
  "attempt.flagged",
  "assignment.closing",
  "class.joined",
  "join_codes.rotated",
  "ai.allowance_warning",
  "ai.credit_request",
  "ai.credit_request.decided",
  "content.transferred",
  "class.teacher_changed",
  "content.shared",
  "test.published_by_collaborator",
  "message.received",
  "summary.weekly",
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function idPath(prefix: string, id: string | undefined, suffix = "") {
  return id && uuid.test(id) ? `${prefix}/${id}${suffix}` : null;
}

/** audienceOf names the console that reads a supported kind. */
export function audienceOf(kind: NotificationKind): "teacher" | "student" {
  return teacherKinds.has(kind) ? "teacher" : "student";
}

/** notificationPath resolves only known local routes with the contract's UUID identifiers. */
export function notificationPath(target: NotificationTarget | null): string | null {
  if (!target) return null;
  switch (target.route) {
    case "assignment":
      return idPath("/teacher/assignments", target.assignmentId);
    case "attempt":
      return idPath("/teacher/attempts", target.attemptId);
    case "grading":
      return "/teacher/grading";
    case "classes":
      return "/teacher/classes";
    case "result":
      return idPath("/attempts", target.attemptId, "/result");
    case "studentAssignment":
      return idPath("/assignments", target.assignmentId);
    case "sharedWithMe":
      return "/teacher/shared-with-me";
    case "test":
      return idPath("/teacher/tests", target.testId);
    case "dashboard":
      return "/teacher";
    case "messages":
      return messagesPath(target.studentId);
    case "studentMessages":
      return studentMessagesPath(target);
    default:
      return null;
  }
}

/** messagesPath is the staff thread with a student, or Messages when the target names none. */
function messagesPath(studentId: string | undefined) {
  if (studentId === undefined) return "/teacher/messages";
  return uuid.test(studentId) ? threadPath({ kind: "direct", id: studentId }) : null;
}

/** studentMessagesPath is the student's thread a target names: a class's channel, a teacher's direct thread, or Messages. */
function studentMessagesPath(target: NotificationTarget) {
  const { classId, teacherId } = target;
  if (classId !== undefined)
    return uuid.test(classId)
      ? studentThreadPath({ kind: "class", id: classId })
      : null;
  if (teacherId !== undefined)
    return uuid.test(teacherId)
      ? studentThreadPath({ kind: "direct", id: teacherId })
      : null;
  return "/messages";
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function hasCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
function literalSentence(
  key: string,
  params: Readonly<Record<string, string | number>>,
  t: TFunction,
) {
  const values: string[] = [];
  const opaque: Record<string, string | number> = Object.fromEntries(
    Object.entries(params).map(([name, value]) => {
      if (typeof value !== "string") return [name, value];
      const token = `\uE000quizzivy-notification:${values.length}\uE001`;
      values.push(value);
      return [name, token];
    }),
  );
  return t(key, { ...opaque, returnObjects: false, returnDetails: false }).replace(
    /\uE000quizzivy-notification:(\d+)\uE001/g,
    (token, index: string) => values[Number(index)] ?? token,
  );
}
function timedSentence(
  key: string,
  params: NotificationParams,
  t: TFunction,
  locale: Locale,
) {
  if (
    !hasText(params.title) ||
    !hasText(params.closesAt) ||
    !Number.isFinite(new Date(params.closesAt).getTime())
  )
    return null;
  return literalSentence(
    key,
    { title: params.title, when: formatDateTime(params.closesAt, locale) },
    t,
  );
}
function credits(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale).format(value);
}
const sentences: Record<
  NotificationKind,
  (params: NotificationParams, t: TFunction, locale: Locale) => string | null
> = {
  "attempt.submitted": (p, t) => {
    if (!hasText(p.title) || !hasCount(p.toGrade)) return null;
    if (p.toGrade > 0)
      return literalSentence(
        "notifications.kind.toGrade",
        { title: p.title, count: p.toGrade },
        t,
      );
    return hasCount(p.count)
      ? literalSentence(
          "notifications.kind.submitted",
          { title: p.title, count: p.count },
          t,
        )
      : null;
  },
  "attempt.flagged": (p, t) =>
    hasText(p.studentName) && hasCount(p.focusLost)
      ? literalSentence(
          "notifications.kind.flagged",
          {
            studentName: p.studentName,
            count: p.focusLost,
          },
          t,
        )
      : null,
  "assignment.closing": (p, t) =>
    hasText(p.title) && hasCount(p.notSubmitted)
      ? literalSentence(
          "notifications.kind.closing",
          { title: p.title, count: p.notSubmitted },
          t,
        )
      : null,
  "class.joined": (p, t) =>
    hasText(p.studentName) && hasText(p.className)
      ? literalSentence(
          "notifications.kind.joined",
          {
            studentName: p.studentName,
            className: p.className,
          },
          t,
        )
      : null,
  "join_codes.rotated": (p, t) => {
    if (
      !hasCount(p.count) ||
      !Array.isArray(p.classNames) ||
      !p.classNames.every(hasText)
    )
      return null;
    const names = p.classNames.join(", ") + (p.count > p.classNames.length ? "…" : "");
    return literalSentence(
      "notifications.kind.codesRotated",
      { count: p.count, names },
      t,
    );
  },
  "assignment.opened": (p, t, locale) =>
    timedSentence("notifications.kind.opened", p, t, locale),
  "assignment.due_soon": (p, t, locale) =>
    timedSentence("notifications.kind.dueSoon", p, t, locale),
  "assignment.extended": (p, t, locale) =>
    timedSentence("notifications.kind.extended", p, t, locale),
  "result.ready": (p, t) =>
    hasText(p.title)
      ? literalSentence("notifications.kind.resultReady", { title: p.title }, t)
      : null,
  "ai.allowance_warning": (p, t, locale) =>
    hasCount(p.used) && hasCount(p.allowance)
      ? literalSentence(
          "notifications.kind.aiWarning",
          { used: credits(p.used, locale), allowance: credits(p.allowance, locale) },
          t,
        )
      : null,
  "ai.credit_request": (p, t, locale) =>
    hasText(p.teacherName) && hasCount(p.credits)
      ? literalSentence(
          "notifications.kind.aiRequest",
          { teacherName: p.teacherName, credits: credits(p.credits, locale) },
          t,
        )
      : null,
  "ai.credit_request.decided": (p, t, locale) => {
    if (
      !hasCount(p.credits) ||
      (p.decision !== "approved" && p.decision !== "declined")
    )
      return null;
    const key =
      p.decision === "approved"
        ? "notifications.kind.aiApproved"
        : "notifications.kind.aiDeclined";
    return literalSentence(key, { credits: credits(p.credits, locale) }, t);
  },
  "content.transferred": (p, t) =>
    hasText(p.teacherName) && hasCount(p.count)
      ? literalSentence(
          "notifications.kind.transferred",
          { teacherName: p.teacherName, count: p.count },
          t,
        )
      : null,
  "class.teacher_changed": (p, t) => {
    if (!hasText(p.className)) return null;
    if (p.teacherName === undefined)
      return literalSentence(
        "notifications.kind.teacherReceived",
        { className: p.className },
        t,
      );
    return hasText(p.teacherName)
      ? literalSentence(
          "notifications.kind.teacherChanged",
          { className: p.className, teacherName: p.teacherName },
          t,
        )
      : null;
  },
  "content.shared": (p, t) => {
    if (!hasText(p.sharerName) || !hasText(p.name)) return null;
    if (p.contentKind !== "test" && p.contentKind !== "question_set") return null;
    return literalSentence(
      p.contentKind === "test"
        ? "notifications.kind.sharedTest"
        : "notifications.kind.sharedSet",
      { sharerName: p.sharerName, name: p.name },
      t,
    );
  },
  "test.published_by_collaborator": (p, t) =>
    hasText(p.editorName) && hasText(p.title) && hasCount(p.version) && p.version > 0
      ? literalSentence(
          "notifications.kind.coPublished",
          { editorName: p.editorName, title: p.title, version: p.version },
          t,
        )
      : null,
  "message.received": (p, t) => messageSentence(p, t),
  "message.from_teacher": (p, t) => messageSentence(p, t),
  "summary.weekly": (p, t) =>
    hasCount(p.count) && hasCount(p.toGrade) && hasCount(p.flagged)
      ? literalSentence(
          "notifications.kind.weekly",
          { count: p.count, toGrade: p.toGrade, flagged: p.flagged },
          t,
        )
      : null,
};

/**
 * messageSentence words a message item: how many new messages, from whom,
 * and the newest one's excerpt, which lives only in the reader's own bell;
 * a class's channel (a student's `message.from_teacher` with `className`)
 * names the class instead of the sender alone.
 */
function messageSentence(p: NotificationParams, t: TFunction) {
  if (!hasText(p.senderName) || !hasText(p.excerpt) || !hasCount(p.count)) return null;
  if (p.count === 0) return null;
  const values = { senderName: p.senderName, excerpt: p.excerpt, count: p.count };
  if (p.className === undefined)
    return literalSentence("notifications.kind.message", values, t);
  return hasText(p.className)
    ? literalSentence(
        "notifications.kind.classMessage",
        { ...values, className: p.className },
        t,
      )
    : null;
}

/** known refuses a kind the contract does not list (a later release's, or `__proto__`). */
function known(kind: string): kind is NotificationKind {
  return Object.hasOwn(KIND_LOOK, kind);
}

/** describeNotification returns a complete localised row or null for an unknown kind or missing sentence input, preserving grading fallback for readers who cannot grade. */
export function describeNotification(
  notification: Notification,
  t: TFunction,
  locale: Locale,
  options?: Readonly<{ canGrade?: boolean }>,
): NotificationView | null {
  const kind = notification.kind;
  if (!known(kind)) return null;
  const text = sentences[kind](notification.params, t, locale);
  if (text === null) return null;
  const submitted = notification.kind === "attempt.submitted";
  const waiting = submitted && (notification.params.toGrade ?? 0) > 0;
  const look =
    submitted && !waiting
      ? { icon: FileCheck, tone: "neutral" as const }
      : KIND_LOOK[kind];
  const to =
    waiting && options?.canGrade !== false
      ? "/teacher/grading"
      : notificationPath(notification.target);
  return { ...look, text, to };
}
