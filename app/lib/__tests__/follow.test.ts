import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
}

const BASE = 'ana_fibonacci';
let local: ReturnType<typeof fakeStorage>;
let kvEvents: Array<{ key: string; value: string | null }>;

async function load() {
  vi.resetModules();
  return import('../follow');
}

beforeEach(() => {
  local = fakeStorage();
  const target = new EventTarget();
  kvEvents = [];
  target.addEventListener('trio-kv', (e) => kvEvents.push((e as CustomEvent).detail));
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', fakeStorage());
  vi.stubGlobal('window', target);
});

afterEach(() => vi.unstubAllGlobals());

describe('turning Follow off from the switch', () => {
  test('puts back the view that was there before Follow, and announces it like a change from the other screen', async () => {
    const follow = await load();
    local.setItem(`trio_cc_active_file_${BASE}`, 'mine.js');
    local.setItem(`trio_cc_layout_${BASE}`, '{"files":false}');

    follow.setFollowing(true);
    local.setItem(`trio_cc_active_file_${BASE}`, 'theirs.js');
    kvEvents.length = 0;
    follow.setFollowing(false);

    expect(local.getItem(`trio_cc_active_file_${BASE}`)).toBe('mine.js');
    expect(kvEvents).toContainEqual({ key: `trio_cc_active_file_${BASE}`, value: 'mine.js' });
    expect(follow.isFollowing()).toBe(false);
  });

  test('stopFollowing keeps where the person went', async () => {
    const follow = await load();
    local.setItem(`trio_cc_active_file_${BASE}`, 'mine.js');
    follow.setFollowing(true);
    local.setItem(`trio_cc_active_file_${BASE}`, 'theirs.js');
    follow.stopFollowing();

    expect(local.getItem(`trio_cc_active_file_${BASE}`)).toBe('theirs.js');
    expect(follow.isFollowing()).toBe(false);
  });

  test('a part of the page can add what is not in storage, like panel sizes', async () => {
    const follow = await load();
    follow.registerViewSnapshot(() => ({ [`trio_cc_sizes_candidate_${BASE}`]: '{"outer":{"files":20}}' }));
    follow.setFollowing(true);
    follow.setFollowing(false);

    expect(local.getItem(`trio_cc_sizes_candidate_${BASE}`)).toBe('{"outer":{"files":20}}');
  });

  test('the sizes of the other side are not touched', async () => {
    const follow = await load();
    local.setItem(`trio_cc_sizes_interviewer_${BASE}`, 'theirs-before');
    follow.setFollowing(true);
    local.setItem(`trio_cc_sizes_interviewer_${BASE}`, 'theirs-after');
    follow.setFollowing(false);

    expect(local.getItem(`trio_cc_sizes_interviewer_${BASE}`)).toBe('theirs-after');
  });

  test('the list of terminals is not rewound, only the one in front is announced', async () => {
    const follow = await load();
    const before = JSON.stringify({ tabs: [{ id: 'a', label: 'Terminal 1' }], activeTabId: 'a' });
    local.setItem(`trio_cc_term_tabs_${BASE}`, before);
    follow.setFollowing(true);
    const grown = JSON.stringify({ tabs: [{ id: 'a', label: 'Terminal 1' }, { id: 'b', label: 'Terminal 2' }], activeTabId: 'b' });
    local.setItem(`trio_cc_term_tabs_${BASE}`, grown);
    const seen: boolean[] = [];
    (window as unknown as EventTarget).addEventListener('trio-kv', () => seen.push(follow.isRestoringView()));
    follow.setFollowing(false);

    expect(local.getItem(`trio_cc_term_tabs_${BASE}`)).toBe(grown);
    expect(seen).toContain(true);
    expect(follow.isRestoringView()).toBe(false);
  });
});

describe('currentView', () => {
  test('is what this screen shows, with what the page adds on top, without the other side sizes', async () => {
    const follow = await load();
    local.setItem(`trio_cc_active_file_${BASE}`, 'a.js');
    local.setItem(`trio_cc_sizes_interviewer_${BASE}`, 'theirs');
    local.setItem('trio_cc_unrelated', 'x');
    follow.registerViewSnapshot(() => ({ [`trio_cc_sizes_candidate_${BASE}`]: 'mine' }));

    const view = follow.currentView();
    expect(view[`trio_cc_active_file_${BASE}`]).toBe('a.js');
    expect(view[`trio_cc_sizes_candidate_${BASE}`]).toBe('mine');
    expect(view[`trio_cc_sizes_interviewer_${BASE}`]).toBeUndefined();
    expect(view.trio_cc_unrelated).toBeUndefined();
  });

  test('includes the open tabs of either side', async () => {
    const follow = await load();
    local.setItem('trio_cc_role', 'interviewer');
    local.setItem(`trio_cc_tabs_${BASE}`, '["a.js"]');
    expect(follow.currentView()[`trio_cc_tabs_${BASE}`]).toBe('["a.js"]');
  });
});

describe('layout gestures', () => {
  test('only count while a separator is in use, and end Follow', async () => {
    const follow = await load();
    const gesture = await import('../layoutGesture');
    expect(gesture.isLayoutGesture()).toBe(false);

    follow.setFollowing(true);
    gesture.pulseLayoutGesture();
    expect(gesture.isLayoutGesture()).toBe(true);
    expect(follow.isFollowing()).toBe(false);
  });
});
