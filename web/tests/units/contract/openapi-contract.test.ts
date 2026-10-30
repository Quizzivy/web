import { describe, expect, it } from "vitest";
import {
  isPublic,
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
