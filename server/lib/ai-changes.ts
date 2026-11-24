export interface FileChange {
  file: string;
  before: string | null;
}

interface Source {
  changedAt: number;
  lastChanges(): FileChange[];
}

/** The AI's latest changes across the interview's sessions; for a file two sessions changed, the more recent one wins */
export function mergeChanges(sources: Source[]): FileChange[] {
  const byFile = new Map<string, { at: number; change: FileChange }>();
  for (const source of sources) {
    for (const change of source.lastChanges()) {
      const known = byFile.get(change.file);
      if (!known || source.changedAt >= known.at) byFile.set(change.file, { at: source.changedAt, change });
    }
  }
  return [...byFile.values()].map(v => v.change);
}
