const DROPPED_PREFIXES = ['--- previous session restored', '--- earlier session', '--- reconnected'];

const isBlank = (line: string) => !line.trim();

/** "● name / exercise", the banner the server prints when a terminal attaches */
function isBanner(line: string): boolean {
  return line.startsWith('\u25cf ') && line.includes(' / ');
}

/** "candidate/exercise $", an empty shell prompt */
function isEmptyPrompt(line: string): boolean {
  const trimmed = line.trimEnd();
  if (!trimmed.endsWith(' $')) return false;
  const path = trimmed.slice(0, -2);
  const slash = path.indexOf('/');
  return slash > 0 && slash < path.length - 1 && !/\s/.test(path);
}

function isNoise(line: string): boolean {
  return DROPPED_PREFIXES.some(prefix => line.startsWith(prefix)) || line.includes('Terminal disconnected') || isBanner(line) || isEmptyPrompt(line);
}

/** Restore markers, the shell banner, empty prompts and runs of blank lines do not pile up across reloads */
export function cleanScrollback(lines: string[]): string[] {
  return lines.filter((line, i) => !isNoise(line) && !(i > 0 && isBlank(line) && isBlank(lines[i - 1])));
}
