import { accessToken } from './access-gate.js';

let platformUrl = process.env.PLATFORM_URL || 'http://localhost:3000';

export function getPlatformUrl(): string {
  return platformUrl;
}

/** Only a web address is kept; anything else (a script, a file path) is ignored */
export function setPlatformUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 300) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    platformUrl = url.origin;
    return true;
  } catch {
    return false;
  }
}

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

/**
 * The link the interviewer sends: the tunnel address plus this interview's private code after a #.
 * Null when there is no tunnel (the address is local) or the servers were not started with make start.
 */
export function candidateLink(): string | null {
  const token = accessToken();
  if (!token) return null;
  try {
    const url = new URL(platformUrl);
    if (LOCAL.test(url.hostname)) return null;
    return `${url.origin}/#k=${token}`;
  } catch {
    return null;
  }
}
