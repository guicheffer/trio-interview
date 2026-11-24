/** Turns file names the assistant mentions into links the chat can open in the editor */
export const FILE_LINK_PREFIX = 'trio-file:';

const SKIP = /(`[^`\n]*`|\[[^\]\n]*\]\([^)\n]*\))/;
const BARE = /(?<![\w/.@-])((?:[\w.-]+\/)*[\w.-]*\w\.[A-Za-z][A-Za-z0-9]{0,7})(?::(\d+))?(?![\w/-])/g;

/** The file a mention points at: the full path, or a bare name when only one file has it */
export function resolveFile(mention: string, files: string[]): string | null {
  const name = mention.replace(/^\.\//, '');
  if (files.includes(name)) return name;
  const same = files.filter(f => f === name || f.endsWith(`/${name}`));
  return same.length === 1 ? same[0] : null;
}

const link = (label: string, file: string, line?: string) =>
  `[${label}](${FILE_LINK_PREFIX}${encodeURI(file)}${line ? `#${line}` : ''})`;

function linkSegment(text: string, files: string[]): string {
  return text.replace(BARE, (match, mention: string, line?: string) => {
    const file = resolveFile(mention, files);
    return file ? link(match, file, line) : match;
  });
}

/** Links every mention of a known file outside code blocks. Mentions inside inline code keep the code look. */
export function linkFiles(markdown: string, files: string[]): string {
  if (files.length === 0) return markdown;
  let inFence = false;
  return markdown.split('\n').map(line => {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return line; }
    if (inFence) return line;
    return line.split(SKIP).map(part => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        const inner = part.slice(1, -1).trim();
        const m = /^(.+?)(?::(\d+))?$/.exec(inner);
        const file = m ? resolveFile(m[1], files) : null;
        return file ? link(part, file, m?.[2]) : part;
      }
      if (part.startsWith('[')) return part;
      return linkSegment(part, files);
    }).join('');
  }).join('\n');
}

/** Reads a link made by linkFiles back into the file and the line */
export function parseFileLink(href: string | undefined): { file: string; line?: number } | null {
  if (!href?.startsWith(FILE_LINK_PREFIX)) return null;
  const [path, line] = href.slice(FILE_LINK_PREFIX.length).split('#');
  try { return { file: decodeURI(path), ...(line ? { line: Number(line) } : {}) }; } catch { return null; }
}
