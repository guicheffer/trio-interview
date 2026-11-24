'use client';

import { activateOnKey } from '../lib/a11y';
import { isLockedPath } from '../../shared/locks';
import { useState } from 'react';
import { REDACTED, useHiddenFiles } from '../lib/hiddenFiles';

// Extension → color for tab dot indicator
const EXT_COLORS: Record<string, string> = {
  ts: 'bg-blue-500', tsx: 'bg-blue-400',
  js: 'bg-yellow-500', jsx: 'bg-yellow-400',
  py: 'bg-green-500',
  json: 'bg-orange-400',
  md: 'bg-teal-500',
  css: 'bg-pink-500', scss: 'bg-pink-400',
  html: 'bg-red-400',
  sh: 'bg-gray-400',
};

function getExtColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_COLORS[ext] ?? 'bg-gray-400';
}

interface FileTabBarProps {
  tabs: string[];
  selectedTab: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onReorder?: (newOrder: string[]) => void;
  lockedFiles?: Set<string>;
}

export function FileTabBar({ tabs, selectedTab, onSelect, onClose, onReorder, lockedFiles }: FileTabBarProps) {
  const hiddenFiles = useHiddenFiles();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  if (tabs.length === 0) return null;

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      const newTabs = [...tabs];
      const [removed] = newTabs.splice(draggedIndex, 1);
      newTabs.splice(dragOverIndex, 0, removed);
      onReorder?.(newTabs);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="flex items-stretch bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-none flex-shrink-0" style={{ minHeight: '34px' }}>
      {tabs.map((tab, index) => {
        const isPreview = tab === '__preview__';
        const redacted = !isPreview && hiddenFiles.has(tab);
        const name = isPreview ? 'Preview' : redacted ? REDACTED : (tab.split('/').pop() ?? tab);
        const isActive = selectedTab === tab;
        const isLocked = !isPreview && !!lockedFiles && isLockedPath(tab, lockedFiles);
        const isDragging = draggedIndex === index;
        const isDropTarget = dragOverIndex === index;

        return (
          <div
            key={tab}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={`group flex items-center gap-1.5 pl-3 pr-1.5 py-1 border-r border-gray-200 dark:border-gray-700 text-xs cursor-pointer select-none flex-shrink-0 transition-colors ${
              isActive
                ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 border-b border-white dark:border-gray-900'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300'
            } ${isDragging ? 'opacity-50' : ''} ${isDropTarget ? 'border-l-2 border-l-blue-500' : ''}`}
            role="tab"
            tabIndex={0}
            aria-selected={isActive}
            onClick={() => onSelect(tab)}
            onKeyDown={activateOnKey(() => onSelect(tab))}
          >
            {/* Color dot (skip for preview tab) */}
            {!isPreview && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getExtColor(name)}`} />}

            <span className={`font-mono max-w-[140px] truncate ${redacted ? 'italic opacity-70' : ''}`} aria-label={redacted ? 'Hidden file' : undefined}>{name}</span>

            {/* Lock icon for read-only */}
            {isLocked && (
              <svg className="w-2.5 h-2.5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            )}

            {/* Close button */}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(tab); }}
              className={`flex-shrink-0 w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${
                isActive
                  ? 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                  : 'hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-400'
              }`}
              title="Close tab"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
