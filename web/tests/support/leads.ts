import { http, HttpResponse } from "msw";
import type { components } from "@/lib/api/schema";
import { assertContractRequest, contractJson } from "./contractResponse";
import { adminUser } from "./fixtures";
import { server } from "./server";

export type Lead = components["schemas"]["Lead"];
type LeadUpdate = components["schemas"]["LeadUpdate"];
type Summary = components["schemas"]["AdminSummary"];

const BASE = "http://localhost:8080";

/** REQUEST_ID is a request id the error envelope accepts. */
export const REQUEST_ID = "019535d9-3df7-79fb-b466-fa907fa17f9e";

/** HANDLED_AT is the moment the mocked server records a change of status at. */
export const HANDLED_AT = "2026-11-15T03:00:00Z";

/** leadId is the id of the request numbered `n`. */
export function leadId(n: string): string {
  return `019a0000-0000-7000-8000-${n.padStart(12, "0")}`;
}

/** lead builds a new consultation request numbered `n`, sent in Vietnamese three hours ago, with the given overrides. */
export function lead(n: string, fullName: string, overrides: Partial<Lead> = {}): Lead {
  const sent = new Date(Date.now() - 3 * 3_600_000).toISOString();
  return {
    id: leadId(n),
    fullName,
    phone: `09${n.padStart(8, "0")}`,
    interests: ["ielts"],
    courseFor: "self",
    callTime: "any",
    locale: "vi",
    privacyNoticeVersion: "2026-11",
    consentedAt: sent,
    status: "new",
    note: null,
    handledBy: null,
    handledAt: null,
    createdAt: sent,
    ...overrides,
  };
}

function notFound() {
  return HttpResponse.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "Không tìm thấy.",
        requestId: REQUEST_ID,
      },
    },
    { status: 404 },
  );
}

/**
 * serveLeads answers the four `admin-leads` operations from `rows` as the
 * server would: the list filtered by `status` and by `q` (the name, or the
 * digits of a number), one page of `limit` rows; one request by id, or a 404;
 * a `PATCH` that stores the fields it names, records the caller and the time
 * on a change of status and trims the note; and a `DELETE` that removes the
 * row. It returns the rows as they now stand and every request it saw.
 * `refuse` answers a write instead, for the writes it returns a response for.
 */
export function serveLeads(
  rows: readonly Lead[],
  refuse?: (method: "patch" | "delete") => Response | undefined,
) {
  const seen = {
    rows: [...rows],
    lists: [] as URLSearchParams[],
    reads: [] as string[],
    patches: [] as { id: string; body: LeadUpdate }[],
    deletes: [] as string[],
  };
  server.use(
    http.get(`${BASE}/admin/leads`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      seen.lists.push(params);
      const status = params.get("status");
      const q = (params.get("q") ?? "").toLowerCase();
      const digits = q.replace(/\D/g, "");
      const limit = Number(params.get("limit") ?? 20);
      const page = Number(params.get("page") ?? 1);
      const items = seen.rows.filter(
        (row) =>
          (status === null || row.status === status) &&
          (q === "" ||
            row.fullName.toLowerCase().includes(q) ||
            (digits !== "" && row.phone.includes(digits))),
      );
      return contractJson("/admin/leads", "get", 200, {
        items: items.slice((page - 1) * limit, page * limit),
        page,
        pageSize: limit,
        total: items.length,
      });
    }),
    http.get(`${BASE}/admin/leads/:id`, ({ params }) => {
      const id = String(params["id"]);
      seen.reads.push(id);
      const found = seen.rows.find((row) => row.id === id);
      return found === undefined
        ? notFound()
        : contractJson("/admin/leads/{id}", "get", 200, found);
    }),
    http.patch(`${BASE}/admin/leads/:id`, async ({ params, request }) => {
      const id = String(params["id"]);
      const body = (await request.json()) as LeadUpdate;
      assertContractRequest("/admin/leads/{id}", "patch", body);
      seen.patches.push({ id, body });
      const refused = refuse?.("patch");
      if (refused) return refused;
      const found = seen.rows.find((row) => row.id === id);
      if (found === undefined) return notFound();
      const moved = body.status !== undefined && body.status !== found.status;
      const stored: Lead = {
        ...found,
        ...(body.status === undefined ? {} : { status: body.status }),
        ...(body.note === undefined ? {} : { note: body.note?.trim() || null }),
        ...(moved
          ? {
              handledBy: { id: adminUser.id, name: adminUser.fullName },
              handledAt: HANDLED_AT,
            }
          : {}),
      };
      seen.rows = seen.rows.map((row) => (row.id === id ? stored : row));
      return contractJson("/admin/leads/{id}", "patch", 200, stored);
    }),
    http.delete(`${BASE}/admin/leads/:id`, ({ params }) => {
      const id = String(params["id"]);
      seen.deletes.push(id);
      const refused = refuse?.("delete");
      if (refused) return refused;
      if (!seen.rows.some((row) => row.id === id)) return notFound();
      seen.rows = seen.rows.filter((row) => row.id !== id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return seen;
}

/**
 * serveAdminSummary answers `GET /admin/summary` with `answer`, or with what
 * `answer` returns at each read, and counts the reads.
 */
export function serveAdminSummary(answer: Summary | (() => Summary)) {
  const seen = { asked: 0 };
  server.use(
    http.get(`${BASE}/admin/summary`, () => {
      seen.asked += 1;
      return contractJson(
        "/admin/summary",
        "get",
        200,
        typeof answer === "function" ? answer() : answer,
      );
    }),
  );
  return seen;
}
