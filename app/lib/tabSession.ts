import { nanoid } from 'nanoid';

const KEY = 'trio_cc_tab_session';

/**
 * One id per browser tab. It survives a reload, so the assistant's work in progress can be found again,
 * while two tabs (interviewer and candidate) never share a session.
 */
export function tabSessionId(): string {
  try {
    const saved = sessionStorage.getItem(KEY);
    if (saved) return saved;
    const id = nanoid();
    sessionStorage.setItem(KEY, id);
    return id;
  } catch {
    return nanoid();
  }
}
