import { useTranslation } from "react-i18next";
import { otherHostSignIn } from "@/app/host";

/**
 * OtherHostLink leads an account refused here (`isWrongHost`, §5.8) to the
 * sign-in page of the host it belongs at. It draws nothing where one host
 * serves every page.
 */
export function OtherHostLink() {
  const { t } = useTranslation();
  const other = otherHostSignIn();
  if (!other) return null;
  return (
    <a href={other.href} className="font-medium underline underline-offset-[3px]">
      {t("login.otherHost", { host: other.host })}
    </a>
  );
}
