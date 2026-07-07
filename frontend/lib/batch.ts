// Remembers the ids of the ads generated together in one run, so the ad page's
// pager can flip through just that batch (not the whole library). Session-scoped
// and best-effort — clears itself when a new batch is generated or the tab closes.
// Optional per-id labels name each item (e.g. an A/B "take" angle).

const KEY = "dart:batch";

interface StoredBatch {
  ids: string[];
  labels?: (string | null)[];
}

export function setBatch(ids: string[], labels?: (string | null)[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ids, labels }));
  } catch {
    /* storage unavailable — the pager just won't show */
  }
}

function read(): StoredBatch {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (Array.isArray(raw)) return { ids: raw as string[] }; // legacy shape
    if (raw && Array.isArray(raw.ids)) {
      return {
        ids: raw.ids as string[],
        labels: Array.isArray(raw.labels) ? raw.labels : undefined,
      };
    }
    return { ids: [] };
  } catch {
    return { ids: [] };
  }
}

export function getBatch(): string[] {
  return read().ids;
}

// The label for a given id in the current batch, if one was stored.
export function getBatchLabel(id: string): string | null {
  const b = read();
  const i = b.ids.indexOf(id);
  return i >= 0 && b.labels ? b.labels[i] ?? null : null;
}
