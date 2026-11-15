import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { LoadError } from "@/components/shared/ListState";
import { Sheet } from "@/components/shared/Sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import {
  LEAD_NOTE_MAX,
  LEAD_STATUSES,
  deleteLead,
  leadQuery,
  refreshAfterRemoval,
  refreshLeads,
  updateLead,
  type Lead,
  type LeadStatus,
  type LeadUpdate,
} from "@/features/leads/api";
import { InterestChips, PhoneLink } from "@/features/leads/components/LeadCells";
import { ApiError, failureMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/i18n/datetime";
import { useLocale } from "@/lib/i18n/useLocale";

type Draft = Readonly<{ status?: LeadStatus; note?: string }>;

function Fact({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex justify-between gap-3 px-3 py-2.5 text-[13px]">
      <dt className="text-muted-fg flex-none">{label}</dt>
      <dd className="flex min-w-0 justify-end text-right font-medium break-words">
        {children}
      </dd>
    </div>
  );
}

function Facts({ lead }: Readonly<{ lead: Lead }>) {
  const { t } = useTranslation();
  const locale = useLocale();
  return (
    <dl className="divide-y rounded-[10px] border">
      <Fact label={t("leads.column.phone")}>
        <PhoneLink phone={lead.phone} />
      </Fact>
      <Fact label={t("leads.column.interests")}>
        <InterestChips interests={lead.interests} end />
      </Fact>
      <Fact label={t("leads.column.for")}>{t(`leads.for.${lead.courseFor}`)}</Fact>
      <Fact label={t("leads.column.time")}>{t(`leads.time.${lead.callTime}`)}</Fact>
      <Fact label={t("leads.column.received")}>
        {formatDateTime(lead.createdAt, locale)}
      </Fact>
      <Fact label={t("common.language")}>{t(`settings.locale.${lead.locale}`)}</Fact>
      <Fact label={t("leads.consent")}>
        {t("leads.consented", {
          version: lead.privacyNoticeVersion,
          at: formatDateTime(lead.consentedAt, locale),
        })}
      </Fact>
      {lead.handledAt === null ? null : (
        <Fact label={t("leads.handled")}>
          {[lead.handledBy?.name, formatDateTime(lead.handledAt, locale)]
            .filter((part) => part !== undefined)
            .join(" · ")}
        </Fact>
      )}
    </dl>
  );
}

function SheetSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t("common.loading")} className="flex flex-col gap-3">
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function Handling({
  status,
  note,
  pending,
  error,
  onStatus,
  onNote,
}: Readonly<{
  status: LeadStatus;
  note: string;
  pending: boolean;
  error: string | null;
  onStatus: (status: LeadStatus) => void;
  onNote: (note: string) => void;
}>) {
  const { t } = useTranslation();
  const noteId = useId();
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-meta font-semibold">{t("common.status")}</span>
        <Segmented
          label={t("common.status")}
          value={status}
          options={LEAD_STATUSES.map((value) => ({
            value,
            label: t(`leads.status.${value}`),
          }))}
          onChange={(value) => {
            const next = LEAD_STATUSES.find((option) => option === value);
            if (next !== undefined) onStatus(next);
          }}
          pending={pending}
          fill
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={noteId} className="text-meta font-semibold">
          {t("leads.note")}
        </Label>
        <Textarea
          id={noteId}
          className="bg-bg min-h-24"
          maxLength={LEAD_NOTE_MAX}
          readOnly={pending}
          value={note}
          onChange={(event) => onNote(event.target.value)}
        />
      </div>
      {error === null ? null : (
        <p role="alert" className="text-danger-ink text-meta">
          {error}
        </p>
      )}
    </>
  );
}

function noteOf(text: string): string | null {
  const note = text.trim();
  return note === "" ? null : note;
}

function changesOf(lead: Lead, status: LeadStatus, note: string): LeadUpdate | null {
  const changes: LeadUpdate = {};
  const kept = noteOf(note);
  if (status !== lead.status) changes.status = status;
  if (kept !== lead.note) changes.note = kept;
  return Object.keys(changes).length === 0 ? null : changes;
}

function missing(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 400);
}

/**
 * LeadSheet is the sheet of the consultation request `leadId` names, 440px at
 * the right edge and the whole width on a phone: every field the form sent,
 * the language it was sent in, the privacy notice's version and when the
 * person agreed to it, and who last changed the status and when. Status and
 * Note are edited here: Save sends only what changed and is paused while
 * nothing has, and afterwards the list, this request and the sidebar's count
 * are read again. An edit that was not saved is dropped when the sheet shows
 * another request or closes. Delete asks first, removes the request for good
 * and closes the sheet through `onDeleted`; the list and the count are then
 * read again, and what was read of the request is dropped once the sheet has
 * left it. An id that answers 404 or 400 says the request was not found.
 * `onClose` clears the address.
 */
export function LeadSheet({
  leadId,
  onClose,
  onDeleted,
}: Readonly<{
  leadId: string | null;
  onClose: () => void;
  onDeleted: () => void;
}>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const client = useQueryClient();
  const detail = useQuery({ ...leadQuery(leadId ?? ""), enabled: leadId !== null });
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [shown, setShown] = useState(leadId);
  const busy = useRef(false);
  const removed = useRef<string | null>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const id = removed.current;
    if (id === null || id === leadId) return;
    removed.current = null;
    client.removeQueries({ queryKey: leadQuery(id).queryKey });
  }, [leadId, client]);
  if (shown !== leadId) {
    setShown(leadId);
    setDraft({});
    setError(null);
    setConfirming(false);
    setRefusal(null);
  }
  const gone = detail.isError && missing(detail.error);
  const lead = gone ? undefined : detail.data;
  const status = draft.status ?? lead?.status ?? "new";
  const note = draft.note ?? lead?.note ?? "";
  const changes = lead === undefined ? null : changesOf(lead, status, note);
  const paused = saving || deleting;

  async function save(target: Lead, body: LeadUpdate) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const stored = await updateLead(target.id, body);
      client.setQueryData(leadQuery(target.id).queryKey, stored);
      setDraft({});
      toast(t("leads.saved"));
      void refreshLeads(client);
    } catch (cause) {
      setError(failureMessage(cause, t("common.actionFailed")));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  async function remove(target: Lead) {
    if (busy.current) return;
    busy.current = true;
    setDeleting(true);
    setRefusal(null);
    try {
      await deleteLead(target.id);
      removed.current = target.id;
      setConfirming(false);
      toast(t("common.deleted"));
      onDeleted();
      void refreshAfterRemoval(client);
    } catch (cause) {
      setRefusal(failureMessage(cause, t("common.actionFailed")));
    } finally {
      busy.current = false;
      setDeleting(false);
    }
  }

  return (
    <>
      <Sheet
        open={leadId !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        width={440}
        title={lead?.fullName ?? t("leads.one")}
        subtitle={
          lead === undefined ? undefined : formatDateTime(lead.createdAt, locale)
        }
        footer={
          lead === undefined ? undefined : (
            <>
              <Button
                ref={deleteButton}
                type="button"
                variant="outline"
                className="text-danger-ink mr-auto"
                aria-disabled={paused || undefined}
                onClick={() => {
                  if (paused) return;
                  setRefusal(null);
                  setConfirming(true);
                }}
              >
                <Trash2 aria-hidden="true" />
                {t("common.delete")}
              </Button>
              <Button
                type="button"
                aria-disabled={changes === null || paused || undefined}
                onClick={() => {
                  if (changes !== null && !paused) void save(lead, changes);
                }}
              >
                {saving ? t("common.saving") : t("common.save")}
              </Button>
            </>
          )
        }
      >
        {gone ? (
          <p role="alert" className="text-muted-fg text-ui">
            {t("leads.notFound")}
          </p>
        ) : null}
        {detail.isError && !gone ? (
          <LoadError error={detail.error} onRetry={() => void detail.refetch()}>
            {t("leads.oneFailed")}
          </LoadError>
        ) : null}
        {lead === undefined ? (
          detail.isPending && leadId !== null && <SheetSkeleton />
        ) : (
          <>
            <Facts lead={lead} />
            <Handling
              status={status}
              note={note}
              pending={saving}
              error={error}
              onStatus={(next) => setDraft((current) => ({ ...current, status: next }))}
              onNote={(next) => setDraft((current) => ({ ...current, note: next }))}
            />
          </>
        )}
      </Sheet>
      <ConfirmDialog
        open={confirming && lead !== undefined}
        onOpenChange={(open) => {
          if (!open && !deleting) setConfirming(false);
        }}
        destructive
        icon={Trash2}
        returnFocus={deleteButton}
        title={t("leads.delete.title")}
        description={t("leads.delete.body")}
        confirmLabel={t("common.delete")}
        pending={deleting}
        error={refusal}
        onConfirm={() => {
          if (lead !== undefined) void remove(lead);
        }}
      />
    </>
  );
}
