/**
 * What follows a file or folder when it is renamed or moved: the open tabs, the active file and the choices the
 * person made about the agent's changes. Pure, so the rules are tested.
 */

/** The new place of a path after `from` became `to`; `from` may be a folder, and everything inside follows */
export function remapPath(path: string, from: string, to: string): string {
  if (path === from) return to;
  return path.startsWith(from + '/') ? to + path.slice(from.length) : path;
}

/** The same list with every moved path in its place; a path that now appears twice is kept once, where it first was */
export function remapList(paths: string[], from: string, to: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    const next = remapPath(p, from, to);
    if (seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}

const REVIEW_PREFIXES = ['trio_review_kept_', 'trio_review_counts_'];

/** Review keys are `<prefix><file>_<hash>`; the hash has no slash or underscore, so the file is what lies between */
export function remapReviewKey(key: string, from: string, to: string): string | null {
  const prefix = REVIEW_PREFIXES.find(p => key.startsWith(p));
  if (!prefix) return null;
  const rest = key.slice(prefix.length);
  const cut = rest.lastIndexOf('_');
  if (cut < 0) return null;
  const file = rest.slice(0, cut);
  const next = remapPath(file, from, to);
  return next === file ? null : `${prefix}${next}${rest.slice(cut)}`;
}

/** Moves the remembered Keep choices and counts of the renamed files to their new names */
export function migrateReviewKeys(storage: Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>, from: string, to: string): void {
  const moves: Array<[string, string]> = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    const next = key ? remapReviewKey(key, from, to) : null;
    if (key && next) moves.push([key, next]);
  }
  for (const [oldKey, newKey] of moves) {
    const value = storage.getItem(oldKey);
    if (value !== null) storage.setItem(newKey, value);
    storage.removeItem(oldKey);
  }
}

/** The editor's scroll record names a file; it follows too, otherwise the other screen scrolls a file that is gone */
export function remapScrollRecord(raw: string | null, from: string, to: string): string | null {
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw);
    if (typeof rec?.file !== 'string') return null;
    const file = remapPath(rec.file, from, to);
    return file === rec.file ? null : JSON.stringify({ ...rec, file });
  } catch { return null; }
}
