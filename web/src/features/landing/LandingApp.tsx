import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useResolvedTheme } from "@/lib/theme";
import { LandingFooter } from "./components/LandingFooter";
import { useAddress, usePathname } from "./navigation";
import { siteOrigin } from "./site";
import LandingPage from "./pages/LandingPage";

const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const StatusPage = lazy(() => import("./pages/StatusPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

function pageOf(pathname: string): "landing" | "privacy" | "status" | "notFound" {
  const path =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (path === "/") return "landing";
  if (path === "/privacy") return "privacy";
  if (path === "/status") return "status";
  return "notFound";
}

/**
 * CANONICAL is the address a page names as its own, under the site's
 * published address: the Landing and the notice. The status page and the
 * not-found page name none.
 */
const CANONICAL = {
  landing: "/",
  privacy: "/privacy",
  status: null,
  notFound: null,
} as const;

function Framed({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div
      data-landing
      className="bg-bg text-fg text-md flex min-h-svh flex-col leading-[1.55]"
    >
      <div className="flex-1">{children}</div>
      <LandingFooter />
    </div>
  );
}

/**
 * LandingApp is the whole landing site: the Landing at `/`, the privacy
 * notice at `/privacy` and the status page at `/status`, and the not-found
 * page for any other address. The Landing and the notice sit above the site's
 * footer; the other two fill the page. It names the page in the tab, and
 * follows a link to a part of the Landing once that part is on screen, and
 * names the Landing and the notice by the site's published address. There
 * is no sign-in here and no session, and nothing is asked of the API until a
 * person sends the form or opens the status page.
 */
export function LandingApp() {
  useResolvedTheme();
  const { t, i18n } = useTranslation();
  const page = pageOf(usePathname());
  const address = useAddress();

  const titles = {
    landing: t("landing.meta.title"),
    privacy: `${t("privacy.title")} · ${t("app.name")}`,
    status: `${t("landing.footer.status")} · ${t("app.name")}`,
    notFound: `${t("notFound.title")} · ${t("app.name")}`,
  };
  const title = titles[page];

  useEffect(() => {
    document.title = title;
  }, [title, i18n.language]);

  const canonical = CANONICAL[page];
  useEffect(() => {
    const site = siteOrigin();
    const existing = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (site === null || canonical === null) {
      existing?.remove();
      return;
    }
    const link = existing ?? document.createElement("link");
    link.rel = "canonical";
    link.href = `${site}${canonical}`;
    if (!existing) document.head.append(link);
  }, [canonical]);

  useEffect(() => {
    const hash = address.includes("#") ? address.slice(address.indexOf("#") + 1) : "";
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    document.getElementById(hash)?.scrollIntoView();
  }, [address]);

  if (page === "landing")
    return (
      <Framed>
        <LandingPage />
      </Framed>
    );
  return (
    <Suspense fallback={<div className="bg-bg min-h-svh" />}>
      {page === "privacy" && (
        <Framed>
          <PrivacyPage />
        </Framed>
      )}
      {page === "status" && <StatusPage />}
      {page === "notFound" && <NotFoundPage />}
    </Suspense>
  );
}
