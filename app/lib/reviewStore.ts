/**
 * What the person decided about the agent's changes is remembered in this browser, per file and per version of the
 * "before" text, so coming back to a file (or reloading) does not show the same choices again. Plain keys on purpose:
 * these are not synced to the other screen.
 */
export function hashText(text: string | null): string {
  let h = 5381;
  for (const ch of text ?? '\u0000') h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

const keptKey = (file: string, before: string | null) => `trio_review_kept_${file}_${hashText(before)}`;
const countsKey = (file: string, before: string | null) => `trio_review_counts_${file}_${hashText(before)}`;

export function loadKept(file: string, before: string | null): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(keptKey(file, before)) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch { return new Set(); }
}

export function saveKept(file: string, before: string | null, kept: Set<string>): void {
  try { localStorage.setItem(keptKey(file, before), JSON.stringify([...kept])); } catch {}
}

export interface Counts { added: number; removed: number }

export function loadCounts(file: string, before: string | null): Counts | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(countsKey(file, before)) ?? 'null');
    return parsed && typeof parsed.added === 'number' && typeof parsed.removed === 'number' ? parsed : null;
  } catch { return null; }
}

export function saveCounts(file: string, before: string | null, counts: Counts): void {
  try { localStorage.setItem(countsKey(file, before), JSON.stringify(counts)); } catch {}
}
