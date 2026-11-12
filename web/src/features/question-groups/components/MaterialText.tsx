import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { TextCursorInput } from "lucide-react";
import type { SemanticContent } from "@/components/shared/content/model";
import { ContentEditor } from "@/components/shared/content/editor/ContentEditor";
import { NamedToolButton } from "@/components/shared/content/editor/ToolButton";
import type { MediaAsset, MediaKind } from "@/features/media/api";
import { selectedWord } from "../gapEditing";
import type { GapCounts } from "../paneView";
import { MaterialTools } from "./MaterialTools";

const BOTH_KINDS: readonly MediaKind[] = ["image", "audio"];
const TEXT_MIN_HEIGHT = 280;
const TEXT_FONT_SIZE = 15;

function GapBubble({
  editor,
  frame,
  label,
  onMake,
}: Readonly<{
  editor: Editor;
  frame: HTMLDivElement | null;
  label: string;
  onMake: () => void;
}>) {
  const range = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const found = current.isFocused ? selectedWord(current.state) : null;
      return found ? `${found.from}:${found.to}` : null;
    },
  });
  const bubble = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const node = bubble.current;
    if (range === null || frame === null || node === null || editor.isDestroyed) return;
    if (typeof Range.prototype.getClientRects !== "function") return;
    const [from, to] = range.split(":").map(Number) as [number, number];
    const box = frame.getBoundingClientRect();
    const start = editor.view.coordsAtPos(from);
    const end = editor.view.coordsAtPos(to);
    const half = node.offsetWidth / 2;
    const centre = (start.left + end.right) / 2 - box.left;
    node.style.left = `${Math.min(Math.max(centre, half), box.width - half)}px`;
    node.style.bottom = `${box.bottom - Math.min(start.top, end.top) + 5}px`;
    node.style.visibility = "visible";
  }, [range, frame, editor]);
  if (range === null) return null;
  return (
    <button
      ref={bubble}
      type="button"
      data-gap-bubble
      className="bg-primary text-primary-foreground shadow-float invisible absolute z-10 inline-flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-[8px] px-3 text-[13px] leading-none font-semibold whitespace-nowrap max-[767px]:hidden"
      onPointerDown={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onMake}
    >
      <TextCursorInput aria-hidden="true" className="size-3.5" />
      {label}
    </button>
  );
}

function GapTool({
  editor,
  label,
  onMake,
}: Readonly<{ editor: Editor; label: string; onMake: () => void }>) {
  const ready = useEditorState({
    editor,
    selector: ({ editor: current }) => selectedWord(current.state) !== null,
  });
  return (
    <NamedToolButton
      icon={TextCursorInput}
      label={label}
      aria-pressed={ready}
      disabled={!ready}
      onClick={onMake}
    />
  );
}

/**
 * MaterialText is the text of a group's material in the pane's left half: the
 * content editor; under its toolbar a row with the named "Make a gap", which
 * also stands at the selected word from 768px, and the insert tools for a
 * picture or a recording; and a
 * footer that counts the gaps by how they are answered beside the words. The
 * host keys it to isolate the document's history, receives the text through
 * `onText` and the live editor through `onEditor`, a stable callback, and
 * makes the gap in `onMakeGap`. `children` are drawn under the box, where the
 * steps of a cloze stand while the text is empty.
 */
export function MaterialText({
  text,
  label,
  placeholder,
  gaps,
  onText,
  onEditor,
  onMakeGap,
  onAsset,
  children,
}: Readonly<{
  text: SemanticContent;
  label: string;
  placeholder: string;
  gaps: GapCounts;
  onText: (content: SemanticContent) => void;
  onEditor: (editor: Editor | null) => void;
  onMakeGap: (editor: Editor) => void;
  onAsset: (asset: MediaAsset) => void;
  children?: ReactNode;
}>) {
  const { t } = useTranslation();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const report = useRef(onEditor);
  useLayoutEffect(() => {
    report.current = onEditor;
  }, [onEditor]);
  const take = useCallback((next: Editor | null) => {
    setEditor(next);
    report.current(next);
  }, []);
  const total = gaps.choice + gaps.typed;
  const counts =
    total === 0
      ? ""
      : [
          t("groups.pane.gapCount", { count: total }),
          ...(gaps.choice > 0
            ? [t("groups.pane.gapChoice", { count: gaps.choice })]
            : []),
          ...(gaps.typed > 0 ? [t("groups.pane.gapTyped", { count: gaps.typed })] : []),
        ].join(" · ");
  return (
    <div ref={setFrame} className="relative flex min-w-0 flex-col gap-3">
      <ContentEditor
        initialContent={text}
        label={label}
        placeholder={placeholder}
        minHeight={TEXT_MIN_HEIGHT}
        fontSize={TEXT_FONT_SIZE}
        ownGapTool
        footerStart={counts}
        onChange={onText}
        tools={(current) => (
          <MaterialTools
            editor={current}
            kinds={BOTH_KINDS}
            onAsset={onAsset}
            lead={
              <GapTool
                editor={current}
                label={t("groups.pane.makeGap")}
                onMake={() => onMakeGap(current)}
              />
            }
          />
        )}
        onEditor={take}
      />
      {editor ? (
        <GapBubble
          editor={editor}
          frame={frame}
          label={t("groups.pane.makeGap")}
          onMake={() => onMakeGap(editor)}
        />
      ) : null}
      {children}
    </div>
  );
}
