import {
  ArrowLeftRight,
  Box,
  Clock,
  FileAudio,
  FileCode2,
  FileImage,
  FilePenLine,
  FileText,
  FileVideo,
  Grid2x2,
  X,
} from 'lucide-react';
import { FORMAT_SPECS, MediaCategory, SAMPLE_FILES, SampleFileDescriptor } from '../lib/formats';
import { WorkspaceView } from '../types/converter';

interface SidebarProps {
  activeView: WorkspaceView;
  onSelectView: (view: WorkspaceView) => void;
  queueCount: number;
  historyCount: number;
  loadingSampleId: string | null;
  onLoadSample: (sample: SampleFileDescriptor) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function CategoryIcon({
  category,
  className = 'w-4 h-4',
}: {
  category: MediaCategory;
  className?: string;
}) {
  switch (category) {
    case 'pdf':
    case 'document':
      return <FileText className={className} aria-hidden="true" />;
    case 'image':
      return <FileImage className={className} aria-hidden="true" />;
    case 'video':
      return <FileVideo className={className} aria-hidden="true" />;
    case 'audio':
      return <FileAudio className={className} aria-hidden="true" />;
    case '3d':
      return <Box className={className} aria-hidden="true" />;
    case 'data':
      return <FileCode2 className={className} aria-hidden="true" />;
  }
}

export function Sidebar({
  activeView,
  onSelectView,
  queueCount,
  historyCount,
  loadingSampleId,
  onLoadSample,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navItems: Array<{
    id: WorkspaceView;
    label: string;
    count?: number;
    icon: typeof ArrowLeftRight;
  }> = [
    { id: 'converter', label: 'Converter', count: queueCount > 0 ? queueCount : undefined, icon: ArrowLeftRight },
    { id: 'viewer3d', label: '3D Viewer', icon: Box },
    { id: 'pdfEditor', label: 'PDF Editor', icon: FilePenLine },
    { id: 'matrix', label: 'Format Matrix', icon: Grid2x2 },
    { id: 'history', label: 'History', count: historyCount > 0 ? historyCount : undefined, icon: Clock },
  ];

  const railContent = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <div className="flex items-center justify-between h-14 px-5 border-b border-slate-200 shrink-0">
        <a
          href="#converter"
          onClick={(e) => {
            e.preventDefault();
            onSelectView('converter');
            onCloseMobile();
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Transmute
        </a>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      <nav aria-label="Workspace navigation" className="px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectView(item.id);
                onCloseMobile();
              }}
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                active
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </span>
              {item.count !== undefined && (
                <span
                  className={`font-mono text-xs tabular-nums ${
                    active ? 'text-slate-300' : 'text-slate-400'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mx-4 border-t border-slate-200" />

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 mb-2 text-xs font-medium text-slate-500">
          Sample Files
        </p>
        <div className="space-y-1">
          {SAMPLE_FILES.map((sample) => {
            const isLoading = loadingSampleId === sample.id;
            return (
              <button
                key={sample.id}
                type="button"
                disabled={isLoading}
                onClick={() => {
                  onLoadSample(sample);
                  onCloseMobile();
                }}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 transition-colors disabled:opacity-50 group"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0 text-sm font-medium text-slate-800 group-hover:text-slate-950">
                    <CategoryIcon category={sample.category} className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate">{sample.label}</span>
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 shrink-0">
                    {isLoading ? '...' : sample.ext.toUpperCase()}
                  </span>
                </div>
                <p className="mt-0.5 pl-6 text-xs text-slate-500 truncate">
                  {sample.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 py-3.5 border-t border-slate-200 text-xs text-slate-500 shrink-0">
        {FORMAT_SPECS.length} formats · Adobe, Autodesk, Rhino, 3D &amp; Media
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {railContent}
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[85vw] h-full shadow-xl">
            {railContent}
          </aside>
        </div>
      )}
    </>
  );
}
