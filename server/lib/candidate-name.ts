/** Candidate names become folder names under .solutions, so they can never contain a path. */
const SAFE_CANDIDATE_NAME = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$/;

export function isSafeCandidateName(name: unknown): name is string {
  return typeof name === 'string' && SAFE_CANDIDATE_NAME.test(name);
}

export function assertSafeCandidateName(name: unknown): string {
  if (!isSafeCandidateName(name)) throw new Error('Invalid candidate name');
  return name;
}
