const PREFIX = 'trio_cc_';
const stampKey = (baseKey: string) => `trio_cc_ui_stamp_${baseKey}`;

function inScope(key: string, baseKey: string): boolean {
  return key.startsWith(PREFIX) && !key.startsWith('trio_cc_ui_stamp_') && key.includes(baseKey);
}

export function collectScope(baseKey: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && inScope(key, baseKey)) out[key] = localStorage.getItem(key) ?? '';
  }
  return out;
}

function buildStructured(baseKey: string, keys: Record<string, string>) {
  const parse = (k: string): any => {
    try { return keys[k] ? JSON.parse(keys[k]) : undefined; } catch { return undefined; }
  };
  const threads = (parse(`trio_cc_threads_${baseKey}`) ?? []).map((t: any) => ({
    ...t,
    claudeSessionId: keys[`trio_cc_claude_sid_trio_cc_chat_${baseKey}_${t.id}`],
    messages: parse(`trio_cc_chat_${baseKey}_${t.id}`) ?? [],
  }));
  const termTabs: Array<{ id: string; label: string }> = parse(`trio_cc_term_tabs_${baseKey}`)?.tabs ?? [];
  return {
    openTabs: parse(`trio_cc_tabs_${baseKey}`) ?? [],
    activeFile: keys[`trio_cc_active_file_${baseKey}`],
    threads,
    terminals: termTabs.map(t => ({ ...t, scrollback: keys[`trio_cc_term_scroll_${baseKey}_${t.id}`] ?? '' })),
  };
}

export async function hydrateFromServer(candidate: string, exercise: string, baseKey: string): Promise<void> {
  try {
    const res = await fetch(`/api/ui-state?candidate=${encodeURIComponent(candidate)}&exercise=${encodeURIComponent(exercise)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data?.keys || !data.updatedAt || data.updatedAt > Date.now() + 60_000) return;

    const localStamp = Number(localStorage.getItem(stampKey(baseKey)) || 0);
    const hasLocal = Object.keys(collectScope(baseKey)).length > 0;
    if (data.updatedAt > localStamp || !hasLocal) {
      for (const key of Object.keys(collectScope(baseKey))) localStorage.removeItem(key);
      // Only this session's own keys are taken over, so server data can never set the role or another session's state
      for (const [key, value] of Object.entries<string>(data.keys)) {
        if (typeof value === 'string' && inScope(key, baseKey)) localStorage.setItem(key, value);
      }
      localStorage.setItem(stampKey(baseKey), String(data.updatedAt));
    }
  } catch {}
}

export function startPushing(candidate: string, exercise: string, baseKey: string): () => void {
  let lastSent = JSON.stringify(collectScope(baseKey));

  const payload = (keys: Record<string, string>, updatedAt: number) =>
    JSON.stringify({ candidate, exercise, updatedAt, keys, structured: buildStructured(baseKey, keys) });

  const push = async () => {
    const keys = collectScope(baseKey);
    const snapshot = JSON.stringify(keys);
    if (snapshot === lastSent || Object.keys(keys).length === 0) return;
    const updatedAt = Date.now();
    try {
      const res = await fetch('/api/ui-state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: payload(keys, updatedAt),
      });
      if (res.ok) {
        lastSent = snapshot;
        localStorage.setItem(stampKey(baseKey), String(updatedAt));
      }
    } catch {}
  };

  const beacon = () => {
    const keys = collectScope(baseKey);
    if (JSON.stringify(keys) === lastSent || Object.keys(keys).length === 0) return;
    try {
      navigator.sendBeacon('/api/ui-state', new Blob([payload(keys, Date.now())], { type: 'application/json' }));
    } catch {}
  };

  const onHide = () => { if (document.visibilityState === 'hidden') beacon(); };
  const timer = setInterval(push, 3000);
  window.addEventListener('pagehide', beacon);
  document.addEventListener('visibilitychange', onHide);

  return () => {
    clearInterval(timer);
    window.removeEventListener('pagehide', beacon);
    document.removeEventListener('visibilitychange', onHide);
  };
}
