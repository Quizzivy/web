import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleCheck, Clock, type LucideIcon } from "lucide-react";

import { MaintenanceArt, UnexpectedErrorArt } from "@/app/pages/errorArt";
import { Button } from "@/components/ui/button";
import { clockTime, useDisplayTimeZone } from "@/lib/i18n/datetime";
import { cn } from "@/lib/utils";
import { readPublicStatus, type PublicStatus } from "../api";
import { AllNormalArt, SystemActions, SystemPage } from "../components/SystemPage";
import { useLocale } from "../i18n";
import { Link } from "../components/Link";
import { contacts } from "../site";

type Reading =
  | { kind: "checking" }
  | { kind: "error" }
  | { kind: "answered"; status: PublicStatus; at: Date };

type Row = { icon: LucideIcon; tone: string; text: string; meta?: string };

function Rows({ rows }: Readonly<{ rows: readonly Row[] }>) {
  return (
    <ul className="mt-4 flex flex-col overflow-hidden rounded-lg border">
      {rows.map(({ icon: Icon, tone, text, meta }) => (
        <li
          key={text}
          className="text-ui flex items-center gap-2.5 border-t px-3 py-2.5 first:border-t-0"
        >
          <Icon aria-hidden="true" className={cn("size-[15px] shrink-0", tone)} />
          <span className="min-w-0 flex-1">{text}</span>
          {meta && (
            <span className="text-muted-fg text-meta whitespace-nowrap tabular-nums">
              {meta}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

const SUCCESS = "text-success-ink";
const WARNING = "text-warning-ink";

/**
 * StatusPage says how Quizzivy is doing, from `GET /public/status`: all
 * normal, an update is planned, being updated (in the words of the app's
 * maintenance page), or that it could not check. It asks once when it opens
 * and again only on "Check again", never by itself. Times are in the app's
 * time zone, with the date added when it is not today. `read` is the call
 * that asks.
 */
export default function StatusPage({
  read = readPublicStatus,
}: Readonly<{ read?: (signal?: AbortSignal) => Promise<PublicStatus> }>) {
  useDisplayTimeZone();
  const { t } = useTranslation();
  const locale = useLocale();
  const { phone } = contacts(locale);
  const [reading, setReading] = useState<Reading>({ kind: "checking" });
  const request = useRef<AbortController | null>(null);

  const ask = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    read(controller.signal).then(
      (status) => {
        if (!controller.signal.aborted)
          setReading({ kind: "answered", status, at: new Date() });
      },
      () => {
        if (!controller.signal.aborted) setReading({ kind: "error" });
      },
    );
  }, [read]);

  const check = () => {
    setReading({ kind: "checking" });
    ask();
  };

  useEffect(() => {
    ask();
    return () => request.current?.abort();
  }, [ask]);

  const checking = reading.kind === "checking";
  const help = phone ? t("statusPage.foot", { phone }) : undefined;
  const actions = (
    <SystemActions>
      <Button
        onClick={check}
        aria-disabled={checking}
        className={cn(checking && "bg-primary/60")}
      >
        {t("statusPage.check")}
      </Button>
      <Button asChild variant="outline">
        <Link to="/">{t("statusPage.home")}</Link>
      </Button>
    </SystemActions>
  );

  if (reading.kind === "checking")
    return (
      <SystemPage
        art={<AllNormalArt />}
        title={t("statusPage.checkingT")}
        footer={help}
      >
        {actions}
      </SystemPage>
    );

  if (reading.kind === "error")
    return (
      <SystemPage
        art={<UnexpectedErrorArt />}
        title={t("statusPage.errorT")}
        body={t("statusPage.errorB")}
        footer={help}
      >
        {actions}
      </SystemPage>
    );

  const window = reading.status.maintenance;
  const checked = t("statusPage.checked", {
    time: clockTime(reading.at, reading.at, locale),
  });

  if (window === null)
    return (
      <SystemPage
        art={<AllNormalArt />}
        title={t("statusPage.normalT")}
        body={t("statusPage.normalB")}
        footer={help}
      >
        <Rows
          rows={[
            {
              icon: CircleCheck,
              tone: SUCCESS,
              text: t("statusPage.normalRow"),
              meta: checked,
            },
          ]}
        />
        {actions}
      </SystemPage>
    );

  const minutes = Math.max(
    1,
    Math.round((Date.parse(window.endsAt) - Date.parse(window.startsAt)) / 60_000),
  );
  const from = clockTime(window.startsAt, reading.at, locale);
  const to = clockTime(window.endsAt, reading.at, locale);
  const duration = t("statusPage.duration", { minutes });

  if (window.active)
    return (
      <SystemPage
        art={<MaintenanceArt />}
        title={t("statusPage.activeT")}
        body={t("statusPage.activeB", { time: to })}
        footer={t("statusPage.activeF")}
      >
        <Rows
          rows={[
            {
              icon: Clock,
              tone: WARNING,
              text: t("statusPage.started", { time: from }),
              meta: duration,
            },
            { icon: CircleCheck, tone: SUCCESS, text: t("statusPage.saved") },
          ]}
        />
        {actions}
      </SystemPage>
    );

  return (
    <SystemPage
      art={<MaintenanceArt />}
      title={t("statusPage.planT")}
      body={t("statusPage.planB", { from, to })}
      footer={help}
    >
      <Rows
        rows={[
          {
            icon: Clock,
            tone: WARNING,
            text: t("statusPage.planRow1", { time: from }),
            meta: duration,
          },
          {
            icon: CircleCheck,
            tone: SUCCESS,
            text: t("statusPage.planRow2"),
            meta: checked,
          },
        ]}
      />
      {actions}
    </SystemPage>
  );
}
