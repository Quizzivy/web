import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";
import { toast } from "sonner";
import { server } from "./server";
import { SURFACES, loadLocale, loadSurface } from "@/lib/i18n";

/**
 * The app fetches a route tree's strings before the tree renders, and the
 * English strings on first use; tests load every surface in both languages up
 * front, so a component renders its copy outside its route and a switch to en
 * stays synchronous.
 */
await Promise.all(SURFACES.map(loadSurface));
await loadLocale("en");

/** jsdom ships no matchMedia; a desktop-width answer keeps the admin layouts in their wide form. */
window.matchMedia ??= (query: string) =>
  ({
    matches: query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

/** jsdom implements no pointer capture; sonner's swipe handler calls it on every toast press. */
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
/** jsdom does no layout; Radix Select scrolls the chosen item into view when it opens. */
Element.prototype.scrollIntoView ??= () => {};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

/** Sonner unmounts a removed toast on a 200ms timer it never clears; a file that toasted waits it out, or the timer fires after jsdom is gone. */
afterAll(async () => {
  if (toast.getHistory().length > 0) {
    toast.dismiss();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  server.close();
});
