/** Piece is a run of a message body: plain text, or an address to link. */
export type Piece = Readonly<{ text: string; href: string | null }>;

const CANDIDATE = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING = new Set([
  ".",
  ",",
  ";",
  ":",
  "!",
  "?",
  "'",
  '"',
  "\u2019",
  "\u201d",
  "\u2026",
]);

/**
 * trimEnd drops what usually follows an address in a sentence rather than
 * belonging to it: closing punctuation, and a closing bracket the address did
 * not open, so "(see https://a.vn/x)." links "https://a.vn/x".
 */
function trimEnd(raw: string): string {
  let text = raw;
  for (;;) {
    const before = text;
    while (text !== "" && TRAILING.has(text.at(-1)!)) text = text.slice(0, -1);
    for (const [open, close] of [
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ] as const) {
      if (!text.endsWith(close)) continue;
      const opened = text.split(open).length - 1;
      const closed = text.split(close).length - 1;
      if (closed > opened) text = text.slice(0, -1);
    }
    if (text === before) return text;
  }
}

/** safeHref is `text` as a link target when it parses as an http(s) URL with a host, and null otherwise. */
function safeHref(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.hostname === "") return null;
  return url.href;
}

/**
 * pieces cuts a plain-text body into text and http(s) addresses. Nothing else
 * in a body means anything: no HTML, no Markdown, no other scheme, so
 * "javascript:" or a "<a>" stays the text it is.
 */
export function pieces(body: string): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  const push = (text: string, href: string | null) => {
    if (text === "") return;
    const last = out.at(-1);
    if (href === null && last !== undefined && last.href === null)
      out[out.length - 1] = { text: last.text + text, href: null };
    else out.push({ text, href });
  };
  for (const match of body.matchAll(CANDIDATE)) {
    const start = match.index;
    const text = trimEnd(match[0]);
    const href = safeHref(text);
    if (href === null) continue;
    push(body.slice(at, start), null);
    push(text, href);
    at = start + text.length;
  }
  push(body.slice(at), null);
  return out;
}
