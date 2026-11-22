import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileArchive, RotateCcw, X } from 'lucide-react';
import {
  ConversionOptions,
  DEFAULT_OPTIONS,
  formatBytes,
  formatSizeDelta,
  getFormatSpec,
} from '../lib/formats';
import { QueueItem } from '../types/converter';
import { ModelPreview3D } from './ModelPreview3D';

interface InspectorPanelProps {
  item: QueueItem | null;
  activeTab: 'settings' | 'preview';
  onTabChange: (tab: 'settings' | 'preview') => void;
  onUpdateOptions: (id: string, patch: Partial<ConversionOptions>) => void;
  onResetOptions: (id: string) => void;
  onClose: () => void;
}

export function InspectorPanel({
  item,
  activeTab,
  onTabChange,
  onUpdateOptions,
  onResetOptions,
  onClose,
}: InspectorPanelProps) {
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);

  const result = item?.result;
  const previewMime = result?.previewMime ?? '';
  const isTextLike =
    Boolean(result) &&
    !result?.isArchive &&
    (previewMime.startsWith('text/') ||
      previewMime.includes('json') ||
      previewMime.includes('xml') ||
      previewMime.includes('yaml'));

  useEffect(() => {
    if (!result || !isTextLike || activeTab !== 'preview') {
      setTextPreview(null);
      return;
    }

    let cancelled = false;
    setTextLoading(true);
    fetch(result.previewUrl)
      .then((res) => res.text())
      .then((txt) => {
        if (!cancelled) {
          setTextPreview(txt.slice(0, 24000));
        }
      })
      .catch(() => {
        if (!cancelled) setTextPreview('Unable to load text preview.');
      })
      .finally(() => {
        if (!cancelled) setTextLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [result?.jobId, isTextLike, activeTab]);

  if (!item) return null;

  const srcCat = item.sourceFormat.category;
  const targetSpec = getFormatSpec(item.targetExt);
  const tgtCat = targetSpec?.category ?? 'document';
  const opts = { ...DEFAULT_OPTIONS, ...item.options };

  const showImageControls =
    tgtCat === 'image' && item.targetExt !== 'gif' && srcCat !== 'audio';
  const showPdfRenderControls = srcCat === 'pdf' && item.targetExt !== 'txt';
  const showSlideDuration =
    (srcCat === 'pdf' || srcCat === 'image') &&
    (item.targetExt === 'mp4' || item.targetExt === 'gif');
  const showVideoControls =
    srcCat === 'video' && (tgtCat === 'video' || item.targetExt === 'gif');
  const showFrameCapture =
    srcCat === 'video' && tgtCat === 'image' && item.targetExt !== 'gif';
  const showAudioControls =
    tgtCat === 'audio' ||
    (srcCat === 'video' && tgtCat === 'video' && !opts.muteAudio) ||
    (srcCat === 'audio' && tgtCat === 'video');
  const showDataControls =
    (srcCat === 'data' || srcCat === '3d') &&
    (item.targetExt === 'json' || item.targetExt === 'xml' || item.targetExt === 'gltf');
  const showPdfPageSize =
    (srcCat === 'document' || srcCat === 'data') && item.targetExt === 'pdf';
  const show3dControls = srcCat === '3d';
  const show3dBinaryToggle =
    srcCat === '3d' && (item.targetExt === 'stl' || item.targetExt === 'ply');

  return (
    <aside
      aria-label="Conversion inspector"
      className="w-full xl:w-[360px] shrink-0 bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col"
    >
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold text-slate-900 truncate">
            {item.file.name}
          </h2>
          <p className="text-xs text-slate-500 font-mono">
            {item.sourceFormat.label} to {item.targetExt.toUpperCase()}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector panel"
          className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 shrink-0"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Segmented control: Settings vs Output Preview */}
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50">
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-200/70 rounded-md" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'settings'}
            onClick={() => onTabChange('settings')}
            className={`py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              activeTab === 'settings'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Settings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'preview'}
            disabled={!result}
            onClick={() => onTabChange('preview')}
            className={`py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap disabled:opacity-45 ${
              activeTab === 'preview'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Output Preview
          </button>
        </div>
      </div>

      {activeTab === 'settings' ? (
        <div className="p-4 space-y-5 text-sm overflow-y-auto">
          {showPdfRenderControls && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-900">PDF Rendering</p>
              <div>
                <label htmlFor="opt-dpi" className="block text-xs text-slate-600 mb-1">
                  Raster resolution (DPI)
                </label>
                <select
                  id="opt-dpi"
                  value={opts.pdfDpi}
                  onChange={(e) => onUpdateOptions(item.id, { pdfDpi: Number(e.target.value) })}
                  className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md"
                >
                  <option value={72}>72 DPI (Screen / compact)</option>
                  <option value={150}>150 DPI (Balanced standard)</option>
                  <option value={300}>300 DPI (High-detail print)</option>
                </select>
              </div>
              {tgtCat === 'image' && (
                <div>
                  <label htmlFor="opt-pages" className="block text-xs text-slate-600 mb-1">
                    Pages to export
                  </label>
                  <select
                    id="opt-pages"
                    value={opts.pdfPageMode}
                    onChange={(e) =>
                      onUpdateOptions(item.id, {
                        pdfPageMode: e.target.value as 'all' | 'first',
                      })
                    }
                    className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md"
                  >
                    <option value="all">All pages (ZIP if multi-page)</option>
                    <option value="first">First page only</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {showSlideDuration && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="opt-slide" className="font-medium text-slate-700">
                  Duration per page / frame
                </label>
                <span className="font-mono tabular-nums text-slate-900">{opts.slideDuration}s</span>
              </div>
              <input
                id="opt-slide"
                type="range"
                min={1}
                max={10}
                step={1}
                value={opts.slideDuration}
                onChange={(e) => onUpdateOptions(item.id, { slideDuration: Number(e.target.value) })}
                className="w-full accent-blue-600"
              />
            </div>
          )}

          {showImageControls && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-900">Image Parameters</p>
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <label htmlFor="opt-quality" className="text-slate-600">
                    Compression quality
                  </label>
                  <span className="font-mono tabular-nums text-slate-900">{opts.imageQuality}%</span>
                </div>
                <input
                  id="opt-quality"
                  type="range"
                  min={20}
                  max={100}
                  step={2}
                  value={opts.imageQuality}
                  onChange={(e) =>
                    onUpdateOptions(item.id, { imageQuality: Number(e.target.value) })
                  }
                  className="w-full accent-blue-600"
                />
              </div>

              <div>
                <label htmlFor="opt-width" className="block text-xs text-slate-600 mb-1">
                  Maximum width
                </label>
                <select
                  id="opt-width"
                  value={opts.imageMaxWidth}
                  onChange={(e) =>
                    onUpdateOptions(item.id, { imageMaxWidth: Number(e.target.value) })
                  }
                  className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md"
                >
                  <option value={0}>Keep original dimensions</option>
                  <option value={2560}>2560 px (QHD)</option>
                  <option value={1920}>1920 px (Full HD)</option>
                  <option value={1280}>1280 px (Web)</option>
                  <option value={800}>800 px (Compact)</option>
                </select>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(opts.grayscale)}
                  onChange={(e) => onUpdateOptions(item.id, { grayscale: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                Convert to monochrome grayscale
              </label>
            </div>
          )}

          {showFrameCapture && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-900">Keyframe Extraction</p>
              <label htmlFor="opt-timestamp" className="block text-xs text-slate-600">
                Capture timestamp (seconds)
              </label>
              <input
                id="opt-timestamp"
                type="number"
                min={0}
                step={0.5}
                value={opts.frameTimestamp}
                onChange={(e) =>
                  onUpdateOptions(item.id, {
                    frameTimestamp: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full h-9 px-2.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md"
              />
            </div>
          )}

          {showVideoControls && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-900">Video Encoding</p>
              <div>
                <label htmlFor="opt-res" className="block text-xs text-slate-600 mb-1">
                  Resolution
                </label>
                <select
                  id="opt-res"
                  value={opts.videoResolution}
                  onChange={(e) =>
                    onUpdateOptions(item.id, {
                      videoResolution: e.target.value as ConversionOptions['videoResolution'],
                    })
                  }
                  className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md"
                >
                  <option value="original">Original resolution</option>
                  <option value="1080p">1080p (Full HD)</option>
                  <option value="720p">720p (HD)</option>
                  <option value="480p">480p (Compact)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="opt-fps" className="block text-xs text-slate-600 mb-1">
                    Frame rate
                  </label>
                  <select
                    id="opt-fps"
                    value={opts.videoFps}
                    onChange={(e) =>
                      onUpdateOptions(item.id, {
                        videoFps: e.target.value as ConversionOptions['videoFps'],
                      })
                    }
                    className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md"
                  >
                    <option value="original">Original</option>
                    <option value="30">30 fps</option>
                    <option value="24">24 fps</option>
                    <option value="15">15 fps</option>
                  </select>
                </div>

                {item.targetExt !== 'gif' && (
                  <div>
                    <label htmlFor="opt-vpreset" className="block text-xs text-slate-600 mb-1">
                      Quality profile
                    </label>
                    <select
                      id="opt-vpreset"
                      value={opts.videoPreset}
                      onChange={(e) =>
                        onUpdateOptions(item.id, {
                          videoPreset: e.target.value as ConversionOptions['videoPreset'],
                        })
                      }
                      className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md"
                    >
                      <option value="high">High quality</option>
                      <option value="balanced">Balanced</option>
                      <option value="compact">Compact size</option>
                    </select>
                  </div>
                )}
              </div>

              {item.targetExt !== 'gif' && (
                <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(opts.muteAudio)}
                    onChange={(e) => onUpdateOptions(item.id, { muteAudio: e.target.checked })}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  Remove audio track
                </label>
              )}
            </div>
          )}

          {showAudioControls && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-900">Audio Encoding</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="opt-bitrate" className="block text-xs text-slate-600 mb-1">
                    Bitrate
                  </label>
                  <select
                    id="opt-bitrate"
                    value={opts.audioBitrate}
                    onChange={(e) =>
                      onUpdateOptions(item.id, {
                        audioBitrate: e.target.value as ConversionOptions['audioBitrate'],
                      })
                    }
                    className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md"
                  >
                    <option value="320k">320 kbps</option>
                    <option value="192k">192 kbps</option>
                    <option value="128k">128 kbps</option>
                    <option value="96k">96 kbps</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="opt-channels" className="block text-xs text-slate-600 mb-1">
                    Channels
                  </label>
                  <select
                    id="opt-channels"
                    value={opts.audioChannels}
                    onChange={(e) =>
                      onUpdateOptions(item.id, {
                        audioChannels: e.target.value as ConversionOptions['audioChannels'],
                      })
                    }
                    className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md"
                  >
                    <option value="original">Original</option>
                    <option value="2">Stereo (2.0)</option>
                    <option value="1">Mono (1.0)</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="opt-samplerate" className="block text-xs text-slate-600 mb-1">
                  Sample rate
                </label>
                <select
                  id="opt-samplerate"
                  value={opts.audioSampleRate}
                  onChange={(e) =>
                    onUpdateOptions(item.id, {
                      audioSampleRate: e.target.value as ConversionOptions['audioSampleRate'],
                    })
                  }
                  className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md"
                >
                  <option value="original">Original sample rate</option>
                  <option value="48000">48,000 Hz (Broadcast)</option>
                  <option value="44100">44,100 Hz (CD standard)</option>
                  <option value="22050">22,050 Hz (Voice compact)</option>
                </select>
              </div>
            </div>
          )}

          {showDataControls && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-900">Data Formatting</p>
              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={opts.prettyPrint !== false}
                  onChange={(e) => onUpdateOptions(item.id, { prettyPrint: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                Pretty-print with indentation
              </label>
            </div>
          )}

          {showPdfPageSize && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-900">PDF Document Layout</p>
              <label htmlFor="opt-pagesize" className="block text-xs text-slate-600">
                Page dimensions
              </label>
              <select
                id="opt-pagesize"
                value={opts.pdfPageSize}
                onChange={(e) =>
                  onUpdateOptions(item.id, {
                    pdfPageSize: e.target.value as 'letter' | 'a4',
                  })
                }
                className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md"
              >
                <option value="letter">US Letter (8.5 × 11 in)</option>
                <option value="a4">ISO A4 (210 × 297 mm)</option>
              </select>
            </div>
          )}

          {show3dControls && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-900">3D Mesh Transform</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="opt-3d-scale" className="block text-xs text-slate-600 mb-1">
                    Uniform scale
                  </label>
                  <select
                    id="opt-3d-scale"
                    value={opts.modelScale ?? 1}
                    onChange={(e) =>
                      onUpdateOptions(item.id, { modelScale: Number(e.target.value) })
                    }
                    className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md"
                  >
                    <option value={1}>1.0× (Original)</option>
                    <option value={0.01}>0.01× (cm → m)</option>
                    <option value={0.001}>0.001× (mm → m)</option>
                    <option value={10}>10× (Scale up)</option>
                    <option value={100}>100× (m → cm)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="opt-3d-axis" className="block text-xs text-slate-600 mb-1">
                    Up axis
                  </label>
                  <select
                    id="opt-3d-axis"
                    value={opts.modelAxisSwap ?? 'none'}
                    onChange={(e) =>
                      onUpdateOptions(item.id, {
                        modelAxisSwap: e.target.value as ConversionOptions['modelAxisSwap'],
                      })
                    }
                    className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md"
                  >
                    <option value="none">Keep original</option>
                    <option value="z-to-y">Z-Up → Y-Up</option>
                    <option value="y-to-z">Y-Up → Z-Up</option>
                  </select>
                </div>
              </div>

              {show3dBinaryToggle && (
                <div>
                  <label htmlFor="opt-3d-encoding" className="block text-xs text-slate-600 mb-1">
                    Mesh encoding
                  </label>
                  <select
                    id="opt-3d-encoding"
                    value={opts.modelBinaryOutput === false ? 'ascii' : 'binary'}
                    onChange={(e) =>
                      onUpdateOptions(item.id, {
                        modelBinaryOutput: e.target.value === 'binary',
                      })
                    }
                    className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md"
                  >
                    <option value="binary">Binary (compact &amp; fast)</option>
                    <option value="ascii">ASCII (plain text)</option>
                  </select>
                </div>
              )}

              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(opts.modelCenter)}
                  onChange={(e) => onUpdateOptions(item.id, { modelCenter: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                Center geometry at world origin (0, 0, 0)
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(opts.modelRecomputeNormals)}
                  onChange={(e) =>
                    onUpdateOptions(item.id, { modelRecomputeNormals: e.target.checked })
                  }
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                Recompute smooth vertex normals
              </label>
            </div>
          )}

          {!showImageControls &&
            !showPdfRenderControls &&
            !showSlideDuration &&
            !showVideoControls &&
            !showFrameCapture &&
            !showAudioControls &&
            !showDataControls &&
            !showPdfPageSize &&
            !show3dControls && (
              <p className="text-xs text-slate-500 leading-relaxed">
                This conversion uses lossless direct formatting defaults. Click Convert to run
                immediately.
              </p>
            )}

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onResetOptions(item.id)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Reset defaults
            </button>
            <span className="text-xs text-slate-400">Applies on next run</span>
          </div>
        </div>
      ) : (
        <div className="p-4 space-y-4 overflow-y-auto" data-testid="output-preview-panel">
          {!result ? (
            <p className="text-xs text-slate-500">
              Convert this file first to inspect and preview the output.
            </p>
          ) : (
            <>
              {/* Media preview stage */}
              <div className="rounded-md border border-slate-200 bg-slate-50 overflow-hidden">
                {result.previewModelExt ? (
                  <ModelPreview3D
                    url={result.previewUrl}
                    ext={result.previewModelExt}
                    filename={result.outputFilename}
                  />
                ) : previewMime.startsWith('image/') ? (
                  <div className="p-3 flex flex-col items-center">
                    <img
                      src={result.previewUrl}
                      alt={`Converted preview of ${result.outputFilename}`}
                      referrerPolicy="no-referrer"
                      className="max-h-72 w-auto object-contain rounded border border-slate-200 bg-white"
                    />
                    {result.isArchive && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
                        <FileArchive className="w-3.5 h-3.5" aria-hidden="true" />
                        Showing page 1 of {result.metadata?.pageCount ?? 'multiple'} (full archive in ZIP)
                      </p>
                    )}
                  </div>
                ) : previewMime.startsWith('video/') ? (
                  <video
                    src={result.previewUrl}
                    controls
                    className="w-full max-h-64 bg-slate-950"
                  />
                ) : previewMime.startsWith('audio/') ? (
                  <div className="p-4">
                    <audio src={result.previewUrl} controls className="w-full" />
                  </div>
                ) : previewMime === 'application/pdf' ? (
                  <iframe
                    src={result.previewUrl}
                    title={`PDF preview for ${result.outputFilename}`}
                    className="w-full h-72 bg-white"
                  />
                ) : isTextLike ? (
                  <pre className="p-3 text-xs font-mono text-slate-800 max-h-72 overflow-auto whitespace-pre-wrap break-words">
                    {textLoading ? 'Loading preview...' : textPreview}
                  </pre>
                ) : (
                  <div className="p-6 text-center text-xs text-slate-500">
                    Binary output ready for download ({result.outputFilename}).
                  </div>
                )}
              </div>

              {/* Output specs */}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs border-t border-slate-200 pt-3.5">
                <div>
                  <dt className="text-slate-500">Input size</dt>
                  <dd className="mt-0.5 font-mono tabular-nums font-medium text-slate-900">
                    {formatBytes(item.file.size)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Output size</dt>
                  <dd className="mt-0.5 font-mono tabular-nums font-medium text-slate-900">
                    {formatBytes(result.outputSize)} ({formatSizeDelta(item.file.size, result.outputSize)})
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Elapsed time</dt>
                  <dd className="mt-0.5 font-mono tabular-nums font-medium text-slate-900">
                    {(result.durationMs / 1000).toFixed(2)}s
                  </dd>
                </div>
                {result.metadata?.triangles !== undefined ? (
                  <>
                    <div>
                      <dt className="text-slate-500">Triangles</dt>
                      <dd className="mt-0.5 font-mono tabular-nums font-medium text-slate-900">
                        {result.metadata.triangles.toLocaleString()}
                      </dd>
                    </div>
                    {result.metadata.vertices !== undefined && (
                      <div>
                        <dt className="text-slate-500">Vertices</dt>
                        <dd className="mt-0.5 font-mono tabular-nums font-medium text-slate-900">
                          {result.metadata.vertices.toLocaleString()}
                        </dd>
                      </div>
                    )}
                    {result.metadata.bounds && (
                      <div>
                        <dt className="text-slate-500">Bounds (W×H×D)</dt>
                        <dd className="mt-0.5 font-mono tabular-nums font-medium text-slate-900">
                          {result.metadata.bounds}
                        </dd>
                      </div>
                    )}
                  </>
                ) : result.metadata?.width && result.metadata?.height ? (
                  <div>
                    <dt className="text-slate-500">Dimensions</dt>
                    <dd className="mt-0.5 font-mono tabular-nums font-medium text-slate-900">
                      {result.metadata.width} × {result.metadata.height}
                    </dd>
                  </div>
                ) : result.metadata?.pageCount ? (
                  <div>
                    <dt className="text-slate-500">Pages</dt>
                    <dd className="mt-0.5 font-mono tabular-nums font-medium text-slate-900">
                      {result.metadata.pageCount}
                    </dd>
                  </div>
                ) : result.metadata?.durationSec ? (
                  <div>
                    <dt className="text-slate-500">Duration</dt>
                    <dd className="mt-0.5 font-mono tabular-nums font-medium text-slate-900">
                      {result.metadata.durationSec}s
                    </dd>
                  </div>
                ) : null}
              </dl>

              <div className="flex items-center gap-2 pt-2">
                <a
                  href={result.downloadUrl}
                  download={result.outputFilename}
                  className="flex-1 inline-flex items-center justify-center gap-2 h-9 px-3 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  Download {result.isArchive ? 'ZIP' : result.targetExt.toUpperCase()}
                </a>
                <a
                  href={result.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open converted file in new tab"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 shrink-0"
                >
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                </a>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
