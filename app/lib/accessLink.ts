/** The secret of this interview's link. It rides after a # so it never reaches a server or a log; ?k= also works if a chat app drops the #. */
export function tokenFromLocation(loc: Pick<Location, 'hash' | 'search'>): string | null {
  for (const part of [loc.hash.replace(/^#/, ''), loc.search.replace(/^\?/, '')]) {
    const value = new URLSearchParams(part).get('k');
    if (value) return value.slice(0, 200);
  }
  return null;
}

/** The address without the secret, for the address bar once it has been used */
export function withoutToken(loc: Pick<Location, 'pathname' | 'search'>): string {
  const params = new URLSearchParams(loc.search.replace(/^\?/, ''));
  params.delete('k');
  const query = params.toString();
  return loc.pathname + (query ? `?${query}` : '');
}
