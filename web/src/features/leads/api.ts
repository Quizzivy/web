import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { ADMIN_SUMMARY_KEY } from "@/features/admin-overview/api";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { components } from "@/lib/api/schema";

/** Lead is a consultation request as the Admin console reads it. */
export type Lead = components["schemas"]["Lead"];
/** LeadStatus is how far a request has been handled. */
export type LeadStatus = components["schemas"]["LeadStatus"];
/** LeadUpdate is the fields a save changes; a field left out keeps its value. */
export type LeadUpdate = components["schemas"]["LeadUpdate"];

/** LeadTab is a tab of the list: one status, or every request. */
export type LeadTab = LeadStatus | "all";

/** LEADS_KEY is the query key every read of the consultation requests sits under. */
export const LEADS_KEY = ["admin", "leads"] as const;

/** LEAD_STATUSES are the statuses in the order a request moves through them. */
export const LEAD_STATUSES: readonly LeadStatus[] = ["new", "contacted", "closed"];

/** LEAD_TABS are the list's tabs in the order they are drawn; the first is the default. */
export const LEAD_TABS: readonly LeadTab[] = [...LEAD_STATUSES, "all"];

/** LEAD_PAGE_SIZES are the rows per page the list offers; the first is the default. */
export const LEAD_PAGE_SIZES = [10, 20, 50] as const;

export type LeadPageSize = (typeof LEAD_PAGE_SIZES)[number];

/** LEAD_SEARCH_MAX is the longest search the contract takes, in characters. */
export const LEAD_SEARCH_MAX = 200;

/** LEAD_NOTE_MAX is the longest note the contract takes, in characters. */
export const LEAD_NOTE_MAX = 1000;

/** LEAD_PAGE_MAX is the highest page number the contract takes. */
export const LEAD_PAGE_MAX = 1_000_000;

/** LeadsParams is what one page of the list asks for; `q` is empty when no search applies. */
export interface LeadsParams {
  readonly tab: LeadTab;
  readonly q: string;
  readonly page: number;
  readonly limit: LeadPageSize;
}

/**
 * leadsQuery reads `GET /admin/leads`: one page of the requests, newest
 * first, of one status or of all, searched by name or phone number.
 */
export function leadsQuery(params: LeadsParams) {
  const { tab, q, page, limit } = params;
  return queryOptions({
    queryKey: [...LEADS_KEY, "list", tab, q, page, limit] as const,
    queryFn: ({ signal }) =>
      api("get", "/admin/leads", {
        query: {
          ...(tab === "all" ? {} : { status: tab }),
          ...(q === "" ? {} : { q }),
          ...(page > 1 ? { page } : {}),
          limit,
        },
        signal,
      }),
  });
}

/**
 * leadQuery reads `GET /admin/leads/{id}`: one request, as the notification
 * email links to it. A 4xx answer is final and not retried.
 */
export function leadQuery(id: string) {
  return queryOptions({
    queryKey: [...LEADS_KEY, "detail", id] as const,
    queryFn: ({ signal }) => api("get", "/admin/leads/{id}", { path: { id }, signal }),
    retry: (count, error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
      count < 3,
  });
}

/** updateLead sends `PATCH /admin/leads/{id}` with the fields that changed, and answers the request as stored. */
export function updateLead(id: string, body: LeadUpdate) {
  return api("patch", "/admin/leads/{id}", { path: { id }, body });
}

/** deleteLead sends `DELETE /admin/leads/{id}`, which removes the request for good. */
export function deleteLead(id: string) {
  return api("delete", "/admin/leads/{id}", { path: { id } });
}

/**
 * refreshLeads has the list, the open request and the sidebar's count of new
 * requests read again, after a save.
 */
export function refreshLeads(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: LEADS_KEY }),
    client.invalidateQueries({ queryKey: ADMIN_SUMMARY_KEY }),
  ]);
}

/**
 * refreshAfterRemoval has the list and the sidebar's count read again once a
 * request is removed. The removed request itself is not read again.
 */
export function refreshAfterRemoval(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: [...LEADS_KEY, "list"] }),
    client.invalidateQueries({ queryKey: ADMIN_SUMMARY_KEY }),
  ]);
}
