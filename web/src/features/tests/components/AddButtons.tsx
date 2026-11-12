import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpenText, ChevronRight, CircleDot, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  StartChoice,
  StartMenuItems,
} from "@/features/question-groups/components/StartMenu";
import { START_ICONS } from "@/features/question-groups/kindIcons";
import { GROUP_STARTS, type GroupStart } from "@/features/question-groups/kinds";

/**
 * AddButtons are what the outline adds to the section `target` names. From
 * 768px they are two buttons: "Add question", one press, and "Passage, cloze,
 * recording", whose menu lists the four ways to start one with a line on what
 * each gives. Below 768px they are one "+" that opens the same choices as a
 * sheet from the bottom, with a question on its own first. A choice leaves
 * focus to what it makes; closing without one returns it to the button. Without
 * `onCreateGroup` only "Add question" is drawn. A null `target` is an outline
 * with no section yet.
 */
export function AddButtons({
  disabled,
  target,
  onCreateQuestion,
  onCreateGroup,
}: Readonly<{
  disabled: boolean;
  target: string | null;
  onCreateQuestion: () => void;
  onCreateGroup?: ((start: GroupStart) => void) | undefined;
}>) {
  const { t } = useTranslation();
  const wide = useMediaQuery("(min-width: 768px)");
  const [sheet, setSheet] = useState(false);
  const picked = useRef(false);
  const keepFocus = (event: Event) => {
    if (!picked.current) return;
    picked.current = false;
    event.preventDefault();
  };
  const title = t("groups.start.menuTitle", { title: target ?? "" });
  const addQuestion = (
    <Button
      variant="outline"
      size="sm"
      className="shadow-card h-8 w-full justify-start gap-2 px-2.5"
      disabled={disabled}
      onClick={onCreateQuestion}
    >
      <Plus aria-hidden="true" />
      <span className="flex-1 text-left whitespace-nowrap">
        {t("builder.addQuestion")}
      </span>{" "}
      {target === null ? null : (
        <span className="text-muted-foreground min-w-0 truncate text-[11.5px] font-normal">
          {t("builder.addQuestionTo", { title: target })}
        </span>
      )}
    </Button>
  );
  if (!onCreateGroup) return addQuestion;
  if (wide)
    return (
      <>
        {addQuestion}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="shadow-card data-[state=open]:bg-muted h-8 w-full justify-start gap-2 px-2.5"
              disabled={disabled}
            >
              <BookOpenText aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-left">
                {t("groups.start.button")}
              </span>
              <ChevronRight aria-hidden="true" className="text-muted-fg" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="right"
            align="end"
            className="w-87 rounded-xl p-1.5"
            onCloseAutoFocus={keepFocus}
          >
            <DropdownMenuLabel>{title}</DropdownMenuLabel>
            <StartMenuItems
              onPick={(start) => {
                picked.current = true;
                onCreateGroup(start);
              }}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    );
  const choose = (run: () => void) => {
    picked.current = true;
    setSheet(false);
    run();
  };
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="shadow-card h-11 w-full justify-start gap-2 px-2.5"
        disabled={disabled}
        aria-haspopup="dialog"
        onClick={() => setSheet(true)}
      >
        <Plus aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-left">{title}</span>
      </Button>
      <Dialog open={sheet} onOpenChange={setSheet}>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          onCloseAutoFocus={keepFocus}
          className="bg-card data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 top-auto bottom-0 left-0 flex max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-t-2xl rounded-b-none border-x-0 border-b-0 px-2 pt-2 pb-3.5 sm:max-w-none"
        >
          <span
            aria-hidden="true"
            className="bg-border mx-auto mt-0.5 mb-2 h-1 w-9 rounded-full"
          />
          <DialogTitle className="text-muted-fg px-2.5 pt-1 pb-1.5 text-[12.5px] font-semibold">
            {title}
          </DialogTitle>
          <button
            type="button"
            className="hover:bg-hover flex min-h-14 w-full items-start gap-2.75 rounded-[8px] px-2.5 py-2.25 text-left"
            onClick={() => choose(onCreateQuestion)}
          >
            <StartChoice
              icon={CircleDot}
              label={t("builder.addQuestion")}
              description={t("groups.start.question")}
            />
          </button>
          {GROUP_STARTS.map((start) => (
            <button
              key={start}
              type="button"
              className="hover:bg-hover flex min-h-14 w-full items-start gap-2.75 rounded-[8px] px-2.5 py-2.25 text-left"
              onClick={() => choose(() => onCreateGroup(start))}
            >
              <StartChoice
                icon={START_ICONS[start]}
                label={t(`groups.start.${start}.label`)}
                description={t(`groups.start.${start}.description`)}
              />
            </button>
          ))}
        </DialogContent>
      </Dialog>
    </>
  );
}
