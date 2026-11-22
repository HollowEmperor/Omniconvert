import { useMemo, useState } from 'react';
import { Download, Search, Trash2 } from 'lucide-react';
import { formatBytes, formatSizeDelta } from '../lib/formats';
import { HistoryEntry } from '../types/converter';

interface HistoryViewProps {
  entries: HistoryEntry[];
  onClearHistory: () => void;
  onGoToConverter: () => void;
}

export function HistoryView({
  entries,
  onClearHistory,
  onGoToConverter,
}: HistoryViewProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.inputName.toLowerCase().includes(q) ||
        e.result.outputFilename.toLowerCase().includes(q) ||
        e.result.sourceExt.includes(q) ||
        e.result.targetExt.includes(q)
    );
  }, [entries, search]);

  return (
    <section aria-label="Conversion history" className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            Session History
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Completed conversions from this session remain downloadable for 30 minutes.
          </p>
        </div>

        {entries.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="relative w-56">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <label htmlFor="history-search" className="sr-only">
                Search conversion history
              </label>
              <input
                id="history-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search files..."
                className="w-full h-9 pl-9 pr-3 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <button
              type="button"
              onClick={onClearHistory}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              Clear History
            </button>
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <p className="text-sm font-medium text-slate-900">No completed conversions yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Files you convert will appear here with size comparisons and direct download links.
          </p>
          <button
            type="button"
            onClick={onGoToConverter}
            className="mt-5 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 whitespace-nowrap"
          >
            Open Converter
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4">Output File</th>
                <th className="py-2.5 px-4">Route</th>
                <th className="py-2.5 px-4 text-right">Input</th>
                <th className="py-2.5 px-4 text-right">Output</th>
                <th className="py-2.5 px-4 text-right">Delta</th>
                <th className="py-2.5 px-4 text-right">Time</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filtered.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-medium text-slate-900 max-w-xs truncate">
                    {entry.result.outputFilename}
                    <div className="text-xs font-normal text-slate-500 truncate">
                      From {entry.inputName}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                    {entry.result.sourceExt.toUpperCase()} → {entry.result.targetExt.toUpperCase()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
                    {formatBytes(entry.inputSize)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-900 whitespace-nowrap">
                    {formatBytes(entry.result.outputSize)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
                    {formatSizeDelta(entry.inputSize, entry.result.outputSize)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-500 whitespace-nowrap">
                    {(entry.result.durationMs / 1000).toFixed(2)}s
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <a
                      href={entry.result.downloadUrl}
                      download={entry.result.outputFilename}
                      aria-label={`Download ${entry.result.outputFilename}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
