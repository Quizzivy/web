import type { ReactNode } from "react";

import { BrandFrame } from "@/components/shared/BrandFrame";
import { orgName } from "../site";

/**
 * SystemPage is the app's system frame on the landing site: the brand panel
 * from 1024px with the page's drawing and the centre's name, beside the page's
 * title, body, evidence and footnote. The name is the build's, because the
 * site asks the API for nothing it can do without.
 */
export function SystemPage({
  art,
  title,
  body,
  footer,
  children,
}: Readonly<{
  /** The panel's drawing. */
  art: ReactNode;
  title: string;
  /** The sentence under the title; without one nothing is drawn. */
  body?: string;
  /** The line under the actions. */
  footer?: ReactNode;
  children?: ReactNode;
}>) {
  const name = orgName();
  return (
    <BrandFrame
      from="lg"
      panel={
        <div className="text-fg self-center" aria-hidden="true">
          {art}
        </div>
      }
      caption={
        name && (
          <span title={name} className="block min-w-0 truncate">
            {name}
          </span>
        )
      }
    >
      <h1 className="text-h1 text-balance">{title}</h1>
      {body && <p className="text-muted-fg text-body mt-2 text-pretty">{body}</p>}
      {children}
      {footer && (
        <p className="text-muted-fg mt-6 text-center text-sm text-pretty">{footer}</p>
      )}
    </BrandFrame>
  );
}

/** SystemActions stacks a system page's actions, ranked and full width. */
export function SystemActions({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="*:rounded-ctl *:text-md mt-5 flex flex-col gap-2 *:h-11 *:w-full *:px-4.5 lg:*:h-9.5 lg:*:text-base">
      {children}
    </div>
  );
}

const SIZE = { viewBox: "0 0 260 260", width: 300, height: 300 } as const;

/**
 * AllNormalArt is the drawing for "all is well": the app's maintenance
 * drawing with its broken line made whole and a tick at the end. It draws in
 * `currentColor`, like the app's system drawings.
 */
export function AllNormalArt() {
  return (
    <svg {...SIZE} fill="none" stroke="currentColor" aria-hidden="true">
      <g fill="currentColor" fillOpacity="0.3" stroke="none">
        <rect x="40" y="52" width="180" height="12" rx="6" />
        <rect x="40" y="76" width="150" height="12" rx="6" />
        <rect x="40" y="100" width="172" height="12" rx="6" />
      </g>
      <rect
        x="40"
        y="124"
        width="158"
        height="12"
        rx="6"
        fill="currentColor"
        stroke="none"
      />
      <g fill="currentColor" fillOpacity="0.3" stroke="none">
        <rect x="40" y="162" width="164" height="12" rx="6" />
        <rect x="40" y="186" width="132" height="12" rx="6" />
        <rect x="40" y="210" width="176" height="12" rx="6" />
      </g>
      <circle cx="228" cy="130" r="12" strokeWidth="2" strokeOpacity="0.8" />
      <path
        d="M222.5 130.5 l4 4 l7 -8"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
