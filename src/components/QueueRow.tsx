import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  Eye,
  Loader2,
  Play,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import {
  formatBytes,
  formatSizeDelta,
  getTargetFormatsForSource,
  groupFormatsByCategory,
} from '../lib/formats';
import { QueueItem } from '../types/converter';
import { CategoryIcon } from './Sidebar';

interface QueueRowProps {
  item: QueueItem;
  isSelected: boolean;
  onSelect: (id: string, tab: 'settings' | 'preview') => void;
  onTargetChange: (id: string, targetExt: string) => void;
  onConvert: (id: string) => void;
  onRemove: (id: string) => void;
}

export function QueueRow({
  item,
  isSelected,
  onSelect,
  onTargetChange,
  onConvert,
  onRemove,
}: QueueRowProps) {
  const targets = getTargetFormatsForSource(item.sourceFormat.ext);
  const groupedTargets = groupFormatsByCategory(targets);

  const isBusy = item.status === 'converting';
  const isDone = item.status === 'completed' && Boolean(item.result);

  return (
    <div
      data-testid={`queue-row-${item.id}`}
      className={`px-4 py-3.5 transition-colors border-b border-slate-200 last:border-b-0 ${
        isSelected ? 'bg-blue-50/50' : 'bg-white hover:bg-slate-50/70'
      }`}
    >
      {/* Row 1: File identity + status + remove */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="mt-0.5 flex items-center justify-center w-9 h-9 rounded-md bg-slate-100 text-slate-600 shrink-0">
            <CategoryIcon category={item.sourceFormat.category} className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <p className="text-sm font-medium text-slate-900 truncate max-w-full" title={item.file.name}>
                {item.file.name}
              </p>
              {isDone && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 whitespace-nowrap shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Completed
                </span>
              )}
              {isBusy && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 whitespace-nowrap shrink-0 font-mono tabular-nums">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  {typeof item.uploadProgress === 'number' && item.uploadProgress < 100
                    ? `Uploading ${item.uploadProgress}%`
                    : 'Converting'}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
              <span className="font-mono">{item.sourceFormat.label}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{formatBytes(item.file.size)}</span>
              {isDone && item.result && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-slate-700">
                    Output {formatBytes(item.result.outputSize)} (
                    {formatSizeDelta(item.file.size, item.result.outputSize)})
                  </span>
                  {item.result.summaryNote && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{item.result.summaryNote}</span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.file.name} from queue`}
          className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 shrink-0"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {item.status === 'error' && item.error && (
        <p className="mt-2 pl-12 flex items-center gap-1.5 text-xs text-red-600" role="alert">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{item.error}</span>
        </p>
      )}

      {/* Row 2: Target format picker + action buttons */}
      <div className="mt-3 pl-0 sm:pl-12 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-500">
            {item.sourceFormat.label}
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          <label htmlFor={`target-${item.id}`} className="sr-only">
            Output format for {item.file.name}
          </label>
          <select
            id={`target-${item.id}`}
            value={item.targetExt}
            disabled={isBusy}
            onChange={(e) => onTargetChange(item.id, e.target.value)}
            className="h-8 w-28 px-2.5 text-xs font-mono font-medium text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
          >
            {groupedTargets.map((group) => (
              <optgroup key={group.category} label={group.label}>
                {group.formats.map((fmt) => (
                  <option key={fmt.ext} value={fmt.ext}>
                    {fmt.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <button
            type="button"
            onClick={() => onSelect(item.id, 'settings')}
            aria-label={`Configure settings for ${item.file.name}`}
            className={`inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
              isSelected
                ? 'border-blue-600 text-blue-700 bg-blue-50'
                : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            Options
          </button>
        </div>

        <div className="flex items-center gap-2">
          {(item.status === 'ready' || item.status === 'error') && (
            <button
              type="button"
              onClick={() => onConvert(item.id)}
              aria-label={`Convert ${item.file.name}`}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              {item.status === 'error' ? 'Retry' : 'Convert'}
            </button>
          )}

          {isDone && item.result && (
            <>
              <button
                type="button"
                onClick={() => onSelect(item.id, 'preview')}
                aria-label={`Preview converted ${item.file.name}`}
                className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                Preview
              </button>
              <a
                href={item.result.downloadUrl}
                download={item.result.outputFilename}
                aria-label={`Download ${item.result.outputFilename}`}
                className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Download
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
