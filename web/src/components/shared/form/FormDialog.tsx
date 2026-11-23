import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type SubmitEvent,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DialogShell,
  DialogShellBody,
  DialogShellFooter,
  DialogShellHeader,
} from "./DialogShell";
import { FieldControl } from "./fields/FieldControl";
import { fieldErrors, optionalField, visibleFields } from "./fields/rules";
import type { FormField, FormValues } from "./fields/types";
export type {
  FormField,
  FormOption,
  FormIconOption,
  FormColorOption,
  FormInfoRow,
  FormValue,
  FormValues,
} from "./fields/types";

/** FormDialogProps describes a controlled typed form whose caller owns submission and dismissal. */
export type FormDialogProps<V extends FormValues> = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string | ((values: V) => string);
  description?: ReactNode | ((values: V) => ReactNode);
  icon?: LucideIcon | undefined;
  danger?: boolean;
  /** Announces the dialog as an alert: a question whose answer cannot be taken back. */
  alert?: boolean;
  width?: number | undefined;
  className?: string | undefined;
  initial: V;
  fields: readonly FormField<V>[];
  validate?: (values: V) => Partial<Record<keyof V & string, string>> | null;
  /**
   * Shows what `validate` finds as soon as the values hold it, rather than
   * after a submit, for a rule about a choice already made (a set that is
   * full). Required fields still wait for a submit.
   */
  liveErrors?: boolean;
  /**
   * Works out the values after a field changes, from the values the change
   * made and the ones before it: for a field that follows another until the
   * reader edits it (New session's Room follows its Class).
   */
  derive?: ((next: V, previous: V) => V) | undefined;
  submitLabel: string | ((values: V) => string);
  cancelLabel?: string | undefined;
  hideCancel?: boolean;
  pending?: boolean;
  disabled?: boolean;
  error?: string | null;
  onSubmit: (values: V) => void;
  children?: ReactNode;
  returnFocus?: RefObject<HTMLElement | null> | undefined;
}>;

const FIRST_FIELD =
  "input:not([type='hidden']):not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex='-1'])";

/**
 * TYPED_FIELD is a field of a caller's own content (`children`) that the
 * dialog may open on: something to type in or to pick a value from. A tick
 * box, a link or a button there is not one, so a question that carries only
 * those still opens on Cancel.
 */
const TYPED_FIELD =
  "input:not([type='hidden']):not([type='checkbox']):not([type='radio']):not(:disabled), textarea:not(:disabled), select:not(:disabled), [role='combobox']:not(:disabled)";

/**
 * FormDialog edits typed values while open and unlocked, revealing visible
 * errors once a submission has been tried, valid or not, so that a rule the
 * caller finds only while handling a submit shows on its field. It opens with focus on its first field, or on the first field to type in or pick from that the caller passed as `children` (GF-5), or, when it has neither, on
 * Cancel, the safe answer, or on the submit of a notice without Cancel (F-50). While `pending` the control a submit starts from
 * keeps focus (T-35): the submit answers `aria-disabled` and ignores a press,
 * text fields turn read-only, a select answers `aria-disabled` and keeps
 * focus, and the other controls, which cannot start a submit, are disabled. A submit that starts while focus sits on such a
 * control (Safari and Firefox on macOS do not focus a clicked button, and a
 * picker returns focus to its trigger) first moves focus to the submit. `disabled`, when not pending, disables the submit and
 * the fields natively.
 */
export function FormDialog<V extends FormValues>({
  open,
  onOpenChange,
  title,
  description,
  icon,
  danger = false,
  alert = false,
  width,
  className,
  initial,
  fields,
  validate,
  liveErrors = false,
  derive,
  submitLabel,
  cancelLabel,
  hideCancel = false,
  pending = false,
  disabled = false,
  error = null,
  onSubmit,
  children,
  returnFocus,
}: FormDialogProps<V>) {
  const acceptsChanges = useRef(open && !pending && !disabled);
  useLayoutEffect(() => {
    acceptsChanges.current = open && !pending && !disabled;
    return () => {
      acceptsChanges.current = false;
    };
  }, [open, pending, disabled]);
  const { t } = useTranslation();
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState({
    open,
    values: initial,
    touched: false,
    epoch: 0,
  });
  if (state.open !== open)
    setState({
      open,
      values: open ? initial : state.values,
      touched: false,
      epoch: state.epoch + (open ? 1 : 0),
    });
  const values = state.values;
  const shown = visibleFields(fields, values);
  const found = validate?.(values) ?? null;
  const errors = fieldErrors(shown, values, t("formDialog.required"), found);
  const valid = Object.keys(errors).length === 0;
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || disabled) return;
    if (!valid) {
      setState((previous) => ({ ...previous, touched: true }));
      const first = shown.find((field) => errors[field.name]);
      if (first) {
        const block = Array.from(
          form.current?.querySelectorAll<HTMLElement>("[data-field-name]") ?? [],
        ).find((node) => node.dataset.fieldName === first.name);
        block
          ?.querySelector<HTMLElement>(
            "input:not([type='hidden']):not([aria-hidden='true']):not([hidden]),textarea,button,[tabindex='0']",
          )
          ?.focus();
      }
      return;
    }
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      form.current?.contains(active) &&
      !(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)
    )
      submitButton.current?.focus();
    setState((previous) =>
      previous.touched ? previous : { ...previous, touched: true },
    );
    onSubmit(values);
  }
  const body = shown.length > 0 || children !== undefined || error !== null;
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      width={width}
      className={className}
      returnFocus={returnFocus}
      {...(alert ? { role: "alertdialog" } : {})}
      onOpenAutoFocus={(event) => {
        const first =
          form.current?.querySelector<HTMLElement>(FIRST_FIELD) ??
          content.current?.querySelector<HTMLElement>(TYPED_FIELD) ??
          cancelButton.current ??
          submitButton.current;
        if (!first) return;
        event.preventDefault();
        first.focus();
      }}
    >
      <DialogShellHeader
        title={typeof title === "function" ? title(values) : title}
        description={
          typeof description === "function" ? description(values) : description
        }
        icon={icon ?? (danger ? TriangleAlert : undefined)}
        tone={danger ? "danger" : "neutral"}
      />
      {body && (
        <DialogShellBody ref={content}>
          <form
            ref={form}
            id={id}
            noValidate
            onSubmit={submit}
            className="flex flex-col gap-3.5"
          >
            <fieldset disabled={disabled && !pending} className="contents">
              {shown.map((field) => {
                const fieldId = `${id}-${field.name}`;
                const message =
                  state.touched || (liveErrors && found?.[field.name])
                    ? errors[field.name]
                    : undefined;
                const hint =
                  typeof field.hint === "function" ? field.hint(values) : field.hint;
                const describedBy =
                  [hint ? `${fieldId}-hint` : null, message ? `${fieldId}-error` : null]
                    .filter(Boolean)
                    .join(" ") || undefined;
                return (
                  <div
                    key={`${state.epoch}-${field.name}`}
                    data-field-name={field.name}
                    aria-invalid={message !== undefined || undefined}
                    className="flex flex-col gap-1.5"
                  >
                    {field.label && field.kind !== "toggle" && !field.hideLabel && (
                      <label htmlFor={fieldId} className="text-meta font-medium">
                        {field.label}
                        {optionalField(field) && (
                          <span className="text-muted-fg font-normal">
                            {" "}
                            {t("formDialog.optional")}
                          </span>
                        )}
                      </label>
                    )}
                    <FieldControl
                      field={field}
                      values={values}
                      id={fieldId}
                      invalid={message !== undefined}
                      describedBy={describedBy}
                      disabled={!open || (disabled && !pending)}
                      locked={pending}
                      onChange={(next) => {
                        if (!acceptsChanges.current) return;
                        setState((previous) => {
                          const changed = { ...previous.values, [field.name]: next };
                          return {
                            ...previous,
                            values: derive ? derive(changed, previous.values) : changed,
                          };
                        });
                      }}
                    />
                    {hint && (
                      <p
                        id={`${fieldId}-hint`}
                        className="text-muted-fg text-xs leading-[1.45]"
                      >
                        {hint}
                      </p>
                    )}
                    {message && (
                      <p id={`${fieldId}-error`} className="text-danger-ink text-xs">
                        {message}
                      </p>
                    )}
                  </div>
                );
              })}
            </fieldset>
          </form>
          {children}
          {error !== null && (
            <p role="alert" className="text-danger-ink text-xs">
              {error}
            </p>
          )}
        </DialogShellBody>
      )}
      {!body && <form id={id} noValidate onSubmit={submit} />}
      <DialogShellFooter>
        {!hideCancel && (
          <Button
            ref={cancelButton}
            type="button"
            variant="outline"
            className="bg-card text-ui h-9 px-3.5 leading-normal shadow-none"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel ?? t("common.cancel")}
          </Button>
        )}
        <Button
          ref={submitButton}
          type="submit"
          form={id}
          variant={danger ? "destructive" : "default"}
          disabled={disabled && !pending}
          aria-disabled={pending || !valid || undefined}
          className={cn(
            "text-ui h-9 px-4 leading-normal shadow-none",
            // The destructive variant draws its own colours, paused ones included: its label reads 5.37:1.
            !danger && "aria-disabled:bg-primary/55 aria-disabled:hover:bg-primary/55",
          )}
        >
          {typeof submitLabel === "function" ? submitLabel(values) : submitLabel}
        </Button>
      </DialogShellFooter>
    </DialogShell>
  );
}
