'use client';

import { useEffect, useRef, useState } from 'react';
import { collab } from '../lib/collab';
import { useShowCursors } from '../lib/cursorPrefs';

interface RemoteCursor {
  id: string;
  label: string;
  role: 'interviewer' | 'candidate';
  x: number;
  y: number;
  seen: number;
}

const IDLE_MS = 6000;

function readName(): string {
  try { return localStorage.getItem('trio_cc_candidate') || ''; } catch { return ''; }
}

export function PresenceCursors() {
  const [cursors, setCursors] = useState<Record<string, RemoteCursor>>({});
  const [, setTick] = useState(0);
  const [show] = useShowCursors();
  const [open, setOpen] = useState(collab.workspaceOpen);
  const lastSent = useRef(0);

  useEffect(() => {
    collab.setName(readName());
    collab.connect();

    const offCursor = collab.on('cursor', (msg) => {
      setCursors(prev => ({ ...prev, [msg.id]: { id: msg.id, label: msg.label, role: msg.role, x: msg.x, y: msg.y, seen: Date.now() } }));
    });
    const offWorkspace = collab.on('workspace', (msg) => {
      setOpen(!!msg.open);
      if (!msg.open) setCursors({});
    });
    const offLeave = collab.on('leave', (msg) => {
      setCursors(prev => {
        const next = { ...prev };
        delete next[msg.id];
        return next;
      });
    });

    const sendPoint = (clientX: number, clientY: number) => {
      const now = performance.now();
      if (now - lastSent.current < 40 || !collab.isOpen() || !collab.workspaceOpen) return;
      lastSent.current = now;
      collab.setName(readName());
      collab.send({ type: 'move', x: clientX / window.innerWidth, y: clientY / window.innerHeight });
    };

    const onMove = (e: MouseEvent) => sendPoint(e.clientX, e.clientY);
    window.addEventListener('mousemove', onMove, { passive: true });

    // Mouse events inside the preview iframe do not bubble to this window, so listen inside it too
    const attached = new WeakSet<Document>();
    const attachToPreview = () => {
      const frame = document.querySelector<HTMLIFrameElement>('#preview-iframe');
      if (!frame) return;
      try {
        const doc = frame.contentDocument;
        if (!doc || attached.has(doc)) return;
        doc.addEventListener('mousemove', (ev: MouseEvent) => {
          const rect = frame.getBoundingClientRect();
          sendPoint(rect.left + ev.clientX, rect.top + ev.clientY);
        }, { passive: true });
        attached.add(doc);
      } catch {}
    };
    const attachTimer = setInterval(attachToPreview, 700);
    const sweep = setInterval(() => setTick(t => t + 1), 1500);

    return () => {
      offCursor();
      offLeave();
      offWorkspace();
      window.removeEventListener('mousemove', onMove);
      clearInterval(attachTimer);
      clearInterval(sweep);
    };
  }, []);

  if (!show || !open) return null;

  const now = Date.now();
  const visible = Object.values(cursors).filter(c => now - c.seen < IDLE_MS);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[200] overflow-hidden">
      {visible.map(c => {
        const color = c.role === 'interviewer' ? '#7c3aed' : '#16a34a';
        return (
          <div
            key={c.id}
            className="absolute transition-[left,top] duration-75 ease-linear"
            style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
          >
            <svg width="18" height="20" viewBox="0 0 18 20" fill={color} stroke="white" strokeWidth="1.2" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))' }}>
              <path d="M1 1 L1 15 L5 11.5 L8 18.5 L10.5 17.5 L7.6 10.6 L13 10.6 Z" />
            </svg>
            <span
              className="ml-3 -mt-1 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold text-white shadow"
              style={{ backgroundColor: color }}
            >
              {c.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
