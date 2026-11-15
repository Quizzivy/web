import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

/**
 * Shape draws one of the landing site's drawn marks (the brush stroke, the
 * sparkle, the squiggle, the line under the headline) as a mask over the
 * colour its class names, so the mark follows the theme. `fit` stretches the
 * shape to the box or keeps its proportions.
 */
export function Shape({
  src,
  fit = "stretch",
  className,
  style,
}: Readonly<{
  src: string;
  fit?: "stretch" | "contain";
  className?: string;
  style?: CSSProperties;
}>) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute",
        fit === "contain" ? "landing-mask-contain" : "landing-mask",
        className,
      )}
      style={{ ...style, "--landing-mask": `url("${src}")` } as CSSProperties}
    />
  );
}

/** Dots is the square of small dots that sits behind a corner of the top. */
export function Dots({ className }: Readonly<{ className?: string }>) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute size-[92px] [background-image:radial-gradient(var(--ring)_1.6px,transparent_1.8px)] [background-size:18px_18px] opacity-60",
        className,
      )}
    />
  );
}

/** Tile is the soft ground an illustration sits on; it stays light in the dark theme. */
export function Tile({
  src,
  className,
}: Readonly<{ src: string; className?: string }>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "landing-tile grid min-w-0 place-items-center overflow-hidden rounded-[28px]",
        className,
      )}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className="block size-full min-h-0 object-contain"
      />
    </div>
  );
}
