'use client';

import { activateOnKey } from '../lib/a11y';
import { DEFAULT_MODEL } from '../../shared/models';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAction } from '../lib/actions';
import { ChatThread } from '../hooks/useMultiChat';
import { ClaudeModel } from '../hooks/useClaudeStream';
import { MODELS } from '../../shared/models';

interface ChatTabsProps {
  threads: ChatThread[];
  closedThreads?: ChatThread[];
  unreadThreadIds?: Set<string>;
  activeThreadId: string;
  onSelect: (id: string) => void;
  onCreate: (model: ClaudeModel) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onModelChange: (id: string, model: ClaudeModel) => void;
  onReorder?: (fromId: string, toId: string) => void;
  onRestore?: (id: string) => void;
}

const MODEL_LABELS = Object.fromEntries(MODELS.map(m => [m.key, m.badge])) as Record<ClaudeModel, string>;
const MODEL_COLORS = Object.fromEntries(MODELS.map(m => [m.key, m.color])) as Record<ClaudeModel, string>;

export function ChatTabs({
  threads,
  closedThreads = [],
  unreadThreadIds = new Set(),
  activeThreadId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onReorder,
  onRestore,
}: ChatTabsProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [closedMenuPos, setClosedMenuPos] = useState<{ top: number; right: number } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const closedBtnRef = useRef<HTMLButtonElement>(null);
  const closedMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (!showClosed) return;
    const close = (e: MouseEvent) => {
      if (closedMenuRef.current?.contains(e.target as Node)) return;
      if (closedBtnRef.current?.contains(e.target as Node)) return;
      setShowClosed(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showClosed]);

  const commitRename = useCallback(() => {
    if (renamingId) { onRename(renamingId, renameValue); setRenamingId(null); }
  }, [renamingId, renameValue, onRename]);

  const startRename = useCallback((thread: ChatThread, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setRenamingId(thread.id);
    setRenameValue(thread.title);
  }, []);

  useAction('chat:rename', () => {
    const t = threads.find(x => x.id === activeThreadId);
    if (t) startRename(t);
  });

  const handleClosedToggle = () => {
    if (!showClosed && closedBtnRef.current) {
      const rect = closedBtnRef.current.getBoundingClientRect();
      setClosedMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setShowClosed(o => !o);
  };

  return (
    <div className="flex items-center gap-0.5 px-2 pt-1.5 pb-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0 min-h-[34px]" style={{ overflowX: 'auto', overflowY: 'visible' }}>
      {threads.map(thread => {
        const isActive = thread.id === activeThreadId;
        const isRenaming = renamingId === thread.id;
        const hasUnread = !isActive && unreadThreadIds.has(thread.id);

        return (
          <div
            key={thread.id}
            role="tab"
            tabIndex={0}
            aria-selected={isActive}
            onClick={() => onSelect(thread.id)}
            onKeyDown={activateOnKey(() => onSelect(thread.id))}
            draggable={!isRenaming && !!onReorder}
            onDragStart={(e) => {
              setDraggedId(thread.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              if (draggedId && draggedId !== thread.id) {
                e.preventDefault();
                setDragOverId(thread.id);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (draggedId && draggedId !== thread.id) {
                onReorder?.(draggedId, thread.id);
              }
              setDraggedId(null);
              setDragOverId(null);
            }}
            onDragEnd={() => {
              setDraggedId(null);
              setDragOverId(null);
            }}
            className={`${draggedId === thread.id ? 'opacity-50 ' : ''}${dragOverId === thread.id ? 'border-l-2 border-l-blue-500 ' : ''}group relative flex items-center gap-1 px-2 py-1 rounded-t text-xs cursor-pointer select-none flex-shrink-0 transition-colors ${
              isActive
                ? 'bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100'
                : 'text-gray-500 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-gray-700/60 border border-transparent'
            }`}
            style={{ maxWidth: '140px' }}
          >
            {/* Unread dot, outside the span so it's not clipped */}
            {hasUnread && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-gray-50 dark:border-gray-800 animate-pulse z-10" title="New reply" />
            )}
            <span className={`flex-shrink-0 w-3.5 h-3.5 rounded-sm text-[9px] font-bold text-white flex items-center justify-center ${MODEL_COLORS[thread.model]}`}>
              {MODEL_LABELS[thread.model]}
            </span>
            {isRenaming ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                  if (e.key === 'Escape') { setRenamingId(null); }
                  e.stopPropagation();
                }}
                onClick={e => e.stopPropagation()}
                className="w-20 bg-transparent border-none outline-none text-xs font-medium text-gray-900 dark:text-gray-100"
              />
            ) : (
              <span className="truncate font-medium" style={{ maxWidth: '80px' }} onDoubleClick={e => startRename(thread, e)} title={`${thread.title}, double-click to rename`}>
                {thread.title}
              </span>
            )}
            {!isRenaming && (
              <div className={`flex items-center gap-0.5 ml-0.5 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                <button onClick={e => startRename(thread, e)} title="Rename" className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600">
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
                <button onClick={e => { e.stopPropagation(); onDelete(thread.id); }} title="Close chat" className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500">
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* New chat, appends to the right of existing tabs */}
      <button onClick={() => onCreate(DEFAULT_MODEL)} title="New chat" className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-t text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-gray-700/60 transition-colors border border-transparent">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
      </button>

      {/* Closed chats button, portal for dropdown to escape overflow */}
      {closedThreads.length > 0 && onRestore && (
        <div className="flex-shrink-0 ml-auto">
          <button
            ref={closedBtnRef}
            onClick={handleClosedToggle}
            title="Closed chats"
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            {closedThreads.length}
          </button>
        </div>
      )}

      {/* Portal dropdown, not clipped by overflow-x-auto */}
      {showClosed && closedMenuPos && closedThreads.length > 0 && onRestore && typeof document !== 'undefined' && createPortal(
        <div
          ref={closedMenuRef}
          className="w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
          style={{ position: 'fixed', top: closedMenuPos.top, right: closedMenuPos.right, zIndex: 99999 }}
        >
          <div className="px-3 py-2 text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
            Closed chats
          </div>
          {closedThreads.map(t => (
            <button
              key={t.id}
              onClick={() => { onRestore(t.id); setShowClosed(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <span className={`flex-shrink-0 w-3.5 h-3.5 rounded-sm text-[9px] font-bold text-white flex items-center justify-center ${MODEL_COLORS[t.model]}`}>
                {MODEL_LABELS[t.model]}
              </span>
              <span className="truncate">{t.title}</span>
              <span className="ml-auto flex-shrink-0">
                <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
              </span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
