import {
  LEAD_PAGE_MAX,
  LEAD_PAGE_SIZES,
  LEAD_SEARCH_MAX,
  LEAD_TABS,
  type LeadPageSize,
  type LeadTab,
} from "@/features/leads/api";

/** tabOf is the tab a URL names, the first, New, for an absent or unknown one. */
export function tabOf(raw: string | null): LeadTab {
  return LEAD_TABS.find((tab) => tab === raw) ?? LEAD_TABS[0]!;
}

/** tabParam is what the URL holds for a tab: nothing for the first. */
export function tabParam(tab: string): string | null {
  return tab === LEAD_TABS[0] ? null : tab;
}

/** limitOf is the page size the list asks for, the default when `size` is not one it offers. */
export function limitOf(size: number): LeadPageSize {
  return LEAD_PAGE_SIZES.find((option) => option === size) ?? LEAD_PAGE_SIZES[0];
}

/** pageOf is the page the list asks for: the URL's page, no higher than the contract takes. */
export function pageOf(page: number): number {
  return Math.min(page, LEAD_PAGE_MAX);
}

/**
 * searchOf is the text the list sends as `q`: what was typed in NFC without
 * the space around it, cut to LEAD_SEARCH_MAX characters.
 */
export function searchOf(typed: string): string {
  return [...typed.normalize("NFC").trim()].slice(0, LEAD_SEARCH_MAX).join("").trim();
}

/**
 * phoneText is a stored number as a person reads it: a ten-digit Vietnamese
 * number in groups of three, three and four, and any other as it is stored.
 */
export function phoneText(digits: string): string {
  return /^0\d{9}$/.test(digits)
    ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
    : digits;
}
