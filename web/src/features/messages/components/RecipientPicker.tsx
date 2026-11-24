import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  CloudOff,
  GraduationCap,
  MessageSquare,
  MessageSquarePlus,
  RotateCw,
  SearchX,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { IconTile } from "@/components/shared/IconTile";
import { LoadMoreSentinel } from "@/components/shared/LoadMoreSentinel";
import { PersonOption } from "@/components/shared/PersonOption";
import { SearchInput } from "@/components/shared/SearchInput";
import { DialogShell, DialogShellHeader } from "@/components/shared/form/DialogShell";
import { fetchClasses } from "@/features/classes/api";
import { useDebounced } from "@/lib/useDebounced";
import { cn } from "@/lib/utils";
import {
  listMessageRecipients,
  recipientsKey,
  type MessageRecipient,
  type RecipientAudience,
  type RecipientFilter,
} from "../api";
import { recipientSub } from "../people";

/** SEARCH_DELAY_MS is how long the picker waits after the last keystroke before it asks. */
const SEARCH_DELAY_MS = 300;

/** Picked is the person a row names: whom to open a thread with, and whether one exists. */
export type Picked = Readonly<{
  audience: RecipientAudience;
  id: string;
  threadExists: boolean;
}>;

/** The six skeleton rows' line widths, the deck's, rounded to the scale. */
const SKELETON_WIDTHS = [
  ["w-2/5", "w-3/5"],
  ["w-3/5", "w-1/2"],
  ["w-2/5", "w-2/3"],
  ["w-1/2", "w-1/2"],
  ["w-1/2", "w-2/3"],
  ["w-3/5", "w-2/5"],
] as const;

/** The class list New message's filter offers, the one the other class pickers read. */
const CLASSES_KEY = ["teacher-classes", "picker", { limit: 100 }] as const;

/** filterValue is the filter as the Select holds it. */
function filterValue(filter: RecipientFilter): string {
  return filter.kind === "class" ? `class:${filter.classId}` : filter.kind;
}

function filterFrom(value: string): RecipientFilter {
  if (value.startsWith("class:")) return { kind: "class", classId: value.slice(6) };
  if (value === "mine" || value === "none") return { kind: value };
  return { kind: "all" };
}

/**
 * RecipientPicker is New message (T-F2.6, DG-233): a dialog of the people the
 * caller may write to, students and, when `audiences` names them,
 * colleagues. Students take a filter (all, the caller's classes, one class,
 * in no class) and both take a search by name; the list is read a page at a
 * time as it scrolls. A row with a thread is marked; choosing any row hands
 * it to `onPick`, which opens the thread, the existing one or an empty one.
 * The search field drives the list: ↑ and ↓ move through the rows, Enter
 * picks the active one, and Esc closes the dialog.
 */
export function RecipientPicker({
  open,
  onOpenChange,
  audiences,
  onPick,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audiences: readonly RecipientAudience[];
  onPick: (picked: Picked) => void;
}>) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      width={520}
      className="top-[8%] max-h-[min(600px,86dvh)] translate-y-0 max-[767px]:top-[7%] max-[767px]:max-h-[86dvh]"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        input.current?.focus();
      }}
    >
      <DialogShellHeader
        title={t("messages.newMessage")}
        description={t("messages.picker.description")}
        icon={MessageSquarePlus}
      />
      <PickerBody inputRef={input} audiences={audiences} onPick={onPick} />
    </DialogShell>
  );
}

function PickerBody({
  inputRef,
  audiences,
  onPick,
}: Readonly<{
  inputRef: RefObject<HTMLInputElement | null>;
  audiences: readonly RecipientAudience[];
  onPick: (picked: Picked) => void;
}>) {
  const { t } = useTranslation();
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [audience, setAudience] = useState<RecipientAudience>(
    audiences[0] ?? "students",
  );
  const [filter, setFilter] = useState<RecipientFilter>({ kind: "all" });
  const [typed, setTyped] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const q = useDebounced(typed.trim(), SEARCH_DELAY_MS);
  const students = audience === "students";
  const shownFilter: RecipientFilter = students ? filter : { kind: "all" };

  const classes = useQuery({
    queryKey: CLASSES_KEY,
    queryFn: ({ signal }) => fetchClasses({ limit: 100 }, signal),
    staleTime: 60_000,
    enabled: audiences.includes("students"),
  });

  const list = useInfiniteQuery({
    queryKey: recipientsKey(audience, shownFilter, q),
    queryFn: ({ pageParam, signal }) =>
      listMessageRecipients(audience, shownFilter, q, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    // A new search keeps the rows on screen until its answer comes; a new
    // audience or filter starts from the skeleton, as its rows say other things.
    placeholderData: (previous, query) => {
      const key = query?.queryKey;
      return key?.[2] === audience &&
        JSON.stringify(key[3]) === JSON.stringify(shownFilter)
        ? previous
        : undefined;
    },
    retry: false,
  });

  const rows = list.data?.pages.flatMap((page) => page.recipients) ?? [];
  const activeIndex = rows.findIndex((row) => row.id === activeId);
  const active = activeIndex === -1 ? undefined : rows[activeIndex];
  const optionId = (id: string) => `${listId}-${id}`;

  useEffect(() => {
    const box = listRef.current;
    if (box === null || active === undefined) return;
    const option = box.querySelector<HTMLElement>(`[data-recipient="${active.id}"]`);
    if (option === null) return;
    const at = option.getBoundingClientRect();
    const view = box.getBoundingClientRect();
    if (at.top < view.top) box.scrollTop -= view.top - at.top;
    else if (at.bottom > view.bottom) box.scrollTop += at.bottom - view.bottom;
  }, [active]);

  const pick = (row: MessageRecipient) =>
    onPick({ audience, id: row.id, threadExists: row.threadExists });

  const move = (delta: 1 | -1) => {
    if (rows.length === 0) return;
    let next = (activeIndex + delta + rows.length) % rows.length;
    if (activeIndex === -1) next = delta === 1 ? 0 : rows.length - 1;
    setActiveId(rows[next]!.id);
  };

  const keys: Record<string, () => boolean> = {
    ArrowDown: () => {
      move(1);
      return true;
    },
    ArrowUp: () => {
      move(-1);
      return true;
    },
    Enter: () => {
      if (active === undefined) return false;
      pick(active);
      return true;
    },
  };

  let state: "loading" | "error" | "empty" | "rows" = "rows";
  if (list.isPending) state = "loading";
  else if (list.isError && list.data === undefined) state = "error";
  else if (rows.length === 0) state = "empty";

  const emptyText = () => {
    if (q === "")
      return students
        ? t("messages.picker.noStudents")
        : t("messages.picker.noColleagues");
    return students
      ? t("messages.picker.noStudentMatch", { q })
      : t("messages.picker.noColleagueMatch", { q });
  };

  const ownClasses = classes.data?.items ?? [];

  return (
    <>
      <div className="flex flex-none flex-col gap-2.5 px-4.5 pt-3">
        {audiences.length > 1 && (
          <Segmented
            label={t("messages.newMessage")}
            value={audience}
            fill
            className="max-[767px]:[&_button]:h-10"
            onChange={(value) => {
              setAudience(value as RecipientAudience);
              setActiveId(null);
            }}
            options={audiences.map((value) =>
              value === "students"
                ? {
                    value,
                    label: t("messages.picker.students"),
                    icon: GraduationCap,
                  }
                : {
                    value,
                    label: t("messages.picker.colleagues"),
                    icon: UsersRound,
                  },
            )}
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={typed}
            onChange={(next) => {
              setTyped(next);
              setActiveId(null);
            }}
            placeholder={t("messages.picker.search")}
            inputRef={inputRef}
            className="[&_input]:bg-bg min-w-0 flex-[1_1_180px] [&_input]:h-8.5 [&_input]:text-sm max-[767px]:[&_input]:h-11 [&_svg]:top-1/2 [&_svg]:-translate-y-1/2"
            field={{
              role: "combobox",
              "aria-expanded": true,
              "aria-controls": listId,
              "aria-autocomplete": "list",
              "aria-activedescendant":
                active === undefined ? undefined : optionId(active.id),
              autoComplete: "off",
              onKeyDown: (event) => {
                if (keys[event.key]?.()) event.preventDefault();
              },
            }}
          />
          {students && (
            <Select
              value={filterValue(filter)}
              onValueChange={(value) => {
                setFilter(filterFrom(value));
                setActiveId(null);
              }}
            >
              <SelectTrigger
                aria-label={t("messages.picker.filter")}
                className="min-w-0 flex-[0_0_210px] text-sm data-[size=default]:h-8.5 max-[767px]:flex-[1_1_100%] max-[767px]:data-[size=default]:h-11 [&>span]:min-w-0 [&>span]:truncate"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all">{t("messages.picker.all")}</SelectItem>
                <SelectItem value="mine">{t("messages.picker.mine")}</SelectItem>
                {ownClasses.length > 0 && <SelectSeparator />}
                {ownClasses.map((klass) => (
                  <SelectItem key={klass.id} value={`class:${klass.id}`}>
                    {klass.name}
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value="none">{t("messages.noClass")}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-3 pt-2 pb-3">
        {state === "loading" && (
          <div
            role="status"
            aria-label={t("common.loading")}
            className="flex flex-col gap-px"
          >
            {SKELETON_WIDTHS.map(([first, second], index) => (
              <div
                key={index}
                className="flex items-center gap-2.5 p-2 max-[767px]:px-2 max-[767px]:py-2.5"
              >
                <Skeleton className="size-8 flex-none rounded-full" />
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className={cn("h-3", first)} />
                  <Skeleton className={cn("h-2.5", second)} />
                </span>
              </div>
            ))}
          </div>
        )}
        {state === "error" && (
          <Note icon={CloudOff} text={t("messages.picker.error")}>
            <Button
              variant="outline"
              onClick={() => void list.refetch()}
              className="max-[767px]:h-11"
            >
              <RotateCw />
              {t("common.retry")}
            </Button>
          </Note>
        )}
        {state === "empty" && <Note icon={SearchX} text={emptyText()} />}
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label={t("messages.newMessage")}
          aria-busy={list.isFetching || undefined}
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-px overflow-y-auto",
            state !== "rows" && "hidden",
          )}
        >
          {rows.map((row) => (
            <PersonOption
              key={row.id}
              id={optionId(row.id)}
              data-recipient={row.id}
              name={row.name}
              avatarUrl={row.avatarUrl}
              avatarSize="default"
              sub={recipientSub(row, t)}
              active={row.id === activeId}
              className="gap-2.5 rounded-lg p-2 max-[767px]:px-2 max-[767px]:py-2.5"
              onPick={() => pick(row)}
              end={
                row.threadExists ? (
                  <span className="text-muted-fg text-caption inline-flex flex-none items-center gap-1 whitespace-nowrap">
                    <MessageSquare aria-hidden="true" className="size-3.5" />
                    {t("messages.picker.hasThread")}
                  </span>
                ) : null
              }
            />
          ))}
          <LoadMoreSentinel
            as="li"
            active={list.hasNextPage}
            loading={list.isFetchingNextPage}
            onVisible={() => {
              if (!list.isFetchingNextPage) void list.fetchNextPage();
            }}
          />
        </ul>
      </div>
    </>
  );
}

function Note({
  icon,
  text,
  children,
}: Readonly<{ icon: LucideIcon; text: string; children?: ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-5 py-6 text-center">
      <IconTile icon={icon} size={40} />
      <p className="text-muted-fg text-ui max-w-[32ch] text-pretty">{text}</p>
      {children}
    </div>
  );
}
