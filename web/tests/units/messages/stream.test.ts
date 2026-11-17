import { describe, expect, it } from "vitest";
import i18n from "@/lib/i18n";
import { buildStream, merged } from "@/features/messages/stream";
import { folded } from "@/features/messages/useThread";
import { message, uid } from "./support";

const t = i18n.getFixedT("vi");
// 21:00 in Hồ Chí Minh City on Monday 16 November 2026.
const NOW = new Date("2026-11-16T14:00:00Z");

function at(id: number, iso: string) {
  return message(id, id % 2 === 0, `#${id}`, { createdAt: iso });
}

describe("the stream of a thread", () => {
  it("heads each day with a pill: today, yesterday, the weekday, then the date", () => {
    const stream = buildStream(
      [
        at(1, "2026-10-01T03:00:00Z"),
        at(2, "2026-11-12T03:00:00Z"),
        at(3, "2026-11-15T03:00:00Z"),
        at(4, "2026-11-16T03:00:00Z"),
        at(5, "2026-11-16T04:00:00Z"),
      ],
      [],
      [],
      { now: NOW, locale: "vi", t, complete: true },
    );
    expect(
      stream.filter((e) => e.kind === "day").map((e) => e.kind === "day" && e.label),
    ).toEqual(["01/10", "Thứ năm", "Hôm qua", "Hôm nay"]);
    expect(stream.map((e) => e.kind)).toEqual([
      "day",
      "message",
      "day",
      "message",
      "day",
      "message",
      "day",
      "message",
      "message",
    ]);
  });

  it("puts an attempt event at its moment, and holds back one older than what is loaded", () => {
    const event = (n: number, iso: string) => ({
      attemptId: uid(800 + n),
      assignmentId: uid(700),
      title: "Mid-term Reading Mock",
      focusLost: 3,
      at: iso,
    });
    const messages = [at(10, "2026-11-16T13:16:00Z"), at(11, "2026-11-16T13:20:00Z")];
    const events = [event(1, "2026-11-16T13:14:00Z"), event(2, "2026-11-16T13:18:00Z")];
    const partial = buildStream(messages, events, [], {
      now: NOW,
      locale: "vi",
      t,
      complete: false,
    });
    expect(partial.map((e) => e.key)).toEqual([
      expect.stringMatching(/^day:/),
      uid(10),
      `event:${uid(802)}`,
      uid(11),
    ]);
    const whole = buildStream(messages, events, [], {
      now: NOW,
      locale: "vi",
      t,
      complete: true,
    });
    expect(whole.map((e) => e.key).slice(1)).toEqual([
      `event:${uid(801)}`,
      uid(10),
      `event:${uid(802)}`,
      uid(11),
    ]);
  });

  it("keeps the reader's unsent messages last", () => {
    const stream = buildStream(
      [at(10, "2026-11-16T13:16:00Z")],
      [],
      [
        {
          clientId: "c1",
          body: "Đang gửi",
          attachment: null,
          createdAt: "2026-11-16T13:30:00Z",
          status: "sending",
        },
      ],
      { now: NOW, locale: "vi", t, complete: true },
    );
    expect(stream.at(-1)).toMatchObject({ kind: "pending", key: "pending:c1" });
  });

  it("holds each message once, in uuidv7 order, and a poll moves latestId to the newest held", () => {
    const one = message(1, true, "1");
    const two = message(2, false, "2");
    const three = message(3, false, "3");
    expect(merged([two, one], [three, two]).map((m) => m.id)).toEqual([
      one.id,
      two.id,
      three.id,
    ]);

    const held = folded(
      undefined,
      {
        head: "h",
        page: { messages: [one, two], nextBefore: uid(0), latestId: two.id },
      },
      true,
    );
    expect(held).toMatchObject({ nextBefore: uid(0), latestId: two.id });
    const polled = folded(
      held,
      { head: "h2", page: { messages: [three], nextBefore: null, latestId: three.id } },
      false,
    );
    expect(polled.messages.map((m) => m.id)).toEqual([one.id, two.id, three.id]);
    expect(polled).toMatchObject({
      head: "h2",
      nextBefore: uid(0),
      latestId: three.id,
      after: three.id,
    });

    // A send joins the stream without moving the poll's cursor; an empty
    // poll keeps the cursor where the last read left it.
    const own = message(9, true, "own");
    const sent = {
      ...polled,
      messages: merged(polled.messages, [own]),
      latestId: own.id,
    };
    const quiet = folded(
      sent,
      { head: "h3", page: { messages: [], nextBefore: null, latestId: own.id } },
      false,
    );
    expect(quiet).toMatchObject({ latestId: own.id, after: three.id });
  });
});
