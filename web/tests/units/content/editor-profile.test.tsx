import { useState } from "react";
import { expect, test } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { ContentEditor } from "@/components/shared/content/editor/ContentEditor";
import { questionGaps } from "@/components/shared/content/gaps";
import type { SemanticContent } from "@/components/shared/content/model";
import { contentPlainText } from "@/components/shared/content/plainText";
import "@/lib/i18n";

/** jsdom does no layout; ProseMirror measures a range when it scrolls the selection into view. */
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const gap = (id: string, label: string) => ({ type: "gap" as const, id, label });
const text = (value: string) => ({ type: "text" as const, text: value, marks: [] });

const withGap: SemanticContent = {
  format: "semantic_v1",
  blocks: [{ type: "paragraph", content: [text("She "), gap("a", "1")] }],
};

function editorOf(box: HTMLElement): Editor {
  return (box as unknown as { editor: Editor }).editor;
}

test("a field whose profile changes gets a new editor on the document it then holds, never the notice", async () => {
  let latest: SemanticContent = withGap;
  function Field() {
    const [document, setDocument] = useState<SemanticContent>(withGap);
    return (
      <ContentEditor
        initialContent={document}
        label="Đề bài"
        profile={questionGaps(document).length > 0 ? "prompt" : "question"}
        onChange={(next) => {
          latest = next;
          setDocument(next);
        }}
      />
    );
  }
  render(<Field />);
  const first = await screen.findByRole("textbox", { name: "Đề bài" });
  expect(screen.getByRole("button", { name: /Thêm chỗ trống/ })).toBeInTheDocument();

  act(() => {
    editorOf(first).chain().selectAll().deleteSelection().insertContent("She").run();
  });

  const second = await screen.findByRole("textbox", { name: "Đề bài" });
  expect(screen.queryByText(/cấu trúc chưa được hỗ trợ/)).toBeNull();
  expect(second).not.toBe(first);
  expect(second).toHaveTextContent("She");
  expect(screen.queryByRole("button", { name: /Thêm chỗ trống/ })).toBeNull();
  expect(contentPlainText(latest)).toBe("She");

  act(() => {
    editorOf(second).chain().focus("end").insertContent(" left.").run();
  });
  expect(screen.getByRole("textbox", { name: "Đề bài" })).toBe(second);
  expect(contentPlainText(latest)).toBe("She left.");
});
