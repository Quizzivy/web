import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ArrowLeft, UserX } from "lucide-react";
import { EmptyState } from "@/components/shared/ListState";
import { Button } from "@/components/ui/button";
import { nfc } from "@/lib/nfc";

/**
 * AccessRemovedNotice is the block that takes the builder's place when a save
 * answers 404 to a caller who is not the test's owner: the owner stopped
 * sharing it (R7 Access Modes, "Sharing stopped"). It says who, that the
 * last changes were not saved and that assignments keep working, and leads
 * back to Shared with me.
 */
export function AccessRemovedNotice({ ownerName }: Readonly<{ ownerName: string }>) {
  const { t } = useTranslation();
  return (
    <div role="alert">
      <EmptyState
        icon={UserX}
        hint={t("builder.revoked.body")}
        action={
          <Button
            asChild
            variant="outline"
            className="shadow-card h-9 max-[1023px]:h-11"
          >
            <Link to="/teacher/shared-with-me">
              <ArrowLeft aria-hidden="true" />
              {t("sets.backToShared")}
            </Link>
          </Button>
        }
      >
        {t("builder.revoked.title", { name: nfc(ownerName) })}
      </EmptyState>
    </div>
  );
}
