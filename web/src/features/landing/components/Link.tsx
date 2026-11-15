import type { ComponentProps, MouseEvent } from "react";

import { navigate } from "../navigation";

function plainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * Link leads to another address of the landing site. It is a real link, so
 * it opens in a new tab like any other; a plain click changes the page in
 * place.
 */
export function Link({
  to,
  onClick,
  children,
  ...props
}: Readonly<{ to: string } & Omit<ComponentProps<"a">, "href">>) {
  return (
    <a
      {...props}
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (!plainClick(event) || props.target === "_blank") return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
