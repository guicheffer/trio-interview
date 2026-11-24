'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { tabSessionId } from '../lib/tabSession';
import { loadKept, saveKept } from '../lib/reviewStore';
import { diffHunks, revertHunk, type DiffHunk } from '../../shared/line-diff';
import { type AiChange } from '../hooks/useAiChanges';

interface Props {
  /** What the AI changed (from either screen) */
  changes: AiChange[];
  filePath: string | null;
  /** The editor, once it is ready */
  handleRef: React.MutableRefObject<{ editor: any; monaco: any } | null>;
}

const TOAST_MS = 6000;

const signature = (hunk: DiffHunk) => `${hunk.removed.join('\n')}\u0000${hunk.added.join('\n')}`;

function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const el = document.createElement('button');
  el.textContent = label;
  el.style.cssText = `margin-left:6px;padding:0 8px;border-radius:4px;font:600 11px system-ui;cursor:pointer;border:1px solid ${primary ? '#16a34a' : '#9ca3af'};background:${primary ? '#16a34a' : 'transparent'};color:${primary ? '#fff' : 'inherit'}`;
  // The editor takes the mouse for itself on press (and keeps it until release), so the click would never reach the button
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    el.addEventListener(type, e => { e.stopPropagation(); if (type === 'mousedown') e.preventDefault(); });
  }
  el.addEventListener('click', onClick);
  return el;
}

/** The zone above a hunk: what the AI removed (red) and the buttons to keep or undo that change */
function hunkZone(hunk: DiffHunk, lineHeight: number, onKeep: () => void, onUndo: () => void): HTMLElement {
  const root = document.createElement('div');
  root.style.cssText = 'pointer-events:auto;width:100%;font-family:var(--font-geist-mono, monospace);font-size:12px';
  const header = document.createElement('div');
  header.style.cssText = `height:${lineHeight}px;display:flex;align-items:center;justify-content:flex-end;padding-right:24px;color:#a16207;background:rgba(245,158,11,0.12);font:600 11px system-ui`;
  const label = document.createElement('span');
  label.textContent = 'AI change';
  header.append(label, button('Keep', onKeep, true), button('Undo', onUndo));
  root.append(header);
  for (const line of hunk.removed) {
    const row = document.createElement('div');
    row.textContent = `- ${line}`;
    row.style.cssText = `height:${lineHeight}px;line-height:${lineHeight}px;white-space:pre;overflow:hidden;padding-left:64px;background:rgba(239,68,68,0.16);color:#b91c1c`;
    root.append(row);
  }
  return root;
}

/**
 * After the AI changes the open file, its changes are drawn in the editor itself: added lines in green, removed
 * lines in red above them, and Keep or Undo on every change. Undo is a normal edit, so it saves and syncs like typing.
 */
export function AiChangesBar({ changes, filePath, handleRef }: Props) {
  // A file the AI created has nothing to go back to, the undo command handles that
  const before = (filePath ? changes.find(c => c.file === filePath)?.before : null) ?? null;
  const [hunks, setHunks] = useState<DiffHunk[]>([]);
  const [kept, setKept] = useState<Set<string>>(new Set());
  // A choice can be taken back for a few seconds (Ctrl or Cmd+Z also undoes an undo in the editor)
  const [toast, setToast] = useState<{ id: number; label: string; restore: () => void; expiresAt: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offer = useCallback((label: string, restore: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), label, restore, expiresAt: Date.now() + TOAST_MS });
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  // A hidden tab runs its timers late, so a toast whose time is over is dropped when the page comes back
  useEffect(() => {
    const dropExpired = () => setToast(t => (t && Date.now() >= t.expiresAt ? null : t));
    window.addEventListener('focus', dropExpired);
    document.addEventListener('visibilitychange', dropExpired);
    return () => { window.removeEventListener('focus', dropExpired); document.removeEventListener('visibilitychange', dropExpired); };
  }, []);
  const takeBack = () => {
    toast?.restore();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  };
  // The editor is built again when its tab is closed and opened, so follow whichever one is on screen
  const [editor, setEditor] = useState<any>(null);
  useEffect(() => {
    const timer = setInterval(() => {
      const current = handleRef.current?.editor ?? null;
      setEditor((previous: any) => (previous === current ? previous : current));
    }, 300);
    return () => clearInterval(timer);
  }, [handleRef]);

  // Keep choices belong to one version of the file's "before" text: a new answer starts clean, coming back to the file
  // (or reloading) finds the choices again
  useEffect(() => { setKept(filePath && before !== null ? loadKept(filePath, before) : new Set()); setToast(null); }, [filePath, before]);
  const keptRef = useRef(kept);
  keptRef.current = kept;
  const commitKept = useCallback((next: Set<string>) => {
    keptRef.current = next;
    setKept(next);
    if (filePath && before !== null) saveKept(filePath, before, next);
  }, [filePath, before]);

  // Follow the editor's text, so changes keep lining up while the person types
  useEffect(() => {
    if (before === null || !editor) { setHunks([]); return; }
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const recompute = () => { try { setHunks(diffHunks(before, editor.getValue()) ?? []); } catch {} };
    recompute();
    const subscriptions = [
      editor.onDidChangeModelContent(() => { clearTimeout(debounce); debounce = setTimeout(recompute, 250); }),
      editor.onDidChangeModel(recompute),
    ];
    return () => { clearTimeout(debounce); subscriptions.forEach(sub => { try { sub.dispose(); } catch {} }); };
  }, [before, editor]);

  // Undoing is told to the AI with the next message, quietly; keeping needs no word
  const tell = useCallback((action: 'part' | 'all' | 'redo') => {
    if (!filePath) return;
    fetch('/api/chat/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: tabSessionId(), file: filePath, action }),
    }).catch(() => {});
  }, [filePath]);

  const replaceAll = useCallback((text: string) => {
    const handle = handleRef.current;
    const model = handle?.editor.getModel();
    if (!handle || !model) return;
    handle.editor.executeEdits('ai-review', [{ range: model.getFullModelRange(), text }]);
  }, [handleRef]);

  const undo = useCallback((hunk: DiffHunk) => {
    const handle = handleRef.current;
    if (!handle || before === null) return;
    const fresh = diffHunks(before, handle.editor.getValue());
    const index = fresh?.findIndex(h => signature(h) === signature(hunk)) ?? -1;
    if (index < 0) return;
    const current = handle.editor.getValue();
    const next = revertHunk(before, current, index);
    if (next !== null) {
      replaceAll(next);
      tell('part');
      offer('Change undone', () => { replaceAll(current); tell('redo'); });
    }
  }, [before, handleRef, replaceAll, tell, offer]);

  const keepHunk = useCallback((hunk: DiffHunk) => {
    const key = signature(hunk);
    commitKept(new Set(keptRef.current).add(key));
    offer('Change kept', () => { const next = new Set(keptRef.current); next.delete(key); commitKept(next); });
  }, [offer, commitKept]);

  const visible = hunks.filter(h => !kept.has(signature(h)));

  // Draw the changes inside the editor
  useEffect(() => {
    const monaco = handleRef.current?.monaco;
    if (!editor || !monaco || visible.length === 0) return;
    const lineHeight: number = editor.getOption(monaco.editor.EditorOption.lineHeight);
    const decorations = editor.createDecorationsCollection(visible
      .filter(h => h.added.length > 0)
      .map(h => ({
        range: new monaco.Range(h.line + 1, 1, h.line + h.added.length, 1),
        options: { isWholeLine: true, className: 'trio-ai-added', linesDecorationsClassName: 'trio-ai-added-gutter' },
      })));
    const zones: string[] = [];
    editor.changeViewZones((accessor: any) => {
      for (const hunk of visible) {
        const domNode = hunkZone(hunk, lineHeight, () => keepHunk(hunk), () => undo(hunk));
        // suppressMouseDown: otherwise the editor takes the mouse for itself and the buttons never see the click
        zones.push(accessor.addZone({ afterLineNumber: hunk.line, heightInPx: lineHeight * (1 + hunk.removed.length), domNode, suppressMouseDown: true }));
      }
    });
    // The text is drawn over the zones by default; lift the zones so their buttons can be pressed, and let everything
    // else in that layer pass the mouse through to the text
    const layer: HTMLElement | null = editor.getDomNode()?.querySelector('.view-zones') ?? null;
    if (layer) { layer.style.zIndex = '3'; layer.style.pointerEvents = 'none'; }
    return () => {
      try {
        decorations.clear();
        editor.changeViewZones((accessor: any) => zones.forEach(id => accessor.removeZone(id)));
      } catch {}
    };
  }, [visible.map(signature).join('\u0001') + '|' + visible.map(h => h.line).join(','), editor, handleRef, undo, keepHunk]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!filePath || before === null) return null;
  if (visible.length === 0 && !toast) return null;

  const added = visible.reduce((n, h) => n + h.added.length, 0);
  const removed = visible.reduce((n, h) => n + h.removed.length, 0);

  const keepAll = () => {
    const previous = keptRef.current;
    commitKept(new Set(hunks.map(signature)));
    offer('All changes kept', () => commitKept(previous));
  };
  const undoAll = () => {
    const handle = handleRef.current;
    if (!handle || before === null) return;
    const current = handle.editor.getValue();
    replaceAll(before);
    tell('all');
    offer('All changes undone', () => { replaceAll(current); tell('redo'); });
  };

  return (
    <div className="absolute bottom-3 right-4 z-20 flex flex-col items-end gap-2">
      {toast && (
        <div key={toast.id} className="relative overflow-hidden rounded-lg border border-gray-300 bg-white py-1.5 pl-3 pr-2 text-xs text-gray-800 shadow dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" role="status" data-testid="ai-undo-toast">
          <div className="flex items-center gap-3">
            <span>{toast.label}</span>
            <button onClick={takeBack} className="rounded px-2 py-0.5 font-semibold text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-gray-700">Undo</button>
          </div>
          <div className="absolute bottom-0 left-0 h-0.5 bg-green-500" style={{ width: '100%', animation: `trio-toast-timer ${TOAST_MS}ms linear forwards` }} />
        </div>
      )}
      {visible.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 shadow dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100" data-testid="ai-changes-bar">
          <span className="font-semibold">AI changed this file</span>
          <span className="font-mono text-green-700 dark:text-green-400">+{added}</span>
          <span className="font-mono text-red-700 dark:text-red-400">-{removed}</span>
          <button onClick={keepAll} className="rounded bg-green-600 px-2 py-0.5 font-semibold text-white hover:bg-green-700">Keep all</button>
          <button onClick={undoAll} className="rounded border border-amber-400 px-2 py-0.5 font-semibold hover:bg-amber-100 dark:hover:bg-amber-900">Undo all</button>
        </div>
      )}
    </div>
  );
}
