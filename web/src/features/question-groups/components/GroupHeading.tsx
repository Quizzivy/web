import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, CircleAlert, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RowMenu } from "@/components/shared/RowMenu";
import { ContentEditor } from "@/components/shared/content/editor/ContentEditor";
import { contentPlainText } from "@/components/shared/content/plainText";
import {
  isQuestionContent,
  type QuestionContent,
} from "@/components/shared/content/questionContent";
import { KIND_ICONS } from "../kindIcons";
import type { GroupKind } from "../kinds";

const EMPTY_INSTRUCTIONS: QuestionContent = {
  format: "semantic_v1",
  blocks: [{ type: "paragraph", content: [] }],
};

/**
 * GroupHeading is the head of a group's pane: its kind and the section it is
 * in, its one title, the instructions students see, and, at the end, how many
 * questions and points it has, the unfinished question, which `onOpenUnfinished`
 * opens, `status`, and the "…" menu of `menu`. Each new value of
 * `titleFocus` puts focus in the title with its text selected. The
 * instructions are a line that opens their editor in place.
 */
export function GroupHeading({
  kind,
  section,
  title,
  instructions,
  questions,
  points,
  unfinished,
  titleFocus,
  status,
  menu,
  onTitle,
  onInstructions,
  onOpenUnfinished,
}: Readonly<{
  kind: GroupKind;
  section?: string | undefined;
  title: string;
  instructions: QuestionContent | null | undefined;
  questions: number;
  points: number;
  unfinished: number | null;
  titleFocus?: number | undefined;
  status?: ReactNode;
  menu?: ReactNode;
  onTitle: (title: string) => void;
  onInstructions: (instructions: QuestionContent) => void;
  onOpenUnfinished: () => void;
}>) {
  const { t } = useTranslation();
  const field = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (titleFocus === undefined) return;
    field.current?.focus();
    field.current?.select();
  }, [titleFocus]);
  const Icon = KIND_ICONS[kind];
  const name = t(`groups.kind.${kind}.name`);
  const said = instructions ? contentPlainText(instructions).trim() : "";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-[1_1_260px] flex-col items-start gap-0.75">
          <span className="text-muted-fg flex min-h-5 items-center gap-1.75 text-[12.5px]">
            <Icon aria-hidden="true" className="size-3.5" />
            {section ? `${name} · ${section}` : name}
          </span>
          <input
            ref={field}
            value={title}
            maxLength={200}
            aria-label={t("groups.titleLabel")}
            aria-invalid={title.trim() === ""}
            placeholder={t(`groups.kind.${kind}.new`)}
            className="hover:border-input focus:border-ring -mx-2 w-[calc(100%+1rem)] min-w-0 rounded-[8px] border border-transparent bg-transparent px-2 py-0.5 text-[19px] leading-[1.3] font-semibold tracking-[-0.01em] max-[767px]:text-[18px]"
            onChange={(event) => onTitle(event.target.value)}
          />
          {editing ? null : (
            <button
              type="button"
              className="hover:bg-hover -mx-1 flex max-w-full items-center gap-1.5 rounded-[6px] px-1 py-0.5 text-left text-[13px] text-pretty max-[767px]:min-h-10"
              onClick={() => setEditing(true)}
            >
              <span className={said === "" ? "text-muted-fg" : undefined}>
                {said === "" ? t("groups.pane.instructionsPlaceholder") : said}
              </span>
              <Pencil aria-hidden="true" className="text-muted-fg size-3 flex-none" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-fg text-[12.5px] whitespace-nowrap">
            {t("groups.pane.summary", { count: questions, points })}
          </span>
          <span role="status" className="contents">
            {unfinished === null ? null : (
              <button
                type="button"
                className="bg-warning-soft text-warning-ink inline-flex h-6.5 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap max-[767px]:h-10"
                onClick={onOpenUnfinished}
              >
                <CircleAlert aria-hidden="true" className="size-3.25" />
                {t("groups.pane.unfinished", { number: unfinished })}
                <ArrowRight aria-hidden="true" className="size-3" />
              </button>
            )}
          </span>
          {status}
          {menu ? <RowMenu label={t("groups.pane.menu")}>{menu}</RowMenu> : null}
        </div>
      </div>
      {editing ? (
        <div className="flex min-w-0 flex-col gap-2">
          <ContentEditor
            key="instructions"
            initialContent={instructions ?? EMPTY_INSTRUCTIONS}
            label={t("groups.instructions")}
            placeholder={t("groups.pane.instructionsPlaceholder")}
            profile="question"
            onChange={(content) => {
              if (isQuestionContent(content)) onInstructions(content);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-end"
            onClick={() => setEditing(false)}
          >
            {t("common.close")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
