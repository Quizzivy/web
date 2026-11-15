import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ClipboardX,
  Flag,
  Maximize,
  Minus,
  Plus,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import fair from "../assets/ill-fair.svg";
import faq from "../assets/ill-faq.svg";
import listening from "../assets/ill-listening.svg";
import results from "../assets/ill-results.svg";
import tests from "../assets/ill-tests.svg";
import { useLocale } from "../i18n";
import { contacts } from "../site";
import { Tile } from "./Shape";

const H2 =
  "text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] text-balance min-[720px]:text-[38px]";
const LEAD = "text-muted-fg text-title leading-[1.65] text-pretty";
const TILE = "h-[230px] p-[22px] min-[720px]:h-[370px] min-[720px]:p-10";
const STEPS = [1, 2, 3, 4] as const;

/**
 * Steps is the card of four steps that overlaps the lower edge of the colour:
 * join with a code, get the tests, take them, see the results.
 */
export function Steps() {
  const { t } = useTranslation();
  return (
    <div className="relative z-[2] mx-auto -mt-16 max-w-[1200px] px-[18px] min-[720px]:-mt-[76px] min-[720px]:px-7">
      <div className="bg-card landing-shadow flex flex-col gap-4 rounded-[20px] border px-[18px] py-5 min-[720px]:gap-[22px] min-[720px]:px-8 min-[720px]:pt-[26px] min-[720px]:pb-[30px]">
        <h2 className="text-[19px] leading-[1.25] font-semibold tracking-[-0.015em] min-[720px]:text-[22px]">
          {t("landing.steps.title")}
        </h2>
        <ol className="grid grid-cols-1 gap-[18px] min-[720px]:grid-cols-2 min-[960px]:grid-cols-4 min-[960px]:gap-5">
          {STEPS.map((n) => (
            <li key={n} className="flex min-w-0 flex-row gap-3.5 min-[960px]:flex-col">
              <span className="flex shrink-0 items-center gap-3 self-start min-[960px]:self-stretch">
                <span className="bg-brand text-brand-fg grid size-[42px] shrink-0 place-items-center rounded-full text-[17px] font-bold">
                  {n}
                </span>
                {n < STEPS.length && (
                  <span className="hidden h-0 flex-1 border-t-2 border-dashed min-[960px]:block" />
                )}
              </span>
              <span className="flex min-w-0 flex-col gap-[5px]">
                <span className="text-[17px] leading-[1.3] font-semibold tracking-[-0.01em]">
                  {t(`landing.steps.s${n}.title`)}
                </span>
                <span className="text-muted-fg text-[14.5px] leading-[1.55] text-pretty">
                  {t(`landing.steps.s${n}.body`)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

const ROWS = [
  { id: "a", picture: listening, ground: "bg-brand-soft" },
  { id: "b", picture: tests, ground: "bg-info-soft" },
  { id: "c", picture: results, ground: "bg-warning-soft" },
] as const;

/**
 * Rows is the three rows about what the product has today: the kinds of
 * question, taking a test, results. Each has a picture, which changes sides
 * from row to row from 960px.
 */
export function Rows() {
  const { t } = useTranslation();
  return (
    <section
      id="features"
      className="mx-auto flex max-w-[1200px] scroll-mt-4 flex-col gap-12 px-[18px] py-14 min-[720px]:gap-[84px] min-[720px]:px-7 min-[720px]:py-[88px]"
    >
      <h2 className={cn(H2, "max-w-[720px] self-center text-center")}>
        {t("landing.rows.title")}
      </h2>
      {ROWS.map((row, index) => (
        <div
          key={row.id}
          className="grid grid-cols-1 items-center gap-6 min-[960px]:grid-cols-2 min-[960px]:gap-16"
        >
          <Tile
            src={row.picture}
            className={cn(TILE, row.ground, index % 2 === 1 && "min-[960px]:order-2")}
          />
          <div className="flex min-w-0 flex-col gap-3.5">
            <span className="bg-brand-soft text-brand-ink inline-flex h-[26px] items-center self-start rounded-full px-[11px] text-[12.5px] font-semibold whitespace-nowrap">
              {t(`landing.rows.${row.id}.kicker`)}
            </span>
            <h3 className="text-[23px] leading-[1.2] font-semibold tracking-[-0.02em] text-balance min-[720px]:text-[30px]">
              {t(`landing.rows.${row.id}.title`)}
            </h3>
            <p className={LEAD}>{t(`landing.rows.${row.id}.body`)}</p>
            <ul className="mt-0.5 flex flex-col gap-2.5">
              {(["p1", "p2", "p3"] as const).map((point) => (
                <li
                  key={point}
                  className="text-md flex items-start gap-2.5 leading-[1.5]"
                >
                  <span className="bg-brand-soft text-brand-ink mt-px grid size-[22px] shrink-0 place-items-center rounded-full">
                    <Check aria-hidden="true" className="size-[13px]" />
                  </span>
                  <span className="min-w-0 flex-1 text-pretty">
                    {t(`landing.rows.${row.id}.${point}`)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </section>
  );
}

const FAIR: readonly { id: string; icon: LucideIcon }[] = [
  { id: "i1", icon: Maximize },
  { id: "i2", icon: ClipboardX },
  { id: "i3", icon: Flag },
  { id: "i4", icon: ScrollText },
];

/** FairTests is the soft band that says how tests are kept fair, in four points. */
export function FairTests() {
  const { t } = useTranslation();
  return (
    <section id="integrity" className="bg-sidebar scroll-mt-0 border-y">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-6 px-[18px] py-14 min-[720px]:px-7 min-[720px]:py-[88px] min-[960px]:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] min-[960px]:gap-16">
        <Tile src={fair} className={cn(TILE, "bg-brand-soft")} />
        <div className="flex min-w-0 flex-col gap-3.5">
          <h2 className={H2}>{t("landing.fair.title")}</h2>
          <p className={LEAD}>{t("landing.fair.sub")}</p>
          <ul className="mt-2 grid grid-cols-1 gap-4 min-[720px]:grid-cols-2 min-[720px]:gap-x-[26px] min-[720px]:gap-y-[22px]">
            {FAIR.map(({ id, icon: Icon }) => (
              <li key={id} className="flex min-w-0 items-start gap-3">
                <span className="bg-card grid size-10 shrink-0 place-items-center rounded-xl border">
                  <Icon aria-hidden="true" className="size-[19px]" />
                </span>
                <span className="flex min-w-0 flex-col gap-[3px]">
                  <span className="text-title leading-[1.35] font-semibold">
                    {t(`landing.fair.${id}.title`)}
                  </span>
                  <span className="text-muted-fg text-[14.5px] leading-[1.55] text-pretty">
                    {t(`landing.fair.${id}.body`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const QUESTIONS = ["q1", "q2", "q3", "q4", "q5"] as const;

function faqHelp(
  t: (key: string, values: Record<string, string>) => string,
  phone: string | null,
  email: string | null,
): string | null {
  if (phone && email) return t("landing.faq.help", { phone, mail: email });
  if (phone) return t("landing.faq.helpPhone", { phone });
  if (email) return t("landing.faq.helpMail", { mail: email });
  return null;
}

/**
 * Faq is the five questions, each on a card and one open at a time, the first
 * to begin with, beside the centre's phone and email.
 */
export function Faq() {
  const { t } = useTranslation();
  const { phone, email } = contacts(useLocale());
  const [open, setOpen] = useState<string | null>(QUESTIONS[0]);
  const base = useId();
  const help = faqHelp(t, phone, email);

  return (
    <section
      id="faq"
      className="mx-auto grid max-w-[1200px] scroll-mt-4 grid-cols-1 items-start gap-6 px-[18px] pb-14 min-[720px]:px-7 min-[720px]:pb-[88px] min-[960px]:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] min-[960px]:gap-16"
    >
      <div className="flex min-w-0 flex-col gap-3.5">
        <h2 className={H2}>{t("landing.faq.title")}</h2>
        {help && <p className={LEAD}>{help}</p>}
        <Tile
          src={faq}
          className="bg-brand-soft mt-2.5 hidden h-[250px] p-7 min-[960px]:grid"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2.5">
        {QUESTIONS.map((id) => {
          const on = open === id;
          return (
            <div
              key={id}
              className={cn(
                "rounded-2xl border px-[18px]",
                on ? "bg-brand-soft" : "bg-card",
              )}
            >
              <h3>
                <button
                  type="button"
                  id={`${base}-${id}`}
                  aria-expanded={on}
                  aria-controls={`${base}-${id}-answer`}
                  onClick={() => setOpen(on ? null : id)}
                  className="text-fg text-title flex w-full cursor-pointer items-center gap-3.5 py-4 text-left leading-[1.55] font-medium"
                >
                  <span className="min-w-0 flex-1 text-pretty">
                    {t(`landing.faq.${id}.q`)}
                  </span>
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full",
                      on ? "bg-brand text-brand-fg" : "bg-muted text-fg",
                    )}
                  >
                    {on ? (
                      <Minus aria-hidden="true" className="size-4" />
                    ) : (
                      <Plus aria-hidden="true" className="size-4" />
                    )}
                  </span>
                </button>
              </h3>
              <p
                id={`${base}-${id}-answer`}
                role="region"
                aria-labelledby={`${base}-${id}`}
                hidden={!on}
                className="text-muted-fg text-md mb-4 leading-[1.65] text-pretty"
              >
                {t(`landing.faq.${id}.a`)}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
