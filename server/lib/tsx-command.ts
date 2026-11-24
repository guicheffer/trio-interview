import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { hasModuleSyntax } from './shell-command.js';

const TEMP_FILE_LIFETIME_MS = 5000;

/**
 * tsx needs an ES module. A plain .ts script without import or export runs from a temporary .mts copy
 * with an empty export added, and the command is pointed at that copy.
 */
export function prepareTsxCommand(cmd: string, exercisePath: string): string {
  const match = /^tsx\s+(\S+)/.exec(cmd);
  if (!match?.[1].endsWith('.ts')) return cmd;
  try {
    const script = resolve(exercisePath, match[1]);
    if (!existsSync(script)) return cmd;
    const content = readFileSync(script, 'utf-8');
    if (hasModuleSyntax(content)) return cmd;
    const tempFile = script.replace(/\.ts$/, '.temp.mts');
    writeFileSync(tempFile, content.trimEnd() + '\nexport {};\n');
    setTimeout(() => { try { unlinkSync(tempFile); } catch { /* already removed */ } }, TEMP_FILE_LIFETIME_MS);
    return cmd.replace(match[1], tempFile);
  } catch {
    return cmd;
  }
}
