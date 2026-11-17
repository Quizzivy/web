import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/shared/Tooltip";
import { openHref, type RowAct, type SharedRow } from "./sharedRow";

/**
 * SharedRowActions are a row's Open, Make a copy (only with `canCopy`) and the
 * deck's x for Remove from my list, named for a screen reader and on hover.
 */
export function SharedRowActions({
  item,
  canCopy,
  onAct,
}: Readonly<{
  item: SharedRow;
  canCopy: boolean;
  onAct: (act: RowAct, item: SharedRow) => void;
}>) {
  const { t } = useTranslation();
  const remove = t("sharing.withMe.remove");
  return (
    <span className="flex items-center justify-end gap-2">
      <Button asChild variant="outline" size="sm" className="shadow-none">
        <Link to={openHref(item)}>{t("sharing.withMe.open")}</Link>
      </Button>
      {canCopy ? (
        <Button
          variant="outline"
          size="sm"
          className="shadow-none"
          onClick={() => onAct("copy", item)}
        >
          <Copy aria-hidden="true" />
          {t("sharing.withMe.copy")}
        </Button>
      ) : null}
      <Tooltip label={remove}>
        <Button
          variant="ghost"
          size="sm"
          aria-label={remove}
          className="text-muted-fg hover:text-fg w-7.5 px-0"
          onClick={() => onAct("remove", item)}
        >
          <X aria-hidden="true" className="size-3.75" />
        </Button>
      </Tooltip>
    </span>
  );
}
