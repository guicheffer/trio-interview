// Only the platform's own announcement counts; any other URL an app prints (logs, JSON, CORS lists) must not become the preview
const PREVIEW_RE = /(?<=Preview ready: )https?:\/\/[A-Za-z0-9\-._~:\/%?#@!$&'()*+;=]+/;

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g');

const withoutColors = (text: string) => text.replace(ANSI, '');

/** The preview address the server prints as "Preview ready: <url>", colors removed */
export function firstPreviewUrl(text: string): string | null {
  return PREVIEW_RE.exec(withoutColors(text))?.[0] ?? null;
}

export function lastPreviewUrl(text: string): string | null {
  const urls = withoutColors(text).match(new RegExp(PREVIEW_RE.source, 'g'));
  return urls?.length ? urls[urls.length - 1] : null;
}
