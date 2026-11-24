const CD_FORBIDDEN = new Set(['&', '|', ';', '<', '>', '(', ')', '`', '$']);

/** `cd` or `cd <target>` where the target has no shell operators */
export function isPlainCd(command: string): boolean {
  if (!command.startsWith('cd')) return false;
  const rest = command.slice(2);
  if (rest === '') return true;
  if (!/^\s/.test(rest)) return false;
  for (const ch of rest) if (CD_FORBIDDEN.has(ch)) return false;
  return true;
}

function startsWithWord(text: string, word: string): boolean {
  if (!text.startsWith(word)) return false;
  const next = text.charAt(word.length);
  return next === '' || !/\w/.test(next);
}

/** True when a line of the source starts with an import or export statement */
export function hasModuleSyntax(source: string): boolean {
  return source.split('\n').some(line => {
    const t = line.trimStart();
    return startsWithWord(t, 'export') || startsWithWord(t, 'import');
  });
}

export function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charAt(end - 1) === '/') end--;
  return value.slice(0, end);
}

export function trimSlashes(value: string): string {
  let start = 0;
  while (start < value.length && value.charAt(start) === '/') start++;
  return trimTrailingSlashes(value.slice(start));
}
