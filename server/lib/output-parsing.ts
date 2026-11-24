const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g');

const PORT_PATTERNS = [
  /(?:localhost|127\.0\.0\.1):(\d{4,5})/i,
  /(?:listening|running|started?)[^\d]*(\d{4,5})/i,
  /on port\s+(\d{4,5})/i,
];

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

/** The first port a dev server announces in its output, or null */
export function detectPort(text: string): number | null {
  for (const pattern of PORT_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

const TITLE_LEADING = new Set(['"', "'", '`', '#', '*']);
const TITLE_TRAILING = new Set(['"', "'", '`', '.', '*']);

const isSpace = (ch: string) => ch.trim() === '';

/** The first line of the model's answer, without quotes, markdown marks or trailing punctuation, at most 40 characters */
export function cleanTitle(raw: string): string {
  const line = raw.split('\n')[0];
  let start = 0;
  let end = line.length;
  while (start < end && (TITLE_LEADING.has(line.charAt(start)) || isSpace(line.charAt(start)))) start++;
  while (end > start && (TITLE_TRAILING.has(line.charAt(end - 1)) || isSpace(line.charAt(end - 1)))) end--;
  return line.slice(start, end).slice(0, 40);
}
