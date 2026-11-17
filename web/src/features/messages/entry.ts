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
 * mayMessage tells whether the caller may write to a student: the API's own
 * answer, `canMessage` on a Students row (`StudentRow`) or a class's member
 * (`ClassMember`). The server computes it from the same rule the thread
 * enforces (`messaging-peer`): an existing thread, or a tie (a class of the
 * caller's, now or before, or an account the caller created), with the
 * account enabled and still a student; `scope.all` does not widen it. The
 * thread still answers a refusal that came after the page loaded (404, or
 * 409 MESSAGING_NOT_ALLOWED with its sentence in the composer's place).
 */
export function mayMessage(person: Readonly<{ canMessage: boolean }>): boolean {
  return person.canMessage;
}
