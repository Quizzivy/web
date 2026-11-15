import { useTranslation } from "react-i18next";

import { NotFoundArt } from "@/app/pages/errorArt";
import { Button } from "@/components/ui/button";
import { SystemActions, SystemPage } from "../components/SystemPage";
import { Link } from "../components/Link";
import { navigate, usePathname } from "../navigation";

/**
 * NotFoundPage is the landing site's answer to an address it does not have,
 * in the app's words: the path that failed, a way to the first page, and a
 * way back, which leads to the first page when there is nowhere to go back to.
 */
export default function NotFoundPage() {
  const { t } = useTranslation();
  const pathname = usePathname();
  return (
    <SystemPage
      art={<NotFoundArt />}
      title={t("notFound.title")}
      body={t("notFound.body")}
      footer={t("notFound.footnote")}
    >
      <div className="bg-muted mt-4 rounded-md px-3 py-2 text-base">
        <code className="text-muted-fg text-meta font-mono [overflow-wrap:anywhere]">
          {pathname}
        </code>
      </div>
      <SystemActions>
        <Button asChild>
          <Link to="/">{t("notFound.action")}</Link>
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            window.history.length > 1 ? window.history.back() : navigate("/")
          }
        >
          {t("notFound.back")}
        </Button>
      </SystemActions>
    </SystemPage>
  );
}
