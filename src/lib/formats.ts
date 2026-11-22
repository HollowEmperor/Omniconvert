export type MediaCategory = 'pdf' | 'image' | 'video' | 'audio' | '3d' | 'document' | 'data';

export type FormatEcosystem = 'adobe' | 'autodesk' | 'rhino';

export interface FormatSpec {
  ext: string;
  label: string;
  category: MediaCategory;
  ecosystem?: FormatEcosystem;
  mimeTypes: string[];
  description: string;
  canBeInput: boolean;
  canBeOutput: boolean;
}

export interface ConversionOptions {
  // Image
  imageQuality?: number; // 10 - 100
  imageMaxWidth?: number; // 0 = original
  grayscale?: boolean;
  // PDF
  pdfDpi?: number; // 72, 150, 300
  pdfPageMode?: 'all' | 'first';
  slideDuration?: number; // seconds per page when PDF/Image -> Video
  // Video
  videoResolution?: 'original' | '1080p' | '720p' | '480p';
  videoFps?: 'original' | '30' | '24' | '15';
  videoPreset?: 'high' | 'balanced' | 'compact';
  muteAudio?: boolean;
  frameTimestamp?: number; // seconds for Video -> Image
  // Audio
  audioBitrate?: '320k' | '192k' | '128k' | '96k';
  audioSampleRate?: 'original' | '48000' | '44100' | '22050';
  audioChannels?: 'original' | '2' | '1';
  // 3D Models
  modelScale?: number; // 1, 0.01, 0.001, 10, 100
  modelCenter?: boolean;
  modelRecomputeNormals?: boolean;
  modelAxisSwap?: 'none' | 'z-to-y' | 'y-to-z';
  modelBinaryOutput?: boolean; // binary vs ASCII for STL/PLY
  // Document / Data
  prettyPrint?: boolean;
  pdfPageSize?: 'letter' | 'a4';
}

export const DEFAULT_OPTIONS: ConversionOptions = {
  imageQuality: 88,
  imageMaxWidth: 0,
  grayscale: false,
  pdfDpi: 150,
  pdfPageMode: 'all',
  slideDuration: 3,
  videoResolution: 'original',
  videoFps: 'original',
  videoPreset: 'balanced',
  muteAudio: false,
  frameTimestamp: 0.5,
  audioBitrate: '192k',
  audioSampleRate: 'original',
  audioChannels: 'original',
  modelScale: 1,
  modelCenter: false,
  modelRecomputeNormals: false,
  modelAxisSwap: 'none',
  modelBinaryOutput: true,
  prettyPrint: true,
  pdfPageSize: 'letter',
};

export const CATEGORY_LABELS: Record<MediaCategory, string> = {
  pdf: 'PDF',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  '3d': '3D Model',
  document: 'Document',
  data: 'Data',
};

export const ECOSYSTEM_LABELS: Record<FormatEcosystem, string> = {
  adobe: 'Adobe',
  autodesk: 'Autodesk',
  rhino: 'Rhino 3D',
};

export const FORMAT_SPECS: FormatSpec[] = [
  // PDF & Adobe Vector/Print
  {
    ext: 'pdf',
    label: 'PDF',
    category: 'pdf',
    mimeTypes: ['application/pdf'],
    description: 'Portable Document Format',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'ai',
    label: 'AI',
    category: 'pdf',
    ecosystem: 'adobe',
    mimeTypes: ['application/illustrator', 'application/postscript'],
    description: 'Adobe Illustrator vector artwork',
    canBeInput: true,
    canBeOutput: false,
  },
  {
    ext: 'eps',
    label: 'EPS',
    category: 'pdf',
    ecosystem: 'adobe',
    mimeTypes: ['application/postscript', 'image/x-eps'],
    description: 'Adobe Encapsulated PostScript vector print',
    canBeInput: true,
    canBeOutput: true,
  },
  // Images
  {
    ext: 'png',
    label: 'PNG',
    category: 'image',
    mimeTypes: ['image/png'],
    description: 'Lossless raster graphics',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'jpg',
    label: 'JPG',
    category: 'image',
    mimeTypes: ['image/jpeg', 'image/jpg'],
    description: 'Compressed photographic image',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'webp',
    label: 'WEBP',
    category: 'image',
    mimeTypes: ['image/webp'],
    description: 'Modern web raster format',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'gif',
    label: 'GIF',
    category: 'image',
    mimeTypes: ['image/gif'],
    description: 'Animated or indexed raster image',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'bmp',
    label: 'BMP',
    category: 'image',
    mimeTypes: ['image/bmp', 'image/x-ms-bmp'],
    description: 'Uncompressed bitmap image',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'tiff',
    label: 'TIFF',
    category: 'image',
    mimeTypes: ['image/tiff'],
    description: 'Archival print-grade image',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'ico',
    label: 'ICO',
    category: 'image',
    mimeTypes: ['image/x-icon', 'image/vnd.microsoft.icon'],
    description: 'Desktop and browser favicon icon',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'svg',
    label: 'SVG',
    category: 'image',
    mimeTypes: ['image/svg+xml'],
    description: 'Scalable vector graphics',
    canBeInput: true,
    canBeOutput: false,
  },
  {
    ext: 'psd',
    label: 'PSD',
    category: 'image',
    ecosystem: 'adobe',
    mimeTypes: ['image/vnd.adobe.photoshop', 'application/x-photoshop'],
    description: 'Adobe Photoshop layered raster document',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'psb',
    label: 'PSB',
    category: 'image',
    ecosystem: 'adobe',
    mimeTypes: ['image/vnd.adobe.photoshop'],
    description: 'Adobe Photoshop Large Document format',
    canBeInput: true,
    canBeOutput: false,
  },
  {
    ext: 'dng',
    label: 'DNG',
    category: 'image',
    ecosystem: 'adobe',
    mimeTypes: ['image/x-adobe-dng', 'image/dng'],
    description: 'Adobe Digital Negative camera RAW',
    canBeInput: true,
    canBeOutput: false,
  },
  // Video
  {
    ext: 'mp4',
    label: 'MP4',
    category: 'video',
    mimeTypes: ['video/mp4'],
    description: 'H.264 universal video container',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'webm',
    label: 'WEBM',
    category: 'video',
    mimeTypes: ['video/webm'],
    description: 'Open web video container (VP8/VP9)',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'mov',
    label: 'MOV',
    category: 'video',
    mimeTypes: ['video/quicktime'],
    description: 'Apple QuickTime video container',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'mkv',
    label: 'MKV',
    category: 'video',
    mimeTypes: ['video/x-matroska'],
    description: 'Matroska multimedia container',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'avi',
    label: 'AVI',
    category: 'video',
    mimeTypes: ['video/x-msvideo'],
    description: 'Legacy Audio Video Interleave',
    canBeInput: true,
    canBeOutput: true,
  },
  // Audio
  {
    ext: 'mp3',
    label: 'MP3',
    category: 'audio',
    mimeTypes: ['audio/mpeg', 'audio/mp3'],
    description: 'Universal compressed audio',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'wav',
    label: 'WAV',
    category: 'audio',
    mimeTypes: ['audio/wav', 'audio/x-wav', 'audio/wave'],
    description: 'Uncompressed PCM studio audio',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'flac',
    label: 'FLAC',
    category: 'audio',
    mimeTypes: ['audio/flac', 'audio/x-flac'],
    description: 'Lossless archival audio',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'ogg',
    label: 'OGG',
    category: 'audio',
    mimeTypes: ['audio/ogg'],
    description: 'Ogg Vorbis open audio',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'm4a',
    label: 'M4A',
    category: 'audio',
    mimeTypes: ['audio/mp4', 'audio/x-m4a', 'audio/aac'],
    description: 'AAC compressed audio container',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'opus',
    label: 'OPUS',
    category: 'audio',
    mimeTypes: ['audio/opus'],
    description: 'Low-latency high-efficiency audio',
    canBeInput: true,
    canBeOutput: true,
  },
  // 3D Models
  {
    ext: 'glb',
    label: 'GLB',
    category: '3d',
    mimeTypes: ['model/gltf-binary'],
    description: 'Binary glTF 2.0 web & studio 3D model',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'gltf',
    label: 'GLTF',
    category: '3d',
    mimeTypes: ['model/gltf+json'],
    description: 'JSON glTF 2.0 3D scene exchange',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'obj',
    label: 'OBJ',
    category: '3d',
    mimeTypes: ['model/obj', 'text/plain'],
    description: 'Wavefront OBJ polygon geometry',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'stl',
    label: 'STL',
    category: '3d',
    mimeTypes: ['model/stl', 'application/sla', 'application/vnd.ms-pki.stl'],
    description: '3D printing & CAD triangle mesh',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'ply',
    label: 'PLY',
    category: '3d',
    mimeTypes: ['model/ply', 'application/x-ply'],
    description: 'Polygon File Format & 3D scan mesh',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'usdz',
    label: 'USDZ',
    category: '3d',
    mimeTypes: ['model/vnd.usdz+zip'],
    description: 'Apple AR Quick Look 3D package',
    canBeInput: false,
    canBeOutput: true,
  },
  {
    ext: 'fbx',
    label: 'FBX',
    category: '3d',
    ecosystem: 'autodesk',
    mimeTypes: ['application/octet-stream'],
    description: 'Autodesk Filmbox 3D interchange',
    canBeInput: true,
    canBeOutput: false,
  },
  {
    ext: 'dxf',
    label: 'DXF',
    category: '3d',
    ecosystem: 'autodesk',
    mimeTypes: ['image/vnd.dxf', 'application/dxf', 'text/plain'],
    description: 'Autodesk AutoCAD 2D/3D Drawing Exchange',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: '3ds',
    label: '3DS',
    category: '3d',
    ecosystem: 'autodesk',
    mimeTypes: ['image/x-3ds', 'application/x-3ds'],
    description: 'Autodesk 3ds Max legacy binary mesh',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: '3dm',
    label: '3DM',
    category: '3d',
    ecosystem: 'rhino',
    mimeTypes: ['model/vnd.rhino', 'application/octet-stream'],
    description: 'Rhinoceros 3D native OpenNURBS model',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'dae',
    label: 'DAE',
    category: '3d',
    mimeTypes: ['model/vnd.collada+xml'],
    description: 'COLLADA XML 3D asset exchange',
    canBeInput: true,
    canBeOutput: false,
  },
  {
    ext: '3mf',
    label: '3MF',
    category: '3d',
    mimeTypes: ['model/3mf'],
    description: '3D Manufacturing Format archive',
    canBeInput: true,
    canBeOutput: false,
  },
  {
    ext: 'off',
    label: 'OFF',
    category: '3d',
    mimeTypes: ['model/off'],
    description: 'Object File Format polygon mesh',
    canBeInput: true,
    canBeOutput: true,
  },
  // Document
  {
    ext: 'txt',
    label: 'TXT',
    category: 'document',
    mimeTypes: ['text/plain'],
    description: 'Plain UTF-8 text document',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'md',
    label: 'MD',
    category: 'document',
    mimeTypes: ['text/markdown', 'text/x-markdown'],
    description: 'Markdown formatted text',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'html',
    label: 'HTML',
    category: 'document',
    mimeTypes: ['text/html'],
    description: 'HyperText Markup document',
    canBeInput: true,
    canBeOutput: true,
  },
  // Structured Data
  {
    ext: 'csv',
    label: 'CSV',
    category: 'data',
    mimeTypes: ['text/csv', 'application/csv'],
    description: 'Comma-separated tabular values',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'json',
    label: 'JSON',
    category: 'data',
    mimeTypes: ['application/json'],
    description: 'JavaScript Object Notation',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'yaml',
    label: 'YAML',
    category: 'data',
    mimeTypes: ['application/x-yaml', 'text/yaml', 'text/x-yaml'],
    description: 'Human-readable configuration data',
    canBeInput: true,
    canBeOutput: true,
  },
  {
    ext: 'xml',
    label: 'XML',
    category: 'data',
    mimeTypes: ['application/xml', 'text/xml'],
    description: 'Extensible Markup Language data',
    canBeInput: true,
    canBeOutput: true,
  },
];

const FORMAT_MAP = new Map<string, FormatSpec>(FORMAT_SPECS.map((f) => [f.ext, f]));

const EXT_ALIASES: Record<string, string> = {
  jpeg: 'jpg',
  jpe: 'jpg',
  tif: 'tiff',
  yml: 'yaml',
  htm: 'html',
  markdown: 'md',
  aac: 'm4a',
  oga: 'ogg',
  m4v: 'mp4',
  mpeg: 'mp4',
  mpg: 'mp4',
};

export function normalizeExtension(rawExt: string): string {
  const cleaned = rawExt.toLowerCase().replace(/^\./, '').trim();
  return EXT_ALIASES[cleaned] ?? cleaned;
}

export function detectFormat(fileName: string, mimeType?: string): FormatSpec | null {
  const dotIdx = fileName.lastIndexOf('.');
  if (dotIdx >= 0 && dotIdx < fileName.length - 1) {
    const ext = normalizeExtension(fileName.slice(dotIdx + 1));
    const found = FORMAT_MAP.get(ext);
    if (found && found.canBeInput) return found;
  }

  if (mimeType) {
    const normalizedMime = mimeType.toLowerCase().split(';')[0].trim();
    if (normalizedMime !== 'application/octet-stream' && normalizedMime !== 'text/plain') {
      const byMime = FORMAT_SPECS.find(
        (spec) => spec.canBeInput && spec.mimeTypes.includes(normalizedMime)
      );
      if (byMime) return byMime;
    } else if (normalizedMime === 'text/plain') {
      return FORMAT_MAP.get('txt') ?? null;
    }
  }

  return null;
}

export function getFormatSpec(ext: string): FormatSpec | undefined {
  return FORMAT_MAP.get(normalizeExtension(ext));
}

/**
 * Universal conversion matrix: maps every source category to all valid output extensions,
 * including cross-media paths and 3D model pipelines.
 */
export const CATEGORY_TARGETS: Record<MediaCategory, string[]> = {
  pdf: ['png', 'jpg', 'webp', 'pdf', 'eps', 'psd', 'mp4', 'gif', 'txt'],
  image: ['png', 'jpg', 'webp', 'gif', 'bmp', 'tiff', 'ico', 'psd', 'eps', 'pdf', 'mp4'],
  video: ['mp4', 'webm', 'mov', 'mkv', 'avi', 'gif', 'mp3', 'wav', 'flac', 'ogg', 'm4a', 'opus', 'png', 'jpg', 'webp', 'pdf'],
  audio: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'opus', 'mp4', 'webm', 'png', 'jpg'],
  '3d': ['glb', 'gltf', 'obj', 'stl', 'ply', '3dm', 'dxf', '3ds', 'usdz', 'off', 'png', 'jpg', 'json'],
  document: ['pdf', 'html', 'txt', 'md', 'png', 'jpg'],
  data: ['json', 'csv', 'yaml', 'xml', 'html', 'txt', 'pdf'],
};

export function getTargetFormatsForSource(sourceExt: string): FormatSpec[] {
  const source = getFormatSpec(sourceExt);
  if (!source) return [];

  const targetExts = CATEGORY_TARGETS[source.category] ?? [];
  return targetExts
    .filter((ext) => ext !== source.ext)
    .map((ext) => FORMAT_MAP.get(ext))
    .filter((spec): spec is FormatSpec => Boolean(spec && spec.canBeOutput));
}

export function getDefaultTargetForSource(sourceExt: string): string {
  const source = getFormatSpec(sourceExt);
  if (!source) return 'pdf';

  switch (source.category) {
    case 'pdf':
      return 'png';
    case 'image':
      return source.ext === 'png' ? 'webp' : 'png';
    case 'video':
      return source.ext === 'mp4' ? 'mp3' : 'mp4';
    case 'audio':
      return source.ext === 'mp3' ? 'wav' : 'mp3';
    case '3d':
      return source.ext === 'glb' ? 'stl' : 'glb';
    case 'document':
      return 'pdf';
    case 'data':
      return source.ext === 'json' ? 'csv' : 'json';
  }
}

export function isConversionSupported(sourceExt: string, targetExt: string): boolean {
  const normSource = normalizeExtension(sourceExt);
  const normTarget = normalizeExtension(targetExt);
  if (normSource === normTarget) return false;
  return getTargetFormatsForSource(normSource).some((f) => f.ext === normTarget);
}

export function groupFormatsByCategory(
  formats: FormatSpec[]
): Array<{ category: MediaCategory; label: string; formats: FormatSpec[] }> {
  const order: MediaCategory[] = ['3d', 'image', 'pdf', 'video', 'audio', 'document', 'data'];
  const groups: Array<{ category: MediaCategory; label: string; formats: FormatSpec[] }> = [];

  for (const cat of order) {
    const items = formats.filter((f) => f.category === cat);
    if (items.length > 0) {
      groups.push({ category: cat, label: CATEGORY_LABELS[cat], formats: items });
    }
  }
  return groups;
}

export function buildOutputFilename(inputName: string, targetExt: string, isArchive = false): string {
  const trimmed = inputName.trim() || 'converted';
  const dotIdx = trimmed.lastIndexOf('.');
  const base = dotIdx > 0 ? trimmed.slice(0, dotIdx) : trimmed;
  const safeBase = base.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'converted';
  const normTarget = normalizeExtension(targetExt);
  if (isArchive) {
    return `${safeBase}_${normTarget}_pages.zip`;
  }
  return `${safeBase}.${normTarget}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIdx]}`;
}

export function formatSizeDelta(inputBytes: number, outputBytes: number): string {
  if (!inputBytes || !Number.isFinite(inputBytes) || !Number.isFinite(outputBytes)) {
    return '0%';
  }
  const pct = ((outputBytes - inputBytes) / inputBytes) * 100;
  const rounded = Math.abs(pct) >= 10 ? Math.round(pct) : Number(pct.toFixed(1));
  if (rounded > 0) return `+${rounded}%`;
  if (rounded < 0) return `${rounded}%`;
  return '0%';
}

export interface SampleFileDescriptor {
  id: string;
  name: string;
  label: string;
  ext: string;
  category: MediaCategory;
  description: string;
  recommendedTarget: string;
}

export const SAMPLE_FILES: SampleFileDescriptor[] = [
  {
    id: 'quarterly-brief',
    name: 'quarterly-brief.pdf',
    label: 'Quarterly Brief',
    ext: 'pdf',
    category: 'pdf',
    description: '2-page formatted PDF report',
    recommendedTarget: 'png',
  },
  {
    id: 'studio-prism',
    name: 'studio-prism.png',
    label: 'Studio Prism',
    ext: 'png',
    category: 'image',
    description: 'High-res geometric artwork',
    recommendedTarget: 'pdf',
  },
  {
    id: 'kinetic-loop',
    name: 'kinetic-loop.mp4',
    label: 'Kinetic Loop',
    ext: 'mp4',
    category: 'video',
    description: '2.5s H.264 clip with audio',
    recommendedTarget: 'mp3',
  },
  {
    id: 'chord-progression',
    name: 'chord-progression.wav',
    label: 'Chord Progression',
    ext: 'wav',
    category: 'audio',
    description: '3s uncompressed PCM audio',
    recommendedTarget: 'mp4',
  },
  {
    id: 'orbital-hub',
    name: 'orbital-hub.obj',
    label: 'Orbital Hub',
    ext: 'obj',
    category: '3d',
    description: 'Multi-part mechanical 3D mesh',
    recommendedTarget: 'glb',
  },
  {
    id: 'cad-bracket',
    name: 'cad-bracket.dxf',
    label: 'CAD Bracket',
    ext: 'dxf',
    category: '3d',
    description: 'Autodesk AutoCAD 3D L-bracket',
    recommendedTarget: 'glb',
  },
  {
    id: 'rhino-shell',
    name: 'rhino-shell.3dm',
    label: 'Rhino Pavilion',
    ext: '3dm',
    category: '3d',
    description: 'Rhino 3D OpenNURBS shell canopy',
    recommendedTarget: 'stl',
  },
  {
    id: 'vector-poster',
    name: 'vector-poster.eps',
    label: 'Vector Poster',
    ext: 'eps',
    category: 'pdf',
    description: 'Adobe EPS vector print layout',
    recommendedTarget: 'png',
  },
  {
    id: 'metrics-dataset',
    name: 'metrics-dataset.csv',
    label: 'Metrics Dataset',
    ext: 'csv',
    category: 'data',
    description: 'Structured tabular metrics',
    recommendedTarget: 'json',
  },
];

export const ACCEPT_ATTRIBUTE = FORMAT_SPECS.filter((f) => f.canBeInput)
  .flatMap((f) => [`.${f.ext}`, ...f.mimeTypes])
  .concat(['.jpeg', '.tif', '.yml', '.htm', '.aac'])
  .join(',');
