import { useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  FileText,
  Library,
  UserMinus,
  type LucideIcon,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  DialogShell,
  DialogShellBody,
  DialogShellFooter,
  DialogShellHeader,
} from "@/components/shared/form/DialogShell";
import { ApiError } from "@/lib/api/errors";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import {
  createShares,
  deleteShare,
  sharesKey,
  updateShare,
  useShares,
  withGrant,
  withGrants,
  withoutGrant,
  type ShareAccess,
  type ShareGrant,
  type ShareKind,
  type ShareList,
  type ShareTeacher,
} from "../api";
import { AccessSelect } from "./AccessSelect";
import { PeoplePicker } from "./PeoplePicker";

const KIND_ICON: Record<ShareKind, LucideIcon> = {
  test: FileText,
  question_set: Library,
};

const MESSAGE_LIMIT = 500;

const FOOT_BUTTON = "shadow-none max-[767px]:h-11 max-[767px]:flex-[1_1_120px]";

/** ShareDialogProps names the content to share and what to do when its grants change. */
export type ShareDialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: ShareKind;
  resourceId: string;
  /** The test's title or the set's name, for "Share “{name}”". */
  name: string;
  /** The line under the title; "Only you can see it until you share it." when not given. */
  description?: ReactNode;
  /** Runs after a grant is made or removed, for the caller's "Shared · {n}". */
  onSharedChange?: () => void;
}>;

/**
 * ShareDialog is the deck's share dialog (`sh.*`) for a test or a question
 * set: 520px or the width less 24px, 8% from the top and at most 84% high.
 * The picker collects colleagues as chips; with someone pending, the access
 * select (Can use by default), "Send a notification" (on) and the optional
 * message appear, and Share grants them all, toasts, and keeps the dialog open
 * for more. "People with access" lists the owner first, then each grant,
 * whose select applies at once and whose Stop sharing asks first. Cancel
 * clears the pending chips, Done closes. A 403, read or write, means the
 * caller can no longer share it: the dialog closes with a toast.
 */
export function ShareDialog({
  open,
  onOpenChange,
  kind,
  resourceId,
  name,
  description,
  onSharedChange,
}: ShareDialogProps) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const me = useAuthStore((state) => state.user);
  const key = sharesKey(kind, resourceId);
  const input = useRef<HTMLInputElement>(null);
  const afterStop = useRef<HTMLElement | null>(null);
  const notifyId = useId();
  const peopleId = useId();
  const [adds, setAdds] = useState<readonly ShareTeacher[]>([]);
  const [access, setAccess] = useState<ShareAccess>("use");
  const [notifyOn, setNotifyOn] = useState(true);
  const [message, setMessage] = useState("");
  const [stopping, setStopping] = useState<ShareGrant | null>(null);

  const reset = () => {
    setAdds([]);
    setAccess("use");
    setNotifyOn(true);
    setMessage("");
    setStopping(null);
  };
  const close = () => {
    onOpenChange(false);
    reset();
  };
  const refused = (cause: unknown): boolean => {
    if (!(cause instanceof ApiError) || cause.status !== 403) return false;
    close();
    notify.warning(t(`sharing.toast.forbidden.${kind}`));
    return true;
  };
  const failed = (cause: unknown) => {
    if (refused(cause)) return;
    notify.error(cause instanceof ApiError ? cause.message : t("sharing.toast.failed"));
  };
  const shares = useShares(kind, resourceId, open, (cause) => refused(cause));
  const patchList = (change: (list: ShareList) => ShareList) =>
    client.setQueryData<ShareList>(key, (list) =>
      list === undefined ? list : change(list),
    );

  const share = useMutation({
    mutationFn: () =>
      createShares({
        kind,
        resourceId,
        granteeIds: adds.map((teacher) => teacher.id),
        access,
        notify: notifyOn,
        message: notifyOn && message.trim() !== "" ? message.trim() : null,
      }),
    onSuccess: async (result) => {
      const count = result.grants.length;
      patchList((list) => withGrants(list, result.grants));
      setAdds([]);
      setMessage("");
      notify.success(
        t(notifyOn ? "sharing.toast.sharedNotified" : "sharing.toast.shared", {
          count,
        }),
      );
      input.current?.focus();
      onSharedChange?.();
      await client.invalidateQueries({ queryKey: key });
    },
    onError: failed,
  });

  const change = useMutation({
    mutationFn: ({ grant, level }: { grant: ShareGrant; level: ShareAccess }) =>
      updateShare(grant.id, level),
    onMutate: ({ grant, level }) => {
      patchList((list) => withGrant(list, { ...grant, access: level }));
    },
    onSuccess: (saved, { grant }) => {
      patchList((list) => withGrant(list, saved));
      notify.success(
        t(saved.access === "edit" ? "sharing.toast.nowEdit" : "sharing.toast.nowUse", {
          name: grant.grantee.fullName,
        }),
      );
    },
    onError: (cause, { grant }) => {
      patchList((list) => withGrant(list, grant));
      failed(cause);
    },
  });

  const stop = useMutation({
    mutationFn: (grant: ShareGrant) => deleteShare(grant.id),
    onSuccess: (_, grant) => {
      patchList((list) => withoutGrant(list, grant.id));
      afterStop.current = input.current;
      setStopping(null);
      notify.success(t("sharing.toast.stopped", { name: grant.grantee.fullName }));
      onSharedChange?.();
    },
    onError: (cause) => {
      setStopping(null);
      failed(cause);
    },
  });

  const list = shares.data;
  const exclude = new Set<string>([
    ...(list === undefined ? [] : [list.owner.id]),
    ...(list?.grants.map((grant) => grant.grantee.id) ?? []),
  ]);
  const pending = adds.length > 0;
  const Icon = KIND_ICON[kind];

  return (
    <DialogShell
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      width={520}
      className="top-[8%] max-h-[84dvh] translate-y-0"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        input.current?.focus();
      }}
    >
      <DialogShellHeader
        title={t("sharing.title", { name })}
        description={description ?? t("sharing.onlyYou")}
        icon={Icon}
      />
      <DialogShellBody>
        <div className="flex flex-wrap items-start gap-2">
          <PeoplePicker
            inputRef={input}
            selected={adds}
            exclude={exclude}
            onAdd={(teacher) => setAdds((current) => [...current, teacher])}
            onRemove={(id) =>
              setAdds((current) => current.filter((teacher) => teacher.id !== id))
            }
          />
          {pending ? (
            <AccessSelect
              value={access}
              onChange={setAccess}
              label={t("sharing.permission")}
              className="h-10"
            />
          ) : null}
        </div>
        {pending ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Switch id={notifyId} checked={notifyOn} onCheckedChange={setNotifyOn} />
              <label htmlFor={notifyId} className="cursor-pointer">
                {t("sharing.notify")}
              </label>
            </div>
            {notifyOn ? (
              <Textarea
                rows={2}
                maxLength={MESSAGE_LIMIT}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                aria-label={t("sharing.message")}
                placeholder={t("sharing.message")}
                className="bg-bg rounded-ctl min-h-0 px-3 py-2 leading-normal"
              />
            ) : null}
          </div>
        ) : null}
        <section aria-labelledby={peopleId} className="flex flex-col">
          <h3 id={peopleId} className="text-meta pb-1 font-semibold">
            {t("sharing.people")}
          </h3>
          {list === undefined ? (
            <PeopleState
              failed={shares.isError}
              onRetry={() => void shares.refetch()}
            />
          ) : (
            <>
              <div className="flex items-center gap-3 py-2">
                <Avatar name={list.owner.name} src={list.owner.avatarUrl} />
                <Person
                  name={
                    me?.id === list.owner.id
                      ? t("sharing.you", { name: list.owner.name })
                      : list.owner.name
                  }
                  email={list.owner.email}
                />
                <span className="text-muted-fg text-meta pr-1">
                  {t("sharing.owner")}
                </span>
              </div>
              {list.grants.map((grant) => (
                <div
                  key={grant.id}
                  data-grant={grant.id}
                  className="flex items-center gap-3 border-t py-2"
                >
                  <Avatar name={grant.grantee.fullName} src={grant.grantee.avatarUrl} />
                  <Person name={grant.grantee.fullName} email={grant.grantee.email} />
                  <AccessSelect
                    value={grant.access}
                    label={t("sharing.permissionFor", { name: grant.grantee.fullName })}
                    onChange={(level) => change.mutate({ grant, level })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("sharing.stop", { name: grant.grantee.fullName })}
                    title={t("sharing.stop", { name: grant.grantee.fullName })}
                    className="text-muted-fg hover:bg-hover hover:text-danger-ink dark:hover:bg-hover flex-none max-[767px]:size-11"
                    onClick={() => {
                      afterStop.current = null;
                      setStopping(grant);
                    }}
                  >
                    <UserMinus aria-hidden="true" />
                  </Button>
                </div>
              ))}
              {list.grants.length === 0 ? (
                <p className="text-muted-fg border-t py-2 text-sm">
                  {t("sharing.nobody")}
                </p>
              ) : null}
            </>
          )}
        </section>
        <div className="grid grid-cols-2 gap-2">
          <Tile title={t("sharing.canUse")}>{t(`sharing.help.${kind}.use`)}</Tile>
          <Tile title={t("sharing.canEdit")}>{t(`sharing.help.${kind}.edit`)}</Tile>
        </div>
        <p className="text-muted-fg text-xs leading-normal">{t("sharing.footnote")}</p>
      </DialogShellBody>
      <DialogShellFooter>
        {pending ? (
          <Button
            type="button"
            variant="outline"
            className={FOOT_BUTTON}
            onClick={() => {
              setAdds([]);
              input.current?.focus();
            }}
          >
            {t("common.cancel")}
          </Button>
        ) : null}
        <Button
          type="button"
          className={FOOT_BUTTON}
          aria-disabled={share.isPending || undefined}
          onClick={() => {
            if (!pending) close();
            else if (!share.isPending) share.mutate();
          }}
        >
          {t(pending ? "sharing.share" : "sharing.done")}
        </Button>
      </DialogShellFooter>
      <ConfirmDialog
        open={stopping !== null}
        onOpenChange={(next) => !next && setStopping(null)}
        title={t("sharing.stopTitle", { name: stopping?.grantee.fullName ?? "" })}
        description={t("sharing.stopBody")}
        confirmLabel={t("sharing.stopConfirm")}
        destructive
        pending={stop.isPending}
        returnFocus={afterStop}
        onConfirm={() => stopping && stop.mutate(stopping)}
      />
    </DialogShell>
  );
}

function Person({ name, email }: Readonly<{ name: string; email: string }>) {
  return (
    <span className="min-w-0 flex-1">
      <span className="text-ui block truncate font-medium">{name}</span>
      <span className="text-muted-fg block truncate text-xs">{email}</span>
    </span>
  );
}

function Tile({ title, children }: Readonly<{ title: string; children: string }>) {
  return (
    <div className="bg-muted rounded-ctl text-meta p-3 leading-normal">
      <b className="mb-1 block font-semibold">{title}</b>
      <span className="text-muted-fg">{children}</span>
    </div>
  );
}

/** PeopleState stands in for "People with access" until it loads: three bar rows, or the error line with Retry. */
function PeopleState({
  failed,
  onRetry,
}: Readonly<{ failed: boolean; onRetry: () => void }>) {
  const { t } = useTranslation();
  if (failed)
    return (
      <Alert variant="danger">
        <CircleAlert aria-hidden="true" />
        <div className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="min-w-0 flex-[1_1_180px]">{t("sharing.loadFailed")}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="max-[767px]:h-11"
          >
            {t("common.retry")}
          </Button>
        </div>
      </Alert>
    );
  return (
    <div role="status" aria-label={t("common.loading")}>
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          aria-hidden="true"
          className={cn("flex items-center gap-3 py-2", row > 0 && "border-t")}
        >
          <Skeleton className="size-8 flex-none rounded-full" />
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className={cn("h-3 rounded-md", row === 0 ? "w-2/5" : "w-1/2")} />
            <Skeleton className="h-2.5 w-3/5 rounded-md" />
          </span>
          <Skeleton className="rounded-seg h-8 w-24 flex-none" />
        </div>
      ))}
    </div>
  );
}
