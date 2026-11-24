import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';

// Which files the AI wrote to, kept next to the candidate's exercise folder so it survives restarts and shows up in the export
function storePath(workPath: string): string {
  return join(dirname(workPath), `ai-files-${basename(workPath)}.json`);
}

export function readAiFiles(workPath: string): string[] {
  try {
    const parsed = JSON.parse(readFileSync(storePath(workPath), 'utf-8'));
    return Array.isArray(parsed) ? parsed.filter((f): f is string => typeof f === 'string') : [];
  } catch {
    return [];
  }
}

export function markAiFile(workPath: string, relativePath: string): void {
  const known = readAiFiles(workPath);
  if (known.includes(relativePath)) return;
  try {
    mkdirSync(dirname(storePath(workPath)), { recursive: true });
    writeFileSync(storePath(workPath), JSON.stringify([...known, relativePath]), 'utf-8');
  } catch {}
}
