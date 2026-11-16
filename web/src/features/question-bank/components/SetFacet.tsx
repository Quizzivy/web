import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Library, UsersRound } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { QuestionSetSummary } from "@/features/question-bank/api";
import { useLocale } from "@/lib/i18n/useLocale";

/** SHOWN is how many sets the group lists before "Show all". */
const SHOWN = 5;

const ROW =
  "hover:bg-hover -mx-2 flex min-h-8 items-center gap-2 rounded-sm px-2 py-1 text-sm leading-normal max-[1023px]:min-h-11";

const QUIET =
  "text-muted-fg hover:text-fg cursor-pointer text-meta underline underline-offset-4 max-[1023px]:min-h-11";

/** setHref is a set's own page. */
function setHref(id: string): string {
  return `/teacher/question-bank/sets/${id}`;
}

/**
 * SetFacet is the Sets group the bank's filter aside opens with (DG-90,
 * interim; the proposal's Q3): the caller's own sets, most recently changed
 * first, each a link to its page with a people mark when it is shared and how
 * many questions it holds. Five show, and "Show all" lists the rest in place.
 * With no set yet it says how to make the first one; a set starts from a
 * selection, so there is no button. While the sets load it draws three bars,
 * and a failed read says so with Retry.
 */
export function SetFacet({
  sets,
  failed,
  onRetry,
}: Readonly<{
  sets: readonly QuestionSetSummary[] | undefined;
  failed: boolean;
  onRetry: () => void;
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const heading = useId();
  const [all, setAll] = useState(false);
  const figure = new Intl.NumberFormat(locale);
  const shown = all ? sets : sets?.slice(0, SHOWN);

  const body = () => {
    if (failed)
      return (
        <p className="text-muted-fg text-meta leading-normal">
          {t("bank.sets.loadFailed")}{" "}
          <button type="button" className={QUIET} onClick={onRetry}>
            {t("common.retry")}
          </button>
        </p>
      );
    if (shown === undefined)
      return (
        <div aria-hidden="true" className="flex flex-col gap-2 py-1">
          {[72, 56, 64].map((width) => (
            <Skeleton key={width} className="h-4" style={{ width: `${width}%` }} />
          ))}
        </div>
      );
    if (shown.length === 0)
      return (
        <p className="text-muted-fg text-meta leading-normal text-pretty">
          {t("bank.sets.empty")}
        </p>
      );
    return (
      <>
        <ul className="flex flex-col">
          {shown.map((set) => (
            <li key={set.id}>
              {/* `from` tells the set page's not-found state that the reader came from the bank. */}
              <Link to={setHref(set.id)} state={{ from: "bank" }} className={ROW}>
                <Library
                  aria-hidden="true"
                  className="text-muted-fg size-3.5 flex-none"
                />
                <span className="min-w-0 flex-1 truncate">{set.name}</span>
                {set.sharedWith > 0 ? (
                  <UsersRound
                    role="img"
                    aria-label={t("bank.sets.sharedWith", { count: set.sharedWith })}
                    className="text-muted-fg size-3 flex-none"
                  />
                ) : null}
                <span className="text-muted-fg text-xs tabular-nums">
                  {figure.format(set.questionCount)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {!all && sets !== undefined && sets.length > SHOWN ? (
          <button
            type="button"
            className={`${QUIET} mt-1 self-start`}
            onClick={() => setAll(true)}
          >
            {t("bank.sets.showAll", { count: sets.length })}
          </button>
        ) : null}
      </>
    );
  };

  return (
    <section aria-labelledby={heading} className="flex min-w-0 flex-col">
      <h2 id={heading} className="text-meta mb-2 leading-normal font-semibold">
        {t("bank.sets.title")}
      </h2>
      {body()}
    </section>
  );
}
