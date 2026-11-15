import { useId, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound } from "lucide-react";

import {
  clean,
  CODE_LENGTH,
  EXAMPLE_CODE,
  group,
  hasExcluded,
} from "@/features/join/code";
import { cn } from "@/lib/utils";
import brush from "../assets/brush.svg";
import hero from "../assets/hero.jpg";
import sparkle from "../assets/sparkle.svg";
import squiggle from "../assets/squiggle.svg";
import underline from "../assets/underline.svg";
import { useLocale } from "../i18n";
import { Link } from "./Link";
import { contacts, links } from "../site";
import { Dots, Shape } from "./Shape";

/**
 * JoinBox is the class-code field of the Landing, with the app's own rules: at
 * most eight letters and digits, shown in two groups. Eight characters of the
 * alphabet wake the button, which opens that class on the student site. A
 * character no code has says so at once; sending fewer than eight says so and
 * stays.
 */
export function JoinBox({
  open = (address: string) => window.location.assign(address),
}: Readonly<{ open?: (address: string) => void }>) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [short, setShort] = useState(false);
  const errorId = useId();
  const excluded = hasExcluded(code);
  const whole = code.length === CODE_LENGTH && !excluded;
  const shortError =
    short && code.length < CODE_LENGTH ? t("landing.hero.joinShort") : "";
  const error = excluded ? t("landing.hero.joinExcluded") : shortError;

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (whole) open(links.joinCode(code));
    else if (!excluded) setShort(true);
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      className="bg-card landing-shadow flex max-w-[470px] flex-col gap-2.5 rounded-2xl border p-3.5 min-[720px]:px-[18px] min-[720px]:py-4"
    >
      <label
        htmlFor={`${errorId}-code`}
        className="flex items-center gap-2 text-base font-semibold"
      >
        <KeyRound aria-hidden="true" className="text-brand-ink size-4" />
        {t("landing.hero.haveCode")}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={`${errorId}-code`}
          value={group(code)}
          onChange={(event) => {
            setCode(clean(event.target.value));
            setShort(false);
          }}
          placeholder={EXAMPLE_CODE}
          aria-label={t("landing.hero.codeLabel")}
          aria-invalid={error !== ""}
          aria-describedby={error ? errorId : undefined}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={CODE_LENGTH + 1}
          className={cn(
            "bg-card placeholder:text-muted-fg h-12 min-w-0 flex-1 rounded-[10px] border-[1.5px] px-3.5 font-mono text-[18px] font-semibold tracking-[0.12em] uppercase",
            error && "border-danger",
            whole && "border-success",
          )}
        />
        <button
          type="submit"
          aria-disabled={!whole}
          className={cn(
            "bg-primary text-primary-fg text-md h-12 cursor-pointer rounded-[10px] px-5 leading-[1.55] font-semibold whitespace-nowrap",
            !whole && "bg-primary/55",
          )}
        >
          {t("landing.hero.joinClass")}
        </button>
      </div>
      {error && (
        <span id={errorId} role="alert" className="text-danger-ink text-sm">
          {error}
        </span>
      )}
    </form>
  );
}

const LINK = "text-fg font-medium underline underline-offset-[3px]";

/**
 * Hero is the top of the Landing under the header: the headline with a drawn
 * line under its middle words, one sentence, the join box, and the photo in an
 * arch with three brush strokes behind it and a few drawn marks around.
 */
export function Hero() {
  const { t } = useTranslation();
  const { name: org } = contacts(useLocale());
  return (
    <section className="relative z-[1] mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-7 px-[18px] pt-6 pb-[100px] min-[720px]:gap-11 min-[720px]:px-7 min-[720px]:pt-10 min-[720px]:pb-[120px] min-[960px]:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] min-[960px]:pt-11 min-[960px]:pb-32">
      <div className="flex min-w-0 flex-col gap-[18px] min-[720px]:gap-[22px]">
        <h1 className="text-[36px] leading-[1.12] font-semibold tracking-[-0.03em] text-balance min-[720px]:text-[48px] min-[1100px]:text-[56px]">
          {t("landing.hero.h1a")}{" "}
          <span className="relative isolate inline-block whitespace-nowrap">
            <Shape
              src={underline}
              className="bg-brand inset-x-[-3%] bottom-[-0.12em] -z-10 h-[0.3em]"
            />
            {t("landing.hero.h1b")}
          </span>{" "}
          {t("landing.hero.h1c")}
        </h1>
        <p className="text-muted-fg text-title max-w-[560px] leading-[1.6] text-pretty min-[720px]:text-[18px]">
          {t("landing.hero.sub", { org })}
        </p>
        <JoinBox />
        <span className="text-muted-fg text-[13.5px] leading-[1.6]">
          {t("landing.hero.orSignIn")}{" "}
          <a href={links.studentSignIn()} className={LINK}>
            {t("landing.hero.signIn")}
          </a>{" "}
          ·{" "}
          <Link to="/#consult" className={LINK}>
            {t("landing.hero.consultLink")}
          </Link>
        </span>
      </div>
      <div
        aria-hidden="true"
        className="relative h-[356px] min-w-0 min-[720px]:h-[520px]"
      >
        <Shape
          src={brush}
          className="bg-brand top-6 left-1/2 ml-[-170px] h-[58px] w-[250px] -rotate-[22deg] opacity-50 min-[720px]:top-[30px] min-[720px]:ml-[-285px] min-[720px]:h-[92px] min-[720px]:w-[400px]"
        />
        <Shape
          src={brush}
          className="bg-brand top-[124px] left-1/2 ml-[-165px] h-[82px] w-[330px] -rotate-[22deg] min-[720px]:top-[176px] min-[720px]:ml-[-262px] min-[720px]:h-32 min-[720px]:w-[520px]"
        />
        <Shape
          src={brush}
          className="bg-primary top-[238px] left-1/2 ml-[-70px] h-[52px] w-60 -rotate-[22deg] min-[720px]:top-[352px] min-[720px]:ml-[-120px] min-[720px]:h-20 min-[720px]:w-[380px]"
        />
        <Dots className="right-0 bottom-[18px] min-[720px]:right-[2%]" />
        <div className="bg-muted landing-shadow absolute bottom-0 left-1/2 ml-[-110px] h-[308px] w-[220px] overflow-hidden rounded-t-[110px] rounded-b-[22px] min-[720px]:ml-[-165px] min-[720px]:h-[462px] min-[720px]:w-[330px] min-[720px]:rounded-t-[165px] min-[720px]:rounded-b-[28px]">
          <img
            src={hero}
            alt=""
            draggable={false}
            className="block size-full object-cover object-[50%_18%]"
          />
        </div>
        <Shape
          src={sparkle}
          fit="contain"
          className="bg-primary top-0 right-[2%] size-10 min-[720px]:top-1 min-[720px]:right-[5%] min-[720px]:size-16"
        />
        <Shape
          src={squiggle}
          fit="contain"
          className="bg-primary bottom-9 left-0 h-[17px] w-[72px] min-[720px]:bottom-14 min-[720px]:left-[3%] min-[720px]:h-[26px] min-[720px]:w-28"
        />
        <span className="border-brand absolute top-[58px] left-[6%] box-border size-[18px] rounded-full border-[5px] min-[720px]:top-[86px] min-[720px]:left-[10%] min-[720px]:size-[26px]" />
      </div>
    </section>
  );
}
