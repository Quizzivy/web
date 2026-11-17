import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Linkified } from "@/features/messages/linkify";
import { pieces } from "@/features/messages/links";

/** A plain-text address and another scheme, which a teacher may well paste. */
// eslint-disable-next-line sonarjs/no-clear-text-protocols -- the body a teacher typed, not a request
const PLAIN = "http://a.vn/x?y=1#z";
// eslint-disable-next-line sonarjs/no-clear-text-protocols -- the body a teacher typed, not a request
const FTP = "ftp://a.vn/x";

describe("links in a message body (T-R7.20)", () => {
  it("links http and https addresses and leaves the rest as text", () => {
    expect(pieces(`Xem https://example.edu.vn/thi-thu và ${PLAIN} nhé`)).toEqual([
      { text: "Xem ", href: null },
      {
        text: "https://example.edu.vn/thi-thu",
        href: "https://example.edu.vn/thi-thu",
      },
      { text: " và ", href: null },
      { text: PLAIN, href: PLAIN },
      { text: " nhé", href: null },
    ]);
  });

  it("keeps the punctuation and the bracket that close a sentence out of the link", () => {
    expect(pieces("(xem https://a.vn/x).")).toEqual([
      { text: "(xem ", href: null },
      { text: "https://a.vn/x", href: "https://a.vn/x" },
      { text: ").", href: null },
    ]);
    expect(pieces("https://vi.wikipedia.org/wiki/A_(B)")[0]).toEqual({
      text: "https://vi.wikipedia.org/wiki/A_(B)",
      href: "https://vi.wikipedia.org/wiki/A_(B)",
    });
  });

  it("links no other scheme and no address without a host", () => {
    for (const body of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(document.cookie)",
      "data:text/html,<script>alert(1)</script>",
      FTP,
      "https://",
      "mailto:a@b.vn",
    ])
      expect(
        pieces(body).every((piece) => piece.href === null),
        body,
      ).toBe(true);
  });

  it("renders markup as the text it is, and a link that hands nothing to the page it opens", () => {
    const { container } = render(
      <p>
        <Linkified
          body={
            '<a href="javascript:alert(1)">bấm</a> <img src=x onerror=alert(1)> https://a.vn/"onmouseover="x'
          }
        />
      </p>,
    );
    expect(container.querySelector("img")).toBeNull();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://a.vn/");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(container.textContent).toContain('<a href="javascript:alert(1)">bấm</a>');
  });
});
