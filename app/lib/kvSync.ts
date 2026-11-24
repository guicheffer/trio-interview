import { collab } from './collab';
import { currentView, isFollowKey, isFollowing } from './follow';

// Kept out of the live sync: big, per browser or private to this machine
const LOCAL_ONLY = ['trio_cc_term_scroll_', 'trio_cc_ui_stamp_', 'trio_cc_consent', 'trio_cc_candidate', 'trio_cc_exercise', 'trio_cc_show_cursors', 'trio_cc_role', 'trio_cc_follow'];

let activeBaseKey: string | null = null;
let applyingRemote = false;
let patched = false;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let rawSet: (this: Storage, key: string, value: string) => void;
let rawRemove: (this: Storage, key: string) => void;

function shared(key: string): boolean {
  return !!activeBaseKey
    && key.startsWith('trio_cc_')
    && key.includes(activeBaseKey)
    && !LOCAL_ONLY.some(p => key.startsWith(p));
}

function scheduleSend(key: string) {
  if (applyingRemote) return;
  const pending = timers.get(key);
  if (pending) clearTimeout(pending);
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    collab.send({ type: 'kv', key, value: localStorage.getItem(key) });
  }, key.startsWith('trio_cc_chat_') ? 250 : 100));
}

function patchStorage() {
  if (patched || typeof window === 'undefined') return;
  patched = true;
  rawSet = Storage.prototype.setItem;
  rawRemove = Storage.prototype.removeItem;

  Storage.prototype.setItem = function (key: string, value: string) {
    const changed = this === window.localStorage && shared(key) && this.getItem(key) !== value;
    rawSet.call(this, key, value);
    if (changed) scheduleSend(key);
  };
  Storage.prototype.removeItem = function (key: string) {
    const existed = this === window.localStorage && shared(key) && this.getItem(key) !== null;
    rawRemove.call(this, key);
    if (existed) scheduleSend(key);
  };
}

function applyRemote(key: string, value: string | null) {
  if (!shared(key)) return;
  if (isFollowKey(key, collab.role === 'interviewer') && !isFollowing()) return;
  if (localStorage.getItem(key) === value) return;
  applyingRemote = true;
  try {
    if (value === null) rawRemove.call(localStorage, key);
    else rawSet.call(localStorage, key, value);
  } finally {
    applyingRemote = false;
  }
  window.dispatchEvent(new CustomEvent('trio-kv', { detail: { key, value } }));
}

function scopeKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && shared(key)) keys.push(key);
  }
  return keys;
}

/** Mirrors this candidate's UI state (tabs, folders, chats, layout...) with every other screen in the same room. */
export function startKvSync(baseKey: string, displayName: string): () => void {
  patchStorage();
  activeBaseKey = baseKey;
  collab.setName(displayName);

  const offKv = collab.on('kv', (msg) => applyRemote(msg.key, msg.value));
  const offSnapshot = collab.on('kv-snapshot', (msg) => {
    const entries = msg.entries as Record<string, { value: string | null }>;
    const remoteKeys = Object.keys(entries);
    if (remoteKeys.length === 0) {
      // Fresh room (server restarted): the candidate's screen is the source of truth
      if (collab.role === 'candidate') for (const key of scopeKeys()) scheduleSend(key);
      return;
    }
    for (const key of remoteKeys) applyRemote(key, entries[key].value);
  });

  // Someone turned Follow on: show them this screen as it is now, not as the room last remembers it
  const offRequest = collab.on('peer', (msg) => {
    if (msg.kind !== 'view-request') return;
    for (const [key, value] of Object.entries(currentView())) {
      if (shared(key)) collab.send({ type: 'kv', key, value });
    }
  });

  collab.join(baseKey);

  const onFollowChange = () => {
    if (!isFollowing()) return;
    collab.join(baseKey);
    collab.send({ type: 'peer', kind: 'view-request' });
  };
  window.addEventListener('trio-follow-change', onFollowChange);

  return () => {
    window.removeEventListener('trio-follow-change', onFollowChange);
    offKv();
    offSnapshot();
    offRequest();
    if (activeBaseKey === baseKey) activeBaseKey = null;
  };
}
