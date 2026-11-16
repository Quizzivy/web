import { reaches } from "@/layouts/teacherNav";
import { useAuthStore } from "@/stores/auth";
import { MESSAGES_PATH, threadPath, type MessagesOpening } from "./api";

/**
 * useOpensMessages tells whether the signed-in user reaches Messages, the
 * rule its sidebar entry shows by (`listStaffThreads`' `workspace.teacher`).
 */
export function useOpensMessages(): boolean {
  return useAuthStore((state) => reaches(state.user, "messages"));
}

/** directThreadPath is the address of the caller's thread with a student. */
export function directThreadPath(studentId: string): string {
  return threadPath({ kind: "direct", id: studentId });
}

/** DIRECT_TAB is the state that opens Messages (`MESSAGES_PATH`) on its Direct tab. */
export const DIRECT_TAB: MessagesOpening = { tab: "direct" };

export { MESSAGES_PATH };

/**
 * mayMessage is the web's reading of whom a teacher may write to. The API
 * opens a direct thread with a student the caller has a thread with, has
 * taught (now or before), or created (`messaging-peer`), and only while the
 * student's account is enabled; a page knows none of the past and no
 * creator, only the classes a Students row lists, which are the caller's own
 * (every class, for `scope.all`), and whether the account is suspended. So
 * "Send message" shows for an enabled student the row places in a class, and
 * on every member of a class the caller opened (a `ClassMember` says nothing
 * of the account); the thread itself answers any refusal (404, or 409
 * MESSAGING_NOT_ALLOWED with its sentence in the composer's place).
 */
export function mayMessage(
  student: Readonly<{ classes: readonly unknown[]; disabledAt: string | null }>,
): boolean {
  return student.disabledAt === null && student.classes.length > 0;
}
