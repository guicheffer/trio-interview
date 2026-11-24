'use client';

import { useState, useEffect } from 'react';

interface DatabaseViewerProps {
  filePath: string;
}

interface TableInfo {
  name: string;
  rowCount: number;
}

interface QueryResult {
  columns: string[];
  values: any[][];
}

function ResultView({ result }: { result: QueryResult }) {
  if (result.columns.length === 0) {
    return <div className="p-4 text-sm text-gray-500 dark:text-gray-400">Query executed successfully (no results)</div>;
  }
  return (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700">
              <tr>
                {result.columns.map((col, i) => (
                  <th key={i} className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 border-r border-gray-300 dark:border-gray-700 last:border-r-0 whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.values.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="px-3 py-2 text-gray-800 dark:text-gray-200 border-r border-gray-200 dark:border-gray-700 last:border-r-0 font-mono text-xs">
                      {cell === null ? <span className="text-gray-400 italic">null</span> : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
  );
}

export function DatabaseViewer({ filePath }: DatabaseViewerProps) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  // Load last query from localStorage (scoped to file path)
  const storageKey = `trio_cc_db_query_${filePath}`;
  const [query, setQuery] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      return localStorage.getItem(storageKey) || '';
    } catch {
      return '';
    }
  });

  // Load tables on mount
  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/database/tables?dbPath=${encodeURIComponent(filePath)}`)
      .then(r => {
        if (!r.ok) return r.json().then(e => Promise.reject(e.error || 'Failed to load tables'));
        return r.json();
      })
      .then(({ tables: loadedTables }) => {
        setTables(loadedTables);
        setLoading(false);
      })
      .catch(err => {
        setError(String(err));
        setLoading(false);
      });
  }, [filePath]);

  // Auto-execute saved query when component loads
  useEffect(() => {
    if (!loading && query && !queryResult && tables.length > 0) {
      executeQuery(query);
    }
  }, [loading, query, tables]);

  const executeQuery = async (sql: string) => {
    if (!sql.trim()) return;
    setExecuting(true);
    setQueryError(null);

    try {
      const res = await fetch('/api/database/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbPath: filePath, query: sql }),
      });

      const data = await res.json();

      if (!res.ok) {
        setQueryError(data.error || 'Query failed');
        return;
      }

      setQueryResult({ columns: data.columns, values: data.values });

      // Save query to localStorage
      try {
        localStorage.setItem(storageKey, sql);
      } catch {}
    } catch (err: any) {
      setQueryError(err.message || String(err));
    } finally {
      setExecuting(false);
    }
  };

  const viewTable = (tableName: string) => {
    setSelectedTable(tableName);
    const sql = `SELECT * FROM "${tableName}" LIMIT 100`;
    setQuery(sql);
    executeQuery(sql);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-white dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">Loading database...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-white dark:bg-gray-900">
        <div className="text-red-500 text-sm">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-white dark:bg-gray-900">
      {/* Left sidebar: tables */}
      <div className="w-48 border-r border-gray-200 dark:border-gray-700 flex flex-col flex-shrink-0">
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Tables</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {tables.length === 0 ? (
            <div className="p-3 text-xs text-gray-500">No tables found</div>
          ) : (
            tables.map(table => (
              <button
                key={table.name}
                onClick={() => viewTable(table.name)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-800 ${
                  selectedTable === table.name ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <div className="font-medium truncate">{table.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{table.rowCount} rows</div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: query editor + results */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center gap-2">
          <span className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate">{filePath}</span>
          <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium flex-shrink-0">
            SQLite
          </span>
        </div>

        {/* Query editor */}
        <div className="border-b border-gray-200 dark:border-gray-700 p-3 flex-shrink-0">
          <div className="flex flex-col gap-2">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  executeQuery(query);
                }
              }}
              placeholder="SELECT * FROM table_name LIMIT 100"
              className="w-full px-3 py-2 text-sm font-mono border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Press Cmd/Ctrl+Enter to run
              </span>
              <button
                onClick={() => executeQuery(query)}
                disabled={!query.trim() || executing}
                className="px-4 py-2 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {executing ? 'Running...' : 'Run Query'}
              </button>
            </div>
          </div>
          {queryError && (
            <div className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded">
              {queryError}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto">
          {queryResult ? (
            <ResultView result={queryResult} />
          ) : (
            <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
              Select a table from the left or enter a SQL query above
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
