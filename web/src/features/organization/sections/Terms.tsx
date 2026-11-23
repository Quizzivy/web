import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, RotateCw, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DataTable, type DataColumn } from "@/components/shared/data/DataTable";
import { RowMenu } from "@/components/shared/RowMenu";
import { SettingsCard } from "@/components/shared/SettingsCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { termsQuery, useDeleteTerm, type Term } from "@/features/organization/api";
import { TermDialog } from "@/features/organization/components/TermDialog";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { failureMessage } from "@/lib/api/errors";
import { dayMonthYear } from "@/lib/i18n/datetime";
import { useLocale } from "@/lib/i18n/useLocale";

type Locale = ReturnType<typeof useLocale>;

/** STATE_BADGES gives each of a term's states its one badge. */
const STATE_BADGES = {
  current: "success",
  upcoming: "info",
  past: "secondary",
} as const satisfies Record<Term["state"], string>;

const NAME_TRACK = "minmax(150px,1.5fr)";
const DATE_TRACK = "minmax(104px,1fr)";
const STATE_TRACK = "112px";
const MENU_TRACK = "34px";
const SKELETON_WIDTHS = ["w-[46%]", "w-[38%]", "w-[42%]"] as const;

/** termDay is a term's `YYYY-MM-DD` day as the product writes a date with its year. */
function termDay(day: string, locale: Locale) {
  return dayMonthYear(`${day}T12:00:00Z`, locale, "UTC");
}

function TermState({ state }: Readonly<{ state: Term["state"] }>) {
  const { t } = useTranslation();
  return (
    <Badge variant={STATE_BADGES[state]}>
      {t(`systemSettings.terms.state.${state}`)}
    </Badge>
  );
}

type Acting = (term: Term, from: RefObject<HTMLElement | null>) => void;

function TermMenuItems({
  term,
  from,
  onEdit,
  onDelete,
}: Readonly<{
  term: Term;
  from: RefObject<HTMLElement | null>;
  onEdit: Acting;
  onDelete: Acting;
}>) {
  const { t } = useTranslation();
  return (
    <>
      <DropdownMenuItem onSelect={() => onEdit(term, from)}>
        <Pencil aria-hidden="true" />
        {t("systemSettings.terms.edit")}
      </DropdownMenuItem>
      <DropdownMenuItem variant="destructive" onSelect={() => onDelete(term, from)}>
        <Trash2 aria-hidden="true" />
        {t("systemSettings.terms.delete")}
      </DropdownMenuItem>
    </>
  );
}

function PhoneRow({
  term,
  onEdit,
  onDelete,
}: Readonly<{ term: Term; onEdit: Acting; onDelete: Acting }>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <li className="flex items-center gap-2.5 border-t py-3 pr-2.5 pl-4 first:border-t-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.75">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ui min-w-0 font-medium">{term.name}</span>
          <TermState state={term.state} />
        </div>
        <span className="text-muted-fg text-meta tabular-nums">
          {termDay(term.startsOn, locale)} – {termDay(term.endsOn, locale)}
        </span>
      </div>
      <RowMenu
        triggerRef={trigger}
        label={t("systemSettings.terms.actions", { name: term.name })}
      >
        <TermMenuItems term={term} from={trigger} onEdit={onEdit} onDelete={onDelete} />
      </RowMenu>
    </li>
  );
}

function Loading({ wide }: Readonly<{ wide: boolean }>) {
  const { t } = useTranslation();
  const columns: readonly DataColumn<{ id: string }>[] = [
    {
      id: "name",
      header: t("systemSettings.terms.name"),
      track: NAME_TRACK,
      cell: ({ id }) => (
        <Skeleton className={`h-2.75 ${SKELETON_WIDTHS[Number(id)] ?? "w-[40%]"}`} />
      ),
    },
    {
      id: "starts",
      header: t("systemSettings.terms.starts"),
      track: DATE_TRACK,
      cell: () => <Skeleton className="h-2.75 w-18" />,
    },
    {
      id: "ends",
      header: t("systemSettings.terms.ends"),
      track: DATE_TRACK,
      cell: () => <Skeleton className="h-2.75 w-18" />,
    },
    {
      id: "state",
      header: t("common.status"),
      hideHeader: true,
      track: STATE_TRACK,
      cell: () => <Skeleton className="h-5.5 w-20" />,
    },
  ];
  const rows = SKELETON_WIDTHS.map((_, index) => ({ id: String(index) }));
  return (
    <div role="status" aria-label={t("common.loading")}>
      <div aria-hidden="true">
        {wide ? (
          <DataTable
            label={t("systemSettings.terms.title")}
            columns={columns}
            rows={rows}
            rowSize={{ minHeight: 52 }}
            menu={() => null}
            menuTrack={MENU_TRACK}
            padX={18}
            framed={false}
          />
        ) : (
          rows.map(({ id }) => (
            <div
              key={id}
              className="flex flex-col gap-2 border-t px-4 py-3.5 first:border-t-0"
            >
              <Skeleton
                className={`h-2.75 ${SKELETON_WIDTHS[Number(id)] ?? "w-[40%]"}`}
              />
              <Skeleton className="h-2.5 w-[60%]" />
            </div>
          ))
        )}
      </div>
      <p className="text-muted-fg text-meta border-t p-2.5 text-center leading-normal">
        {t("common.loading")}
      </p>
    </div>
  );
}

function Message({
  text,
  alert = false,
  action,
}: Readonly<{ text: string; alert?: boolean; action: ReactNode }>) {
  return (
    <div className="flex flex-col items-center gap-3 px-4.5 py-9 text-center">
      <p
        role={alert ? "alert" : undefined}
        className="text-muted-fg text-ui max-w-[46ch] leading-normal text-pretty"
      >
        {text}
      </p>
      {action}
    </div>
  );
}

type TermsHostValue = Readonly<{
  opened: boolean;
  addButton: RefObject<HTMLButtonElement | null>;
  add: (from: RefObject<HTMLElement | null>) => void;
  edit: Acting;
  askDelete: Acting;
}>;

const TermsHostContext = createContext<TermsHostValue | null>(null);

/**
 * TermsHost holds what System settings' Terms keeps while its card is drawn
 * again, as it is when the settings document arrives and the page swaps its
 * placeholder sections for the form: whether the section has been shown,
 * which is when its list is first read, and its two dialogs, Add or edit a
 * term and the confirm before a delete, which it renders after `children`.
 * Focus goes back to what opened a dialog, and after a delete, or an add from
 * the empty card, to the card's Add term.
 */
export function TermsHost({
  shown,
  children,
}: Readonly<{ shown: boolean; children: ReactNode }>) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(shown);
  if (shown && !opened) setOpened(true);
  const remove = useDeleteTerm();
  const addButton = useRef<HTMLButtonElement>(null);
  const origin = useRef<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; term: Term | null }>({
    open: false,
    term: null,
  });
  const [removing, setRemoving] = useState<{ open: boolean; term: Term | null }>({
    open: false,
    term: null,
  });
  const [removeError, setRemoveError] = useState<string | null>(null);

  const value = useMemo<TermsHostValue>(
    () => ({
      opened,
      addButton,
      add: (from) => {
        origin.current = from.current;
        setDialog({ open: true, term: null });
      },
      edit: (term, from) => {
        origin.current = from.current;
        setDialog({ open: true, term });
      },
      askDelete: (term, from) => {
        origin.current = from.current;
        setRemoveError(null);
        setRemoving({ open: true, term });
      },
    }),
    [opened],
  );

  function confirmDelete() {
    const term = removing.term;
    if (term === null || remove.isPending) return;
    setRemoveError(null);
    remove.mutate(term.id, {
      onSuccess: () => {
        toast(t("systemSettings.terms.deleted", { name: term.name }));
        origin.current = addButton.current;
        setRemoving((previous) => ({ ...previous, open: false }));
      },
      onError: (cause) => setRemoveError(failureMessage(cause, t("api.failed"))),
    });
  }

  return (
    <TermsHostContext.Provider value={value}>
      {children}
      <TermDialog
        open={dialog.open}
        term={dialog.term}
        returnFocus={origin}
        onSaved={() => {
          // A term added from the empty card takes that card's button with it.
          if (dialog.term === null) origin.current = addButton.current;
        }}
        onOpenChange={(open) => setDialog((previous) => ({ ...previous, open }))}
      />
      <ConfirmDialog
        open={removing.open}
        onOpenChange={(open) => {
          if (!open && remove.isPending) return;
          setRemoving((previous) => ({ ...previous, open }));
        }}
        title={t("systemSettings.terms.deleteTitle", {
          name: removing.term?.name ?? "",
        })}
        description={t("systemSettings.terms.deleteBody")}
        confirmLabel={t("systemSettings.terms.deleteConfirm")}
        destructive
        alert
        pending={remove.isPending}
        error={removeError}
        returnFocus={origin}
        onConfirm={confirmDelete}
      />
    </TermsHostContext.Provider>
  );
}

/**
 * TermsSection is System settings' Terms, inside a TermsHost: the card
 * "Terms" with the line that says what a term is for and Add term in its
 * header, holding the centre's terms newest first, each with its name, its
 * two days and a pill for current, upcoming or past, which the server works
 * out. A row's menu edits it or, once asked, deletes it. Below 768px each
 * term is two lines with its menu. Until the section has been shown, and
 * while the list is read, three skeleton rows hold its place; a failed read
 * says so with Retry, and no term says what rates do without one. The
 * section saves itself, through its dialogs, and has no part in the page's
 * unsaved-changes bar.
 */
export function TermsSection() {
  const { t } = useTranslation();
  const locale = useLocale();
  const wide = useMediaQuery("(min-width: 768px)");
  const host = useContext(TermsHostContext);
  if (host === null) throw new Error("TermsSection is drawn inside a TermsHost.");
  const { opened, addButton, add, edit, askDelete } = host;
  const terms = useQuery({ ...termsQuery(), enabled: opened });

  const columns: readonly DataColumn<Term>[] = [
    {
      id: "name",
      header: t("systemSettings.terms.name"),
      track: NAME_TRACK,
      cell: (term) => <span className="block truncate font-medium">{term.name}</span>,
    },
    {
      id: "starts",
      header: t("systemSettings.terms.starts"),
      track: DATE_TRACK,
      cell: (term) => (
        <span className="text-muted-fg whitespace-nowrap tabular-nums">
          {termDay(term.startsOn, locale)}
        </span>
      ),
    },
    {
      id: "ends",
      header: t("systemSettings.terms.ends"),
      track: DATE_TRACK,
      cell: (term) => (
        <span className="text-muted-fg whitespace-nowrap tabular-nums">
          {termDay(term.endsOn, locale)}
        </span>
      ),
    },
    {
      id: "state",
      header: t("common.status"),
      hideHeader: true,
      track: STATE_TRACK,
      cell: (term) => <TermState state={term.state} />,
    },
  ];

  const items = terms.data?.items;
  const addLabel = t("systemSettings.terms.add");
  let content: ReactNode;
  if (terms.isError) {
    content = (
      <Message
        alert
        text={t("systemSettings.terms.loadFailed")}
        action={
          <Button
            type="button"
            variant="outline"
            className="h-9"
            onClick={() => void terms.refetch()}
          >
            <RotateCw aria-hidden="true" />
            {t("common.retry")}
          </Button>
        }
      />
    );
  } else if (items === undefined) {
    content = <Loading wide={wide} />;
  } else if (items.length === 0) {
    content = (
      <Message
        text={t("systemSettings.terms.empty")}
        action={<EmptyAdd label={addLabel} onAdd={add} />}
      />
    );
  } else if (wide) {
    content = (
      <DataTable
        label={t("systemSettings.terms.title")}
        columns={columns}
        rows={items}
        rowSize={{ minHeight: 52 }}
        menu={(term, { triggerRef }) => (
          <TermMenuItems
            term={term}
            from={triggerRef}
            onEdit={edit}
            onDelete={askDelete}
          />
        )}
        menuLabel={(term) => t("systemSettings.terms.actions", { name: term.name })}
        menuTrack={MENU_TRACK}
        padX={18}
        framed={false}
      />
    );
  } else {
    content = (
      <ul aria-label={t("systemSettings.terms.title")}>
        {items.map((term) => (
          <PhoneRow key={term.id} term={term} onEdit={edit} onDelete={askDelete} />
        ))}
      </ul>
    );
  }

  return (
    <SettingsCard
      title={t("systemSettings.terms.title")}
      description={t("systemSettings.terms.hint")}
      action={
        <Button
          ref={addButton}
          type="button"
          variant="outline"
          className="h-8.5"
          onClick={() => add(addButton)}
        >
          <Plus aria-hidden="true" />
          {addLabel}
        </Button>
      }
    >
      {content}
    </SettingsCard>
  );
}

function EmptyAdd({
  label,
  onAdd,
}: Readonly<{ label: string; onAdd: (from: RefObject<HTMLElement | null>) => void }>) {
  const button = useRef<HTMLButtonElement>(null);
  return (
    <Button
      ref={button}
      type="button"
      variant="outline"
      className="h-9"
      onClick={() => onAdd(button)}
    >
      <Plus aria-hidden="true" />
      {label}
    </Button>
  );
}
