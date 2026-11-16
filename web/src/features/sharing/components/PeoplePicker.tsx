import { useEffect, useId, useRef, useState, type Ref } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useDebounced } from "@/lib/useDebounced";
import { cn } from "@/lib/utils";
import { DIRECTORY_KEY, useTeacherLookup, type ShareTeacher } from "../api";

/** LOOKUP_DELAY is how long the picker waits after the last keystroke before it asks. */
export const LOOKUP_DELAY = 200;

function lookupStatus(
  waiting: boolean,
  failed: boolean,
  rows: number,
  t: TFunction,
): string | null {
  if (waiting) return t("common.loading");
  if (failed) return t("sharing.searchFailed");
  return rows === 0 ? t("sharing.noMatch") : null;
}

/**
 * Suggestion is one colleague the directory found: DG-22's initials (the
 * photo when there is one), the name and the email. A disabled account says
 * so and is not picked.
 */
function Suggestion({
  id,
  teacher,
  active,
  onPick,
}: Readonly<{
  id: string;
  teacher: ShareTeacher;
  active: boolean;
  onPick: (teacher: ShareTeacher) => void;
}>) {
  const { t } = useTranslation();
  return (
    <li role="presentation">
      <button
        type="button"
        id={id}
        role="option"
        tabIndex={-1}
        aria-selected={active}
        aria-disabled={teacher.disabled || undefined}
        data-teacher={teacher.id}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left",
          teacher.disabled
            ? "text-fg/50 [&_[data-slot=avatar]]:text-fg/50 cursor-default"
            : "hover:bg-hover cursor-pointer",
          active && "bg-hover",
        )}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onPick(teacher)}
      >
        <Avatar name={teacher.fullName} src={teacher.avatarUrl} size="28" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{teacher.fullName}</span>
          <span className="text-muted-fg block truncate text-xs">{teacher.email}</span>
        </span>
        {teacher.disabled ? (
          <span className="text-muted-fg text-caption whitespace-nowrap">
            {t("sharing.accountDisabled")}
          </span>
        ) : null}
      </button>
    </li>
  );
}

/**
 * PeoplePicker is the share dialog's chip box: the teachers waiting to be
 * added as chips, then one combobox that looks colleagues up by name or email.
 * A lookup waits 200 ms after the last keystroke, and a lookup still in
 * flight when the text changes is cancelled. Suggestions leave out `exclude`
 * (the owner and everyone who already has access) and the pending chips; an
 * "Account disabled" row is listed but cannot be picked, and ↑/↓ skip it.
 * Enter adds the active suggestion, Backspace in an empty field takes the last
 * chip back, and Esc closes the list, so a second Esc closes the dialog. The
 * active row is announced through `aria-activedescendant` (DG-36).
 */
export function PeoplePicker({
  selected,
  exclude,
  onAdd,
  onRemove,
  inputRef,
}: Readonly<{
  selected: readonly ShareTeacher[];
  exclude: ReadonlySet<string>;
  onAdd: (teacher: ShareTeacher) => void;
  onRemove: (id: string) => void;
  inputRef?: Ref<HTMLInputElement>;
}>) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const term = text.trim();
  const settled = useDebounced(term, LOOKUP_DELAY);
  const fresh = term !== "" && settled === term;
  const lookup = useTeacherLookup(settled, fresh);

  const chosen = new Set(selected.map((teacher) => teacher.id));
  const found: readonly ShareTeacher[] =
    fresh && lookup.data !== undefined ? lookup.data.teachers : [];
  const rows = found.filter(
    (teacher) => !exclude.has(teacher.id) && !chosen.has(teacher.id),
  );
  const pickable = rows.filter((teacher) => !teacher.disabled);
  const activeIndex = Math.max(
    0,
    pickable.findIndex((teacher) => teacher.id === activeId),
  );
  const active = pickable[activeIndex];
  const waiting = term !== "" && (!fresh || lookup.isPending);
  const open = focused && !dismissed && term !== "";
  const optionId = (id: string) => `${listId}-${id}`;

  useEffect(() => {
    const list = listRef.current;
    if (!open || list === null || active === undefined) return;
    const option = list.querySelector<HTMLElement>(`[data-teacher="${active.id}"]`);
    if (option === null) return;
    const box = option.getBoundingClientRect();
    const view = list.getBoundingClientRect();
    if (box.top < view.top) list.scrollTop -= view.top - box.top;
    else if (box.bottom > view.bottom) list.scrollTop += box.bottom - view.bottom;
  }, [active, open]);

  function change(next: string) {
    if (next.trim() !== term) void client.cancelQueries({ queryKey: DIRECTORY_KEY });
    setText(next);
    setDismissed(false);
    setActiveId(null);
  }

  function pick(teacher: ShareTeacher) {
    if (teacher.disabled) return;
    onAdd(teacher);
    change("");
  }

  function move(delta: 1 | -1) {
    if (pickable.length === 0) return;
    const next = (activeIndex + delta + pickable.length) % pickable.length;
    setActiveId(pickable[next]!.id);
  }

  const keys: Record<string, () => boolean> = {
    ArrowDown: () => {
      if (!open) setDismissed(false);
      else move(1);
      return true;
    },
    ArrowUp: () => {
      if (!open) setDismissed(false);
      else move(-1);
      return true;
    },
    Enter: () => {
      if (!open || waiting || active === undefined) return false;
      pick(active);
      return true;
    },
    Escape: () => {
      if (!open) return false;
      setDismissed(true);
      return true;
    },
    Backspace: () => {
      const last = selected.at(-1);
      if (text === "" && last !== undefined) onRemove(last.id);
      return false;
    },
  };

  const status = lookupStatus(waiting, lookup.isError, rows.length, t);

  return (
    <div className="relative min-w-0 flex-[1_1_200px]">
      <div className="bg-bg focus-within:border-ring has-[input:focus-visible]:outline-focus rounded-ctl flex min-h-10 flex-wrap items-center gap-1 border px-2 py-1 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 max-[767px]:min-h-11">
        {selected.map((teacher) => (
          <span
            key={teacher.id}
            className="bg-muted text-meta inline-flex h-7 items-center gap-1 rounded-full border pr-1 pl-0.5 font-medium whitespace-nowrap"
          >
            <Avatar name={teacher.fullName} src={teacher.avatarUrl} size="sm" />
            {teacher.fullName}
            <button
              type="button"
              aria-label={t("sharing.removePending", { name: teacher.fullName })}
              className="text-muted-fg hover:bg-hover hover:text-fg grid size-5 place-items-center rounded-full"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onRemove(teacher.id)}
            >
              <X aria-hidden="true" className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          size={1}
          role="combobox"
          aria-label={t("sharing.addPlaceholder")}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            open && !waiting && active !== undefined ? optionId(active.id) : undefined
          }
          data-local-escape={open ? "true" : undefined}
          autoComplete="off"
          className="placeholder:text-muted-fg lg:text-ui h-7 min-w-30 flex-[1_1_140px] bg-transparent text-[length:var(--text-input)] outline-none!"
          placeholder={t(
            selected.length > 0 ? "sharing.addMore" : "sharing.addPlaceholder",
          )}
          value={text}
          onChange={(event) => change(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (keys[event.key]?.()) event.preventDefault();
          }}
        />
      </div>
      {open ? (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label={t("sharing.addPlaceholder")}
          aria-busy={waiting || undefined}
          className="bg-card shadow-float absolute inset-x-0 top-[calc(100%+4px)] z-10 flex max-h-60 flex-col overflow-y-auto rounded-lg border p-1"
        >
          {status === null
            ? rows.map((teacher) => (
                <Suggestion
                  key={teacher.id}
                  id={optionId(teacher.id)}
                  teacher={teacher}
                  active={!teacher.disabled && teacher.id === active?.id}
                  onPick={pick}
                />
              ))
            : null}
          {status === null ? null : (
            <li role="presentation" className="text-muted-fg text-meta px-2 py-2">
              {status}
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
