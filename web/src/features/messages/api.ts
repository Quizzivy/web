import { api, uploadFile, type UploadOptions } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type StaffThread = components["schemas"]["StaffThread"];
export type StaffMessage = components["schemas"]["StaffMessage"];
export type StaffDirectThread = components["schemas"]["StaffDirectThread"];
export type StaffClassThread = components["schemas"]["StaffClassThread"];
export type StaffMessagePost = components["schemas"]["StaffMessagePost"];
export type MessageAttachment = components["schemas"]["MessageAttachment"];
export type MessagePreview = components["schemas"]["MessagePreview"];
export type ContextEvent = components["schemas"]["ContextEvent"];
export type SeenBy = components["schemas"]["SeenBy"];

/**
 * ThreadRef names one conversation of the staff side: a class's channel by its
 * class, a direct thread by its student. A direct thread is addressed by its
 * counterpart and exists from its first message, so a ref can name a thread
 * nobody has written in yet.
 */
export type ThreadRef = Readonly<{ kind: "class" | "direct"; id: string }>;

/** ThreadPage is one read of a thread: its messages, oldest first, and its cursors. */
export type ThreadPage<M> = Readonly<{
  messages: readonly M[];
  nextBefore: string | null;
  latestId: string | null;
}>;

/** Cursor is where a read of a thread starts: the newest page, older or newer than a message. */
export type Cursor = Readonly<{ before?: string; after?: string }>;

/** STAFF_MESSAGES_KEY heads every query of the staff Messages page. */
export const STAFF_MESSAGES_KEY = ["teacher-messages"] as const;

/** staffThreadsKey is the query key of the list, for a search or none. */
export function staffThreadsKey(q: string) {
  return [...STAFF_MESSAGES_KEY, "threads", q] as const;
}

/** staffThreadKey is the query key of one open thread. */
export function staffThreadKey(ref: ThreadRef) {
  return [...STAFF_MESSAGES_KEY, "thread", ref.kind, ref.id] as const;
}

/** threadPath is the address that opens `ref` on the staff Messages page. */
export function threadPath(ref: ThreadRef): string {
  const segment = ref.kind === "class" ? "class" : "student";
  return `/teacher/messages/${segment}/${encodeURIComponent(ref.id)}`;
}

/**
 * MessagesOpening is what a link into Messages may hand the page as its
 * location's state: `tab` is the list's tab to start on, with no
 * conversation open, as the Students page's bulk Message opens Direct for
 * several students.
 */
export type MessagesOpening = Readonly<{ tab?: "all" | "direct" | "classes" }>;

/** MESSAGES_PATH is Messages with no thread open. */
export const MESSAGES_PATH = "/teacher/messages";

/** refOf is the ref a row of the list opens. */
export function refOf(thread: StaffThread): ThreadRef | null {
  const { kind, classId, studentId } = thread.thread;
  const id = kind === "class" ? classId : studentId;
  return id === null ? null : { kind, id };
}

/** sameRef tells whether two refs name the same thread. */
export function sameRef(a: ThreadRef | null, b: ThreadRef | null): boolean {
  return a !== null && b !== null && a.kind === b.kind && a.id === b.id;
}

/** PAGE_LIMIT is how many messages one read brings, the contract's default. */
export const PAGE_LIMIT = 30;

/** cursorQuery is the query of a thread's read from `cursor`, a page of PAGE_LIMIT. */
export function cursorQuery(cursor: Cursor) {
  return {
    limit: PAGE_LIMIT,
    ...(cursor.before === undefined ? {} : { before: cursor.before }),
    ...(cursor.after === undefined ? {} : { after: cursor.after }),
  };
}

/**
 * listStaffThreads reads the rows of the list: every class channel in scope
 * and every direct thread, and with `q` the matching ones followed by the
 * students the caller may write to and has no thread with (`candidate`).
 */
export function listStaffThreads(q: string, signal?: AbortSignal) {
  const query = q === "" ? {} : { q };
  return api(
    "get",
    "/teacher/messages/threads",
    signal ? { query, signal } : { query },
  );
}

export function getStaffDirectThread(
  studentId: string,
  cursor: Cursor = {},
  signal?: AbortSignal,
) {
  const options = { path: { studentId }, query: cursorQuery(cursor) };
  return api(
    "get",
    "/teacher/messages/students/{studentId}",
    signal ? { ...options, signal } : options,
  );
}

export function getStaffClassThread(
  classId: string,
  cursor: Cursor = {},
  signal?: AbortSignal,
) {
  const options = { path: { classId }, query: cursorQuery(cursor) };
  return api(
    "get",
    "/teacher/messages/classes/{classId}",
    signal ? { ...options, signal } : options,
  );
}

/** postStaffMessage posts to a direct thread or announces to a class. */
export function postStaffMessage(ref: ThreadRef, body: StaffMessagePost) {
  return ref.kind === "class"
    ? api("post", "/teacher/messages/classes/{classId}", {
        path: { classId: ref.id },
        body,
      })
    : api("post", "/teacher/messages/students/{studentId}", {
        path: { studentId: ref.id },
        body,
      });
}

/** markStaffThreadRead moves the caller's read pointer of `ref` to `messageId`. */
export function markStaffThreadRead(ref: ThreadRef, messageId: string) {
  const body = { lastReadMessageId: messageId };
  return ref.kind === "class"
    ? api("post", "/teacher/messages/classes/{classId}/read", {
        path: { classId: ref.id },
        body,
      })
    : api("post", "/teacher/messages/students/{studentId}/read", {
        path: { studentId: ref.id },
        body,
      });
}

/**
 * uploadMessageAttachment stores one file for a message that is not sent yet.
 * The server types it by its content and refuses it with 413 or 415.
 */
export function uploadMessageAttachment(file: File, options?: UploadOptions) {
  return uploadFile<MessageAttachment>("/teacher/messages/attachments", file, options);
}

/** getStaffAttachmentUrl asks for a five-minute link that downloads one file. */
export function getStaffAttachmentUrl(id: string) {
  return api("get", "/teacher/messages/attachments/{id}", { path: { id } });
}

/** ATTACHMENT_MAX_BYTES is the largest file a message may carry, 20 MiB. */
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

/**
 * ATTACHMENT_ACCEPT is what the file picker offers. The server reads the
 * content, not the name, so this only spares a teacher a refusal.
 */
export const ATTACHMENT_ACCEPT =
  ".pdf,.doc,.docx,.png,.jpg,.jpeg,.mp3,.m4a,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,audio/mpeg,audio/mp4";

/**
 * attemptSheetPath opens the attempt in its assignment's sheet, where the
 * teacher reads the timeline (D8).
 */
export function attemptSheetPath(event: ContextEvent): string {
  const query = new URLSearchParams({ attempt: event.attemptId });
  return `/teacher/assignments/${encodeURIComponent(event.assignmentId)}?${query.toString()}`;
}
