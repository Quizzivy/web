import {
  colleagueRef,
  refOf,
  type ColleagueThread,
  type StaffThread,
  type ThreadRef,
} from "./api";

/**
 * Listed is one row of the staff list, from either of the two reads it
 * merges: `listStaffThreads` (class channels and threads with students) or
 * `listColleagueThreads` (threads with colleagues, F2), with the ref it opens.
 */
export type Listed =
  | Readonly<{ source: "staff"; row: StaffThread; ref: ThreadRef }>
  | Readonly<{ source: "colleague"; row: ColleagueThread; ref: ThreadRef }>;

function staffListed(row: StaffThread): Listed | null {
  const ref = refOf(row);
  return ref === null ? null : { source: "staff", row, ref };
}

function colleagueListed(row: ColleagueThread): Listed {
  return { source: "colleague", row, ref: colleagueRef(row) };
}

/** newer tells whether `a`'s last message is after `b`'s; a row with none is the oldest. */
function newer(a: string | null, b: string | null): boolean {
  if (a === null) return false;
  if (b === null) return true;
  return Date.parse(a) > Date.parse(b);
}

/**
 * mergeByLatest is All (Q12): the staff rows and the colleague rows, newest
 * last message first. Each list comes in its own order (newest first, and a
 * class channel nobody has posted in last, by name), which the merge keeps:
 * a colleague row goes before a staff row only when its last message is
 * newer, so equal times keep the staff row first.
 */
export function mergeByLatest(
  staff: readonly StaffThread[],
  colleagues: readonly ColleagueThread[],
): Listed[] {
  const out: Listed[] = [];
  let j = 0;
  for (const row of staff) {
    while (
      j < colleagues.length &&
      newer(colleagues[j]!.lastMessageAt, row.lastMessageAt)
    )
      out.push(colleagueListed(colleagues[j++]!));
    const listed = staffListed(row);
    if (listed !== null) out.push(listed);
  }
  for (; j < colleagues.length; j++) out.push(colleagueListed(colleagues[j]!));
  return out;
}

/** listedOf is every row of one read, as Listed, in its own order. */
export function listedOf(
  staff: readonly StaffThread[],
  colleagues: readonly ColleagueThread[],
): Listed[] {
  return [
    ...staff.flatMap((row) => staffListed(row) ?? []),
    ...colleagues.map(colleagueListed),
  ];
}
