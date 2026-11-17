import type { ReactNode } from "react";
import { pieces } from "./links";

/**
 * Linkified renders a message body as text, with each http(s) address as a
 * React anchor that opens in a new tab and passes on neither the opener nor
 * the referrer, and asks search engines to follow nothing.
 */
export function Linkified({
  body,
  linkClassName,
}: Readonly<{ body: string; linkClassName?: string }>): ReactNode {
  return pieces(body).map((piece, index) =>
    piece.href === null ? (
      piece.text
    ) : (
      <a
        key={index}
        href={piece.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={linkClassName}
      >
        {piece.text}
      </a>
    ),
  );
}
