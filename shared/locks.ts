/**
 * Locked paths from `lockedFiles` in exercise.json:
 *   "description.md"   a file by name (any folder) or by exact path
 *   "phases/"          a whole folder (also "phases/**")
 *   "fixtures/*.json"  a glob
 */
function globToRegex(glob: string): RegExp {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '').replace(/\*/g, '[^/]*').replace(//g, '.*');
  return new RegExp(`^${esc}$`);
}

function trimSlashes(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value.charAt(start) === '/') start++;
  while (end > start && value.charAt(end - 1) === '/') end--;
  return value.slice(start, end);
}

function stripLeadingSlashes(value: string): string {
  let start = 0;
  while (start < value.length && value.charAt(start) === '/') start++;
  return value.slice(start);
}

function matchesFolder(clean: string, pattern: string): boolean {
  const dir = trimSlashes(pattern.endsWith('/**') ? pattern.slice(0, -3) : pattern);
  return clean === dir || clean.startsWith(dir + '/');
}

function matchesPattern(clean: string, base: string, pattern: string): boolean {
  if (pattern.endsWith('/') || pattern.endsWith('/**')) return matchesFolder(clean, pattern);
  if (!pattern.includes('/') && !pattern.includes('*')) return base === pattern;
  return pattern.includes('*') ? globToRegex(pattern).test(clean) : clean === pattern;
}

/** Collapses ./ and ../ and ignores case, so ./phases/x.md or Phases/x.md are the same file as phases/x.md */
function canonical(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/').toLowerCase();
}

export function isLockedPath(path: string, patterns: Iterable<string>): boolean {
  const clean = canonical(path);
  const base = clean.split('/').pop() ?? clean;
  for (const raw of patterns) {
    const pattern = stripLeadingSlashes(raw).toLowerCase();
    if (pattern && matchesPattern(clean, base, pattern)) return true;
  }
  return false;
}
