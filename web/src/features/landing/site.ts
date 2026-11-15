import { group } from "@/features/join/code";
import type { Locale } from "./i18n";

/**
 * The privacy notice the landing site shows and the consultation form sends:
 * its version, which the server stores with each request, and the day it took
 * effect.
 */
export const PRIVACY_NOTICE = {
  version: "2026-11",
  effectiveFrom: "2026-11-15",
} as const;

/** FALLBACK_ORG_NAME names the centre where the build sets no name. */
const FALLBACK_ORG_NAME = "Quizzivy";

/** The sections of the Landing a link can lead to. */
export const SECTIONS = ["features", "integrity", "faq"] as const;

function origin(raw: string | undefined): string {
  let value = raw?.trim() ?? "";
  while (value.endsWith("/")) value = value.slice(0, -1);
  return value === "" ? window.location.origin : value;
}

/**
 * links are the addresses the landing site leads to in the app. Each carries
 * its host, the student's (`VITE_STUDENT_APP_URL`) or the staff's
 * (`VITE_STAFF_APP_URL`): the site is on another one, and has no page of the
 * app. A build that names no host leads to its own origin, which is only
 * right where one origin serves everything.
 */
export const links = {
  studentSignIn: () => `${origin(import.meta.env["VITE_STUDENT_APP_URL"])}/login`,
  staffSignIn: () => `${origin(import.meta.env["VITE_STAFF_APP_URL"])}/login`,
  join: () => `${origin(import.meta.env["VITE_STUDENT_APP_URL"])}/join`,
  joinCode: (code: string) =>
    `${origin(import.meta.env["VITE_STUDENT_APP_URL"])}/join/${group(code)}`,
} as const;

/**
 * Contacts are the centre's lines as the build set them. The landing site
 * never asks the API for them, so the page opens with the app down. An unset
 * line is null and stays hidden.
 */
export type Contacts = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
};

function line(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * contacts reads the centre's lines for `locale`: `VITE_ORG_NAME`,
 * `VITE_ORG_FRONT_DESK_PHONE`, `VITE_ORG_EMAIL` and the address, which is
 * `VITE_ORG_ADDRESS` in Vietnamese and `VITE_ORG_ADDRESS_EN` in English, each
 * standing in for the other when only one is set.
 */
export function contacts(locale: Locale): Contacts {
  const env = import.meta.env;
  const address = line(env["VITE_ORG_ADDRESS"]);
  const addressEn = line(env["VITE_ORG_ADDRESS_EN"]);
  return {
    name: line(env["VITE_ORG_NAME"]) ?? FALLBACK_ORG_NAME,
    phone: line(env["VITE_ORG_FRONT_DESK_PHONE"]),
    email: line(env["VITE_ORG_EMAIL"]),
    address: locale === "en" ? (addressEn ?? address) : (address ?? addressEn),
  };
}

/**
 * siteOrigin is the address the landing site is published at
 * (`VITE_LANDING_URL`), or null where the build names none. Each page names
 * itself by it, so the same page on another host of the Pages project is not
 * taken for the site's own.
 */
export function siteOrigin(): string | null {
  const set = line(import.meta.env["VITE_LANDING_URL"]);
  return set === null ? null : origin(set);
}

/** orgName is the centre's name as the build set it, or null. */
export function orgName(): string | null {
  return line(import.meta.env["VITE_ORG_NAME"]);
}

/** telHref is the `tel:` address of a phone number as the centre writes it. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^0-9+]/g, "")}`;
}
