import { useSyncExternalStore } from "react";

/**
 * The landing site's navigation. It has three pages and a few links to parts
 * of the first, so it reads the address itself and needs no router: a link
 * changes the address without loading the page again, and every page reads
 * where it is from the address.
 */
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  window.addEventListener("hashchange", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
    window.removeEventListener("hashchange", listener);
  };
}

/** navigate opens an address of the landing site without loading the page again. */
export function navigate(to: string): void {
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (to !== current) window.history.pushState(null, "", to);
  notify();
}

/** usePathname is the path of the page on screen. */
export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

/**
 * useAddress is the path with the part it points at, as `/#faq`: the page
 * follows it to that part.
 */
export function useAddress(): string {
  return useSyncExternalStore(
    subscribe,
    () => `${window.location.pathname}${window.location.hash}`,
  );
}
