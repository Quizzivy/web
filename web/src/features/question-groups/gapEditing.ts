import type { Editor } from "@tiptap/react";
import type { Node as ProseNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** GapFace is what a gap shows in the text while it is edited: its question's number and its word. */
export interface GapFace {
  number: number | null;
  word: string;
  open: boolean;
  label: string;
}

const key = new PluginKey<DecorationSet>("groupGapFaces");

function faces(
  doc: ProseNode,
  read: (gapId: string) => GapFace | undefined,
): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "gap") return true;
    const face = read(String(node.attrs.id));
    if (face)
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: "content-gap-answered",
          "data-gap-number": face.number === null ? "" : String(face.number),
          "data-gap-word": face.word,
          "aria-label": face.label,
          ...(face.open ? { "data-gap-open": "" } : {}),
        }),
      );
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

/**
 * gapFacePlugin draws each gap of a material's text as its question's number
 * and word, read through `read` whenever the document changes or the plugin
 * is told to look again (refreshGapFaces), and reports a press on a gap to
 * `onPress`.
 */
function gapFacePlugin(
  read: (gapId: string) => GapFace | undefined,
  onPress: (gapId: string) => void,
): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => faces(state.doc, read),
      apply: (transaction, current, _old, state) =>
        transaction.docChanged || transaction.getMeta(key)
          ? faces(state.doc, read)
          : current,
    },
    props: {
      decorations: (state) => key.getState(state),
      handleClickOn: (_view, _pos, node, _nodePos, _event, direct) => {
        if (!direct || node.type.name !== "gap") return false;
        onPress(String(node.attrs.id));
        return true;
      },
    },
  });
}

/**
 * showGapFaces gives an editor gapFacePlugin once: asked again for the same
 * editor, as a mount under StrictMode does, it leaves the plugin in place.
 */
export function showGapFaces(
  editor: Editor,
  read: (gapId: string) => GapFace | undefined,
  onPress: (gapId: string) => void,
) {
  if (editor.isDestroyed || key.get(editor.state)) return;
  editor.registerPlugin(gapFacePlugin(read, onPress));
}

/** refreshGapFaces has gapFacePlugin read every gap's face again. */
export function refreshGapFaces(editor: Editor) {
  if (editor.isDestroyed) return;
  editor.view.dispatch(
    editor.state.tr.setMeta(key, true).setMeta("addToHistory", false),
  );
}

/**
 * selectedWord is the text a gap can be made from: a selection inside one
 * paragraph that holds text and nothing else, trimmed of the spaces around
 * it, with the range of what is left. Null for a caret, a selection across
 * blocks, or one that takes in a gap, a break or an image.
 */
export function selectedWord(
  state: EditorState,
): { from: number; to: number; word: string } | null {
  const { from, to, empty, $from, $to } = state.selection;
  if (empty || !$from.sameParent($to) || !$from.parent.isTextblock) return null;
  let plain = true;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isInline && !node.isText) plain = false;
    return plain;
  });
  if (!plain) return null;
  const text = state.doc.textBetween(from, to);
  const word = text.trim();
  if (word === "") return null;
  const lead = text.length - text.trimStart().length;
  return { from: from + lead, to: from + lead + word.length, word };
}

/**
 * makeGap turns the selected word into a gap and returns the gap's id and the
 * word, or null when selectedWord finds none. The gap's label is the smallest
 * number no gap of the document carries. `before` is called with the two
 * before the document changes, so the host can answer the change knowing the
 * word.
 */
export function makeGap(
  editor: Editor,
  before: (gapId: string, word: string) => void,
): { gapId: string; word: string } | null {
  const found = selectedWord(editor.state);
  const type = editor.state.schema.nodes.gap;
  if (!found || !type) return null;
  const labels = new Set<string>();
  editor.state.doc.descendants((node) => {
    if (node.type.name === "gap") labels.add(String(node.attrs.label));
  });
  let label = 1;
  while (labels.has(String(label))) label++;
  const gapId = crypto.randomUUID();
  before(gapId, found.word);
  editor.view.dispatch(
    editor.state.tr
      .replaceWith(
        found.from,
        found.to,
        type.create({ id: gapId, label: String(label) }),
      )
      .scrollIntoView(),
  );
  editor.view.focus();
  return { gapId, word: found.word };
}

/**
 * unmakeGap puts `word` back where the gap `gapId` stands, as one step of the
 * editor's history, so undo brings the gap back. It reports whether the
 * document held the gap.
 */
export function unmakeGap(editor: Editor, gapId: string, word: string): boolean {
  let range: { from: number; to: number } | undefined;
  editor.state.doc.descendants((node, pos) => {
    if (range) return false;
    if (node.type.name === "gap" && node.attrs.id === gapId)
      range = { from: pos, to: pos + node.nodeSize };
    return true;
  });
  if (!range) return false;
  const transaction = editor.state.tr;
  if (word === "") transaction.delete(range.from, range.to);
  else transaction.replaceWith(range.from, range.to, editor.state.schema.text(word));
  editor.view.dispatch(transaction);
  return true;
}
