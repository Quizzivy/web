import type { components } from "@/lib/api/schema";

type Calendar = components["schemas"]["Calendar"];
type ClassSession = components["schemas"]["ClassSession"];
type ClassListItem = components["schemas"]["ClassListItem"];

/** The deck's classes (`CAL_EV`), with the rooms the student's week gives them. */
export const DECK_CLASSES = {
  evening: {
    id: "018f0000-0000-7000-8000-0000000000c1",
    name: "IELTS 6.5 Evening",
    room: "Phòng 2",
  },
  foundation: {
    id: "018f0000-0000-7000-8000-0000000000c2",
    name: "IELTS Foundation A",
    room: "Phòng 1",
  },
  toeic: {
    id: "018f0000-0000-7000-8000-0000000000c3",
    name: "TOEIC 600 Weekend",
    room: null,
  },
  kids: {
    id: "018f0000-0000-7000-8000-0000000000c4",
    name: "Kids Starters B",
    room: null,
  },
} as const;

type DeckClass = keyof typeof DECK_CLASSES;

const SERIES_ID: Record<DeckClass, string> = {
  evening: "019535d9-3df7-79fb-b466-fa907fa170e1",
  foundation: "019535d9-3df7-79fb-b466-fa907fa170e2",
  toeic: "019535d9-3df7-79fb-b466-fa907fa170e3",
  kids: "019535d9-3df7-79fb-b466-fa907fa170e4",
};

/** The deck's assignments, by the title its events carry. */
export const DECK_ASSIGNMENTS = {
  reading: "019535d9-3df7-79fb-b466-fa907fa170a1",
  listening: "019535d9-3df7-79fb-b466-fa907fa170a2",
  vocabulary: "019535d9-3df7-79fb-b466-fa907fa170a3",
} as const;

function addDays(date: string, days: number): string {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** utcOf is the instant of a wall-clock time in Ho Chi Minh City, seven hours ahead of UTC. */
function utcOf(date: string, hours: number): string {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  const minutes = Math.round(hours * 60) - 7 * 60;
  return new Date(Date.UTC(y, m - 1, d, 0, minutes))
    .toISOString()
    .replace(".000Z", "Z");
}

/**
 * deckSession is one occurrence of a deck class's weekly series on `monday +
 * day`, at `hours` (18.5 is 18:30) for `length` hours.
 */
export function deckSession(
  monday: string,
  day: number,
  hours: number,
  length: number,
  klass: DeckClass,
  change: Partial<ClassSession> = {},
): ClassSession {
  const date = addDays(monday, day);
  const { id, name, room } = DECK_CLASSES[klass];
  const whole = Math.round(hours * 60);
  return {
    id: `${SERIES_ID[klass]}.${date.replaceAll("-", "")}`,
    classId: id,
    className: name,
    seriesId: SERIES_ID[klass],
    series: {
      id: SERIES_ID[klass],
      classId: id,
      weekday: day + 1,
      startTime: `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`,
      durationMinutes: Math.round(length * 60),
      room,
      startsOn: addDays(monday, day - 21),
      endsOn: null,
      timeZone: "Asia/Ho_Chi_Minh",
    },
    date,
    startsAt: utcOf(date, hours),
    durationMinutes: Math.round(length * 60),
    room,
    note: null,
    cancelled: false,
    changed: false,
    hasAttendance: false,
    ...change,
  };
}

/**
 * deckWeek is the deck's Calendar (`CAL_EV`) for the week starting on
 * `monday`: eight sessions of four classes, and four openings and closings.
 * With `grown`, the week also holds a 07:00 session on Monday, so the grid
 * grows an hour above 08:00.
 */
export function deckWeek(monday: string, options: { grown?: boolean } = {}): Calendar {
  const at = (day: number, hours: number) => utcOf(addDays(monday, day), hours);
  const sessions = [
    ...(options.grown ? [deckSession(monday, 0, 7, 1.5, "kids")] : []),
    deckSession(monday, 0, 18, 1.5, "evening"),
    deckSession(monday, 1, 17.5, 1.5, "foundation"),
    deckSession(monday, 2, 18, 1.5, "evening"),
    deckSession(monday, 3, 17.5, 1.5, "foundation"),
    deckSession(monday, 4, 18, 1.5, "evening"),
    deckSession(monday, 5, 9, 2, "toeic"),
    deckSession(monday, 5, 14, 1.5, "kids"),
    deckSession(monday, 6, 9, 2, "toeic"),
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return {
    sessions,
    assignmentEvents: [
      {
        kind: "opens",
        at: at(2, 8),
        assignmentId: DECK_ASSIGNMENTS.reading,
        title: "Reading Mock",
        classNames: ["IELTS 6.5 Evening"],
      },
      {
        kind: "closes",
        at: at(2, 21),
        assignmentId: DECK_ASSIGNMENTS.reading,
        title: "Reading Mock",
        classNames: ["IELTS 6.5 Evening"],
      },
      {
        kind: "closes",
        at: at(3, 8),
        assignmentId: DECK_ASSIGNMENTS.listening,
        title: "Listening",
        classNames: ["IELTS Foundation A"],
      },
      {
        kind: "closes",
        at: at(4, 20.5),
        assignmentId: DECK_ASSIGNMENTS.vocabulary,
        title: "Vocabulary quiz",
        classNames: ["IELTS 6.5 Evening"],
      },
    ],
    terms: [
      {
        id: "019535d9-3df7-79fb-b466-fa907fa170f1",
        name: "Học kỳ 1",
        startsOn: addDays(monday, -21),
        endsOn: addDays(monday, 88),
      },
    ],
  };
}

/** deckClass is a deck class as `listClasses` returns it, with its own room. */
export function deckClass(klass: DeckClass): ClassListItem {
  const { id, name, room } = DECK_CLASSES[klass];
  return {
    id,
    name,
    description: null,
    scheduleLabel: null,
    room,
    ownRoom: room,
    schedule: { slots: [], label: null },
    studentCount: 18,
    openAssignmentCount: 1,
    selfJoinEnabled: true,
    archivedAt: null,
    joinCode: null,
    createdAt: "2025-08-03T03:00:00Z",
    averageScore: null,
  };
}
