import { describe, expect, it } from "vitest";
import {
  isPublic,
  jsonResponseSchema,
  loadSpec,
  operations,
  propertyNames,
  resolveRef,
  type Json,
} from "@tests/support/openapi";
import {
  MAX_AUDIO_BYTES,
  MAX_DURATION_MS,
  MAX_IMAGE_BYTES,
} from "@/features/media/limits";

/**
 * The web's half of the contract checks, against the pinned
 * `@quizzivy/sdk/openapi.yaml`. The structural invariants (references, the
 * student-payload boundary, x-permission, conventions) run in Quizzivy/sdk on
 * every contract PR (D-082 (i)); what stays here compares the contract with
 * this app's own code, and tests the helpers the other web tests use.
 */

const doc = loadSpec();
const ops = operations(doc);

describe("the checkers themselves", () => {
  it("propertyNames finds a key nested behind refs, arrays and allOf", () => {
    const synthetic = {
      components: {
        schemas: {
          Leaf: { type: "object", properties: { isCorrect: { type: "boolean" } } },
          Mid: { type: "array", items: { $ref: "#/components/schemas/Leaf" } },
          Root: {
            allOf: [
              {
                type: "object",
                properties: { nested: { $ref: "#/components/schemas/Mid" } },
              },
            ],
          },
        },
      },
    };
    const names = propertyNames(synthetic, synthetic.components.schemas.Root);
    expect(names.has("isCorrect")).toBe(true);
  });

  it("propertyNames terminates on a circular $ref", () => {
    const synthetic = {
      components: {
        schemas: {
          Node: {
            type: "object",
            properties: {
              child: { $ref: "#/components/schemas/Node" },
              id: { type: "string" },
            },
          },
        },
      },
    };
    const names = propertyNames(synthetic, synthetic.components.schemas.Node);
    expect(names.has("id")).toBe(true);
  });

  it("resolveRef reports a dangling reference", () => {
    expect(resolveRef({ components: {} }, "#/components/schemas/Nope")).toBeUndefined();
  });

  it("isPublic recognises both forms of an unauthenticated operation", () => {
    expect(isPublic({ security: [] })).toBe(true);
    expect(isPublic({ security: [{}] })).toBe(true);
    expect(isPublic({ security: [{ bearerAuth: [] }] })).toBe(false);
    expect(isPublic({})).toBe(false);
  });

  it("operations() ignores non-method keys on a path item", () => {
    const found = operations({
      paths: { "/x": { parameters: [{ name: "id" }], get: { operationId: "getX" } } },
    });
    expect(found.map((o) => o.method)).toEqual(["get"]);
  });
});

describe("§11.1's upload limits agree across the layers", () => {
  const asset = resolveRef(doc, "#/components/schemas/MediaAsset") as Record<
    string,
    Json
  >;
  const properties = asset["properties"] as Record<string, Record<string, Json>>;
  const limits = asset["x-media-limits"] as Record<string, Json>;

  it("the three constants are MediaAsset's x-media-limits", () => {
    expect(limits).toEqual({
      audioBytes: MAX_AUDIO_BYTES,
      imageBytes: MAX_IMAGE_BYTES,
      durationMs: MAX_DURATION_MS,
    });
  });

  it("MAX_AUDIO_BYTES matches MediaAsset.bytes.maximum", () => {
    expect(properties["bytes"]?.["maximum"]).toBe(MAX_AUDIO_BYTES);
  });

  it("MAX_DURATION_MS matches MediaAsset.durationMs.maximum", () => {
    expect(properties["durationMs"]?.["maximum"]).toBe(MAX_DURATION_MS);
  });

  it("the transport lets through the largest audio and its multipart framing", () => {
    const upload = ops.find((o) => o.op["operationId"] === "uploadMedia");
    expect(upload?.op["x-max-body-bytes"]).toBe(MAX_AUDIO_BYTES + 128 * 1024);
  });
});

/** Every component schema a node reaches through its `$ref`s, by name. */
function schemasReached(node: Json, seen = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const kid of node) schemasReached(kid, seen);
  } else if (node && typeof node === "object") {
    const ref: unknown = node.$ref;
    if (typeof ref === "string" && !seen.has(ref)) {
      seen.add(ref);
      schemasReached(resolveRef(doc, ref), seen);
    }
    for (const kid of Object.values(node)) schemasReached(kid, seen);
  }
  return new Set([...seen].map((ref) => ref.replace("#/components/schemas/", "")));
}

/** The JSON schemas of an operation's 2xx answers. */
function successSchemas(op: Json): Json[] {
  return Object.entries(op.responses ?? {})
    .filter(([status]) => status.startsWith("2"))
    .map(([status]) => jsonResponseSchema(op, status))
    .filter((schema) => schema !== undefined);
}

function successNames(op: Json): Set<string> {
  const names = new Set<string>();
  for (const schema of successSchemas(op)) {
    for (const name of propertyNames(doc, schema)) names.add(name);
  }
  return names;
}

describe("a student's Messages carry nothing of the staff side (T-R7.10b, T-R7.21)", () => {
  // The grading keys no /app/* answer may carry, the staff side's "Seen by"
  // and attempt events, any count of a class's members, an email, and the
  // staff sender's side (D17, DG-91, §13.5).
  const BANNED = [
    "isCorrect",
    "sampleAnswer",
    "acceptedAnswers",
    "transcript",
    "transcripts",
    "teacherNote",
    "seenBy",
    "contextEvents",
    "studentCount",
    "memberCount",
    "email",
    "side",
  ];
  const STAFF_SCHEMAS = [
    "StaffMessage",
    "StaffMessageSender",
    "SeenBy",
    "ContextEvent",
    "StaffThread",
    "StaffDirectThreadPeer",
    "StaffClassThreadClass",
  ];
  const student = ops.filter((o) => o.path.startsWith("/app/messages/"));

  it("walks the seven operations and reaches what they answer", () => {
    expect(student.length).toBeGreaterThanOrEqual(7);
    const reached = new Set<string>();
    for (const o of student) for (const name of successNames(o.op)) reached.add(name);
    for (const key of [
      "threads",
      "messages",
      "sender",
      "teacher",
      "readOnly",
      "classNames",
      "former",
      "canPost",
      "preview",
      "unread",
      "mine",
    ]) {
      expect(reached, `the walk never reaches ${key}`).toContain(key);
    }
  });

  it.each(student.map((o) => [`${o.method.toUpperCase()} ${o.path}`, o] as const))(
    "%s answers no banned key and no staff schema",
    (_name, o) => {
      const names = successNames(o.op);
      expect(BANNED.filter((key) => names.has(key))).toEqual([]);
      const schemas = new Set<string>();
      for (const schema of successSchemas(o.op)) {
        for (const s of schemasReached(schema)) schemas.add(s);
      }
      expect(STAFF_SCHEMAS.filter((s) => schemas.has(s))).toEqual([]);
    },
  );

  it("StaffMessage and StudentMessage are distinct, the student's without seenBy and with a MessageSender", () => {
    const staff = resolveRef(doc, "#/components/schemas/StaffMessage") as Json;
    const pupil = resolveRef(doc, "#/components/schemas/StudentMessage") as Json;
    expect(staff).toBeDefined();
    expect(pupil).toBeDefined();
    expect(pupil).not.toBe(staff);
    expect(Object.keys(staff.properties)).toContain("seenBy");
    expect(Object.keys(pupil.properties)).not.toContain("seenBy");
    expect(pupil.properties.sender.$ref).toBe("#/components/schemas/MessageSender");
    expect(staff.properties.sender.$ref).not.toBe(pupil.properties.sender.$ref);
    const sender = resolveRef(doc, "#/components/schemas/MessageSender") as Json;
    expect(Object.keys(sender.properties)).not.toContain("side");
  });

  it("the walk finds the staff keys where they are, so it would find a leak", () => {
    const find = (id: string) => ops.find((o) => o.op["operationId"] === id);
    const thread = find("getStaffDirectThread");
    const post = find("postStaffDirectMessage");
    expect(thread && successNames(thread.op)).toContain("contextEvents");
    expect(thread && successNames(thread.op)).toContain("side");
    expect(post && successNames(post.op)).toContain("side");
  });
});
