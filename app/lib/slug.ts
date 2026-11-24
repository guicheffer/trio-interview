function trimDashes(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value.charAt(start) === '-') start++;
  while (end > start && value.charAt(end - 1) === '-') end--;
  return value.slice(start, end);
}

/** A name typed by a person ("Ana María Souza") as a folder name ("ana-maria-souza") */
export function toSlug(input: string): string {
  return trimDashes(input.trim()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, ''));
}
