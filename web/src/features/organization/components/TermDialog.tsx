import { useId, useRef, useState, type RefObject, type SubmitEvent } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { CalendarRange, CircleAlert } from "lucide-react";
import {
  DialogShell,
  DialogShellBody,
  DialogShellFooter,
  DialogShellHeader,
} from "@/components/shared/form/DialogShell";
import { DateField } from "@/components/shared/form/fields/DateField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import {
  useCreateTerm,
  useUpdateTerm,
  type Term,
  type TermPatch,
} from "@/features/organization/api";
import { ApiError, failureMessage } from "@/lib/api/errors";

/** TERM_NAME_MAX is the longest name the contract takes (`TermName`). */
const TERM_NAME_MAX = 60;

type Draft = { name: string; startsOn: string; endsOn: string };

type Overlap = Readonly<{ name: string; startsOn: string; endsOn: string }>;

function draftOf(term: Term | null): Draft {
  return term === null
    ? { name: "", startsOn: "", endsOn: "" }
    : { name: term.name, startsOn: term.startsOn, endsOn: term.endsOn };
}

function changesOf(term: Term, sent: Draft): TermPatch {
  const body: TermPatch = {};
  if (sent.name !== term.name) body.name = sent.name;
  if (sent.startsOn !== term.startsOn) body.startsOn = sent.startsOn;
  if (sent.endsOn !== term.endsOn) body.endsOn = sent.endsOn;
  return body;
}

function DateBlock({
  id,
  label,
  value,
  invalid,
  message,
  describedBy,
  disabled,
  onChange,
}: Readonly<{
  id: string;
  label: string;
  value: string;
  invalid: boolean;
  message: string | null;
  describedBy: string | undefined;
  disabled: boolean;
  onChange: (next: string) => void;
}>) {
  const own = message === null ? undefined : `${id}-error`;
  const described = [own, describedBy].filter(Boolean).join(" ") || undefined;
  return (
    <div data-field={id} className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-meta font-medium">
        {label}
      </label>
      <DateField
        id={id}
        label={label}
        value={value}
        invalid={invalid}
        describedBy={described}
        disabled={disabled}
        onChange={onChange}
      />
      {message === null ? null : (
        <p id={own} className="text-danger-ink text-xs">
          {message}
        </p>
      )}
    </div>
  );
}

type Field = "name" | "starts" | "ends";

/** checkDraft judges a draft as the form does, before anything is sent. */
function checkDraft(draft: Draft, term: Term | null, overlap: Overlap | null) {
  const missing = {
    name: draft.name.trim() === "",
    starts: draft.startsOn === "",
    ends: draft.endsOn === "",
  };
  const reversed = !missing.starts && !missing.ends && draft.endsOn < draft.startsOn;
  const overlapping =
    overlap !== null &&
    overlap.startsOn === draft.startsOn &&
    overlap.endsOn === draft.endsOn;
  const endMoved = term !== null && !missing.ends && draft.endsOn !== term.endsOn;
  let first: Field | null = null;
  if (missing.name) first = "name";
  else if (missing.starts || overlapping) first = "starts";
  else if (missing.ends || reversed) first = "ends";
  return { missing, reversed, overlapping, endMoved, first };
}

/**
 * useTermSave sends a draft: an add for no `term`, otherwise the fields that
 * changed, and nothing when none did. It keeps the range the server refused
 * as overlapping, with the other term's name, and any other failure's
 * message.
 */
function useTermSave(
  term: Term | null,
  onSaved: ((term: Term) => void) | undefined,
  onOpenChange: (open: boolean) => void,
) {
  const { t } = useTranslation();
  const create = useCreateTerm();
  const update = useUpdateTerm();
  const [overlap, setOverlap] = useState<Overlap | null>(null);
  const [error, setError] = useState<string | null>(null);

  function failed(cause: unknown, sent: Draft) {
    const other =
      cause instanceof ApiError && cause.code === "TERM_OVERLAPS"
        ? cause.details?.["name"]
        : undefined;
    if (typeof other === "string" && other !== "")
      setOverlap({ name: other, startsOn: sent.startsOn, endsOn: sent.endsOn });
    else setError(failureMessage(cause, t("api.failed")));
  }

  function landed(stored: Term, message: "added" | "saved") {
    toast(t(`systemSettings.terms.${message}`, { name: stored.name }));
    onSaved?.(stored);
    onOpenChange(false);
  }

  function save(sent: Draft) {
    setError(null);
    const options = (message: "added" | "saved") => ({
      onSuccess: (stored: Term) => landed(stored, message),
      onError: (cause: unknown) => failed(cause, sent),
    });
    if (term === null) {
      create.mutate(sent, options("added"));
      return;
    }
    const body = changesOf(term, sent);
    if (Object.keys(body).length === 0) onOpenChange(false);
    else update.mutate({ id: term.id, body }, options("saved"));
  }

  function reset() {
    setOverlap(null);
    setError(null);
  }

  return { pending: create.isPending || update.isPending, overlap, error, save, reset };
}

type Check = ReturnType<typeof checkDraft>;

/**
 * notesOf is what the form says: "Required" under an empty field once a save
 * has been tried, the refused range under the two days, the line about
 * repeating sessions when an edited term's end moves, and which days are
 * marked.
 */
function notesOf(check: Check, overlap: Overlap | null, tried: boolean, t: TFunction) {
  const required = t("formDialog.required");
  let range: string | null = null;
  if (check.reversed) range = t("systemSettings.terms.endBeforeStart");
  else if (check.overlapping && overlap !== null)
    range = t("systemSettings.terms.overlaps", { name: overlap.name });
  const startEmpty = tried && check.missing.starts;
  const endEmpty = tried && check.missing.ends;
  return {
    name: tried && check.missing.name ? required : null,
    starts: startEmpty ? required : null,
    ends: endEmpty ? required : null,
    startInvalid: startEmpty || check.overlapping,
    endInvalid: endEmpty || check.reversed || check.overlapping,
    range,
    hint: check.endMoved && range === null ? t("systemSettings.terms.endHint") : null,
  };
}

const NOTE_TONES = {
  field: "text-danger-ink text-xs",
  range: "text-danger-ink text-meta -mt-1.5 flex items-start gap-1.5 leading-normal",
  hint: "text-muted-fg text-meta -mt-1.5 leading-normal text-pretty",
  failure: "text-danger-ink text-xs",
} as const;

/** Note is one line under the fields, or nothing while `text` is null. */
function Note({
  id,
  tone,
  text,
}: Readonly<{ id?: string; tone: keyof typeof NOTE_TONES; text: string | null }>) {
  if (text === null) return null;
  const alert = tone === "range" || tone === "failure";
  return (
    <p id={id} role={alert ? "alert" : undefined} className={NOTE_TONES[tone]}>
      {tone === "range" ? (
        <>
          <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 flex-none" />
          <span className="min-w-0 flex-1 text-pretty">{text}</span>
        </>
      ) : (
        text
      )}
    </p>
  );
}

/**
 * TermDialog adds a term, when `term` is null, or edits `term`: a name and
 * the two days, on the product's date picker. It saves itself and closes,
 * with a toast that names the term; it is no part of the settings form's
 * unsaved changes. An end before the start is caught as soon as both days
 * are picked, and nothing is sent. A range the server finds sharing a day
 * with another term reads "Overlaps {name}" under the two days, both
 * marked, until either day changes. While a term is edited, moving its end
 * says that repeating sessions already made keep their old last date. Each
 * opening starts from `term` again. A save in flight keeps the name
 * focusable and read-only, and the submit answers `aria-disabled`.
 */
export function TermDialog({
  open,
  term,
  onOpenChange,
  onSaved,
  returnFocus,
}: Readonly<{
  open: boolean;
  term: Term | null;
  onOpenChange: (open: boolean) => void;
  /** Called with the stored term once a save lands, just before the dialog closes. */
  onSaved?: ((term: Term) => void) | undefined;
  returnFocus?: RefObject<HTMLElement | null> | undefined;
}>) {
  const { t } = useTranslation();
  const id = useId();
  const { pending, overlap, error, save, reset } = useTermSave(
    term,
    onSaved,
    onOpenChange,
  );
  const nameInput = useRef<HTMLInputElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);

  const [shownOpen, setShownOpen] = useState(open);
  const [draft, setDraft] = useState<Draft>(() => draftOf(term));
  const [tried, setTried] = useState(false);
  if (shownOpen !== open) {
    setShownOpen(open);
    if (open) {
      setDraft(draftOf(term));
      setTried(false);
      reset();
    }
  }

  const check = checkDraft(draft, term, overlap);
  const notes = notesOf(check, overlap, tried, t);
  const nameId = `${id}-name`;
  const startId = `${id}-starts`;
  const endId = `${id}-ends`;
  const rangeId = `${id}-range`;
  const hintId = `${id}-hint`;
  const rangeDescribed =
    [notes.range === null ? null : rangeId, notes.hint === null ? null : hintId]
      .filter(Boolean)
      .join(" ") || undefined;

  function edit(field: keyof Draft, value: string) {
    if (pending) return;
    setDraft((previous) => ({ ...previous, [field]: value }));
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setTried(true);
    if (check.first === "name") {
      nameInput.current?.focus();
      return;
    }
    if (check.first !== null) {
      const field = check.first === "starts" ? startId : endId;
      form.current
        ?.querySelector<HTMLElement>(`[data-field="${field}"] button`)
        ?.focus();
      return;
    }
    // The date pickers are disabled while the save is in flight: focus waits on the submit.
    if (!(document.activeElement instanceof HTMLInputElement))
      submitButton.current?.focus();
    save({ ...draft, name: draft.name.trim() });
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      returnFocus={returnFocus}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        nameInput.current?.focus();
      }}
    >
      <DialogShellHeader
        title={t(
          term === null ? "systemSettings.terms.add" : "systemSettings.terms.editTitle",
        )}
        icon={CalendarRange}
      />
      <DialogShellBody>
        <form
          ref={form}
          id={id}
          noValidate
          onSubmit={submit}
          className="flex flex-col gap-3.5"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor={nameId} className="text-meta font-medium">
              {t("systemSettings.terms.name")}
            </label>
            <Input
              ref={nameInput}
              id={nameId}
              value={draft.name}
              placeholder={t("systemSettings.terms.namePlaceholder")}
              maxLength={TERM_NAME_MAX}
              autoComplete="off"
              readOnly={pending}
              aria-invalid={notes.name !== null || undefined}
              aria-describedby={notes.name === null ? undefined : `${nameId}-error`}
              onChange={(event) => edit("name", event.target.value)}
            />
            <Note id={`${nameId}-error`} tone="field" text={notes.name} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <DateBlock
              id={startId}
              label={t("systemSettings.terms.starts")}
              value={draft.startsOn}
              invalid={notes.startInvalid}
              message={notes.starts}
              describedBy={check.overlapping ? rangeId : undefined}
              disabled={pending}
              onChange={(next) => edit("startsOn", next)}
            />
            <DateBlock
              id={endId}
              label={t("systemSettings.terms.ends")}
              value={draft.endsOn}
              invalid={notes.endInvalid}
              message={notes.ends}
              describedBy={rangeDescribed}
              disabled={pending}
              onChange={(next) => edit("endsOn", next)}
            />
          </div>
          <Note id={rangeId} tone="range" text={notes.range} />
          <Note id={hintId} tone="hint" text={notes.hint} />
          <Note tone="failure" text={error} />
        </form>
      </DialogShellBody>
      <DialogShellFooter>
        <Button
          type="button"
          variant="outline"
          className="bg-card text-ui h-9 px-3.5 leading-normal shadow-none"
          onClick={() => onOpenChange(false)}
        >
          {t("common.cancel")}
        </Button>
        <Button
          ref={submitButton}
          type="submit"
          form={id}
          aria-disabled={pending || check.first !== null || undefined}
          className="text-ui aria-disabled:bg-primary/55 aria-disabled:hover:bg-primary/55 h-9 px-4 leading-normal shadow-none"
        >
          {term === null ? t("systemSettings.terms.add") : t("common.save")}
        </Button>
      </DialogShellFooter>
    </DialogShell>
  );
}
