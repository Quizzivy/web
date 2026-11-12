import type { Locator, Page } from "@playwright/test";

/** GroupStartName is a choice of the outline's "Passage, cloze, recording" menu, by its Vietnamese name. */
export type GroupStartName =
  "Bài đọc và câu hỏi" | "Bài điền từ" | "Bài nghe và câu hỏi" | "Bài nghe điền từ";

/** startGroup opens the outline's second button and picks one of its four starts. */
export async function startGroup(page: Page, start: GroupStartName) {
  await page
    .getByRole("button", { name: "Bài đọc, điền từ, bài nghe", exact: true })
    .click();
  await page
    .getByRole("menuitem")
    .filter({ has: page.getByText(start, { exact: true }) })
    .click();
}

/** paneTitle is the one title of the group whose pane is open. */
export function paneTitle(page: Page): Locator {
  return page.getByRole("textbox", { name: "Tiêu đề", exact: true });
}

/** paneText is the text of the material in the pane's left half. */
export function paneText(page: Page): Locator {
  return page.getByRole("textbox", { name: "Đoạn văn", exact: true });
}

/** addPaneQuestion adds a question of `type` at the end of the pane's stack, which opens it. */
export async function addPaneQuestion(page: Page, type = "Một đáp án") {
  await page.getByRole("button", { name: type, exact: true }).click();
}

/** paneMenu opens the pane's own "…" menu and returns the item named `name`. */
export async function paneMenu(page: Page, name: string): Promise<Locator> {
  await page.getByRole("button", { name: "Thao tác với bài này", exact: true }).click();
  return page.getByRole("menuitem", { name, exact: true });
}
