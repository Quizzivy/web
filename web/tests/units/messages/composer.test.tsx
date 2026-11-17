import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Composer } from "@/features/messages/components/Composer";
import { sendsOnEnter, type Outgoing } from "@/features/messages/compose";
import type { Draft } from "@/features/messages/drafts";
import type { Upload } from "@/features/messages/components/AttachDialog";
import { staffAttach } from "@/features/messages/components/StaffAttach";
import { GUIDE } from "./support";

function Harness({
  enterSends,
  onSend,
  upload,
  initial = { text: "", attachment: null },
}: Readonly<{
  enterSends: boolean;
  onSend: (outgoing: Outgoing) => void;
  upload?: Upload;
  initial?: Draft;
}>) {
  const [draft, setDraft] = useState<Draft>(initial);
  return (
    <Composer
      draft={draft}
      onDraft={setDraft}
      onSend={onSend}
      enterSends={enterSends}
      placeholder="Nhắn cho Nam…"
      attach={upload && staffAttach(upload)}
    />
  );
}

function field() {
  return screen.getByRole("textbox", { name: "Nhắn cho Nam…" });
}

describe("the composer's keys (T-R7.20, Q2)", () => {
  it("sends on Enter in a direct thread, trimmed, and empties the box", async () => {
    const onSend = vi.fn();
    render(<Harness enterSends onSend={onSend} />);
    await userEvent.type(field(), "  Chào em  {Enter}");
    expect(onSend).toHaveBeenCalledWith({ body: "Chào em", attachment: null });
    expect(field()).toHaveValue("");
  });

  it("adds a line on Shift+Enter in a direct thread and sends nothing", async () => {
    const onSend = vi.fn();
    render(<Harness enterSends onSend={onSend} />);
    await userEvent.type(field(), "Dòng một{Shift>}{Enter}{/Shift}Dòng hai");
    expect(onSend).not.toHaveBeenCalled();
    expect(field()).toHaveValue("Dòng một\nDòng hai");
  });

  it("sends nothing on the Enter that ends an IME composition (Telex, VNI)", () => {
    const onSend = vi.fn();
    render(
      <Harness
        enterSends
        onSend={onSend}
        initial={{ text: "Vieejt", attachment: null }}
      />,
    );
    fireEvent.keyDown(field(), { key: "Enter", isComposing: true });
    fireEvent.keyDown(field(), { key: "Enter", keyCode: 229 });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("never sends on Enter in a class channel: only Send posts", async () => {
    const onSend = vi.fn();
    render(<Harness enterSends={false} onSend={onSend} />);
    await userEvent.type(field(), "Thông báo{Enter}dòng hai");
    expect(onSend).not.toHaveBeenCalled();
    expect(field()).toHaveValue("Thông báo\ndòng hai");
    await userEvent.click(screen.getByRole("button", { name: "Gửi" }));
    expect(onSend).toHaveBeenCalledWith({
      body: "Thông báo\ndòng hai",
      attachment: null,
    });
  });

  it("keeps Send paused with neither text nor a file", async () => {
    const onSend = vi.fn();
    render(
      <Harness
        enterSends
        onSend={onSend}
        initial={{ text: "   ", attachment: null }}
      />,
    );
    const send = screen.getByRole("button", { name: "Gửi" });
    expect(send).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(send);
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("reads a keyboard event the way the rule says", () => {
    const enter = {
      key: "Enter",
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
    };
    expect(sendsOnEnter({ ...enter, nativeEvent: {} }, true)).toBe(true);
    expect(sendsOnEnter({ ...enter, nativeEvent: {} }, false)).toBe(false);
    expect(sendsOnEnter({ ...enter, shiftKey: true, nativeEvent: {} }, true)).toBe(
      false,
    );
    expect(sendsOnEnter({ ...enter, nativeEvent: { isComposing: true } }, true)).toBe(
      false,
    );
    expect(sendsOnEnter({ ...enter, nativeEvent: { keyCode: 229 } }, true)).toBe(false);
  });
});

describe("a file in the composer (Q3)", () => {
  it("waits as a chip after Attach, sends nothing, and leaves with the text as one message", async () => {
    const onSend = vi.fn();
    const upload = vi.fn<Upload>(async (_file, options) => {
      options.onProgress?.(0.5);
      return GUIDE;
    });
    render(<Harness enterSends onSend={onSend} upload={upload} />);
    await userEvent.click(screen.getByRole("button", { name: "Đính kèm tệp" }));
    const dialog = await screen.findByRole("dialog", { name: "Đính kèm tệp" });
    const input = dialog.querySelector<HTMLInputElement>("input[type=file]")!;
    await userEvent.upload(
      input,
      new File(["%PDF-1.7"], "Hướng dẫn thi thử.pdf", { type: "application/pdf" }),
    );
    const attach = await screen.findByRole("button", { name: "Đính kèm" });
    await waitFor(() => expect(attach).toBeEnabled());
    await userEvent.click(attach);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByText("Hướng dẫn thi thử.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi" })).not.toHaveAttribute(
      "aria-disabled",
    );

    await userEvent.type(field(), "Em đọc trước nhé{Enter}");
    expect(onSend).toHaveBeenCalledWith({
      body: "Em đọc trước nhé",
      attachment: GUIDE,
    });
    expect(screen.queryByText("Hướng dẫn thi thử.pdf")).toBeNull();
  });

  it("sends a waiting file alone, and its × takes it out without sending", async () => {
    const onSend = vi.fn();
    const upload = vi.fn<Upload>();
    const { unmount } = render(
      <Harness
        enterSends
        onSend={onSend}
        upload={upload}
        initial={{ text: "", attachment: GUIDE }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Gửi" }));
    expect(onSend).toHaveBeenCalledWith({ body: null, attachment: GUIDE });
    unmount();

    const quiet = vi.fn();
    render(
      <Harness
        enterSends
        onSend={quiet}
        upload={upload}
        initial={{ text: "", attachment: GUIDE }}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Bỏ tệp Hướng dẫn thi thử.pdf" }),
    );
    expect(screen.queryByText("Hướng dẫn thi thử.pdf")).toBeNull();
    expect(screen.getByRole("button", { name: "Gửi" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(quiet).not.toHaveBeenCalled();
  });

  it("refuses a file over 20 MB before sending it, and says why a refused one was refused", async () => {
    const upload = vi.fn<Upload>(async () => {
      const { ApiError } = await import("@/lib/api/errors");
      throw new ApiError({
        status: 415,
        code: "ATTACHMENT_HAS_MACROS",
        message: "macros",
      });
    });
    render(<Harness enterSends onSend={vi.fn()} upload={upload} />);
    await userEvent.click(screen.getByRole("button", { name: "Đính kèm tệp" }));
    const dialog = await screen.findByRole("dialog", { name: "Đính kèm tệp" });
    const input = dialog.querySelector<HTMLInputElement>("input[type=file]")!;
    const big = new File(["x"], "video.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 20 * 1024 * 1024 + 1 });
    await userEvent.upload(input, big);
    expect(await screen.findByRole("alert")).toHaveTextContent("Tệp lớn hơn 20 MB.");
    expect(upload).not.toHaveBeenCalled();

    await userEvent.upload(
      input,
      new File(["DOCM"], "Đề.docm", { type: "application/msword" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tệp Word có macro không gửi được.",
    );
    expect(screen.getByRole("button", { name: "Đính kèm" })).toBeDisabled();
  });
});
