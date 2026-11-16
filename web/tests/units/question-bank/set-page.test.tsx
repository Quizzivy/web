import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import i18n from "@/lib/i18n";
import QuestionSetPage from "@/features/question-bank/pages/teacher/QuestionSetPage";
import { bankColumns } from "@/features/question-bank/pages/teacher/bankColumns";
import { serveSharing } from "../sharing/support";
import {
  COPY1,
  COPY2,
  DUC,
  Q1,
  Q2,
  SET_ID,
  questionSet,
  renderAt,
  serveSets,
  sets,
  signIn,
  signOut,
} from "./sets-support";

const PATH = `/teacher/question-bank/sets/${SET_ID}`;
const ROUTES = [
  { path: "/teacher/question-bank/sets/:id", element: <QuestionSetPage /> },
  { path: "/teacher/question-bank", element: <p>bank page</p> },
  { path: "/teacher/question-bank/:id", element: <p>editor page</p> },
  { path: "/teacher/shared-with-me", element: <p>shared page</p> },
];

beforeEach(() => {
  signIn();
  serveSets();
  serveSharing();
});

afterEach(signOut);

function renderSet(state?: unknown) {
  return renderAt(PATH, ROUTES, state);
}

function shared(access: "edit" | "use") {
  sets.set = questionSet({
    name: "Collocations · B1",
    owner: DUC,
    access,
    sharedWith: 0,
  });
}

async function heading(name = "Present perfect · A2") {
  return screen.findByRole("heading", { level: 1, name }, { timeout: 5000 });
}

async function selectBoth(user: ReturnType<typeof renderSet>["user"]) {
  await user.click(
    await screen.findByRole("checkbox", {
      name: "Chọn Choose the correct form: She ___ since 2019.",
    }),
  );
  await user.click(
    screen.getByRole("checkbox", { name: "Chọn Write the missing word." }),
  );
}

describe("the set page for its owner", () => {
  it("shows the name, size, description and the owner's buttons", async () => {
    renderSet();
    await heading();
    expect(screen.getByText(/^2 câu hỏi · Cập nhật/)).toBeInTheDocument();
    expect(
      screen.getByText("Ôn thì hiện tại hoàn thành cho các lớp A2."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Có thể sửa")).toBeNull();
    expect(screen.getByRole("button", { name: "Chia sẻ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tạo bản sao" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thao tác khác" })).toBeInTheDocument();
  });

  it("says Shared · n once shared, and the share dialog gives the set's size", async () => {
    sets.set = questionSet({ sharedWith: 2 });
    const { user } = renderSet();
    await heading();
    await user.click(screen.getByRole("button", { name: "Đã chia sẻ · 2" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Chia sẻ “Present perfect · A2”",
    });
    expect(within(dialog).getByText("2 câu hỏi")).toBeInTheDocument();
  });

  it("deletes the set after a confirm that says tests are not affected", async () => {
    const { user, router } = renderSet();
    await heading();
    await user.click(screen.getByRole("button", { name: "Thao tác khác" }));
    await user.click(await screen.findByRole("menuitem", { name: "Xoá bộ" }));

    const confirm = await screen.findByRole("dialog", {
      name: "Xoá bộ “Present perfect · A2”?",
    });
    expect(confirm).toHaveTextContent(
      "đề thi đang dùng những câu này không bị ảnh hưởng",
    );
    await user.click(within(confirm).getByRole("button", { name: "Xoá bộ" }));

    await waitFor(() => expect(sets.deleted).toEqual([SET_ID]));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/teacher/question-bank"),
    );
    expect(await screen.findByText("Đã xoá bộ “Present perfect · A2”")).toBeVisible();
  });

  it("renames the set and changes its description", async () => {
    const { user } = renderSet();
    await heading();
    await user.click(screen.getByRole("button", { name: "Thao tác khác" }));
    await user.click(await screen.findByRole("menuitem", { name: "Đổi tên" }));

    const dialog = await screen.findByRole("dialog", { name: "Đổi tên bộ câu hỏi" });
    const name = within(dialog).getByLabelText("Tên bộ");
    await user.clear(name);
    await user.type(name, "Present perfect · A2+");
    await user.clear(within(dialog).getByLabelText(/Mô tả/));
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));

    await waitFor(() =>
      expect(sets.renamed).toEqual([
        { name: "Present perfect · A2+", description: null },
      ]),
    );
    expect(await heading("Present perfect · A2+")).toBeInTheDocument();
  });

  it("removes the selected questions from the set", async () => {
    const { user } = renderSet();
    await heading();
    await selectBoth(user);
    await user.click(screen.getByRole("button", { name: "Gỡ khỏi bộ" }));

    const confirm = await screen.findByRole("dialog", {
      name: "Gỡ 2 câu khỏi bộ?",
    });
    expect(confirm).toHaveTextContent(
      "Các câu này vẫn ở trong ngân hàng của bạn. Đề thi đang dùng chúng không bị ảnh hưởng.",
    );
    await user.click(within(confirm).getByRole("button", { name: "Gỡ khỏi bộ" }));

    await waitFor(() => expect(sets.removed).toEqual([{ questionIds: [Q1, Q2] }]));
    expect(await screen.findByText("Đã gỡ 2 câu khỏi bộ")).toBeVisible();
    expect(await screen.findByText("Bộ này chưa có câu hỏi nào.")).toBeInTheDocument();
  });

  it("adds the selection to a test without copying it", async () => {
    const { user } = renderSet();
    await heading();
    await selectBoth(user);
    await user.click(screen.getByRole("button", { name: "Thêm vào đề thi" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm vào đề thi" });
    await user.click(
      await within(dialog).findByRole("button", { name: /Unit 4 · Review/ }),
    );
    await user.click(await within(dialog).findByRole("button", { name: /Part 1/ }));

    await waitFor(() => expect(sets.outlines).toHaveLength(1));
    expect(sets.copied).toEqual([]);
    expect(sets.outlines[0]).toMatchObject({
      sections: [{ questionIds: [Q1, Q2] }],
    });
  });
});

describe("the set page for a Can edit recipient", () => {
  it("names the owner, the access and what it allows, without Share, Delete or Used", async () => {
    shared("edit");
    renderSet();
    await heading("Collocations · B1");
    expect(screen.getByText("Phan Minh Đức")).toBeInTheDocument();
    expect(screen.getByText("Có thể sửa")).toBeInTheDocument();
    expect(
      screen.getByText("Thay đổi của bạn được lưu vào bản của Đức."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Bạn sửa được câu hỏi và gỡ câu khỏi bộ. Chỉ Đức thêm được câu mới.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đổi tên" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tạo bản sao" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Chia sẻ/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Thao tác khác" })).toBeNull();
    expect(screen.queryByText("Ôn thì hiện tại hoàn thành cho các lớp A2.")).toBeNull();
  });

  it("opens a row's editor in the set's context and may remove from the set", async () => {
    shared("edit");
    const { user } = renderSet();
    await heading("Collocations · B1");
    const link = await screen.findByRole("link", {
      name: "Choose the correct form: She ___ since 2019.",
    });
    expect(link).toHaveAttribute("href", `/teacher/question-bank/${Q1}?set=${SET_ID}`);

    await selectBoth(user);
    await user.click(screen.getByRole("button", { name: "Gỡ khỏi bộ" }));
    const confirm = await screen.findByRole("dialog");
    expect(confirm).toHaveTextContent(
      "Các câu này vẫn ở trong ngân hàng của Đức. Chỉ Đức thêm lại được.",
    );
  });
});

describe("the set page for a Can use recipient", () => {
  it("offers only Make a copy and Add to test", async () => {
    shared("use");
    const { user } = renderSet();
    await heading("Collocations · B1");
    expect(screen.getByText("Có thể dùng")).toBeInTheDocument();
    expect(
      screen.getByText("Bạn xem được bộ này nhưng không sửa được."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đổi tên" })).toBeNull();
    await selectBoth(user);
    expect(screen.getByRole("button", { name: "Thêm vào đề thi" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gỡ khỏi bộ" })).toBeNull();
  });

  it("copies the selection to the teacher's bank, then adds the copies to the test", async () => {
    shared("use");
    const { user } = renderSet();
    await heading("Collocations · B1");
    await selectBoth(user);
    await user.click(screen.getByRole("button", { name: "Thêm vào đề thi" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm vào đề thi" });
    await user.click(
      await within(dialog).findByRole("button", { name: /Unit 4 · Review/ }),
    );
    await user.click(await within(dialog).findByRole("button", { name: /Part 1/ }));

    await waitFor(() => expect(sets.outlines).toHaveLength(1));
    expect(sets.copied).toEqual([{ id: SET_ID, body: { questionIds: [Q1, Q2] } }]);
    expect(sets.outlines[0]).toMatchObject({
      sections: [{ id: expect.any(String), questionIds: [COPY1, COPY2] }],
    });
    expect(
      await screen.findByText(
        "Đã sao chép 2 câu vào ngân hàng của bạn và thêm vào Unit 4 · Review",
      ),
    ).toBeVisible();
  });

  it("makes a copy of the whole set after the confirm", async () => {
    shared("use");
    const { user } = renderSet();
    await heading("Collocations · B1");
    await user.click(screen.getByRole("button", { name: "Tạo bản sao" }));
    const confirm = await screen.findByRole("dialog", {
      name: "Tạo bản sao của “Collocations · B1”?",
    });
    expect(confirm).toHaveTextContent("Bản gốc của Phan Minh Đức không thay đổi.");
    await user.click(within(confirm).getByRole("button", { name: "Tạo bản sao" }));
    await waitFor(() => expect(sets.copied).toEqual([{ id: SET_ID, body: undefined }]));
    expect(
      await screen.findByText("Đã sao chép vào Ngân hàng câu hỏi của bạn"),
    ).toBeVisible();
  });
});

describe("the set page's columns", () => {
  it("leaves the Used column out for a recipient: those are the owner's tests", () => {
    const ids = (used: boolean) =>
      bankColumns(i18n.t, 0, { used }).map((column) => column.id);
    expect(ids(true)).toEqual(["question", "type", "level", "used", "updated"]);
    expect(ids(false)).toEqual(["question", "type", "level", "updated"]);
  });
});

describe("the set page's states", () => {
  it("draws the heading's bars and the table's rows while loading", async () => {
    sets.listHang = true;
    renderSet();
    expect(
      await screen.findByRole("status", { name: "Đang tải…" }),
    ).toBeInTheDocument();
  });

  it("says the set has no questions, and the owner how to add some", async () => {
    sets.members = [];
    sets.set = questionSet({ questionCount: 0 });
    renderSet();
    await heading();
    expect(await screen.findByText("Bộ này chưa có câu hỏi nào.")).toBeInTheDocument();
    expect(
      screen.getByText("Chọn câu trong ngân hàng rồi bấm “Thêm vào bộ”."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở ngân hàng câu hỏi" })).toHaveAttribute(
      "href",
      "/teacher/question-bank",
    );
  });

  it("tells a recipient the set is empty without the owner's hint", async () => {
    shared("use");
    sets.members = [];
    renderSet();
    await heading("Collocations · B1");
    expect(await screen.findByText("Bộ này chưa có câu hỏi nào.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Mở ngân hàng câu hỏi" })).toBeNull();
  });

  it("offers Retry when the set cannot load", async () => {
    sets.setStatus = 500;
    const { user } = renderSet();
    expect(
      await screen.findByRole("heading", { name: "Không tải được bộ câu hỏi" }),
    ).toBeInTheDocument();
    sets.setStatus = 200;
    await user.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await heading()).toBeInTheDocument();
  });

  it("leads a recipient back to Shared with me when the set is gone", async () => {
    sets.setStatus = 404;
    renderSet();
    expect(
      await screen.findByRole("heading", { name: "Không mở được bộ câu hỏi này" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Bộ có thể đã bị xoá, hoặc chủ sở hữu đã dừng chia sẻ với bạn."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Về Được chia sẻ với tôi" }),
    ).toHaveAttribute("href", "/teacher/shared-with-me");
  });

  it("leads back to the bank when the reader came from its Sets group", async () => {
    sets.setStatus = 404;
    renderSet({ from: "bank" });
    expect(await screen.findByText("Bộ có thể đã bị xoá.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về ngân hàng câu hỏi" })).toHaveAttribute(
      "href",
      "/teacher/question-bank",
    );
  });
});
