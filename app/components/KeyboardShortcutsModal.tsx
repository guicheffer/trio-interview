'use client';

import { useEffect, useState } from 'react';

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

export function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const [terminal, setTerminal] = useState<{ groups: Array<{ name: string; commands: string[] }>; notes: string[] } | null>(null);
  useEffect(() => {
    fetch('/api/terminal/commands').then(r => r.json()).then(setTerminal).catch(() => {});
  }, []);

  const chatCommands = [
    ['/compact', 'Summarize the conversation to free up context'],
    ['/undo', 'Revert the files the AI changed in its last answer'],
    ['/clear', 'Clear this chat'],
    ['/new', 'Open a new chat'],
    ['/plan', 'Plan first, with the planning model'],
    ['/instant', 'Act immediately'],
    ['/model <name>', 'Switch model'],
    ['/stop', 'Stop the current answer'],
  ];

  const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
  const modKey = isMac ? '⌘' : 'Ctrl';

  const shortcuts = [
    {
      category: 'Platform',
      items: [
        { keys: [modKey, 'Enter'], description: 'Run App / Execute command' },
        { keys: ['Ctrl', 'R'], description: 'Reload the preview' },
        { keys: ['Shift', 'Esc'], description: 'Focus terminal input' },
        { keys: ['?'], description: 'Show/hide keyboard shortcuts' },
        { keys: ['Alt', 'W'], description: 'Close the file, terminal or chat in focus (Ctrl or Cmd+W where the browser allows it)' },
      ],
    },
    {
      category: 'Editor',
      items: [
        { keys: [modKey, 'S'], description: 'Save file' },
        { keys: [modKey, '/'], description: 'Toggle comment' },
        { keys: [modKey, 'Z'], description: 'Undo' },
        { keys: [modKey, 'Shift', 'Z'], description: 'Redo' },
        { keys: [modKey, 'F'], description: 'Find' },
        { keys: [modKey, 'D'], description: 'Select next occurrence' },
        { keys: ['Alt', '↑/↓'], description: 'Move line up/down' },
        { keys: ['Shift', 'Alt', '↑/↓'], description: 'Copy line up/down' },
        { keys: [modKey, 'X'], description: 'Cut line (empty selection)' },
        { keys: [modKey, 'L'], description: 'Select line' },
      ],
    },
    {
      category: 'Navigation',
      items: [
        { keys: [modKey, 'K'], description: 'Command palette: every action, by name' },
        { keys: [modKey, 'Shift', 'P'], description: 'Command palette (same as above)' },
        { keys: [modKey, 'P'], description: 'Go to file' },
        { keys: [modKey, 'B'], description: 'Toggle sidebar' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Shortcuts and commands</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-50 border border-gray-300 border-b-2 dark:border-gray-400 rounded">?</kbd> or{' '}
              <kbd className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-50 border border-gray-300 border-b-2 dark:border-gray-400 rounded">Esc</kbd> to close
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {shortcuts.map((section) => (
            <div key={section.category}>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                {section.category}
              </h3>
              <div className="space-y-2">
                {section.items.map((shortcut, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIdx) => (
                        <kbd
                          key={keyIdx}
                          className="px-2 py-1 text-xs font-mono bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-50 border border-gray-300 border-b-2 dark:border-gray-400 rounded shadow-sm min-w-[28px] text-center"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">Terminal commands</h3>
            {terminal ? (
              <div className="space-y-3 px-3">
                {terminal.groups.map(g => (
                  <div key={g.name}>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{g.name}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.commands.map(c => (
                        <code key={c} className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-50 border border-gray-300 border-b-2 dark:border-gray-400 rounded">{c}</code>
                      ))}
                    </div>
                  </div>
                ))}
                <ul className="list-disc pl-4 text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                  {terminal.notes.map(n => <li key={n}>{n}</li>)}
                </ul>
              </div>
            ) : (
              <p className="px-3 text-xs text-gray-500">Loading...</p>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">AI chat commands</h3>
            <p className="px-3 mb-2 text-xs text-gray-500 dark:text-gray-400">Type <code className="font-mono">/</code> in the chat box to see them with autocomplete.</p>
            <div className="space-y-1">
              {chatCommands.map(([cmd, desc]) => (
                <div key={cmd} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{desc}</span>
                  <kbd className="px-2 py-1 text-xs font-mono bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-50 border border-gray-300 border-b-2 dark:border-gray-400 rounded">{cmd}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 px-6 py-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Most standard editor shortcuts work in the code editor
          </p>
        </div>
      </div>
    </div>
  );
}
