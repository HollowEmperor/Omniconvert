import { ChangeEvent, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Loader2,
  Menu,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { Dropzone } from './components/Dropzone';
import { FormatMatrixView } from './components/FormatMatrixView';
import { HistoryView } from './components/HistoryView';
import { InspectorPanel } from './components/InspectorPanel';
import { PdfEditorView } from './components/PdfEditorView';
import { QueueRow } from './components/QueueRow';
import { Sidebar } from './components/Sidebar';
import { Viewer3DView } from './components/Viewer3DView';
import JSZip from 'jszip';
import {
  ACCEPT_ATTRIBUTE,
  ConversionOptions,
  DEFAULT_OPTIONS,
  FORMAT_SPECS,
  SampleFileDescriptor,
  detectFormat,
  formatBytes,
  getDefaultTargetForSource,
  isConversionSupported,
} from './lib/formats';
import { convertThreeModelFile } from './lib/threeConverter';
import {
  ConversionResultData,
  HistoryEntry,
  QueueItem,
  RoutePreset,
  WorkspaceView,
} from './types/converter';

const VIEW_TITLES: Record<WorkspaceView, string> = {
  converter: 'Universal Converter',
  viewer3d: '3D Viewer',
  pdfEditor: 'PDF Editor',
  matrix: 'Format Matrix',
  history: 'Session History',
};

function uploadAndConvertViaXhr(
  formData: FormData,
  onProgress: (pct: number) => void
): Promise<ConversionResultData> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/convert');
    xhr.timeout = 0; // No timeout for arbitrarily large files

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && evt.total > 0) {
        const pct = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText) as ConversionResultData & { error?: string };
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload);
        } else {
          reject(new Error(payload.error || `Conversion failed (HTTP ${xhr.status}).`));
        }
      } catch {
        reject(new Error(`Unexpected server response (HTTP ${xhr.status}).`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error while uploading file. Please try again.'));
    };

    xhr.send(formData);
  });
}

export default function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>('converter');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'settings' | 'preview'>('settings');
  const [routePreset, setRoutePreset] = useState<RoutePreset | null>(null);
  const [loadingSampleId, setLoadingSampleId] = useState<string | null>(null);
  const [zipDownloading, setZipDownloading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedItem = useMemo(
    () => queue.find((q) => q.id === selectedId) ?? null,
    [queue, selectedId]
  );

  const pendingItems = useMemo(
    () => queue.filter((q) => q.status === 'ready' || q.status === 'error'),
    [queue]
  );

  const completedItems = useMemo(
    () => queue.filter((q) => q.status === 'completed' && q.result),
    [queue]
  );

  const isAnyConverting = useMemo(
    () => queue.some((q) => q.status === 'converting'),
    [queue]
  );

  const totalQueuedBytes = useMemo(
    () => queue.reduce((sum, item) => sum + item.file.size, 0),
    [queue]
  );

  const addFiles = (incoming: FileList | File[], explicitTarget?: string) => {
    const list = Array.from(incoming);
    if (list.length === 0) return;

    const unsupported: string[] = [];
    const created: QueueItem[] = [];

    for (const file of list) {
      const detected = detectFormat(file.name, file.type);
      if (!detected) {
        unsupported.push(file.name);
        continue;
      }

      let targetExt = getDefaultTargetForSource(detected.ext);
      if (explicitTarget && isConversionSupported(detected.ext, explicitTarget)) {
        targetExt = explicitTarget;
      } else if (routePreset && isConversionSupported(detected.ext, routePreset.targetExt)) {
        targetExt = routePreset.targetExt;
      }

      created.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        sourceFormat: detected,
        targetExt,
        options: { ...DEFAULT_OPTIONS },
        status: 'ready',
      });
    }

    if (unsupported.length > 0) {
      setNotice(
        `Unsupported format skipped: ${unsupported.join(', ')}. Open Format Matrix to view all ${FORMAT_SPECS.filter((f) => f.canBeInput).length} supported input types.`
      );
    } else {
      setNotice(null);
    }

    if (created.length > 0) {
      setQueue((prev) => [...prev, ...created]);
      setActiveView('converter');
      setSelectedId((curr) => curr ?? created[0].id);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = '';
    }
  };

  const triggerFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleLoadSample = async (sample: SampleFileDescriptor) => {
    setLoadingSampleId(sample.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/samples/${encodeURIComponent(sample.id)}`);
      if (!res.ok) {
        throw new Error(`Unable to load sample file (${res.status}).`);
      }
      const blob = await res.blob();
      const file = new File([blob], sample.name, {
        type: blob.type || 'application/octet-stream',
      });
      addFiles([file], sample.recommendedTarget);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to load sample file.');
    } finally {
      setLoadingSampleId(null);
    }
  };

  const handleTargetChange = (id: string, targetExt: string) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, targetExt, status: 'ready', error: undefined, result: undefined }
          : item
      )
    );
  };

  const handleUpdateOptions = (id: string, patch: Partial<ConversionOptions>) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              options: { ...item.options, ...patch },
              status: item.status === 'completed' ? 'ready' : item.status,
            }
          : item
      )
    );
  };

  const handleResetOptions = (id: string) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, options: { ...DEFAULT_OPTIONS } } : item
      )
    );
  };

  const handleRemoveItem = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
    }
  };

  const handleClearQueue = () => {
    setQueue([]);
    setSelectedId(null);
    setNotice(null);
  };

  const convertItemById = async (id: string, snapshot?: QueueItem) => {
    const item = snapshot ?? queue.find((q) => q.id === id);
    if (!item) return;

    const is3d = item.sourceFormat.category === '3d';

    setQueue((prev) =>
      prev.map((q) =>
        q.id === id
          ? { ...q, status: 'converting', uploadProgress: is3d ? undefined : 0, error: undefined }
          : q
      )
    );

    try {
      let payload: ConversionResultData;
      let localBlob: Blob | undefined;

      if (is3d) {
        const converted = await convertThreeModelFile({
          file: item.file,
          sourceExt: item.sourceFormat.ext,
          targetExt: item.targetExt,
          options: item.options,
        });
        payload = converted.result;
        localBlob = converted.blob;
      } else {
        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('targetFormat', item.targetExt);
        formData.append('options', JSON.stringify(item.options));

        payload = await uploadAndConvertViaXhr(formData, (pct) => {
          setQueue((prev) =>
            prev.map((q) => (q.id === id ? { ...q, uploadProgress: pct } : q))
          );
        });
      }

      setQueue((prev) =>
        prev.map((q) =>
          q.id === id
            ? {
                ...q,
                status: 'completed',
                uploadProgress: undefined,
                result: payload,
                localBlob,
                error: undefined,
              }
            : q
        )
      );

      setHistory((prev) => [
        {
          id: payload.jobId,
          completedAt: new Date().toISOString(),
          inputName: item.file.name,
          inputSize: item.file.size,
          sourceCategory: item.sourceFormat.category,
          result: payload,
        },
        ...prev,
      ]);

      setSelectedId((curr) => (curr === id || curr === null ? id : curr));
      if (selectedId === id) {
        setInspectorTab('preview');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Conversion failed unexpectedly.';
      setQueue((prev) =>
        prev.map((q) =>
          q.id === id ? { ...q, status: 'error', uploadProgress: undefined, error: message } : q
        )
      );
    }
  };

  const handleConvertAll = async () => {
    const targets = queue.filter((q) => q.status === 'ready' || q.status === 'error');
    for (const item of targets) {
      await convertItemById(item.id, item);
    }
  };

  const handleDownloadAllZip = async () => {
    if (completedItems.length === 0) return;

    const hasClientConverted = completedItems.some((item) => item.localBlob);

    setZipDownloading(true);
    try {
      let blob: Blob;
      if (hasClientConverted) {
        const zip = new JSZip();
        const usedNames = new Set<string>();
        for (const item of completedItems) {
          if (!item.result) continue;
          let name = item.result.outputFilename;
          let suffix = 1;
          while (usedNames.has(name)) {
            const dot = item.result.outputFilename.lastIndexOf('.');
            name =
              dot > 0
                ? `${item.result.outputFilename.slice(0, dot)}_${suffix}${item.result.outputFilename.slice(dot)}`
                : `${item.result.outputFilename}_${suffix}`;
            suffix += 1;
          }
          usedNames.add(name);
          if (item.localBlob) {
            zip.file(name, item.localBlob);
          } else {
            const res = await fetch(item.result.downloadUrl);
            if (res.ok) {
              zip.file(name, await res.blob());
            }
          }
        }
        blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      } else {
        const jobIds = completedItems
          .map((item) => item.result?.jobId)
          .filter((id): id is string => Boolean(id));
        const res = await fetch('/api/download-zip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobIds }),
        });
        if (!res.ok) {
          throw new Error('Could not package ZIP archive.');
        }
        blob = await res.blob();
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'transmute-converted.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'ZIP packaging failed.');
    } finally {
      setZipDownloading(false);
    }
  };

  const handleSelectRoute = (preset: RoutePreset) => {
    setRoutePreset(preset);
    setActiveView('converter');
    // Also update any currently queued files matching the source format
    setQueue((prev) =>
      prev.map((item) =>
        item.sourceFormat.ext === preset.sourceExt &&
        isConversionSupported(item.sourceFormat.ext, preset.targetExt)
          ? { ...item, targetExt: preset.targetExt, status: 'ready', result: undefined }
          : item
      )
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        onChange={handleFileInputChange}
        className="hidden"
        aria-hidden="true"
      />

      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        queueCount={queue.length}
        historyCount={history.length}
        loadingSampleId={loadingSampleId}
        onLoadSample={handleLoadSample}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on left, single primary CTA on right */}
        <header className="sticky top-0 z-30 h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-md text-slate-600 hover:bg-slate-100 shrink-0"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 hidden sm:inline whitespace-nowrap">Workspace</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-medium text-slate-900 truncate">
                {VIEW_TITLES[activeView]}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={triggerFilePicker}
            className="inline-flex items-center gap-1.5 h-9 px-4 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Add Files
          </button>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1440px] w-full mx-auto">
          {notice && (
            <div
              role="alert"
              className="mb-5 flex items-center justify-between gap-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900"
            >
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
                <span>{notice}</span>
              </div>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Dismiss alert"
                className="inline-flex items-center justify-center w-7 h-7 rounded text-amber-700 hover:bg-amber-100 shrink-0"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {activeView === 'converter' && (
            <div className="space-y-6">
              <Dropzone
                compact={queue.length > 0}
                onFilesAdded={addFiles}
                onTriggerFilePicker={triggerFilePicker}
                onLoadSample={handleLoadSample}
                loadingSampleId={loadingSampleId}
                routePreset={routePreset}
                onClearPreset={() => setRoutePreset(null)}
              />

              {queue.length > 0 && (
                <div className="flex flex-col xl:flex-row items-start gap-6">
                  {/* Conversion queue card */}
                  <div className="flex-1 min-w-0 w-full bg-white border border-slate-200 rounded-lg overflow-hidden">
                    {/* Batch toolbar */}
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-slate-600 flex items-center gap-2">
                        <span className="font-semibold text-slate-900">Conversion Queue</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {queue.length} {queue.length === 1 ? 'file' : 'files'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {formatBytes(totalQueuedBytes)}
                        </span>
                        {completedItems.length > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums text-green-700">
                              {completedItems.length} completed
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {completedItems.length >= 2 && (
                          <button
                            type="button"
                            disabled={zipDownloading}
                            onClick={handleDownloadAllZip}
                            className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                          >
                            {zipDownloading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                            Download All (ZIP)
                          </button>
                        )}

                        {pendingItems.length > 0 && (
                          <button
                            type="button"
                            disabled={isAnyConverting}
                            onClick={handleConvertAll}
                            className="inline-flex items-center gap-1.5 h-8 px-3.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                          >
                            {isAnyConverting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Play className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                            Convert All ({pendingItems.length})
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isAnyConverting}
                          onClick={handleClearQueue}
                          className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-md disabled:opacity-40 whitespace-nowrap shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          Clear
                        </button>
                      </div>
                    </div>

                    <div data-testid="conversion-queue">
                      {queue.map((item) => (
                        <QueueRow
                          key={item.id}
                          item={item}
                          isSelected={selectedId === item.id}
                          onSelect={(id, tab) => {
                            setSelectedId(id);
                            setInspectorTab(tab);
                          }}
                          onTargetChange={handleTargetChange}
                          onConvert={(id) => convertItemById(id)}
                          onRemove={handleRemoveItem}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Right contextual settings / preview inspector */}
                  {selectedItem && (
                    <InspectorPanel
                      item={selectedItem}
                      activeTab={inspectorTab}
                      onTabChange={setInspectorTab}
                      onUpdateOptions={handleUpdateOptions}
                      onResetOptions={handleResetOptions}
                      onClose={() => setSelectedId(null)}
                    />
                  )}
                </div>
              )}

              {/* Supported workflow summary below empty dropzone */}
              {queue.length === 0 && (
                <section aria-label="Supported conversion capabilities" className="pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      {
                        title: 'Adobe & PDF Suite',
                        formats: 'PDF, PSD, PSB, AI, EPS, DNG → PNG, PDF, EPS, PSD',
                        detail: 'Rasterize pages up to 300 DPI, flatten Photoshop/Illustrator files, or edit PDFs in the built-in PDF Editor.',
                      },
                      {
                        title: 'Autodesk & Rhino 3D',
                        formats: '3DM, DXF, 3DS, FBX, GLB, OBJ, STL, PLY → USDZ',
                        detail: 'Convert Rhino OpenNURBS, AutoCAD DXF, and 3ds Max models locally with transforms and standalone 3D Viewer.',
                      },
                      {
                        title: 'Image & Video',
                        formats: 'PNG, WEBP, SVG, MP4, WEBM, MOV, MKV',
                        detail: 'Transcode containers, build animated GIFs, extract audio tracks, or generate PDF storyboards.',
                      },
                      {
                        title: 'Audio & Data',
                        formats: 'WAV, MP3, FLAC, OPUS, CSV, JSON, YAML, XML',
                        detail: 'Encode audio with custom bitrates, render waveform videos, or transform structured datasets.',
                      },
                    ].map((cap) => (
                      <div
                        key={cap.title}
                        className="p-5 bg-white border border-slate-200 rounded-lg"
                      >
                        <h2 className="font-display text-sm font-semibold text-slate-900">
                          {cap.title}
                        </h2>
                        <p className="mt-1 font-mono text-xs text-blue-700">
                          {cap.formats}
                        </p>
                        <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                          {cap.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {activeView === 'viewer3d' && (
            <Viewer3DView
              onSendToConverter={(file) => {
                addFiles([file]);
              }}
            />
          )}

          {activeView === 'pdfEditor' && (
            <PdfEditorView
              onSendToConverter={(file) => {
                addFiles([file]);
              }}
            />
          )}

          {activeView === 'matrix' && (
            <FormatMatrixView onSelectRoute={handleSelectRoute} />
          )}

          {activeView === 'history' && (
            <HistoryView
              entries={history}
              onClearHistory={() => setHistory([])}
              onGoToConverter={() => setActiveView('converter')}
            />
          )}
        </main>
      </div>
    </div>
  );
}
