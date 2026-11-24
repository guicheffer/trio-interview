/**
 * The candidate's app is shown to the interviewer from a second port of the same server. Another port is another
 * origin, so a page the candidate wrote cannot read or call the interviewer's API, and it is still the same site, so
 * the app's own cookies (a login, for example) keep working inside the preview frame.
 */
export const PREVIEW_PORT = 3099;

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

/** True for a Host header that points at the preview port of this machine */
export function isPreviewHost(host: string): boolean {
  const match = /^(.+):(\d+)$/.exec(host.trim());
  return !!match && LOCAL.test(match[1]) && Number(match[2]) === PREVIEW_PORT;
}
