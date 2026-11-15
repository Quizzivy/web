import { useTranslation } from "react-i18next";

import { BrandLockup } from "@/components/shared/Brand";
import { useLocale } from "../i18n";
import { Link } from "./Link";
import { contacts, links, SECTIONS } from "../site";

const LINK = "text-muted-fg hover:text-fg text-base leading-[1.55] no-underline";

/**
 * LandingFooter is the landing site's footer: the logo and a line about the
 * system, the three columns of links, and the year with the centre's address.
 * The email and the address are left out when the build sets none.
 */
export function LandingFooter() {
  const { t } = useTranslation();
  const { email, address } = contacts(useLocale());
  const year = new Date().getFullYear();

  return (
    <footer data-landing-chrome className="bg-sidebar border-t">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-8 px-[18px] pt-12 pb-7 min-[720px]:grid-cols-2 min-[720px]:px-7 min-[960px]:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
        <div className="flex min-w-0 flex-col gap-3">
          <BrandLockup height={28} theme="auto" className="self-start" />
          <span className="text-muted-fg max-w-[300px] text-base leading-[1.6]">
            {t("landing.footer.about")}
          </span>
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="text-sm leading-[1.55] font-semibold">
            {t("landing.footer.product")}
          </span>
          {SECTIONS.map((id) => (
            <Link key={id} to={`/#${id}`} className={LINK}>
              {t(`landing.nav.${id}`)}
            </Link>
          ))}
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="text-sm leading-[1.55] font-semibold">
            {t("landing.footer.start")}
          </span>
          <a href={links.studentSignIn()} className={LINK}>
            {t("landing.footer.students")}
          </a>
          <a href={links.staffSignIn()} className={LINK}>
            {t("landing.footer.staff")}
          </a>
          <a href={links.join()} className={LINK}>
            {t("landing.footer.join")}
          </a>
          <Link to="/#consult" className={LINK}>
            {t("landing.footer.consult")}
          </Link>
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="text-sm leading-[1.55] font-semibold">
            {t("landing.footer.help")}
          </span>
          <Link to="/status" className={LINK}>
            {t("landing.footer.status")}
          </Link>
          <Link to="/#faq" className={LINK}>
            {t("landing.footer.questions")}
          </Link>
          <Link to="/privacy" className={LINK}>
            {t("landing.footer.privacy")}
          </Link>
          {email && (
            <a href={`mailto:${email}`} className={LINK}>
              {email}
            </a>
          )}
        </div>
      </div>
      <div className="text-muted-fg mx-auto flex max-w-[1200px] flex-wrap justify-between gap-3 border-t px-[18px] pt-4 pb-7 text-sm leading-[1.55] min-[720px]:px-7">
        <span>{t("landing.footer.copyright", { year })}</span>
        {address && <span>{address}</span>}
      </div>
    </footer>
  );
}
