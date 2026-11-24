'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface CsvViewerProps {
  filePath: string;
}

function parseCsv(content: string): string[][] {
  return content.trim().split('\n').map((line: string) => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  });
}

function serializeCsv(data: string[][]): string {
  return data.map(row =>
    row.map(cell => {
      const needsQuotes = cell.includes(',') || cell.includes('"') || cell.includes('\n');
      return needsQuotes ? `"${cell.replace(/"/g, '""')}"` : cell;
    }).join(',')
  ).join('\n');
}

export function CsvViewer({ filePath }: CsvViewerProps) {
  const [data, setData] = useState<string[][] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/files/${encodeURIComponent(filePath)}`)
      .then(r => {
        if (!r.ok) {
          return Promise.reject('Failed to load CSV');
        }
        return r.json();
      })
      .then(({ content }) => { setData(parseCsv(content)); setDirty(false); })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false));
  }, [filePath]);

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  const startEdit = useCallback((rowIdx: number, colIdx: number, currentValue: string) => {
    setEditingCell({ row: rowIdx, col: colIdx });
    setEditValue(currentValue.replace(/^"(.*)"$/, '$1'));
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingCell || !data) return;
    const newData = data.map((row, r) =>
      r === editingCell.row
        ? row.map((cell, c) => c === editingCell.col ? editValue : cell)
        : row
    );
    setData(newData);
    setEditingCell(null);
    setDirty(true);
    setSaving(true);
    // Auto-save
    fetch(`/api/files/${encodeURIComponent(filePath)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: serializeCsv(newData) }),
    })
      .then(() => setDirty(false))
      .catch(() => {})
      .finally(() => setSaving(false));
  }, [editingCell, editValue, data, filePath]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full bg-white dark:bg-gray-900">
      <div className="text-gray-500 dark:text-gray-400">Loading CSV...</div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-full bg-white dark:bg-gray-900">
      <div className="text-red-500 text-sm">Error: {error}</div>
    </div>
  );

  if (!data || data.length === 0) return (
    <div className="flex items-center justify-center h-full bg-white dark:bg-gray-900">
      <div className="text-gray-500 text-sm">Empty CSV file</div>
    </div>
  );

  const headers = data[0];
  const rows = data.slice(1);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center gap-2">
        <span className="text-sm font-mono text-gray-700 dark:text-gray-300">{filePath}</span>
        <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-medium">
          CSV ({rows.length} rows)
        </span>
        {saving && <span className="text-xs text-gray-400 ml-auto">Saving…</span>}
        {!saving && dirty && <span className="text-xs text-orange-500 ml-auto">Unsaved</span>}
        {!saving && !dirty && data && <span className="text-xs text-gray-400 ml-auto">Double-click cell to edit</span>}
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700">
            <tr>
              {headers.map((header, i) => (
                <th key={i} className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 border-r border-gray-300 dark:border-gray-700 last:border-r-0">
                  {header.replace(/^"(.*)"$/, '$1')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                {row.map((cell, cellIdx) => {
                  const isEditing = editingCell?.row === rowIdx + 1 && editingCell?.col === cellIdx;
                  const displayValue = cell.replace(/^"(.*)"$/, '$1');
                  return (
                    <td
                      key={cellIdx}
                      onDoubleClick={() => startEdit(rowIdx + 1, cellIdx, cell)}
                      className="px-0 py-0 border-r border-gray-200 dark:border-gray-700 last:border-r-0 font-mono text-xs cursor-text"
                    >
                      {isEditing ? (
                        <input
                          ref={editInputRef}
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                            if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                            e.stopPropagation();
                          }}
                          className="w-full px-3 py-2 bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-400 dark:border-blue-500 outline-none text-gray-900 dark:text-gray-100 font-mono text-xs"
                        />
                      ) : (
                        <div className="px-3 py-2 text-gray-800 dark:text-gray-200 min-h-[32px]">
                          {displayValue}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
