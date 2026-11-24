'use client';

import { useEffect, useRef, useState } from 'react';
import { backdropProps } from '../lib/a11y';
import { helpSteps, type HelpRole } from '../lib/helpContent';

interface HelpModalProps {
  role: HelpRole;
  /** First visit of a candidate: fade in, and on close shrink into the menu button so they know where to find it again */
  animated?: boolean;
  onClose: () => void;
}

const SHRINK_MS = 500;

export function HelpModal({ role, animated = false, onClose }: HelpModalProps) {
  const steps = helpSteps(role);
  const [index, setIndex] = useState(0);
  const [entered, setEntered] = useState(!animated);
  const [shrink, setShrink] = useState<{ dx: number; dy: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => {
    if (!animated) return;
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [animated]);

  const close = () => {
    const target = document.querySelector('[data-help-target]');
    const panel = panelRef.current;
    if (!animated || !target || !panel || shrink) {
      onClose();
      return;
    }
    const to = target.getBoundingClientRect();
    const from = panel.getBoundingClientRect();
    setShrink({ dx: to.left + to.width / 2 - (from.left + from.width / 2), dy: to.top + to.height / 2 - (from.top + from.height / 2) });
    setTimeout(onClose, SHRINK_MS);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight' && !last) setIndex(index + 1);
    if (e.key === 'ArrowLeft' && index > 0) setIndex(index - 1);
  };

  const panelStyle: React.CSSProperties = shrink
    ? { transform: `translate(${shrink.dx}px, ${shrink.dy}px) scale(0.05)`, opacity: 0, transition: `all ${SHRINK_MS}ms cubic-bezier(0.5, 0, 0.75, 0)` }
    : { opacity: entered ? 1 : 0, transform: entered ? 'none' : 'translateY(8px)', transition: animated ? 'all 300ms ease-out' : undefined };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      style={{ opacity: shrink ? 0 : 1, transition: animated ? `opacity ${SHRINK_MS}ms` : undefined }}
      {...backdropProps(close)}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Help"
        style={panelStyle}
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{step.title}</h2>
          <span className="text-xs text-gray-400">{index + 1} of {steps.length}</span>
        </div>

        <div className="space-y-3 px-6 py-5 text-sm text-gray-700 dark:text-gray-300">
          {step.body.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          {step.links && (
            <ul className="space-y-1 pt-1">
              {step.links.map(link => (
                <li key={link.href}>
                  <a href={link.href} target="_blank" rel="noreferrer" className="text-blue-600 underline dark:text-blue-400">{link.label}</a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3 dark:border-gray-700">
          <div className="flex gap-1.5" aria-hidden="true">
            {steps.map((s, i) => (
              <span key={s.title} className={`h-1.5 w-1.5 rounded-full ${i === index ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {index > 0 && (
              <button onClick={() => setIndex(index - 1)} className="rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">Back</button>
            )}
            <button
              autoFocus
              onClick={last ? close : () => setIndex(index + 1)}
              className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-700"
            >
              {last ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
