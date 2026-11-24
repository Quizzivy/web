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
export type ColleagueThread = components["schemas"]["ColleagueThread"];
export type ColleagueDirectThread = components["schemas"]["ColleagueDirectThread"];

/**
 * ThreadRef names one conversation of the staff side: a class's channel by its
 * class, a direct thread by its student, a colleague thread (F2) by the other
 * staff member. A direct or colleague thread is addressed by its counterpart
 * and exists from its first message, so a ref can name a thread nobody has
 * written in yet.
 */
export type ThreadRef = Readonly<{
  kind: "class" | "direct" | "colleague";
  id: string;
}>;

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

/** colleagueThreadsKey is the query key of the colleague threads, for a search or none. */
export function colleagueThreadsKey(q: string) {
  return [...STAFF_MESSAGES_KEY, "colleagues", q] as const;
}

/** LIST_KEYS head the two lists Messages merges: the threads and the colleague threads. */
export const LIST_KEYS = [
  [...STAFF_MESSAGES_KEY, "threads"],
  [...STAFF_MESSAGES_KEY, "colleagues"],
] as const;

/** staffThreadKey is the query key of one open thread. */
export function staffThreadKey(ref: ThreadRef) {
  return [...STAFF_MESSAGES_KEY, "thread", ref.kind, ref.id] as const;
}

/** threadPath is the address that opens `ref` on the staff Messages page. */
export function threadPath(ref: ThreadRef): string {
  const segment = { class: "class", direct: "student", colleague: "colleagues" }[
    ref.kind
  ];
  return `/teacher/messages/${segment}/${encodeURIComponent(ref.id)}`;
}

/**
 * MessagesOpening is what a link into Messages may hand the page as its
 * location's state: `tab` is the list's tab to start on, with no
 * conversation open, as the Students page's bulk Message opens Direct for
 * several students.
 */
export type MessagesOpening = Readonly<{
  tab?: "all" | "direct" | "classes" | "colleagues";
}>;

/** MESSAGES_PATH is Messages with no thread open. */
export const MESSAGES_PATH = "/teacher/messages";

/** refOf is the ref a row of the list opens. */
export function refOf(thread: StaffThread): ThreadRef | null {
  const { kind, classId, studentId } = thread.thread;
  const id = kind === "class" ? classId : studentId;
  return id === null ? null : { kind, id };
}

/** colleagueRef is the ref a colleague row opens. */
export function colleagueRef(row: ColleagueThread): ThreadRef {
  return { kind: "colleague", id: row.colleagueId };
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

/**
 * listColleagueThreads reads the caller's threads with colleagues (F2), newest
 * first, and with `q` the matching ones followed by the colleagues the caller
 * has no thread with (`candidate`).
 */
export function listColleagueThreads(q: string, signal?: AbortSignal) {
  const query = q === "" ? {} : { q };
  return api(
    "get",
    "/teacher/messages/colleagues",
    signal ? { query, signal } : { query },
  );
}

export function getColleagueThread(
  colleagueId: string,
  cursor: Cursor = {},
  signal?: AbortSignal,
) {
  const options = { path: { colleagueId }, query: cursorQuery(cursor) };
  return api(
    "get",
    "/teacher/messages/colleagues/{colleagueId}",
    signal ? { ...options, signal } : options,
  );
}

/** postStaffMessage posts to a direct or colleague thread, or announces to a class. */
export function postStaffMessage(ref: ThreadRef, body: StaffMessagePost) {
  if (ref.kind === "colleague")
    return api("post", "/teacher/messages/colleagues/{colleagueId}", {
      path: { colleagueId: ref.id },
      body,
    });
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

export type MessageRecipient = components["schemas"]["MessageRecipient"];

/** RecipientAudience is which of New message's lists to read: students or colleagues. */
export type RecipientAudience = "students" | "colleagues";

/**
 * RecipientFilter is the students' filter of New message: every enabled
 * student, the students of the caller's classes (`mine`), one class of the
 * caller's, or the students in no class. Colleagues take none.
 */
export type RecipientFilter =
  | Readonly<{ kind: "all" }>
  | Readonly<{ kind: "mine" }>
  | Readonly<{ kind: "class"; classId: string }>
  | Readonly<{ kind: "none" }>;

/** RECIPIENT_PAGE is how many rows one read of New message's list brings. */
export const RECIPIENT_PAGE = 30;

/** recipientsKey is the query key of New message's list for one audience, filter and search. */
export function recipientsKey(
  audience: RecipientAudience,
  filter: RecipientFilter,
  q: string,
) {
  return [...STAFF_MESSAGES_KEY, "recipients", audience, filter, q] as const;
}

/**
 * listMessageRecipients reads one page of the people New message offers:
 * every enabled student (narrowed by `filter`: at most one of `mine`,
 * `classId` and `inNoClass`, as the contract allows) or every colleague, by
 * name, matched by `q`, from `cursor`.
 */
export function listMessageRecipients(
  audience: RecipientAudience,
  filter: RecipientFilter,
  q: string,
  cursor: string | null,
  signal?: AbortSignal,
) {
  const narrow =
    audience === "colleagues"
      ? {}
      : {
          ...(filter.kind === "mine" ? { mine: true } : {}),
          ...(filter.kind === "class" ? { classId: filter.classId } : {}),
          ...(filter.kind === "none" ? { inNoClass: true } : {}),
        };
  const query = {
    audience,
    limit: RECIPIENT_PAGE,
    ...narrow,
    ...(q === "" ? {} : { q }),
    ...(cursor === null ? {} : { cursor }),
  };
  return api(
    "get",
    "/teacher/messages/recipients",
    signal ? { query, signal } : { query },
  );
}

/** markStaffThreadRead moves the caller's read pointer of `ref` to `messageId`. */
export function markStaffThreadRead(ref: ThreadRef, messageId: string) {
  const body = { lastReadMessageId: messageId };
  if (ref.kind === "colleague")
    return api("post", "/teacher/messages/colleagues/{colleagueId}/read", {
      path: { colleagueId: ref.id },
      body,
    });
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
