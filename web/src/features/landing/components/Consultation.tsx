import { useId, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, Mail, MapPin, Phone } from "lucide-react";

import { cn } from "@/lib/utils";
import { submitLead, type LeadInput, type LeadOutcome } from "../api";
import brush from "../assets/brush.svg";
import sparkle from "../assets/sparkle.svg";
import {
  CALL_TIMES,
  COURSE_FOR,
  firstMistake,
  INTERESTS,
  leadSchema,
  type LeadField,
} from "../input";
import { useLocale } from "../i18n";
import { contacts, PRIVACY_NOTICE, telHref } from "../site";
import { Shape } from "./Shape";

type Fields = {
  fullName: string;
  phone: string;
  interests: readonly (typeof INTERESTS)[number][];
  courseFor: (typeof COURSE_FOR)[number];
  callTime: (typeof CALL_TIMES)[number];
  consent: boolean;
  website: string;
};

const EMPTY: Fields = {
  fullName: "",
  phone: "",
  interests: [],
  courseFor: "self",
  callTime: "any",
  consent: false,
  website: "",
};

type Sending = { kind: "idle" } | { kind: "sending" } | LeadOutcome;

const FIELD =
  "bg-bg text-md h-[42px] w-full rounded-[9px] border px-3 font-normal placeholder:text-muted-fg";
const LABEL = "flex flex-col gap-1.5 text-sm leading-[1.55] font-medium";

/**
 * ConsultationForm asks for a call back: a name, a phone number, the courses
 * of interest, who the course is for and when to call, and a box to tick
 * before sending. It says nothing until the first try, then names one mistake
 * at a time: the name, the phone, the box. What was typed stays when the
 * request cannot be sent. `send` is the call that sends it.
 */
export function ConsultationForm({
  send = submitLead,
}: Readonly<{ send?: (input: LeadInput) => Promise<LeadOutcome> }>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { name: org, phone: centrePhone } = contacts(locale);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState<Sending>({ kind: "idle" });
  const [sentTo, setSentTo] = useState("");
  const base = useId();
  const errorId = `${base}-error`;

  const input = {
    ...fields,
    locale,
    privacyNoticeVersion: PRIVACY_NOTICE.version,
  };
  const mistake = tried ? firstMistake(input) : null;
  const wrong = (field: LeadField) => mistake?.field === field;
  const set = (patch: Partial<Fields>) => {
    setFields((current) => ({ ...current, ...patch }));
    if (sending.kind !== "sending") setSending({ kind: "idle" });
  };

  let refusal = "";
  if (sending.kind === "limited")
    refusal = t("landing.consult.errLimited", { count: sending.minutes });
  else if (sending.kind === "failed")
    refusal = centrePhone
      ? t("landing.consult.errFailed", { phone: centrePhone })
      : t("landing.consult.errFailedNoPhone");
  const error = mistake ? t(mistake.message) : refusal;

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.kind === "sending") return;
    setTried(true);
    const parsed = leadSchema.safeParse(input);
    if (!parsed.success) return;
    setSending({ kind: "sending" });
    const outcome = await send(
      fields.website ? { ...parsed.data, website: fields.website } : parsed.data,
    );
    if (outcome.kind === "sent") {
      setSentTo(parsed.data.fullName);
      setFields(EMPTY);
      setTried(false);
    }
    setSending(outcome);
  }

  if (sending.kind === "sent") {
    return (
      <div className="flex flex-col items-start gap-3 py-3">
        <span className="bg-success-soft text-success-ink grid size-11 place-items-center rounded-xl">
          <Check aria-hidden="true" className="size-[22px]" />
        </span>
        <span role="status" className="text-[19px] font-semibold">
          {t("landing.consult.sentTitle")}
        </span>
        <span className="text-muted-fg text-[14.5px] leading-[1.6]">
          {t("landing.consult.sentBody", { name: sentTo })}
        </span>
        <button
          type="button"
          onClick={() => setSending({ kind: "idle" })}
          className="bg-card hover:bg-hover h-[38px] cursor-pointer rounded-[9px] border px-3.5 text-base font-medium"
        >
          {t("landing.consult.sendAnother")}
        </button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-3.5"
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-3">
        <label className={LABEL}>
          {t("landing.consult.name")}
          <input
            name="fullName"
            autoComplete="name"
            maxLength={120}
            value={fields.fullName}
            onChange={(event) => set({ fullName: event.target.value })}
            aria-invalid={wrong("fullName")}
            aria-describedby={wrong("fullName") ? errorId : undefined}
            className={cn(FIELD, wrong("fullName") && "border-danger")}
          />
        </label>
        <label className={LABEL}>
          {t("landing.consult.phone")}
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={20}
            placeholder={t("landing.consult.phonePlaceholder")}
            value={fields.phone}
            onChange={(event) => set({ phone: event.target.value })}
            aria-invalid={wrong("phone")}
            aria-describedby={wrong("phone") ? errorId : undefined}
            className={cn(FIELD, wrong("phone") && "border-danger")}
          />
        </label>
      </div>
      <div
        role="group"
        aria-labelledby={`${base}-interest`}
        className="flex flex-col gap-1.5"
      >
        <span id={`${base}-interest`} className="text-sm leading-[1.55] font-medium">
          {t("landing.consult.interest")}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {INTERESTS.map((interest) => {
            const on = fields.interests.includes(interest);
            return (
              <button
                key={interest}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  set({
                    interests: on
                      ? fields.interests.filter((other) => other !== interest)
                      : [...fields.interests, interest],
                  })
                }
                className={cn(
                  "inline-flex h-[34px] cursor-pointer items-center gap-1.5 rounded-full border px-[13px] text-[13.5px] font-medium whitespace-nowrap",
                  on
                    ? "border-primary bg-primary text-primary-fg"
                    : "bg-card text-fg hover:bg-hover",
                )}
              >
                {on && <Check aria-hidden="true" className="size-[13px]" />}
                {t(`landing.consult.interests.${interest}`)}
              </button>
            );
          })}
        </div>
      </div>
      <fieldset className="flex min-w-0 flex-col gap-1.5">
        <legend className="mb-1.5 text-sm leading-[1.55] font-medium">
          {t("landing.consult.who")}
        </legend>
        <div className="bg-muted flex gap-0.5 rounded-[9px] p-[3px]">
          {COURSE_FOR.map((who) => (
            <label key={who} className="min-w-0 flex-1 cursor-pointer">
              <input
                type="radio"
                name="courseFor"
                value={who}
                checked={fields.courseFor === who}
                onChange={() => set({ courseFor: who })}
                className="peer sr-only"
              />
              <span className="text-muted-fg peer-checked:bg-card peer-checked:text-fg peer-checked:shadow-card peer-checked:ring-border peer-focus-visible:outline-focus flex h-8 items-center justify-center rounded-[7px] px-1 text-sm font-medium whitespace-nowrap peer-checked:ring-1 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
                {t(`landing.consult.whoOptions.${who}`)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className={LABEL}>
        {t("landing.consult.time")}
        <span className="relative flex items-center">
          <select
            name="callTime"
            value={fields.callTime}
            onChange={(event) =>
              set({ callTime: event.target.value as Fields["callTime"] })
            }
            className={cn(FIELD, "cursor-pointer appearance-none pr-[34px]")}
          >
            {CALL_TIMES.map((time) => (
              <option key={time} value={time}>
                {t(`landing.consult.times.${time}`)}
              </option>
            ))}
          </select>
          <ChevronsUpDown
            aria-hidden="true"
            className="text-muted-fg pointer-events-none absolute right-3 size-3.5"
          />
        </span>
      </label>
      <div className="flex items-start gap-2.5 text-[13.5px] leading-[1.5]">
        <span className="relative mt-0.5 grid size-[18px] shrink-0 place-items-center">
          <input
            id={`${base}-consent`}
            type="checkbox"
            checked={fields.consent}
            onChange={(event) => set({ consent: event.target.checked })}
            aria-invalid={wrong("consent")}
            aria-describedby={wrong("consent") ? errorId : undefined}
            className={cn(
              "peer bg-card checked:border-primary checked:bg-primary size-[18px] cursor-pointer appearance-none rounded-[5px] border-[1.5px]",
              wrong("consent") ? "border-danger" : "border-ring",
            )}
          />
          <Check
            aria-hidden="true"
            className="text-primary-fg pointer-events-none absolute hidden size-3 peer-checked:block"
          />
        </span>
        <label htmlFor={`${base}-consent`} className="min-w-0 flex-1 text-pretty">
          {t("landing.consult.consentA", { org })}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener"
            className="text-fg font-medium underline underline-offset-[3px]"
          >
            {t("landing.consult.privacyNotice")}
          </a>
          {t("landing.consult.consentB")}
        </label>
      </div>
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] size-px overflow-hidden"
      >
        <input
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={fields.website}
          onChange={(event) => set({ website: event.target.value })}
        />
      </div>
      {error && (
        <span
          id={errorId}
          role="alert"
          className="text-danger-ink text-sm leading-[1.55] text-pretty"
        >
          {error}
        </span>
      )}
      <button
        type="submit"
        aria-disabled={sending.kind === "sending"}
        className={cn(
          "bg-primary text-primary-fg text-md h-12 w-full cursor-pointer rounded-[10px] leading-[1.55] font-semibold",
          sending.kind === "sending" && "bg-primary/60",
        )}
      >
        {sending.kind === "sending"
          ? t("landing.consult.sending")
          : t("landing.consult.submit")}
      </button>
      <span className="text-muted-fg text-[12.5px]">
        {t("landing.consult.privacy")}
      </span>
    </form>
  );
}

const CONTACT = "flex items-center gap-3 text-[15.5px] font-medium";
const CONTACT_ICON =
  "bg-brand text-brand-fg grid size-[38px] shrink-0 place-items-center rounded-full";

/**
 * Consultation is the dark panel that asks for a call back: the centre's
 * phone, email and address, each left out when the build sets none, beside the
 * form on a card.
 */
export function Consultation() {
  const { t } = useTranslation();
  const { phone, email, address } = contacts(useLocale());
  return (
    <section
      id="consult"
      className="mx-auto max-w-[1200px] scroll-mt-0 px-[18px] py-14 min-[720px]:px-7 min-[720px]:py-[88px]"
    >
      <div className="bg-primary text-primary-fg relative grid grid-cols-1 items-center gap-[26px] overflow-hidden rounded-[22px] px-[18px] pt-[30px] pb-[18px] min-[720px]:rounded-[32px] min-[720px]:p-10 min-[960px]:grid-cols-2 min-[960px]:gap-12 min-[960px]:p-14">
        <Shape
          src={brush}
          className="bg-brand bottom-[-46px] left-[-70px] h-[70px] w-[300px] -rotate-[22deg] opacity-90"
        />
        <Shape
          src={sparkle}
          fit="contain"
          className="bg-brand top-[18px] left-[calc(100%-62px)] size-11 min-[720px]:top-9 min-[720px]:left-[calc(100%-90px)] min-[960px]:left-[calc(50%-96px)]"
        />
        <div className="relative flex min-w-0 flex-col gap-3.5">
          <span className="bg-brand text-brand-fg inline-flex h-[26px] items-center self-start rounded-full px-[11px] text-[12.5px] font-semibold">
            {t("landing.consult.eyebrow")}
          </span>
          <h2 className="text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] text-balance min-[720px]:text-[38px]">
            {t("landing.consult.title")}
          </h2>
          <p className="text-title leading-[1.65] text-pretty opacity-80">
            {t("landing.consult.sub")}
          </p>
          <div className="mt-2 flex flex-col gap-3">
            {phone && (
              <a href={telHref(phone)} className={cn(CONTACT, "no-underline")}>
                <span className={CONTACT_ICON}>
                  <Phone aria-hidden="true" className="size-[17px]" />
                </span>
                {phone}
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className={cn(CONTACT, "no-underline")}>
                <span className={CONTACT_ICON}>
                  <Mail aria-hidden="true" className="size-[17px]" />
                </span>
                {email}
              </a>
            )}
            {address && (
              <span className={CONTACT}>
                <span className={CONTACT_ICON}>
                  <MapPin aria-hidden="true" className="size-[17px]" />
                </span>
                {address}
              </span>
            )}
          </div>
        </div>
        <div className="bg-card text-fg landing-shadow relative min-w-0 rounded-[18px] p-4 min-[720px]:p-[22px]">
          <ConsultationForm />
        </div>
      </div>
    </section>
  );
}
