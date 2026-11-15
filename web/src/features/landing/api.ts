import type { components } from "@/lib/api/schema";

/**
 * LeadInput is the body of `POST /public/leads` (`submitLead`): what the
 * consultation form sends. `website` is a field no person fills.
 */
export type LeadInput = {
  fullName: string;
  phone: string;
  interests: ("ielts" | "toeic" | "communication" | "kids" | "business")[];
  courseFor: "self" | "child" | "company";
  callTime: "any" | "morning" | "afternoon" | "evening";
  locale: "vi" | "en";
  consent: true;
  privacyNoticeVersion: "2026-11";
  website?: string;
};

const BASE_URL: string =
  import.meta.env["VITE_API_BASE_URL"] ?? "http://localhost:8080";

/** PublicStatus is the answer of `GET /public/status`. */
export type PublicStatus = components["schemas"]["PublicStatus"];

/**
 * LeadOutcome is how sending a consultation request ended: received, refused
 * for too many requests with the minutes to wait, or not sent.
 */
export type LeadOutcome =
  { kind: "sent" } | { kind: "limited"; minutes: number } | { kind: "failed" };

function address(path: string): string {
  const origin = BASE_URL.endsWith("/") ? BASE_URL.slice(0, -1) : BASE_URL;
  return `${origin}${path}`;
}

function minutesToWait(header: string | null): number {
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.max(1, Math.ceil(seconds / 60))
    : 1;
}

/**
 * submitLead sends a consultation request. The landing site calls the API
 * from another origin and holds no session, so the request carries no
 * credentials. It never rejects.
 */
export async function submitLead(input: LeadInput): Promise<LeadOutcome> {
  try {
    const response = await fetch(address("/public/leads"), {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (response.status === 202) return { kind: "sent" };
    if (response.status === 429)
      return {
        kind: "limited",
        minutes: minutesToWait(response.headers.get("Retry-After")),
      };
    return { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

/**
 * readPublicStatus asks `GET /public/status` past the browser's cache and
 * without credentials. It rejects when the server gives no answer, or one
 * that is not the status.
 */
export async function readPublicStatus(signal?: AbortSignal): Promise<PublicStatus> {
  const response = await fetch(address("/public/status"), {
    credentials: "omit",
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`status ${response.status}`);
  return (await response.json()) as PublicStatus;
}
