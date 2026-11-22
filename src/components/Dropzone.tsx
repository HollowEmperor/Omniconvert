import { DragEvent, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { SAMPLE_FILES, SampleFileDescriptor } from '../lib/formats';
import { RoutePreset } from '../types/converter';

interface DropzoneProps {
  compact: boolean;
  onFilesAdded: (files: FileList | File[]) => void;
  onTriggerFilePicker: () => void;
  onLoadSample: (sample: SampleFileDescriptor) => void;
  loadingSampleId: string | null;
  routePreset: RoutePreset | null;
  onClearPreset: () => void;
}

export function Dropzone({
  compact,
  onFilesAdded,
  onTriggerFilePicker,
  onLoadSample,
  loadingSampleId,
  routePreset,
  onClearPreset,
}: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesAdded(e.dataTransfer.files);
    }
  };

  return (
    <section aria-label="File upload area">
      {routePreset && (
        <div className="mb-3 flex items-center justify-between gap-4 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
          <span>
            Preset active: converting{' '}
            <strong className="font-mono font-semibold">{routePreset.sourceExt.toUpperCase()}</strong>
            {' to '}
            <strong className="font-mono font-semibold">{routePreset.targetExt.toUpperCase()}</strong>.
            Drop matching files below to apply automatically.
          </span>
          <button
            type="button"
            onClick={onClearPreset}
            aria-label="Clear active format preset"
            className="inline-flex items-center justify-center w-7 h-7 rounded text-blue-700 hover:bg-blue-100 shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid="upload-dropzone"
        className={`rounded-lg border border-dashed transition-colors ${
          isDragging
            ? 'border-blue-600 bg-blue-50/70'
            : 'border-slate-300 bg-white hover:border-slate-400'
        } ${compact ? 'px-5 py-4' : 'px-6 py-12 sm:py-16'}`}
      >
        {compact ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center justify-center w-9 h-9 rounded-md bg-slate-100 text-slate-600 shrink-0">
                <Upload className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  Drop additional files here to queue a batch
                </p>
                <p className="text-xs text-slate-500">
                  PDF, Adobe (PSD, AI, EPS, DNG), Autodesk (DXF, 3DS, FBX), Rhino (3DM), Video, Audio, 3D &amp; Data
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onTriggerFilePicker}
              className="px-4 py-2 text-sm font-medium text-slate-900 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              Browse Files
            </button>
          </div>
        ) : (
          <div className="max-w-xl mx-auto text-center">
            <div className="mx-auto mb-4 flex items-center justify-center w-12 h-12 rounded-lg bg-slate-100 text-slate-700">
              <Upload className="w-5 h-5" aria-hidden="true" />
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 text-balance">
              Convert any file across PDF, Adobe, Autodesk, Rhino, 3D, and media
            </h1>
            <p className="mt-2.5 text-sm sm:text-base text-slate-600 leading-relaxed">
              Drop files of any size below, pick your output format, and fine-tune quality,
              resolution, DPI, bitrate, or 3D mesh transforms before converting.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onTriggerFilePicker}
                className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors whitespace-nowrap shrink-0"
              >
                Choose Files
              </button>
              <span className="text-xs text-slate-500">
                No file size limit · Streaming upload &amp; batch conversion
              </span>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-200">
              <p className="text-xs font-medium text-slate-500 mb-3">
                Or test immediately with a sample file
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {SAMPLE_FILES.map((sample) => {
                  const busy = loadingSampleId === sample.id;
                  return (
                    <button
                      key={sample.id}
                      type="button"
                      disabled={busy}
                      onClick={() => onLoadSample(sample)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 hover:border-slate-300 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {busy ? `Loading ${sample.label}...` : `${sample.label} (${sample.ext.toUpperCase()})`}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
