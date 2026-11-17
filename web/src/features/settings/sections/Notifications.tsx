import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DirtyBar } from "@/components/shared/DirtyBar";
import { SettingsCard } from "@/components/shared/SettingsCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import type {
  NotificationEvent,
  NotificationPreference,
} from "@/features/notifications/api";
import { TEACHER_EVENTS } from "@/features/notifications/kinds";
import { useNotificationPreferences } from "@/features/notifications/useNotificationPreferences";
import { useUnsavedSection } from "@/features/settings/unsavedSection";
import { failureMessage } from "@/lib/api/errors";

const EVENT_KEY: Record<(typeof TEACHER_EVENTS)[number], string> = {
  "attempt.submitted": "submitted",
  "attempt.flagged": "flagged",
  "message.received": "message",
  "assignment.closing": "closing",
  "summary.weekly": "weekly",
};

/** CHANNELS are the grid's two columns, in the deck's order. */
const CHANNELS = ["inApp", "email"] as const;
type Channel = (typeof CHANNELS)[number];

const CHANNEL_ID: Record<Channel, string> = { inApp: "switch", email: "email" };

const GRID = "grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-3 px-4.5";

/** A switch is one event's one channel, `${event} ${channel}`. */
type SwitchKey = `${NotificationEvent} ${Channel}`;
type Switches = ReadonlyMap<SwitchKey, boolean>;

function switchesOf(rows: readonly NotificationPreference[]): Switches {
  return new Map(
    rows.flatMap((row) =>
      CHANNELS.map((channel) => [`${row.event} ${channel}` as SwitchKey, row[channel]]),
    ),
  );
}

/**
 * NotificationsSection is the Notifications card of the teacher's settings:
 * "Choose where each update reaches you." with a grid of Update, In app and
 * Email, and a row with two switches for each of the teacher's updates in
 * the deck's order: A student submits, An attempt is flagged, New message,
 * An assignment is about to close and Weekly summary. The switches show the
 * server's rows, whose defaults are the deck's (T-R7.13). A change raises
 * the DirtyBar; Save changes sends all seven rows, the student's two as
 * they were read, and Discard restores the saved ones. While saving, the
 * switches stay focusable and ignore a press; when Save changes or Discard
 * ends the unsaved changes, focus returns to the switch last changed.
 */
export function NotificationsSection() {
  const { t } = useTranslation();
  const { query, save } = useNotificationPreferences();
  const [edits, setEdits] = useState<Switches>(new Map());
  const [error, setError] = useState<string | null>(null);
  const saved = query.data;
  const savedSwitches = saved === undefined ? undefined : switchesOf(saved);
  const dirty =
    savedSwitches !== undefined &&
    [...edits].some(([key, on]) => savedSwitches.get(key) !== on);

  const saving = save.isPending;
  useUnsavedSection("notifications", dirty);
  const lastToggled = useRef<string>(`notify-${EVENT_KEY[TEACHER_EVENTS[0]]}-switch`);
  const toggledSwitch = useCallback(
    () => document.getElementById(lastToggled.current),
    [],
  );

  const isOn = (event: NotificationEvent, channel: Channel) => {
    const key: SwitchKey = `${event} ${channel}`;
    return edits.get(key) ?? savedSwitches?.get(key) ?? false;
  };

  function toggle(event: NotificationEvent, channel: Channel, id: string, on: boolean) {
    if (saving) return;
    lastToggled.current = id;
    setEdits((current) => new Map(current).set(`${event} ${channel}`, on));
  }

  function submit() {
    if (saved === undefined) return;
    setError(null);
    save.mutate(
      saved.map((row) => ({
        ...row,
        inApp: edits.get(`${row.event} inApp`) ?? row.inApp,
        email: edits.get(`${row.event} email`) ?? row.email,
      })),
      {
        onSuccess: () => {
          setEdits(new Map());
          toast(t("settings.saved"));
        },
        onError: (cause) => setError(failureMessage(cause, t("api.failed"))),
      },
    );
  }

  return (
    <>
      <SettingsCard
        title={t("settings.notifications.title")}
        description={t("settings.notifications.hint")}
        className="overflow-hidden"
      >
        <div
          className={`${GRID} bg-muted text-muted-fg text-meta py-2.5 leading-normal font-medium`}
          aria-hidden="true"
        >
          <span>{t("settings.notifications.update")}</span>
          <span className="text-center">{t("settings.notifications.inApp")}</span>
          <span className="text-center">{t("settings.notifications.email")}</span>
        </div>
        {query.isPending ? (
          <div role="status" aria-label={t("common.loading")}>
            {TEACHER_EVENTS.map((event) => (
              <div key={event} className={`${GRID} border-t py-3`}>
                <span className="flex flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-48" />
                  <Skeleton className="h-3 w-32" />
                </span>
                <Skeleton className="mx-auto h-5.5 w-9.5 rounded-full" />
                <Skeleton className="mx-auto h-5.5 w-9.5 rounded-full" />
              </div>
            ))}
          </div>
        ) : null}
        {query.isError && saved === undefined ? (
          <div className="flex flex-wrap items-center gap-3 border-t px-4.5 py-4">
            <p role="alert" className="text-muted-fg text-ui flex-1">
              {t("settings.notifications.loadFailed")}
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-8.5"
              onClick={() => void query.refetch()}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : null}
        {saved === undefined
          ? null
          : TEACHER_EVENTS.map((event) => {
              const key = EVENT_KEY[event];
              return (
                <div key={event} className={`${GRID} border-t py-3`}>
                  <span className="min-w-0">
                    <span
                      id={`notify-${key}`}
                      className="text-ui block leading-normal font-medium"
                    >
                      {t(`settings.notifications.events.${key}`)}
                    </span>
                    <span
                      id={`notify-${key}-hint`}
                      className="text-muted-fg text-meta block leading-normal"
                    >
                      {t(`settings.notifications.events.${key}Hint`)}
                    </span>
                  </span>
                  {CHANNELS.map((channel) => {
                    const id = `notify-${key}-${CHANNEL_ID[channel]}`;
                    return (
                      <span key={channel} className="flex justify-center">
                        <Switch
                          id={id}
                          checked={isOn(event, channel)}
                          aria-label={t(
                            channel === "inApp"
                              ? "settings.notifications.inAppFor"
                              : "settings.notifications.emailFor",
                            { update: t(`settings.notifications.events.${key}`) },
                          )}
                          aria-describedby={`notify-${key}-hint`}
                          aria-disabled={saving || undefined}
                          onCheckedChange={(on) => toggle(event, channel, id, on)}
                        />
                      </span>
                    );
                  })}
                </div>
              );
            })}
      </SettingsCard>
      <DirtyBar
        dirty={dirty}
        saving={saving}
        error={error}
        onDiscard={() => {
          setError(null);
          setEdits(new Map());
        }}
        onSave={submit}
        returnFocus={toggledSwitch}
      />
    </>
  );
}
