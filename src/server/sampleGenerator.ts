import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { generateSampleCadBracketDxf } from '../lib/dxfCore';
import { generateSampleOrbitalHubObj } from '../lib/meshCore';
import { generateSampleRhinoShell3dm } from '../lib/rhinoCore';

const execFileAsync = promisify(execFile);

const SAMPLE_CACHE_DIR = path.join(os.tmpdir(), 'transmute-samples-v2');

export interface GeneratedSample {
  path: string;
  filename: string;
  mimeType: string;
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(SAMPLE_CACHE_DIR, { recursive: true });
}

async function generateSamplePdf(filePath: string): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const mono = await pdfDoc.embedFont(StandardFonts.Courier);

  // Page 1
  const p1 = pdfDoc.addPage([612, 792]);
  p1.drawRectangle({ x: 0, y: 690, width: 612, height: 102, color: rgb(0.06, 0.09, 0.16) });
  p1.drawText('QUARTERLY OPERATIONS BRIEF', { x: 48, y: 744, size: 19, font: bold, color: rgb(1, 1, 1) });
  p1.drawText('Document Reference: Q4-2026  |  Prepared for Distribution', {
    x: 48,
    y: 716,
    size: 10,
    font: mono,
    color: rgb(0.58, 0.72, 0.96),
  });

  const bodyLines = [
    'Executive Summary',
    'Media pipelines across design, engineering, and editorial teams require predictable,',
    'lossless format interoperability. During Q4, unified batch transcoding reduced manual',
    'asset preparation turnaround by 62% across archival PDF, raster image, and video workflows.',
    '',
    'Key Throughput Benchmarks',
    '  - Document Rasterization (300 DPI): 1,420 pages / hour',
    '  - Image Optimization (PNG to WEBP): -68.4% median payload reduction',
    '  - Audio Extraction (MP4 to 192k MP3): 48x real-time average speed',
    '  - Structured Data Interchange (CSV / JSON / YAML / XML): 100% schema fidelity',
  ];

  let y = 640;
  bodyLines.forEach((line, idx) => {
    const isHeading = idx === 0 || idx === 5;
    p1.drawText(line, {
      x: 48,
      y,
      size: isHeading ? 13 : 10.5,
      font: isHeading ? bold : regular,
      color: isHeading ? rgb(0.06, 0.09, 0.16) : rgb(0.2, 0.25, 0.33),
    });
    y -= isHeading ? 24 : 18;
  });

  // Visual bar chart graphic on Page 1
  p1.drawRectangle({ x: 48, y: 240, width: 516, height: 160, color: rgb(0.97, 0.98, 0.99), borderColor: rgb(0.88, 0.91, 0.94), borderWidth: 1 });
  p1.drawText('Conversion Volume by Media Class', { x: 64, y: 374, size: 11, font: bold, color: rgb(0.06, 0.09, 0.16) });
  const bars = [
    { label: 'PDF', pct: 0.85, color: rgb(0.15, 0.39, 0.92) },
    { label: 'IMG', pct: 0.94, color: rgb(0.09, 0.64, 0.45) },
    { label: 'VID', pct: 0.68, color: rgb(0.85, 0.47, 0.02) },
    { label: 'AUD', pct: 0.56, color: rgb(0.39, 0.45, 0.55) },
  ];
  bars.forEach((b, i) => {
    const by = 336 - i * 24;
    p1.drawText(b.label, { x: 64, y: by + 3, size: 9, font: mono, color: rgb(0.28, 0.33, 0.41) });
    p1.drawRectangle({ x: 104, y: by, width: Math.round(390 * b.pct), height: 13, color: b.color });
  });

  p1.drawText('Page 1 of 2', { x: 500, y: 36, size: 9, font: mono, color: rgb(0.45, 0.5, 0.58) });

  // Page 2
  const p2 = pdfDoc.addPage([612, 792]);
  p2.drawText('APPENDIX: SUPPORTED INTERCHANGE MATRIX', { x: 48, y: 736, size: 15, font: bold, color: rgb(0.06, 0.09, 0.16) });
  p2.drawLine({ start: { x: 48, y: 724 }, end: { x: 564, y: 724 }, thickness: 1, color: rgb(0.85, 0.88, 0.92) });

  const appendix = [
    '1. PDF Documents -> PNG, JPG, WEBP (per-page or ZIP archive), MP4/GIF slideshow, Plain Text',
    '2. Raster & Vector Images -> PNG, JPG, WEBP, GIF, BMP, TIFF, ICO, PDF, MP4 clip',
    '3. Video Containers -> MP4, WEBM, MOV, MKV, AVI, GIF, MP3/WAV/FLAC audio, Keyframe PNG/PDF',
    '4. Audio Recordings -> MP3, WAV, FLAC, OGG, M4A, OPUS, Waveform Video (MP4/WEBM) & Image',
    '5. Documents & Data -> CSV, JSON, YAML, XML, HTML Table, Markdown, PDF',
  ];
  let y2 = 684;
  for (const row of appendix) {
    p2.drawText(row, { x: 48, y: y2, size: 10.5, font: regular, color: rgb(0.2, 0.25, 0.33) });
    y2 -= 28;
  }
  p2.drawText('Page 2 of 2', { x: 500, y: 36, size: 9, font: mono, color: rgb(0.45, 0.5, 0.58) });

  await fs.writeFile(filePath, await pdfDoc.save());
}

async function generateSampleImage(filePath: string): Promise<void> {
  // Crisp geometric architectural PNG generated via ImageMagick
  await execFileAsync('convert', [
    '-size',
    '1200x800',
    'xc:#0f172a',
    '-fill',
    '#1e293b',
    '-draw',
    'rectangle 60,60 1140,740',
    '-fill',
    '#2563eb',
    '-draw',
    'polygon 240,620 560,180 880,620',
    '-fill',
    '#60a5fa',
    '-draw',
    'polygon 560,180 880,620 960,440',
    '-fill',
    '#f8fafc',
    '-draw',
    'circle 560,420 560,490',
    '-fill',
    '#0f172a',
    '-draw',
    'circle 560,420 560,452',
    filePath,
  ]);
}

async function generateSampleVideo(filePath: string): Promise<void> {
  // Real 2.5s H.264 MP4 with testsrc2 visual motion and 440Hz/554Hz harmonic audio
  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=960x540:rate=24:duration=2.5',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=2.5',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    filePath,
  ]);
}

async function generateSampleAudio(filePath: string): Promise<void> {
  // Real 3s stereo harmonic chord WAV audio
  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'aevalsrc=0.25*sin(2*PI*261.63*t)+0.22*sin(2*PI*329.63*t)+0.22*sin(2*PI*392.00*t)+0.15*sin(2*PI*523.25*t):s=44100:d=3',
    '-c:a',
    'pcm_s16le',
    filePath,
  ]);
}

async function generateSampleCsv(filePath: string): Promise<void> {
  const csv = [
    'asset_id,format,category,original_kb,converted_kb,compression_pct,verified',
    'DOC-101,PDF,Document,482.5,146.2,-69.7,true',
    'IMG-204,PNG,Image,1240.0,312.4,-74.8,true',
    'VID-309,MP4,Video,18420.0,4910.5,-73.3,true',
    'AUD-412,WAV,Audio,9620.0,1180.0,-87.7,true',
    'DAT-518,CSV,Data,42.8,51.2,19.6,true',
  ].join('\n');
  await fs.writeFile(filePath, csv, 'utf-8');
}

async function generateSample3dObj(filePath: string): Promise<void> {
  const objContent = generateSampleOrbitalHubObj();
  await fs.writeFile(filePath, objContent, 'utf-8');
}

async function generateSampleCadDxf(filePath: string): Promise<void> {
  const dxfContent = generateSampleCadBracketDxf();
  await fs.writeFile(filePath, dxfContent, 'utf-8');
}

async function generateSampleRhino3dm(filePath: string): Promise<void> {
  const bytes = await generateSampleRhinoShell3dm();
  await fs.writeFile(filePath, bytes);
}

async function generateSampleAdobeEps(filePath: string): Promise<void> {
  const eps = [
    '%!PS-Adobe-3.0 EPSF-3.0',
    '%%BoundingBox: 0 0 600 420',
    '%%Title: Transmute Architectural Vector Poster',
    '%%Creator: Transmute Sample Generator',
    '%%EndComments',
    '0.06 0.09 0.16 setrgbcolor',
    '0 0 600 420 rectfill',
    '0.12 0.16 0.23 setrgbcolor',
    '24 24 552 372 rectfill',
    '0.15 0.39 0.92 setrgbcolor',
    'newpath 80 80 moveto 300 350 lineto 520 80 lineto closepath fill',
    '0.38 0.65 0.98 setrgbcolor',
    'newpath 300 350 moveto 520 80 lineto 540 220 lineto closepath fill',
    '0.97 0.98 0.99 setrgbcolor',
    'newpath 300 185 52 0 360 arc fill',
    '0.06 0.09 0.16 setrgbcolor',
    'newpath 300 185 26 0 360 arc fill',
    '0.95 0.97 1.0 setrgbcolor',
    '/Helvetica-Bold findfont 22 scalefont setfont',
    '48 352 moveto (ADOBE EPS VECTOR SPEC) show',
    '/Courier findfont 11 scalefont setfont',
    '48 330 moveto (POSTSCRIPT LEVEL 3  |  600 x 420 PT) show',
    'showpage',
    '%%EOF',
  ].join('\n');
  await fs.writeFile(filePath, `${eps}\n`, 'utf-8');
}

export async function getOrCreateSampleFile(sampleId: string): Promise<GeneratedSample> {
  await ensureDir();

  const definitions: Record<
    string,
    { filename: string; mimeType: string; build: (target: string) => Promise<void> }
  > = {
    'quarterly-brief': {
      filename: 'quarterly-brief.pdf',
      mimeType: 'application/pdf',
      build: generateSamplePdf,
    },
    'studio-prism': {
      filename: 'studio-prism.png',
      mimeType: 'image/png',
      build: generateSampleImage,
    },
    'kinetic-loop': {
      filename: 'kinetic-loop.mp4',
      mimeType: 'video/mp4',
      build: generateSampleVideo,
    },
    'chord-progression': {
      filename: 'chord-progression.wav',
      mimeType: 'audio/wav',
      build: generateSampleAudio,
    },
    'orbital-hub': {
      filename: 'orbital-hub.obj',
      mimeType: 'model/obj',
      build: generateSample3dObj,
    },
    'cad-bracket': {
      filename: 'cad-bracket.dxf',
      mimeType: 'image/vnd.dxf',
      build: generateSampleCadDxf,
    },
    'rhino-shell': {
      filename: 'rhino-shell.3dm',
      mimeType: 'model/vnd.rhino',
      build: generateSampleRhino3dm,
    },
    'vector-poster': {
      filename: 'vector-poster.eps',
      mimeType: 'application/postscript',
      build: generateSampleAdobeEps,
    },
    'metrics-dataset': {
      filename: 'metrics-dataset.csv',
      mimeType: 'text/csv',
      build: generateSampleCsv,
    },
  };

  const def = definitions[sampleId];
  if (!def) {
    throw new Error(`Unknown sample id: ${sampleId}`);
  }

  const targetPath = path.join(SAMPLE_CACHE_DIR, def.filename);
  try {
    await fs.access(targetPath);
  } catch {
    await def.build(targetPath);
  }

  return {
    path: targetPath,
    filename: def.filename,
    mimeType: def.mimeType,
  };
}
