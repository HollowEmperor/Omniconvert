import { ChangeEvent, DragEvent, MouseEvent, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  Layers,
  Loader2,
  RotateCcw,
  RotateCw,
  Trash2,
  Type,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { formatBytes } from '../lib/formats';

interface PdfEditorViewProps {
  onSendToConverter: (file: File) => void;
}

interface PdfTextAnnotation {
  id: string;
  text: string;
  xPct: number; // 0..100 from left
  yPct: number; // 0..100 from top
  fontSize: number; // pt
  colorHex: string;
}

interface EditablePdfPage {
  id: string;
  sourceDocIndex: number; // -1 for blank page
  sourcePageIndex: number;
  rotation: number; // 0, 90, 180, 270
  previewUrl: string;
  widthPt: number;
  heightPt: number;
  annotations: PdfTextAnnotation[];
}

interface RenderPagesResponse {
  pageCount: number;
  pages: Array<{
    pageIndex: number;
    width: number;
    height: number;
    imageDataUrl: string;
  }>;
  error?: string;
}

const COLOR_SWATCHES = [
  { hex: '#0f172a', label: 'Slate' },
  { hex: '#1d4ed8', label: 'Blue' },
  { hex: '#dc2626', label: 'Red' },
  { hex: '#15803d', label: 'Green' },
];

function hexToPdfRgb(hex: string) {
  const clean = hex.replace('#', '');
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255;
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255;
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255;
  return rgb(
    Number.isFinite(r) ? r : 0.06,
    Number.isFinite(g) ? g : 0.09,
    Number.isFinite(b) ? b : 0.16
  );
}

function sanitizePdfText(text: string): string {
  return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
}

function createBlankPagePreviewDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="612" height="792" viewBox="0 0 612 792"><rect width="612" height="792" fill="#ffffff"/><text x="306" y="400" text-anchor="middle" fill="#cbd5e1" font-family="sans-serif" font-size="18">Blank Page</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function renderPdfViaServer(file: File): Promise<RenderPagesResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('dpi', '120');
  const res = await fetch('/api/pdf/render-pages', {
    method: 'POST',
    body: formData,
  });
  const payload = (await res.json()) as RenderPagesResponse;
  if (!res.ok) {
    throw new Error(payload.error || `Unable to render PDF pages (${res.status}).`);
  }
  return payload;
}

export function PdfEditorView({ onSendToConverter }: PdfEditorViewProps) {
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<number>(0);
  const [sourceBuffers, setSourceBuffers] = useState<Uint8Array[]>([]);
  const [pages, setPages] = useState<EditablePdfPage[]>([]);
  const [initialPagesSnapshot, setInitialPagesSnapshot] = useState<EditablePdfPage[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);

  const [zoom, setZoom] = useState<number>(100);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Annotation composer state
  const [annotationText, setAnnotationText] = useState('Reviewed & Approved');
  const [annotationSize, setAnnotationSize] = useState(14);
  const [annotationColor, setAnnotationColor] = useState('#1d4ed8');
  const [placeMode, setPlaceMode] = useState(false);

  // Watermark & metadata state
  const [watermarkText, setWatermarkText] = useState('');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaAuthor, setMetaAuthor] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mergeInputRef = useRef<HTMLInputElement | null>(null);

  const activePageIndex = useMemo(
    () => pages.findIndex((p) => p.id === activePageId),
    [pages, activePageId]
  );
  const activePage = activePageIndex >= 0 ? pages[activePageIndex] : pages[0] ?? null;

  const loadPdfFile = async (file: File, append = false) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setError('Please select a valid PDF (.pdf) document.');
      return;
    }

    setLoading(true);
    setError(null);
    setStatusMessage(null);

    try {
      const arrayBuf = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const rendered = await renderPdfViaServer(file);
      const pdfPages = pdfDoc.getPages();

      const docIndex = append ? sourceBuffers.length : 0;
      const builtPages: EditablePdfPage[] = rendered.pages.map((rp, idx) => {
        const size = pdfPages[idx]?.getSize() ?? { width: 612, height: 792 };
        return {
          id: `pg-${Date.now()}-${docIndex}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          sourceDocIndex: docIndex,
          sourcePageIndex: idx,
          rotation: 0,
          previewUrl: rp.imageDataUrl,
          widthPt: size.width,
          heightPt: size.height,
          annotations: [],
        };
      });

      if (append) {
        setSourceBuffers((prev) => [...prev, bytes]);
        setPages((prev) => [...prev, ...builtPages]);
        setStatusMessage(`Merged ${builtPages.length} page${builtPages.length === 1 ? '' : 's'} from ${file.name}.`);
      } else {
        setFileName(file.name);
        setFileSize(file.size);
        setSourceBuffers([bytes]);
        setPages(builtPages);
        setInitialPagesSnapshot(builtPages);
        setActivePageId(builtPages[0]?.id ?? null);
        setMetaTitle(pdfDoc.getTitle() || file.name.replace(/\.pdf$/i, ''));
        setMetaAuthor(pdfDoc.getAuthor() || '');
        setWatermarkText('');
        setZoom(100);
        setPlaceMode(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open PDF document.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      loadPdfFile(f, false);
      e.target.value = '';
    }
  };

  const handleMergeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      loadPdfFile(f, true);
      e.target.value = '';
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) loadPdfFile(f, false);
  };

  const handleLoadSamplePdf = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/samples/quarterly-brief');
      if (!res.ok) throw new Error('Unable to load sample PDF.');
      const blob = await res.blob();
      const file = new File([blob], 'quarterly-brief.pdf', { type: 'application/pdf' });
      await loadPdfFile(file, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sample PDF.');
      setLoading(false);
    }
  };

  const rotatePage = (pageId: string, delta: number) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === pageId ? { ...p, rotation: (p.rotation + delta + 360) % 360 } : p
      )
    );
  };

  const movePage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= pages.length) return;
    setPages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const duplicatePage = (index: number) => {
    const src = pages[index];
    if (!src) return;
    const copy: EditablePdfPage = {
      ...src,
      id: `pg-copy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      annotations: src.annotations.map((a) => ({ ...a, id: `${a.id}-c` })),
    };
    setPages((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setActivePageId(copy.id);
  };

  const deletePage = (index: number) => {
    if (pages.length <= 1) return;
    const removed = pages[index];
    const next = pages.filter((_, i) => i !== index);
    setPages(next);
    if (activePageId === removed.id) {
      setActivePageId(next[Math.max(0, index - 1)]?.id ?? null);
    }
  };

  const insertBlankPage = () => {
    const blank: EditablePdfPage = {
      id: `pg-blank-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sourceDocIndex: -1,
      sourcePageIndex: -1,
      rotation: 0,
      previewUrl: createBlankPagePreviewDataUrl(),
      widthPt: 612,
      heightPt: 792,
      annotations: [],
    };
    const insertAt = activePageIndex >= 0 ? activePageIndex + 1 : pages.length;
    setPages((prev) => {
      const next = [...prev];
      next.splice(insertAt, 0, blank);
      return next;
    });
    setActivePageId(blank.id);
  };

  const addAnnotationToActivePage = (xPct: number, yPct: number) => {
    if (!activePage || !annotationText.trim()) return;
    const note: PdfTextAnnotation = {
      id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: annotationText.trim(),
      xPct: Math.min(92, Math.max(4, Number(xPct.toFixed(1)))),
      yPct: Math.min(95, Math.max(5, Number(yPct.toFixed(1)))),
      fontSize: annotationSize,
      colorHex: annotationColor,
    };
    setPages((prev) =>
      prev.map((p) =>
        p.id === activePage.id ? { ...p, annotations: [...p.annotations, note] } : p
      )
    );
    setPlaceMode(false);
    setStatusMessage(`Added text annotation on Page ${activePageIndex + 1}.`);
  };

  const handlePageCanvasClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!placeMode || !activePage) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    addAnnotationToActivePage(xPct, yPct);
  };

  const removeAnnotation = (pageId: string, annId: string) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === pageId
          ? { ...p, annotations: p.annotations.filter((a) => a.id !== annId) }
          : p
      )
    );
  };

  const handleResetEdits = () => {
    if (initialPagesSnapshot.length === 0) return;
    setPages(initialPagesSnapshot.map((p) => ({ ...p, annotations: [] })));
    setActivePageId(initialPagesSnapshot[0]?.id ?? null);
    setWatermarkText('');
    setStatusMessage('Reset document to original pages.');
  };

  const buildEditedPdfBytes = async (): Promise<Uint8Array> => {
    const outDoc = await PDFDocument.create();
    const font = await outDoc.embedFont(StandardFonts.HelveticaBold);

    const loadedSources = await Promise.all(
      sourceBuffers.map((buf) => PDFDocument.load(buf, { ignoreEncryption: true }))
    );

    for (const pageSpec of pages) {
      let page;
      if (pageSpec.sourceDocIndex === -1) {
        page = outDoc.addPage([pageSpec.widthPt, pageSpec.heightPt]);
      } else {
        const srcDoc = loadedSources[pageSpec.sourceDocIndex];
        const [copied] = await outDoc.copyPages(srcDoc, [pageSpec.sourcePageIndex]);
        page = outDoc.addPage(copied);
      }

      if (pageSpec.rotation !== 0) {
        const existingAngle = page.getRotation().angle;
        page.setRotation(degrees((existingAngle + pageSpec.rotation) % 360));
      }

      const { width, height } = page.getSize();

      // Stamp text annotations
      for (const ann of pageSpec.annotations) {
        const x = (ann.xPct / 100) * width;
        const y = height - (ann.yPct / 100) * height - ann.fontSize * 0.8;
        page.drawText(sanitizePdfText(ann.text), {
          x: Math.max(8, Math.min(width - 24, x)),
          y: Math.max(8, Math.min(height - ann.fontSize, y)),
          size: ann.fontSize,
          font,
          color: hexToPdfRgb(ann.colorHex),
        });
      }

      // Stamp diagonal watermark if configured
      if (watermarkText.trim()) {
        const wm = sanitizePdfText(watermarkText.trim()).slice(0, 48);
        const wmSize = Math.max(26, Math.min(54, Math.round(width * 0.08)));
        const textW = font.widthOfTextAtSize(wm, wmSize);
        page.drawText(wm, {
          x: Math.max(32, (width - textW * 0.72) * 0.5),
          y: height * 0.36,
          size: wmSize,
          font,
          color: rgb(0.4, 0.45, 0.55),
          opacity: 0.22,
          rotate: degrees(38),
        });
      }
    }

    if (metaTitle.trim()) outDoc.setTitle(metaTitle.trim());
    if (metaAuthor.trim()) outDoc.setAuthor(metaAuthor.trim());
    outDoc.setProducer('Transmute PDF Editor');

    return outDoc.save();
  };

  const handleExportDownload = async () => {
    if (pages.length === 0) return;
    setExporting(true);
    setError(null);
    try {
      const pdfBytes = await buildEditedPdfBytes();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const outName = `${fileName.replace(/\.pdf$/i, '') || 'document'}_edited.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatusMessage(`Exported ${outName} (${formatBytes(blob.size)}, ${pages.length} pages).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export edited PDF.');
    } finally {
      setExporting(false);
    }
  };

  const handleSendEditedToConverter = async () => {
    if (pages.length === 0) return;
    setExporting(true);
    setError(null);
    try {
      const pdfBytes = await buildEditedPdfBytes();
      const outName = `${fileName.replace(/\.pdf$/i, '') || 'document'}_edited.pdf`;
      const file = new File([pdfBytes.buffer as ArrayBuffer], outName, {
        type: 'application/pdf',
      });
      onSendToConverter(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to prepare edited PDF.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section aria-label="PDF viewer and editor" className="space-y-5">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />
      <input
        ref={mergeInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleMergeChange}
        className="hidden"
        aria-hidden="true"
      />

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            PDF Viewer &amp; Editor
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            View pages, reorder, rotate, duplicate, merge PDFs, stamp text annotations or watermarks, and export lossless PDF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {pages.length > 0 && (
            <>
              <button
                type="button"
                disabled={exporting}
                onClick={handleSendEditedToConverter}
                className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
                Send to Converter
              </button>
              <button
                type="button"
                disabled={exporting}
                onClick={handleExportDownload}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {exporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                Export Edited PDF
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <FolderOpen className="w-3.5 h-3.5" aria-hidden="true" />
            Open PDF
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {statusMessage && !error && (
        <div
          role="status"
          className="px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900"
        >
          {statusMessage}
        </div>
      )}

      {pages.length === 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
          }}
          onDrop={handleDrop}
          data-testid="pdf-editor-dropzone"
          className={`rounded-lg border border-dashed px-6 py-14 sm:py-20 text-center transition-colors ${
            isDragging
              ? 'border-blue-600 bg-blue-50/70'
              : 'border-slate-300 bg-white hover:border-slate-400'
          }`}
        >
          <div className="max-w-lg mx-auto">
            <div className="mx-auto mb-4 flex items-center justify-center w-12 h-12 rounded-lg bg-slate-100 text-slate-700">
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="w-5 h-5" aria-hidden="true" />
              )}
            </div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              {loading ? 'Rendering PDF pages...' : 'Drop a PDF document to view and edit'}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Rotate, reorder, duplicate, delete, or merge pages, add text notes and diagonal watermarks, and export cleanly.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
              >
                Choose PDF File
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleLoadSamplePdf}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
              >
                Load Sample PDF (Quarterly Brief)
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {/* Document toolbar */}
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 text-xs">
              <span className="font-semibold text-slate-900 truncate max-w-[220px]">
                {fileName}
              </span>
              <span className="font-mono tabular-nums text-slate-500 whitespace-nowrap">
                {pages.length} {pages.length === 1 ? 'page' : 'pages'} · {formatBytes(fileSize)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {/* Page navigation */}
              <div className="inline-flex items-center rounded-md border border-slate-200 bg-white">
                <button
                  type="button"
                  disabled={activePageIndex <= 0}
                  onClick={() => setActivePageId(pages[activePageIndex - 1]?.id ?? null)}
                  aria-label="Previous page"
                  className="inline-flex items-center justify-center w-8 h-8 text-slate-600 hover:bg-slate-100 disabled:opacity-35"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <span className="px-2 text-xs font-mono tabular-nums text-slate-700 whitespace-nowrap">
                  {activePageIndex + 1} / {pages.length}
                </span>
                <button
                  type="button"
                  disabled={activePageIndex >= pages.length - 1}
                  onClick={() => setActivePageId(pages[activePageIndex + 1]?.id ?? null)}
                  aria-label="Next page"
                  className="inline-flex items-center justify-center w-8 h-8 text-slate-600 hover:bg-slate-100 disabled:opacity-35"
                >
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {/* Zoom */}
              <div className="inline-flex items-center rounded-md border border-slate-200 bg-white">
                <button
                  type="button"
                  disabled={zoom <= 60}
                  onClick={() => setZoom((z) => Math.max(60, z - 15))}
                  aria-label="Zoom out"
                  className="inline-flex items-center justify-center w-8 h-8 text-slate-600 hover:bg-slate-100 disabled:opacity-35"
                >
                  <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <span className="px-2 text-xs font-mono tabular-nums text-slate-700">
                  {zoom}%
                </span>
                <button
                  type="button"
                  disabled={zoom >= 160}
                  onClick={() => setZoom((z) => Math.min(160, z + 15))}
                  aria-label="Zoom in"
                  className="inline-flex items-center justify-center w-8 h-8 text-slate-600 hover:bg-slate-100 disabled:opacity-35"
                >
                  <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>

              {/* Page rotation */}
              {activePage && (
                <>
                  <button
                    type="button"
                    onClick={() => rotatePage(activePage.id, -90)}
                    aria-label="Rotate active page counter-clockwise"
                    className="inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    -90°
                  </button>
                  <button
                    type="button"
                    onClick={() => rotatePage(activePage.id, 90)}
                    aria-label="Rotate active page clockwise"
                    className="inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
                  >
                    <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                    +90°
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={insertBlankPage}
                className="inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
              >
                <FilePlus2 className="w-3.5 h-3.5" aria-hidden="true" />
                Blank Page
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => mergeInputRef.current?.click()}
                className="inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
              >
                <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                Merge PDF
              </button>
            </div>
          </div>

          {/* 3-pane editor workspace: Thumbnail Strip | Active Page Canvas | Edit Tools */}
          <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_290px] min-h-[560px]">
            {/* Left page thumbnail strip */}
            <div
              className="border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/70 p-3 overflow-y-auto max-h-[640px]"
              aria-label="PDF page thumbnails"
            >
              <p className="text-xs font-medium text-slate-500 mb-2.5">Pages</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-1 gap-2.5">
                {pages.map((pg, idx) => {
                  const isActive = activePage?.id === pg.id;
                  return (
                    <div
                      key={pg.id}
                      className={`rounded-md border p-2 transition-colors ${
                        isActive
                          ? 'border-blue-600 bg-blue-50/60'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setActivePageId(pg.id)}
                        className="w-full text-left"
                      >
                        <div className="aspect-[612/792] w-full bg-white border border-slate-200 rounded-sm overflow-hidden flex items-center justify-center">
                          <img
                            src={pg.previewUrl}
                            alt={`Page ${idx + 1}`}
                            style={{ transform: `rotate(${pg.rotation}deg)` }}
                            className="max-w-full max-h-full object-contain transition-transform"
                          />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-[11px]">
                          <span className="font-mono tabular-nums font-medium text-slate-800">
                            Page {idx + 1}
                          </span>
                          {pg.rotation !== 0 && (
                            <span className="font-mono text-blue-700">{pg.rotation}°</span>
                          )}
                        </div>
                      </button>

                      {/* Per-page quick actions */}
                      <div className="mt-1.5 pt-1.5 border-t border-slate-200/80 flex items-center justify-between">
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => movePage(idx, -1)}
                            aria-label={`Move page ${idx + 1} up`}
                            className="inline-flex items-center justify-center w-6 h-6 rounded text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 disabled:opacity-30"
                          >
                            <ArrowUp className="w-3 h-3" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === pages.length - 1}
                            onClick={() => movePage(idx, 1)}
                            aria-label={`Move page ${idx + 1} down`}
                            className="inline-flex items-center justify-center w-6 h-6 rounded text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 disabled:opacity-30"
                          >
                            <ArrowDown className="w-3 h-3" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicatePage(idx)}
                            aria-label={`Duplicate page ${idx + 1}`}
                            className="inline-flex items-center justify-center w-6 h-6 rounded text-slate-500 hover:bg-slate-200/70 hover:text-slate-900"
                          >
                            <Copy className="w-3 h-3" aria-hidden="true" />
                          </button>
                        </div>
                        <button
                          type="button"
                          disabled={pages.length <= 1}
                          onClick={() => deletePage(idx)}
                          aria-label={`Delete page ${idx + 1}`}
                          className="inline-flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                        >
                          <Trash2 className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Center interactive page viewer */}
            <div className="bg-slate-100/90 p-5 overflow-auto flex flex-col items-center justify-start max-h-[640px]">
              {placeMode && (
                <div className="mb-3 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium">
                  Click anywhere on the page below to stamp your text annotation
                </div>
              )}

              {activePage && (
                <div
                  onClick={handlePageCanvasClick}
                  data-testid="pdf-active-page"
                  style={{ width: `${Math.round(480 * (zoom / 100))}px` }}
                  className={`relative bg-white shadow-sm border border-slate-300 select-none transition-all ${
                    placeMode ? 'cursor-crosshair ring-2 ring-blue-500' : ''
                  }`}
                >
                  <img
                    src={activePage.previewUrl}
                    alt={`Active PDF page ${activePageIndex + 1}`}
                    style={{ transform: `rotate(${activePage.rotation}deg)` }}
                    className="w-full h-auto block pointer-events-none"
                  />

                  {/* Live text annotation overlays */}
                  {activePage.annotations.map((ann) => (
                    <div
                      key={ann.id}
                      style={{
                        left: `${ann.xPct}%`,
                        top: `${ann.yPct}%`,
                        color: ann.colorHex,
                        fontSize: `${Math.max(10, Math.round(ann.fontSize * (zoom / 100) * 0.78))}px`,
                      }}
                      className="absolute font-bold leading-tight pointer-events-none drop-shadow-[0_1px_1px_rgba(255,255,255,0.85)]"
                    >
                      {ann.text}
                    </div>
                  ))}

                  {/* Live watermark overlay */}
                  {watermarkText.trim() && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                      <span className="font-display font-bold uppercase tracking-widest text-slate-600/25 text-3xl sm:text-4xl -rotate-[38deg] whitespace-nowrap">
                        {watermarkText.trim()}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right editor controls */}
            <aside
              aria-label="PDF editing tools"
              className="border-t lg:border-t-0 lg:border-l border-slate-200 p-4 space-y-5 overflow-y-auto max-h-[640px]"
            >
              {/* Text Annotation tool */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                  <Type className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                  Text Annotation
                </div>

                <div>
                  <label htmlFor="pdf-ann-text" className="block text-xs text-slate-600 mb-1">
                    Annotation text
                  </label>
                  <input
                    id="pdf-ann-text"
                    type="text"
                    value={annotationText}
                    onChange={(e) => setAnnotationText(e.target.value)}
                    placeholder="Enter note or stamp..."
                    className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="pdf-ann-size" className="block text-xs text-slate-600 mb-1">
                      Font size
                    </label>
                    <select
                      id="pdf-ann-size"
                      value={annotationSize}
                      onChange={(e) => setAnnotationSize(Number(e.target.value))}
                      className="w-full h-9 px-2 text-xs bg-white border border-slate-300 rounded-md"
                    >
                      <option value={11}>11 pt</option>
                      <option value={14}>14 pt</option>
                      <option value={18}>18 pt</option>
                      <option value={24}>24 pt</option>
                    </select>
                  </div>
                  <div>
                    <span className="block text-xs text-slate-600 mb-1">Color</span>
                    <div className="flex items-center gap-1.5 h-9">
                      {COLOR_SWATCHES.map((swatch) => (
                        <button
                          key={swatch.hex}
                          type="button"
                          onClick={() => setAnnotationColor(swatch.hex)}
                          aria-label={`Select ${swatch.label} color`}
                          aria-pressed={annotationColor === swatch.hex}
                          style={{ backgroundColor: swatch.hex }}
                          className={`w-6 h-6 rounded-full border-2 transition-transform ${
                            annotationColor === swatch.hex
                              ? 'border-blue-500 scale-110'
                              : 'border-white ring-1 ring-slate-300'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!annotationText.trim()}
                    onClick={() => setPlaceMode((m) => !m)}
                    className={`flex-1 h-8 px-2.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                      placeMode
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    {placeMode ? 'Click Page to Stamp...' : 'Click to Place'}
                  </button>
                  <button
                    type="button"
                    disabled={!annotationText.trim()}
                    onClick={() => addAnnotationToActivePage(12, 14)}
                    className="h-8 px-2.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-45 whitespace-nowrap"
                  >
                    Add Top
                  </button>
                </div>

                {activePage && activePage.annotations.length > 0 && (
                  <div className="pt-2 space-y-1.5">
                    <p className="text-[11px] font-medium text-slate-500">
                      On Page {activePageIndex + 1} ({activePage.annotations.length})
                    </p>
                    {activePage.annotations.map((ann) => (
                      <div
                        key={ann.id}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-slate-50 border border-slate-200 text-xs"
                      >
                        <span className="truncate text-slate-800">{ann.text}</span>
                        <button
                          type="button"
                          onClick={() => removeAnnotation(activePage.id, ann.id)}
                          aria-label={`Remove annotation ${ann.text}`}
                          className="text-slate-400 hover:text-red-600 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Watermark */}
              <div className="pt-4 border-t border-slate-200 space-y-2">
                <label htmlFor="pdf-watermark" className="block text-xs font-semibold text-slate-900">
                  Document Watermark
                </label>
                <input
                  id="pdf-watermark"
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  placeholder="e.g. CONFIDENTIAL or DRAFT"
                  className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <p className="text-[11px] text-slate-500">
                  Applied diagonally across every page on export.
                </p>
              </div>

              {/* Metadata */}
              <div className="pt-4 border-t border-slate-200 space-y-2.5">
                <p className="text-xs font-semibold text-slate-900">PDF Properties</p>
                <div>
                  <label htmlFor="pdf-meta-title" className="block text-xs text-slate-600 mb-1">
                    Document title
                  </label>
                  <input
                    id="pdf-meta-title"
                    type="text"
                    value={metaTitle}
                    onChange={(e) => setMetaTitle(e.target.value)}
                    className="w-full h-8 px-2.5 text-xs bg-white border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="pdf-meta-author" className="block text-xs text-slate-600 mb-1">
                    Author
                  </label>
                  <input
                    id="pdf-meta-author"
                    type="text"
                    value={metaAuthor}
                    onChange={(e) => setMetaAuthor(e.target.value)}
                    className="w-full h-8 px-2.5 text-xs bg-white border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleResetEdits}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  Reset all page edits
                </button>
              </div>
            </aside>
          </div>
        </div>
      )}
    </section>
  );
}
