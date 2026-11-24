'use client';

import { backdropProps } from '../lib/a11y';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface CreateFileModalProps {
  type: 'file' | 'folder';
  parentPath?: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export function CreateFileModal({ type, parentPath, onConfirm, onCancel }: CreateFileModalProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onConfirm(parentPath ? `${parentPath}/${trimmed}` : trimmed);
  };

  // Render via Portal so fixed positioning works even inside transformed panel containers
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" {...backdropProps(onCancel)}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-80 border border-gray-200 dark:border-gray-700"
      >
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {type === 'file' ? 'New File' : 'New Folder'}
          {parentPath && <span className="text-gray-400 dark:text-gray-500 font-normal"> in {parentPath}/</span>}
        </h3>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
            if (e.key === 'Escape') onCancel();
          }}
          placeholder={type === 'file' ? 'solution.ts' : 'src'}
          className="w-full px-3 py-2 text-sm font-mono border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-500 mb-4"
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!value.trim()}
            className="px-4 py-1.5 text-sm rounded-lg bg-accent-500 hover:bg-accent-600 text-white font-medium disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
