import { useEffect, useRef } from "react";
import { exitFullscreen } from "./fullscreen";

/** How many engines are mounted, so a remount in the same tick keeps fullscreen. */
let mounted = 0;

/**
 * useFullscreenReleased leaves the fullscreen the engine asked for when the
 * student leaves the paper by any way out: the ✕, the browser's back button,
 * or any other navigation away from it (§10.2). The exit waits a tick and
 * happens only if no engine is mounted by then, so React's development
 * remount, or a move from one attempt's route to another, does not drop a
 * fullscreen the student is still meant to be in. `asks` is read at the moment
 * of leaving: a fullscreen the assignment did not ask for is left alone. The
 * integrity monitor has removed its listeners by then, so the app's own exit
 * is not recorded as the student's.
 */
export function useFullscreenReleased(asks: boolean): void {
  const asked = useRef(asks);
  useEffect(() => {
    asked.current = asks;
  }, [asks]);
  useEffect(() => {
    mounted += 1;
    return () => {
      mounted -= 1;
      if (!asked.current) return;
      setTimeout(() => {
        if (mounted === 0) void exitFullscreen();
      }, 0);
    };
  }, []);
}
