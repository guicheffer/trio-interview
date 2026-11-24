import { PREVIEW_PORT } from '../../shared/preview-origin';

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

/**
 * Where the preview is loaded from. On the interviewer's screen (localhost) the candidate's app is served from a
 * port of its own, so a page the candidate wrote cannot call the interviewer's API (it is another origin) while the
 * app's cookies still work (it is the same site). A candidate previewing their own app stays on the page's origin.
 * The address may be a path or the full address of this server.
 */
export function previewSrc(address: string, loc: Pick<Location, 'protocol' | 'hostname' | 'port'> | undefined): string {
  if (!loc || !LOCAL_HOST.test(loc.hostname)) return address;
  let path = address;
  if (!address.startsWith('/')) {
    try {
      const url = new URL(address);
      if (!LOCAL_HOST.test(url.hostname) || (url.port || '80') !== (loc.port || '80')) return address;
      path = url.pathname + url.search + url.hash;
    } catch {
      return address;
    }
  }
  return `${loc.protocol}//localhost:${PREVIEW_PORT}${path}`;
}
