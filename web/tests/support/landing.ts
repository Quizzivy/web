import { createElement, type ReactElement } from "react";
import { render } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { vi } from "vitest";
import { landingI18n, type Locale } from "@/features/landing/i18n";
import en from "@/features/landing/locales/en.json";

/** CENTRE is the centre's lines as a build of the landing site sets them. */
export const CENTRE = {
  name: "Quizzivy English Centre",
  phone: "036 321 6199",
  email: "hello@quizzivy.com",
  address: "TP. Hồ Chí Minh",
  addressEn: "Ho Chi Minh City",
} as const;

/** STUDENT_HOST and STAFF_HOST are the app's two hosts the landing site links to. */
export const STUDENT_HOST = "https://my.quizzivy.com";
export const STAFF_HOST = "https://portal.quizzivy.com";

/**
 * landingBuild sets the build values of the landing site: the app's two hosts
 * and the centre's lines; `unset` names the lines the build leaves out.
 */
export function landingBuild(
  unset: readonly ("name" | "phone" | "email" | "address")[] = [],
) {
  vi.stubEnv("VITE_STUDENT_APP_URL", STUDENT_HOST);
  vi.stubEnv("VITE_STAFF_APP_URL", STAFF_HOST);
  vi.stubEnv("VITE_ORG_NAME", unset.includes("name") ? "" : CENTRE.name);
  vi.stubEnv("VITE_ORG_FRONT_DESK_PHONE", unset.includes("phone") ? "" : CENTRE.phone);
  vi.stubEnv("VITE_ORG_EMAIL", unset.includes("email") ? "" : CENTRE.email);
  vi.stubEnv("VITE_ORG_ADDRESS", unset.includes("address") ? "" : CENTRE.address);
  vi.stubEnv("VITE_ORG_ADDRESS_EN", unset.includes("address") ? "" : CENTRE.addressEn);
}

/** readIn puts the landing site in `locale`, its English strings loaded as a switch loads them. */
export async function readIn(locale: Locale): Promise<void> {
  landingI18n.addResourceBundle("en", "translation", en, true, true);
  await landingI18n.changeLanguage(locale);
}

/** renderLanding renders a piece of the landing site with the site's own strings. */
export function renderLanding(ui: ReactElement) {
  return render(createElement(I18nextProvider, { i18n: landingI18n }, ui));
}

/** openAt sets the address the landing site reads its page from. */
export function openAt(address: string): void {
  window.history.replaceState(null, "", address);
}
