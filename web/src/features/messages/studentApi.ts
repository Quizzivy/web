import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cursorQuery, type Cursor } from "./api";

export type StudentThread = components["schemas"]["StudentThread"];
export type StudentMessage = components["schemas"]["StudentMessage"];
export type StudentDirectThread = components["schemas"]["StudentDirectThread"];
export type StudentClassThread = components["schemas"]["StudentClassThread"];

/**
 * StudentRef names one conversation of the student side: a class's channel
 * by its class, a direct thread by its teacher. A direct thread is addressed
 * by its counterpart and exists from its first message, so the Classes card
 * can open one nobody has written in yet (T-R7.21).
 */
export type StudentRef = Readonly<{ kind: "class" | "direct"; id: string }>;

/** STUDENT_MESSAGES_KEY heads every query of the student's Messages page. */
export const STUDENT_MESSAGES_KEY = ["student-messages"] as const;

/** studentThreadsKey is the query key of the student's list. */
export const studentThreadsKey = [...STUDENT_MESSAGES_KEY, "threads"] as const;

/** studentThreadKey is the query key of one open thread. */
export function studentThreadKey(ref: StudentRef) {
  return [...STUDENT_MESSAGES_KEY, "thread", ref.kind, ref.id] as const;
}

/**
 * studentThreadPath is the address that opens `ref` on the student host,
 * where a student's pages sit at the root (§5.8).
 */
export function studentThreadPath(ref: StudentRef): string {
  const segment = ref.kind === "class" ? "class" : "teacher";
  return `/messages/${segment}/${encodeURIComponent(ref.id)}`;
}

/** studentRefOf is the ref a row of the student's list opens. */
export function studentRefOf(row: StudentThread): StudentRef | null {
  const { kind, classId, teacherId } = row.thread;
  const id = kind === "class" ? classId : teacherId;
  return id === null ? null : { kind, id };
}

/**
 * listStudentThreads reads the student's rows: their direct threads, and the
 * channels of their classes that have at least one post, newest first.
 */
export function listStudentThreads(signal?: AbortSignal) {
  return api("get", "/app/messages/threads", signal ? { signal } : {});
}

export function getStudentDirectThread(
  teacherId: string,
  cursor: Cursor = {},
  signal?: AbortSignal,
) {
  const options = { path: { teacherId }, query: cursorQuery(cursor) };
  return api(
    "get",
    "/app/messages/teachers/{teacherId}",
    signal ? { ...options, signal } : options,
  );
}

export function getStudentClassThread(
  classId: string,
  cursor: Cursor = {},
  signal?: AbortSignal,
) {
  const options = { path: { classId }, query: cursorQuery(cursor) };
  return api(
    "get",
    "/app/messages/classes/{classId}",
    signal ? { ...options, signal } : options,
  );
}

/** postStudentDirectMessage writes to a teacher: text only. */
export function postStudentDirectMessage(
  teacherId: string,
  body: Readonly<{ clientId: string; body: string }>,
) {
  return api("post", "/app/messages/teachers/{teacherId}", {
    path: { teacherId },
    body: { ...body },
  });
}

/** markStudentThreadRead moves the student's read pointer of `ref` to `messageId`. */
export function markStudentThreadRead(ref: StudentRef, messageId: string) {
  const body = { lastReadMessageId: messageId };
  return ref.kind === "class"
    ? api("post", "/app/messages/classes/{classId}/read", {
        path: { classId: ref.id },
        body,
      })
    : api("post", "/app/messages/teachers/{teacherId}/read", {
        path: { teacherId: ref.id },
        body,
      });
}

/** getStudentAttachmentUrl asks for a five-minute link that downloads a teacher's file. */
export function getStudentAttachmentUrl(id: string) {
  return api("get", "/app/messages/attachments/{id}", { path: { id } });
}
