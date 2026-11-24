'use client';

import { useCallback, useEffect, useState } from 'react';

const FOLLOW_KEY = 'trio_cc_follow';
const EVENT = 'trio-follow-change';

// Follow is off by default on both sides. While it is off, this screen ignores how the other person navigates
// (open and focused files, scroll, preview, terminal and chat tabs, layout, folders). Content always stays live:
// file text, terminal output, chat messages, cursors and carets.
// What is open (terminal tabs, chats) is always shared; which one is focused only when following.
// File tabs the candidate opens always reach the interviewer, the interviewer's file tabs only reach a following candidate.
const FOLLOW_PREFIXES = [
  'trio_cc_scroll_', 'trio_cc_active_file_', 'trio_cc_preview_pinned_', 'trio_cc_preview_seeded_',
  'trio_cc_layout_', 'trio_cc_sizes_', 'trio_cc_expanded_', 'trio_cc_active_thread_',
];
const SNAPSHOT_KEY = 'trio_cc_follow_snapshot';
const TERMINAL_KEY = 'trio_cc_term_tabs_';
const TABS_KEY = 'trio_cc_tabs_';
let restoring = false;

export function isInterviewerView(): boolean {
  try { return localStorage.getItem('trio_cc_role') === 'interviewer'; } catch { return false; }
}

export function isFollowing(): boolean {
  try { return localStorage.getItem(FOLLOW_KEY) === '1'; } catch { return false; }
}

export function isFollowKey(key: string, receiverIsInterviewer = false): boolean {
  if (key.startsWith('trio_cc_tabs_')) return !receiverIsInterviewer;
  return FOLLOW_PREFIXES.some(p => key.startsWith(p));
}

/** The keys that make up what this screen is looking at, which Follow overwrites with the other person's */
function viewKeys(includeInterviewerTabs = false): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    // The other side's sizes are theirs to write; only this side's go back
    if (key.startsWith('trio_cc_sizes_') && !key.startsWith(`trio_cc_sizes_${isInterviewerView() ? 'interviewer' : 'candidate'}_`)) continue;
    if (FOLLOW_PREFIXES.some(p => key.startsWith(p)) || key.startsWith(TERMINAL_KEY) || (key.startsWith(TABS_KEY) && (includeInterviewerTabs || !isInterviewerView()))) keys.push(key);
  }
  return keys;
}

/** What this screen shows right now, to send to someone who turned Follow on (not what was written to the room last) */
export function currentView(): Record<string, string> {
  const view: Record<string, string> = {};
  try {
    for (const key of viewKeys(true)) {
      const value = localStorage.getItem(key);
      if (value !== null) view[key] = value;
    }
    for (const contribute of contributors) Object.assign(view, contribute());
  } catch {}
  return view;
}

const contributors = new Set<() => Record<string, string>>();

/** Lets a part of the page add to the saved view what is not in localStorage yet, like the sizes the panels have right now */
export function registerViewSnapshot(contribute: () => Record<string, string>): () => void {
  contributors.add(contribute);
  return () => { contributors.delete(contribute); };
}

/** Remembers this screen's own view (files, layout, sizes, chat, terminal) at the moment Follow is turned on */
function takeSnapshot() {
  try {
    const snapshot: Record<string, string> = {};
    for (const key of viewKeys()) {
      const value = localStorage.getItem(key);
      if (value !== null) snapshot[key] = value;
    }
    for (const contribute of contributors) Object.assign(snapshot, contribute());
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {}
}

/** Puts the view back the way it was before Follow, through the same events a change from the other screen uses */
function restoreSnapshot() {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    sessionStorage.removeItem(SNAPSHOT_KEY);
    if (!raw) return;
    const snapshot = JSON.parse(raw) as Record<string, string>;
    restoring = true;
    try {
      for (const [key, value] of Object.entries(snapshot)) {
        // The list of terminals is shared and may have grown; only which one is in front goes back
        if (!key.startsWith(TERMINAL_KEY) && localStorage.getItem(key) !== value) localStorage.setItem(key, value);
        window.dispatchEvent(new CustomEvent('trio-kv', { detail: { key, value } }));
      }
    } finally {
      restoring = false;
    }
  } catch {}
}

/** True while a saved view is being put back, so a terminal brings its own tab to the front */
export function isRestoringView(): boolean {
  return restoring;
}

/** Turning Follow off from the switch returns to the view you had before; stopFollowing keeps where you went */
export function setFollowing(value: boolean, options: { restore?: boolean } = {}) {
  const was = isFollowing();
  if (value && !was) takeSnapshot();
  try { localStorage.setItem(FOLLOW_KEY, value ? '1' : '0'); } catch {}
  window.dispatchEvent(new CustomEvent(EVENT, { detail: value }));
  if (!value && was && options.restore !== false) restoreSnapshot();
}

// Navigating on your own (another file, another tab, dragging a panel) ends Follow, so the frame never lies about what you see
export function stopFollowing() {
  if (isFollowing()) setFollowing(false, { restore: false });
}

export function useFollowing(): [boolean, (v: boolean) => void] {
  const [following, setState] = useState(false);
  useEffect(() => {
    setState(isFollowing());
    const handler = () => setState(isFollowing());
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
  const set = useCallback((v: boolean) => setFollowing(v), []);
  return [following, set];
}
