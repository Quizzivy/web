import { useEffect } from "react";
import { coversPaper, useAppState } from "@/stores/appState";
import type { LockReason, SubmitState } from "./store";

/** ACTIVE_MS_MAX is the contract's ceiling for one report of time on the paper. */
export const ACTIVE_MS_MAX = 600_000;

/**
 * The time on the paper not yet acknowledged by the server: `banked` from
 * the sittings that have ended, plus the one running since `since`, both on
 * the device's clock. Module-level, like the flush timer, because the store's
 * save and the pagehide beacon both read it and neither renders it.
 */
let banked = 0;
let since: number | null = null;

/** startPaperTime starts a visible stretch, unless one is already running. */
export function startPaperTime(now = Date.now()): void {
  if (since === null) since = now;
}

/** stopPaperTime ends the running stretch and banks it. */
export function stopPaperTime(now = Date.now()): void {
  if (since === null) return;
  banked += Math.max(0, now - since);
  since = null;
}

/** paperTime is the time on the paper not yet acknowledged, in whole milliseconds. */
export function paperTime(now = Date.now()): number {
  return Math.floor(banked + (since === null ? 0 : Math.max(0, now - since)));
}

/** reportablePaperTime is what one report may carry: paperTime, at most ACTIVE_MS_MAX. */
export function reportablePaperTime(now = Date.now()): number {
  return Math.min(ACTIVE_MS_MAX, paperTime(now));
}

/**
 * settlePaperTime takes `sent` off the accumulator once the server has
 * acknowledged a save that carried it. What accrued while the save was out
 * stays, so nothing is reported twice and nothing is lost.
 */
export function settlePaperTime(sent: number, now = Date.now()): void {
  if (sent <= 0) return;
  const total = paperTime(now);
  banked = Math.max(0, total - sent);
  if (since !== null) since = now;
}

/** resetPaperTime forgets everything, for an engine that lets go of its attempt. */
export function resetPaperTime(): void {
  banked = 0;
  since = null;
}

/**
 * usePaperTime adds up the time the paper is visible while it can be worked
 * on: it has loaded, is not locked and is not being submitted, the document
 * is visible, and no maintenance or "sign in again" overlay covers the page.
 * It stops when any of that ends or the engine unmounts; what it banked
 * stays until a save is acknowledged or the store resets.
 */
export function usePaperTime(paper: {
  loaded: boolean;
  lock: LockReason | null;
  submitState: SubmitState;
}): void {
  const active = paper.loaded && paper.lock === null && paper.submitState === "idle";
  useEffect(() => {
    if (!active) return;
    const sync = () => {
      if (!document.hidden && !coversPaper(useAppState.getState().overlay))
        startPaperTime();
      else stopPaperTime();
    };
    sync();
    const unsubscribe = useAppState.subscribe(sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", sync);
      stopPaperTime();
    };
  }, [active]);
}
