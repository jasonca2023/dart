// Remembers the ids of the ads generated together in one run, so the ad page's
// pager can flip through just that batch (not the whole library). Session-scoped
// and best-effort — clears itself when a new batch is generated or the tab closes.

const KEY = "dart:batch";

export function setBatch(ids: string[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable — the pager just won't show */
  }
}

export function getBatch(): string[] {
  try {
    const arr = JSON.parse(sessionStorage.getItem(KEY) || "[]");
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}
