import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Building2,
  CalendarClock,
  FileText,
  Hand,
  Inbox,
  Mail,
  MapPin,
  Phone,
  PhoneCall,
  Printer,
  type LucideIcon,
} from "lucide-react";

import { BrandLockup } from "@/components/shared/Brand";
import { LandingHeader } from "../components/LandingHeader";
import { useLocale, type Locale } from "../i18n";
import { contacts, PRIVACY_NOTICE, type Contacts } from "../site";

type Block =
  | { kind: "p"; key: string }
  | { kind: "list"; keys: readonly string[] }
  | { kind: "centre" }
  | { kind: "reach" };

const p = (key: string): Block => ({ kind: "p", key });
const list = (...keys: string[]): Block => ({ kind: "list", keys });

const PARTS: readonly { title: string; blocks: readonly Block[] }[] = [
  { title: "p1t", blocks: [p("p1a"), { kind: "centre" }] },
  { title: "p2t", blocks: [p("p2a"), list("p2b1", "p2b2", "p2b3", "p2b4"), p("p2c")] },
  { title: "p3t", blocks: [p("p3a")] },
  { title: "p4t", blocks: [p("p4a")] },
  {
    title: "p5t",
    blocks: [p("p5a"), p("p5b"), list("p5c1", "p5c2", "p5c3"), p("p5d")],
  },
  { title: "p6t", blocks: [p("p6a")] },
  {
    title: "p7t",
    blocks: [p("p7a"), list("p7b1", "p7b2", "p7b3", "p7b4"), { kind: "reach" }],
  },
  { title: "p8t", blocks: [p("p8a")] },
  { title: "p9t", blocks: [p("p9a")] },
  { title: "p10t", blocks: [p("p10a")] },
  { title: "p11t", blocks: [p("p11a")] },
];

const SUMMARY: readonly { id: string; icon: LucideIcon }[] = [
  { id: "s1", icon: Inbox },
  { id: "s2", icon: PhoneCall },
  { id: "s3", icon: CalendarClock },
  { id: "s4", icon: Hand },
];

const DATE: Record<Locale, Intl.DateTimeFormat> = {
  vi: new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }),
};

const TEXT = "text-title leading-[1.7] text-pretty";

function CentreLines({ centre }: Readonly<{ centre: Contacts }>) {
  const lines: readonly { icon: LucideIcon; text: string | null }[] = [
    { icon: Building2, text: centre.name },
    { icon: MapPin, text: centre.address },
    { icon: Mail, text: centre.email },
    { icon: Phone, text: centre.phone },
  ];
  return (
    <ul className="bg-card rounded-2xl border px-4 py-1">
      {lines.map(
        ({ icon: Icon, text }) =>
          text && (
            <li
              key={text}
              className="flex items-center gap-3 border-t py-[11px] text-[15.5px] first:border-t-0"
            >
              <Icon aria-hidden="true" className="text-muted-fg size-[17px] shrink-0" />
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{text}</span>
            </li>
          ),
      )}
    </ul>
  );
}

function PartBlock({
  block,
  centre,
  reach,
}: Readonly<{ block: Block; centre: Contacts; reach: string | null }>) {
  const { t } = useTranslation();
  if (block.kind === "p")
    return <p className={TEXT}>{t(`privacy.${block.key}`, { org: centre.name })}</p>;
  if (block.kind === "centre") return <CentreLines centre={centre} />;
  if (block.kind === "reach") return reach ? <p className={TEXT}>{reach}</p> : null;
  return (
    <ul className="flex flex-col gap-2">
      {block.keys.map((key) => (
        <li key={key} className="text-title flex items-start gap-2.5 leading-[1.6]">
          <span className="bg-brand mt-2.5 size-1.5 shrink-0 rounded-full" />
          <span className="min-w-0 flex-1 text-pretty">{t(`privacy.${key}`)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * PrivacyPage is the privacy notice of the landing site and its consultation
 * form: the version and the day it took effect, four facts on a soft panel,
 * and eleven short numbered parts. It prints as the notice alone, always
 * light. A line of the centre the build does not set is left out.
 */
export default function PrivacyPage() {
  const { t } = useTranslation();
  const locale = useLocale();
  const centre = contacts(locale);
  const { email, phone } = centre;
  const address = `${window.location.host}/privacy`;

  useEffect(() => {
    const root = document.documentElement;
    let wasDark = false;
    const before = () => {
      wasDark = root.classList.contains("dark");
      root.classList.remove("dark");
    };
    const after = () => {
      if (wasDark) root.classList.add("dark");
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  let reach: string | null = null;
  if (email && phone) reach = t("privacy.p7c", { mail: email, phone });
  else if (email) reach = t("privacy.p7cMail", { mail: email });
  else if (phone) reach = t("privacy.p7cPhone", { phone });

  return (
    <>
      <LandingHeader onBand={false} />
      <main className="mx-auto max-w-[1200px] px-[18px] pt-8 pb-14 min-[720px]:px-7 min-[720px]:pt-14 min-[720px]:pb-[88px] print:px-0 print:py-0">
        <article className="mx-auto flex max-w-[720px] flex-col gap-7 min-[720px]:gap-9">
          <div className="hidden items-center justify-between gap-3 border-b pb-3.5 print:flex">
            <BrandLockup height={28} />
            <span className="text-muted-fg text-[12.5px]">{address}</span>
          </div>
          <header className="flex flex-col gap-3.5">
            <h1 className="text-[30px] leading-[1.15] font-semibold tracking-[-0.025em] text-balance min-[720px]:text-[40px]">
              {t("privacy.title")}
            </h1>
            <p className="text-muted-fg text-title leading-[1.6] text-pretty min-[720px]:text-[18px]">
              {t("privacy.lead")}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-muted-fg inline-flex items-center gap-2 text-[13.5px]">
                <FileText aria-hidden="true" className="size-[15px]" />
                {t("privacy.version", {
                  v: PRIVACY_NOTICE.version,
                  date: DATE[locale].format(new Date(PRIVACY_NOTICE.effectiveFrom)),
                })}
              </span>
              <button
                type="button"
                onClick={() => window.print()}
                className="bg-card text-fg hover:bg-hover inline-flex h-9 cursor-pointer items-center gap-[7px] rounded-lg border px-3 text-[13.5px] font-medium whitespace-nowrap print:hidden"
              >
                <Printer aria-hidden="true" className="size-[15px]" />
                {t("privacy.print")}
              </button>
            </div>
          </header>
          <section className="bg-brand-soft flex flex-col gap-4 rounded-[20px] p-[18px] min-[720px]:px-[26px] min-[720px]:py-6">
            <h2 className="text-[17px] font-semibold">{t("privacy.summary.title")}</h2>
            <ul className="grid grid-cols-1 gap-3.5 min-[720px]:grid-cols-2 min-[720px]:gap-x-6 min-[720px]:gap-y-[18px]">
              {SUMMARY.map(({ id, icon: Icon }) => (
                <li key={id} className="flex min-w-0 items-start gap-3">
                  <span className="bg-card grid size-[38px] shrink-0 place-items-center rounded-xl">
                    <Icon aria-hidden="true" className="text-brand-ink size-[18px]" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-brand-ink text-sm font-semibold">
                      {t(`privacy.summary.${id}.label`)}
                    </span>
                    <span className="text-md leading-[1.5] text-pretty">
                      {t(`privacy.summary.${id}.text`)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          {PARTS.map((part, index) => (
            <section key={part.title} className="flex flex-col gap-2.5">
              <h2 className="flex items-baseline gap-2.5 text-[19px] leading-[1.3] font-semibold tracking-[-0.015em] min-[720px]:text-[22px]">
                <span className="text-muted-fg shrink-0 text-base font-semibold tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 text-balance">
                  {t(`privacy.${part.title}`)}
                </span>
              </h2>
              {part.blocks.map((block) => (
                <PartBlock
                  key={block.kind === "p" ? block.key : block.kind}
                  block={block}
                  centre={centre}
                  reach={reach}
                />
              ))}
            </section>
          ))}
        </article>
      </main>
    </>
  );
}
