import { useMemo, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import {
  CATEGORY_LABELS,
  ECOSYSTEM_LABELS,
  FORMAT_SPECS,
  FormatEcosystem,
  MediaCategory,
  getTargetFormatsForSource,
} from '../lib/formats';
import { RoutePreset } from '../types/converter';

interface FormatMatrixViewProps {
  onSelectRoute: (preset: RoutePreset) => void;
}

type MatrixFilter = 'all' | MediaCategory | FormatEcosystem;

const FILTERS: Array<{ id: MatrixFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'adobe', label: 'Adobe' },
  { id: 'autodesk', label: 'Autodesk' },
  { id: 'rhino', label: 'Rhino 3D' },
  { id: '3d', label: '3D Model' },
  { id: 'pdf', label: 'PDF' },
  { id: 'image', label: 'Image' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'document', label: 'Document' },
  { id: 'data', label: 'Data' },
];

export function FormatMatrixView({ onSelectRoute }: FormatMatrixViewProps) {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<MatrixFilter>('all');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FORMAT_SPECS.filter((src) => src.canBeInput)
      .filter((src) => {
        if (activeFilter === 'all') return true;
        if (activeFilter === 'adobe' || activeFilter === 'autodesk' || activeFilter === 'rhino') {
          return src.ecosystem === activeFilter;
        }
        return src.category === activeFilter;
      })
      .map((src) => {
        const targets = getTargetFormatsForSource(src.ext);
        const ecoLabel = src.ecosystem ? ECOSYSTEM_LABELS[src.ecosystem].toLowerCase() : '';
        const filteredTargets = q
          ? targets.filter(
              (t) =>
                t.ext.includes(q) ||
                t.label.toLowerCase().includes(q) ||
                t.description.toLowerCase().includes(q) ||
                (t.ecosystem && ECOSYSTEM_LABELS[t.ecosystem].toLowerCase().includes(q)) ||
                src.ext.includes(q) ||
                src.label.toLowerCase().includes(q) ||
                src.description.toLowerCase().includes(q) ||
                ecoLabel.includes(q)
            )
          : targets;
        return { source: src, targets: filteredTargets };
      })
      .filter((entry) => entry.targets.length > 0);
  }, [query, activeFilter]);

  const totalRoutes = useMemo(
    () => rows.reduce((sum, r) => sum + r.targets.length, 0),
    [rows]
  );

  return (
    <section aria-label="Universal format conversion matrix" className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            Universal Format Matrix
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Select any conversion pair below — including Adobe, Autodesk CAD, and Rhino 3D formats — to configure the converter.
          </p>
        </div>
        <p className="font-mono text-xs tabular-nums text-slate-500">
          {rows.length} input formats · {totalRoutes} conversion routes
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md w-fit">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveFilter(f.id)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                activeFilter === f.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full xl:w-72">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <label htmlFor="matrix-search" className="sr-only">
            Search formats
          </label>
          <input
            id="matrix-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search formats (psd, dxf, 3dm, eps)..."
            className="w-full h-9 pl-9 pr-3 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Structured directory table */}
      {rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
          <p className="text-sm font-medium text-slate-900">No matching format routes</p>
          <p className="mt-1 text-xs text-slate-500">
            Clear your search filter to view all supported conversions.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setActiveFilter('all');
            }}
            className="mt-4 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-200">
          {rows.map(({ source, targets }) => (
            <div
              key={source.ext}
              className="p-4 flex flex-col lg:flex-row lg:items-center gap-4"
            >
              <div className="lg:w-64 shrink-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-900">
                    {source.label}
                  </span>
                  <span className="text-xs text-slate-500">
                    {source.ecosystem
                      ? `${ECOSYSTEM_LABELS[source.ecosystem]} · ${CATEGORY_LABELS[source.category]}`
                      : CATEGORY_LABELS[source.category]}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{source.description}</p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 flex-1">
                {targets.map((target) => (
                  <button
                    key={`${source.ext}-${target.ext}`}
                    type="button"
                    onClick={() =>
                      onSelectRoute({ sourceExt: source.ext, targetExt: target.ext })
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded hover:border-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
                  >
                    <ArrowRight className="w-3 h-3 text-slate-400" aria-hidden="true" />
                    {target.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
