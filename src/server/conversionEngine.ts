import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  ConversionOptions,
  DEFAULT_OPTIONS,
  buildOutputFilename,
  getFormatSpec,
  isConversionSupported,
  normalizeExtension,
} from '../lib/formats';
import { convertDocumentText, convertStructuredData, stripHtmlToText } from './dataConverter';

const execFileAsync = promisify(execFile);

export interface MediaMetadata {
  width?: number;
  height?: number;
  durationSec?: number;
  pageCount?: number;
  codec?: string;
}

export interface ConversionResult {
  outputPath: string;
  outputFilename: string;
  outputMime: string;
  outputSize: number;
  isArchive: boolean;
  previewPath?: string;
  previewMime?: string;
  metadata?: MediaMetadata;
  summaryNote?: string;
}

async function runBin(cmd: string, args: string[], timeoutMs = 0): Promise<{ stdout: string; stderr: string }> {
  try {
    const res = await execFileAsync(cmd, args, {
      timeout: timeoutMs,
      maxBuffer: 100 * 1024 * 1024,
    });
    return { stdout: res.stdout, stderr: res.stderr };
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    const detail = (e.stderr || e.message || 'Unknown conversion error').trim().split('\n').slice(-4).join(' ');
    throw new Error(`${cmd} failed: ${detail}`);
  }
}

export async function probeMedia(filePath: string): Promise<MediaMetadata> {
  try {
    const { stdout } = await runBin(
      'ffprobe',
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      15000
    );
    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }>;
    };
    const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
    const audioStream = parsed.streams?.find((s) => s.codec_type === 'audio');
    const duration = parsed.format?.duration ? Number(parsed.format.duration) : undefined;
    return {
      width: videoStream?.width,
      height: videoStream?.height,
      durationSec: Number.isFinite(duration) ? Number(duration!.toFixed(2)) : undefined,
      codec: videoStream?.codec_name ?? audioStream?.codec_name,
    };
  } catch {
    return {};
  }
}

function getMimeForExt(ext: string): string {
  if (ext === 'zip') return 'application/zip';
  const spec = getFormatSpec(ext);
  return spec?.mimeTypes[0] ?? 'application/octet-stream';
}

function sanitizeWinAnsiText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, ' ');
}

export async function renderTextToPdf(
  text: string,
  outPdfPath: string,
  title: string,
  pageSize: 'letter' | 'a4' = 'letter',
  monospace = false
): Promise<number> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(monospace ? StandardFonts.Courier : StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const dims: [number, number] = pageSize === 'a4' ? [595.28, 841.89] : [612, 792];
  const margin = 48;
  const fontSize = monospace ? 9.5 : 10.5;
  const lineHeight = fontSize * 1.48;
  const maxWidth = dims[0] - margin * 2;

  const cleaned = sanitizeWinAnsiText(text);
  const rawLines = cleaned.split('\n');
  const wrappedLines: string[] = [];

  for (const rawLine of rawLines) {
    if (rawLine.trim() === '') {
      wrappedLines.push('');
      continue;
    }
    const words = rawLine.split(' ');
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        if (current) wrappedLines.push(current);
        // Break overly long single tokens
        if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (font.widthOfTextAtSize(chunk + ch, fontSize) > maxWidth) {
              wrappedLines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    if (current) wrappedLines.push(current);
  }

  let page = pdfDoc.addPage(dims);
  let y = dims[1] - margin;

  // Document header on first page
  page.drawText(sanitizeWinAnsiText(title).slice(0, 72), {
    x: margin,
    y: y - 4,
    size: 14,
    font: boldFont,
    color: rgb(0.06, 0.09, 0.16),
  });
  y -= 24;
  page.drawLine({
    start: { x: margin, y },
    end: { x: dims[0] - margin, y },
    thickness: 0.75,
    color: rgb(0.85, 0.88, 0.92),
  });
  y -= 20;

  for (const line of wrappedLines) {
    if (y < margin + 16) {
      page = pdfDoc.addPage(dims);
      y = dims[1] - margin;
    }
    if (line.length > 0) {
      page.drawText(line, {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0.12, 0.16, 0.23),
      });
    }
    y -= lineHeight;
  }

  const pages = pdfDoc.getPages();
  pages.forEach((p, idx) => {
    const label = `Page ${idx + 1} of ${pages.length}`;
    const w = font.widthOfTextAtSize(label, 8.5);
    p.drawText(label, {
      x: dims[0] - margin - w,
      y: 24,
      size: 8.5,
      font,
      color: rgb(0.45, 0.5, 0.58),
    });
  });

  const pdfBytes = await pdfDoc.save();
  await fs.writeFile(outPdfPath, pdfBytes);
  return pages.length;
}

async function convertImageFile(
  inputPath: string,
  sourceExt: string,
  targetExt: string,
  outputPath: string,
  opts: ConversionOptions
): Promise<void> {
  const quality = Math.min(100, Math.max(10, opts.imageQuality ?? 88));
  const maxWidth = opts.imageMaxWidth && opts.imageMaxWidth > 0 ? Math.round(opts.imageMaxWidth) : 0;

  // Use ffmpeg for webp input or output to guarantee support without relying on IM webp delegate
  if (sourceExt === 'webp' || targetExt === 'webp') {
    let effectiveInput = inputPath;
    // Pre-flatten Adobe PSD/PSB/DNG/SVG via ImageMagick before feeding to ffmpeg for WEBP output
    if (sourceExt === 'psd' || sourceExt === 'psb' || sourceExt === 'dng' || sourceExt === 'svg') {
      const tmpPng = `${outputPath}.pre.png`;
      await convertImageFile(inputPath, sourceExt, 'png', tmpPng, {
        ...opts,
        imageMaxWidth: 0,
        grayscale: false,
      });
      effectiveInput = tmpPng;
    }

    const vfParts: string[] = [];
    if (maxWidth > 0) {
      vfParts.push(`scale='min(${maxWidth},iw)':-1`);
    }
    if (opts.grayscale) {
      vfParts.push('format=gray');
    }
    const args = ['-y', '-i', effectiveInput];
    if (vfParts.length > 0) {
      args.push('-vf', vfParts.join(','));
    }
    if (targetExt === 'webp') {
      args.push('-c:v', 'libwebp', '-quality', String(quality));
    } else if (targetExt === 'jpg') {
      const qscale = Math.max(2, Math.min(31, Math.round(31 - (quality / 100) * 29)));
      args.push('-q:v', String(qscale));
    }
    args.push('-frames:v', '1', outputPath);
    try {
      await runBin('ffmpeg', args);
    } finally {
      if (effectiveInput !== inputPath) {
        await fs.rm(effectiveInput, { force: true }).catch(() => {});
      }
    }
    return;
  }

  // ImageMagick convert for PNG, JPG, GIF, BMP, TIFF, ICO, SVG, PSD, PSB, DNG
  const args: string[] = [];
  if (sourceExt === 'svg') {
    args.push('-background', 'none', '-density', '150');
  }
  // Use flattened composite [0] for multi-layer/frame sources (PSD, PSB, GIF, ICO) unless targeting GIF
  const inputSpecifier =
    targetExt === 'gif' && sourceExt === 'gif'
      ? inputPath
      : sourceExt === 'psd' || sourceExt === 'psb'
        ? `psd:${inputPath}[0]`
        : sourceExt === 'dng'
          ? `dng:${inputPath}`
          : `${inputPath}[0]`;
  args.push(inputSpecifier);

  if (targetExt === 'jpg' || targetExt === 'bmp') {
    args.push('-background', 'white', '-alpha', 'remove', '-alpha', 'off');
  }
  if (opts.grayscale) {
    args.push('-colorspace', 'Gray');
  }
  if (targetExt === 'ico') {
    const size = maxWidth > 0 && maxWidth <= 256 ? maxWidth : 256;
    args.push('-resize', `${size}x${size}>`, '-gravity', 'center', '-background', 'none', '-extent', `${size}x${size}`);
  } else if (maxWidth > 0) {
    args.push('-resize', `${maxWidth}x>`);
  }

  args.push('-strip', '-quality', String(quality), outputPath);
  await runBin('convert', args);
}

async function convertImageToPdf(
  inputPath: string,
  sourceExt: string,
  outputPath: string,
  workDir: string,
  opts: ConversionOptions
): Promise<void> {
  let embedPath = inputPath;
  let embedAs: 'png' | 'jpg' = sourceExt === 'jpg' ? 'jpg' : 'png';

  if ((sourceExt !== 'png' && sourceExt !== 'jpg') || opts.grayscale || (opts.imageMaxWidth && opts.imageMaxWidth > 0)) {
    embedAs = 'png';
    embedPath = path.join(workDir, 'normalized_for_pdf.png');
    await convertImageFile(inputPath, sourceExt, 'png', embedPath, opts);
  }

  const imgBytes = await fs.readFile(embedPath);
  const pdfDoc = await PDFDocument.create();
  const embedded = embedAs === 'jpg' ? await pdfDoc.embedJpg(imgBytes) : await pdfDoc.embedPng(imgBytes);
  const { width, height } = embedded.scale(1);

  const page = pdfDoc.addPage([width, height]);
  page.drawImage(embedded, { x: 0, y: 0, width, height });

  const outBytes = await pdfDoc.save();
  await fs.writeFile(outputPath, outBytes);
}

let cachedGsFontmapDir: string | null = null;

async function ensureGsFontmapDir(): Promise<string> {
  if (cachedGsFontmapDir) return cachedGsFontmapDir;
  const dir = path.join(os.tmpdir(), 'transmute-gs-fontmap');
  await fs.mkdir(dir, { recursive: true });

  const libDir = '/usr/share/fonts/truetype/liberation';
  const sansReg = `${libDir}/LiberationSans-Regular.ttf`;
  const sansBold = `${libDir}/LiberationSans-Bold.ttf`;
  const sansItal = `${libDir}/LiberationSans-Italic.ttf`;
  const sansBI = `${libDir}/LiberationSans-BoldItalic.ttf`;
  const serifReg = `${libDir}/LiberationSerif-Regular.ttf`;
  const serifBold = `${libDir}/LiberationSerif-Bold.ttf`;
  const serifItal = `${libDir}/LiberationSerif-Italic.ttf`;
  const serifBI = `${libDir}/LiberationSerif-BoldItalic.ttf`;
  const monoReg = `${libDir}/LiberationMono-Regular.ttf`;
  const monoBold = `${libDir}/LiberationMono-Bold.ttf`;
  const monoItal = `${libDir}/LiberationMono-Italic.ttf`;
  const monoBI = `${libDir}/LiberationMono-BoldItalic.ttf`;

  const fontmap = [
    `/Helvetica (${sansReg}) ;`,
    `/Helvetica-Bold (${sansBold}) ;`,
    `/Helvetica-Oblique (${sansItal}) ;`,
    `/Helvetica-BoldOblique (${sansBI}) ;`,
    `/NimbusSans-Regular (${sansReg}) ;`,
    `/NimbusSans-Bold (${sansBold}) ;`,
    `/NimbusSans-Italic (${sansItal}) ;`,
    `/NimbusSans-BoldItalic (${sansBI}) ;`,
    `/ArialMT (${sansReg}) ;`,
    `/Arial-BoldMT (${sansBold}) ;`,
    `/Times-Roman (${serifReg}) ;`,
    `/Times-Bold (${serifBold}) ;`,
    `/Times-Italic (${serifItal}) ;`,
    `/Times-BoldItalic (${serifBI}) ;`,
    `/NimbusRoman-Regular (${serifReg}) ;`,
    `/NimbusRoman-Bold (${serifBold}) ;`,
    `/NimbusRoman-Italic (${serifItal}) ;`,
    `/NimbusRoman-BoldItalic (${serifBI}) ;`,
    `/Courier (${monoReg}) ;`,
    `/Courier-Bold (${monoBold}) ;`,
    `/Courier-Oblique (${monoItal}) ;`,
    `/Courier-BoldOblique (${monoBI}) ;`,
    `/NimbusMonoPS-Regular (${monoReg}) ;`,
    `/NimbusMonoPS-Bold (${monoBold}) ;`,
    `/NimbusMonoPS-Italic (${monoItal}) ;`,
    `/NimbusMonoPS-BoldItalic (${monoBI}) ;`,
  ].join('\n');

  await fs.writeFile(path.join(dir, 'Fontmap'), `${fontmap}\n`, 'utf-8');
  cachedGsFontmapDir = dir;
  return dir;
}

async function renderPdfPagesToPng(
  pdfPath: string,
  workDir: string,
  dpi: number,
  firstPageOnly: boolean,
  isEps = false
): Promise<string[]> {
  const fontmapDir = await ensureGsFontmapDir();
  const pattern = path.join(workDir, 'pdf-page-%03d.png');
  const args = [
    '-dSAFER',
    '-dBATCH',
    '-dNOPAUSE',
    `-I${fontmapDir}`,
    ...(isEps ? ['-dEPSCrop'] : []),
    '-sDEVICE=png16m',
    `-r${dpi}`,
    ...(firstPageOnly ? ['-dFirstPage=1', '-dLastPage=1'] : []),
    `-sOutputFile=${pattern}`,
    pdfPath,
  ];
  await runBin('gs', args);

  const entries = await fs.readdir(workDir);
  return entries
    .filter((f) => /^pdf-page-\d+\.png$/.test(f))
    .sort()
    .map((f) => path.join(workDir, f));
}

export async function renderPdfPagesAsDataUrls(
  pdfPath: string,
  dpi = 120
): Promise<{
  pageCount: number;
  pages: Array<{ pageIndex: number; width: number; height: number; imageDataUrl: string }>;
}> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'transmute-pdfview-'));
  try {
    const pngPaths = await renderPdfPagesToPng(pdfPath, workDir, dpi, false, false);
    const pages: Array<{ pageIndex: number; width: number; height: number; imageDataUrl: string }> = [];
    for (let i = 0; i < pngPaths.length; i += 1) {
      const buf = await fs.readFile(pngPaths[i]);
      // PNG IHDR stores width at byte 16..19 and height at byte 20..23 (big-endian)
      const width = buf.length >= 24 ? buf.readUInt32BE(16) : 612;
      const height = buf.length >= 24 ? buf.readUInt32BE(20) : 792;
      pages.push({
        pageIndex: i,
        width,
        height,
        imageDataUrl: `data:image/png;base64,${buf.toString('base64')}`,
      });
    }
    return { pageCount: pages.length, pages };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function buildAudioArgs(targetExt: string, opts: ConversionOptions): string[] {
  const args: string[] = [];
  const bitrate = opts.audioBitrate ?? '192k';

  switch (targetExt) {
    case 'mp3':
      args.push('-c:a', 'libmp3lame', '-b:a', bitrate);
      break;
    case 'wav':
      args.push('-c:a', 'pcm_s16le');
      break;
    case 'flac':
      args.push('-c:a', 'flac');
      break;
    case 'ogg':
      args.push('-c:a', 'libvorbis', '-b:a', bitrate);
      break;
    case 'm4a':
      args.push('-c:a', 'aac', '-b:a', bitrate);
      break;
    case 'opus':
      args.push('-c:a', 'libopus', '-b:a', bitrate);
      break;
  }

  if (opts.audioSampleRate && opts.audioSampleRate !== 'original') {
    args.push('-ar', opts.audioSampleRate);
  }
  if (opts.audioChannels && opts.audioChannels !== 'original') {
    args.push('-ac', opts.audioChannels);
  }

  return args;
}

export async function convertFile(params: {
  inputPath: string;
  originalName: string;
  sourceExt: string;
  targetExt: string;
  options?: ConversionOptions;
  outputDir: string;
}): Promise<ConversionResult> {
  const sourceExt = normalizeExtension(params.sourceExt);
  const targetExt = normalizeExtension(params.targetExt);
  const opts: ConversionOptions = { ...DEFAULT_OPTIONS, ...(params.options ?? {}) };

  if (!isConversionSupported(sourceExt, targetExt)) {
    throw new Error(`Conversion from ${sourceExt.toUpperCase()} to ${targetExt.toUpperCase()} is not supported.`);
  }

  const sourceSpec = getFormatSpec(sourceExt)!;
  const targetSpec = getFormatSpec(targetExt)!;
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'transmute-work-'));

  try {
    // 1. PDF, ADOBE ILLUSTRATOR (.AI), & ADOBE EPS SOURCES
    if (sourceSpec.category === 'pdf') {
      const isEpsSource = sourceExt === 'eps';

      // AI / EPS -> PDF via Ghostscript pdfwrite
      if (targetExt === 'pdf') {
        const outFilename = buildOutputFilename(params.originalName, 'pdf');
        const outPath = path.join(params.outputDir, outFilename);
        const fontmapDir = await ensureGsFontmapDir();
        await runBin('gs', [
          '-dSAFER',
          '-dBATCH',
          '-dNOPAUSE',
          `-I${fontmapDir}`,
          ...(isEpsSource ? ['-dEPSCrop'] : []),
          '-sDEVICE=pdfwrite',
          `-sOutputFile=${outPath}`,
          params.inputPath,
        ]);
        const stat = await fs.stat(outPath);
        return {
          outputPath: outPath,
          outputFilename: outFilename,
          outputMime: 'application/pdf',
          outputSize: stat.size,
          isArchive: false,
          summaryNote: `Vector-converted ${sourceExt.toUpperCase()} to PDF`,
        };
      }

      // PDF / AI -> Adobe EPS via Ghostscript eps2write
      if (targetExt === 'eps') {
        const outFilename = buildOutputFilename(params.originalName, 'eps');
        const outPath = path.join(params.outputDir, outFilename);
        const fontmapDir = await ensureGsFontmapDir();
        await runBin('gs', [
          '-dSAFER',
          '-dBATCH',
          '-dNOPAUSE',
          `-I${fontmapDir}`,
          '-sDEVICE=eps2write',
          '-dFirstPage=1',
          '-dLastPage=1',
          `-sOutputFile=${outPath}`,
          params.inputPath,
        ]);
        const stat = await fs.stat(outPath);
        return {
          outputPath: outPath,
          outputFilename: outFilename,
          outputMime: 'application/postscript',
          outputSize: stat.size,
          isArchive: false,
          summaryNote: 'Exported Page 1 as Adobe EPS vector print',
        };
      }

      if (targetExt === 'txt') {
        const outFilename = buildOutputFilename(params.originalName, 'txt');
        const outPath = path.join(params.outputDir, outFilename);
        const fontmapDir = await ensureGsFontmapDir();
        await runBin('gs', [
          '-dSAFER',
          '-dBATCH',
          '-dNOPAUSE',
          `-I${fontmapDir}`,
          '-sDEVICE=txtwrite',
          `-sOutputFile=${outPath}`,
          params.inputPath,
        ]);
        const stat = await fs.stat(outPath);
        return {
          outputPath: outPath,
          outputFilename: outFilename,
          outputMime: 'text/plain',
          outputSize: stat.size,
          isArchive: false,
          summaryNote: `Extracted plain text from ${sourceExt.toUpperCase()}`,
        };
      }

      const dpi = opts.pdfDpi ?? 150;
      const firstOnly = targetSpec.category === 'image' && opts.pdfPageMode === 'first';
      const pngPages = await renderPdfPagesToPng(
        params.inputPath,
        workDir,
        dpi,
        firstOnly,
        isEpsSource
      );
      if (pngPages.length === 0) {
        throw new Error(`No renderable pages were found in the ${sourceExt.toUpperCase()} file.`);
      }

      // PDF -> MP4 or GIF slideshow
      if (targetExt === 'mp4' || targetExt === 'gif') {
        const slideSec = Math.max(1, Math.min(10, opts.slideDuration ?? 3));
        const outFilename = buildOutputFilename(params.originalName, targetExt);
        const outPath = path.join(params.outputDir, outFilename);
        const inputPattern = path.join(workDir, 'pdf-page-%03d.png');

        if (targetExt === 'mp4') {
          await runBin('ffmpeg', [
            '-y',
            '-framerate',
            `1/${slideSec}`,
            '-i',
            inputPattern,
            '-vf',
            'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=white,format=yuv420p',
            '-r',
            '24',
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-movflags',
            '+faststart',
            outPath,
          ]);
        } else {
          await runBin('ffmpeg', [
            '-y',
            '-framerate',
            `1/${slideSec}`,
            '-i',
            inputPattern,
            '-vf',
            'scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
            outPath,
          ]);
        }
        const stat = await fs.stat(outPath);
        const meta = await probeMedia(outPath);
        return {
          outputPath: outPath,
          outputFilename: outFilename,
          outputMime: getMimeForExt(targetExt),
          outputSize: stat.size,
          isArchive: false,
          metadata: { ...meta, pageCount: pngPages.length },
          summaryNote: `${pngPages.length} PDF page${pngPages.length === 1 ? '' : 's'} at ${slideSec}s/page`,
        };
      }

      // PDF -> PNG / JPG / WEBP
      const convertedPages: string[] = [];
      for (let i = 0; i < pngPages.length; i += 1) {
        const dest = path.join(workDir, `page-${String(i + 1).padStart(3, '0')}.${targetExt}`);
        if (targetExt === 'png' && !opts.grayscale && (!opts.imageMaxWidth || opts.imageMaxWidth === 0)) {
          await fs.copyFile(pngPages[i], dest);
        } else {
          await convertImageFile(pngPages[i], 'png', targetExt, dest, opts);
        }
        convertedPages.push(dest);
      }

      if (convertedPages.length === 1) {
        const outFilename = buildOutputFilename(params.originalName, targetExt);
        const outPath = path.join(params.outputDir, outFilename);
        await fs.copyFile(convertedPages[0], outPath);
        const stat = await fs.stat(outPath);
        const meta = await probeMedia(outPath);
        let previewPath: string | undefined;
        let previewMime: string | undefined;
        if (targetExt === 'psd') {
          previewPath = path.join(params.outputDir, `preview_${outFilename}.png`);
          await fs.copyFile(pngPages[0], previewPath);
          previewMime = 'image/png';
        }
        return {
          outputPath: outPath,
          outputFilename: outFilename,
          outputMime: getMimeForExt(targetExt),
          outputSize: stat.size,
          isArchive: false,
          previewPath,
          previewMime,
          metadata: { ...meta, pageCount: 1 },
          summaryNote: `Rendered 1 page at ${dpi} DPI`,
        };
      }

      // Multi-page PDF -> ZIP archive + Page 1 preview
      const zip = new JSZip();
      for (const pageFile of convertedPages) {
        const bytes = await fs.readFile(pageFile);
        zip.file(path.basename(pageFile), bytes);
      }
      const outFilename = buildOutputFilename(params.originalName, targetExt, true);
      const outPath = path.join(params.outputDir, outFilename);
      const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      await fs.writeFile(outPath, zipBuf);

      const previewSource = targetExt === 'psd' ? pngPages[0] : convertedPages[0];
      const previewPath = path.join(params.outputDir, `preview_${path.basename(previewSource)}`);
      await fs.copyFile(previewSource, previewPath);

      return {
        outputPath: outPath,
        outputFilename: outFilename,
        outputMime: 'application/zip',
        outputSize: zipBuf.length,
        isArchive: true,
        previewPath,
        previewMime: targetExt === 'psd' ? 'image/png' : getMimeForExt(targetExt),
        metadata: { pageCount: convertedPages.length },
        summaryNote: `${convertedPages.length} pages packaged in ZIP (${dpi} DPI)`,
      };
    }

    // 2. IMAGE SOURCE
    if (sourceSpec.category === 'image') {
      const outFilename = buildOutputFilename(params.originalName, targetExt);
      const outPath = path.join(params.outputDir, outFilename);

      if (targetExt === 'pdf') {
        await convertImageToPdf(params.inputPath, sourceExt, outPath, workDir, opts);
        const stat = await fs.stat(outPath);
        return {
          outputPath: outPath,
          outputFilename: outFilename,
          outputMime: 'application/pdf',
          outputSize: stat.size,
          isArchive: false,
          metadata: { pageCount: 1 },
          summaryNote: 'Embedded image into 1-page PDF',
        };
      }

      if (targetExt === 'eps') {
        const tempPdf = path.join(workDir, 'img_for_eps.pdf');
        await convertImageToPdf(params.inputPath, sourceExt, tempPdf, workDir, opts);
        const fontmapDir = await ensureGsFontmapDir();
        await runBin('gs', [
          '-dSAFER',
          '-dBATCH',
          '-dNOPAUSE',
          `-I${fontmapDir}`,
          '-sDEVICE=eps2write',
          `-sOutputFile=${outPath}`,
          tempPdf,
        ]);
        const stat = await fs.stat(outPath);
        return {
          outputPath: outPath,
          outputFilename: outFilename,
          outputMime: 'application/postscript',
          outputSize: stat.size,
          isArchive: false,
          summaryNote: 'Packaged image as Adobe EPS print file',
        };
      }

      if (targetExt === 'mp4') {
        const duration = Math.max(1, Math.min(15, opts.slideDuration ?? 3));
        let sourceImg = params.inputPath;
        if (
          sourceExt === 'svg' ||
          sourceExt === 'ico' ||
          sourceExt === 'psd' ||
          sourceExt === 'psb' ||
          sourceExt === 'dng'
        ) {
          sourceImg = path.join(workDir, 'rasterized.png');
          await convertImageFile(params.inputPath, sourceExt, 'png', sourceImg, opts);
        }
        await runBin('ffmpeg', [
          '-y',
          '-loop',
          '1',
          '-i',
          sourceImg,
          '-t',
          String(duration),
          '-vf',
          'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
          '-r',
          '24',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          outPath,
        ]);
        const stat = await fs.stat(outPath);
        const meta = await probeMedia(outPath);
        return {
          outputPath: outPath,
          outputFilename: outFilename,
          outputMime: 'video/mp4',
          outputSize: stat.size,
          isArchive: false,
          metadata: meta,
          summaryNote: `Generated ${duration}s H.264 video clip`,
        };
      }

      await convertImageFile(params.inputPath, sourceExt, targetExt, outPath, opts);
      const stat = await fs.stat(outPath);
      const meta = await probeMedia(outPath);
      // Generate PNG preview when exporting Adobe PSD since browsers cannot display .psd inline
      let previewPath: string | undefined;
      let previewMime: string | undefined;
      if (targetExt === 'psd') {
        previewPath = path.join(params.outputDir, `preview_${outFilename}.png`);
        await convertImageFile(outPath, 'psd', 'png', previewPath, { ...opts, imageMaxWidth: 1024 });
        previewMime = 'image/png';
      }
      return {
        outputPath: outPath,
        outputFilename: outFilename,
        outputMime: getMimeForExt(targetExt),
        outputSize: stat.size,
        isArchive: false,
        previewPath,
        previewMime,
        metadata: meta,
      };
    }

    // 3. VIDEO SOURCE
    if (sourceSpec.category === 'video') {
      const outFilename = buildOutputFilename(params.originalName, targetExt);
      const outPath = path.join(params.outputDir, outFilename);
      const inputMeta = await probeMedia(params.inputPath);

      // Video -> Audio extraction
      if (targetSpec.category === 'audio') {
        const args = ['-y', '-i', params.inputPath, '-vn', ...buildAudioArgs(targetExt, opts), outPath];
        await runBin('ffmpeg', args);
        const stat = await fs.stat(outPath);
        const meta = await probeMedia(outPath);
        return {
          outputPath: outPath,
          outputFilename: outFilename,
          outputMime: getMimeForExt(targetExt),
          outputSize: stat.size,
          isArchive: false,
          metadata: meta,
          summaryNote: `Extracted ${targetExt.toUpperCase()} audio track`,
        };
      }

      // Video -> Image frame capture
      if (targetSpec.category === 'image' && targetExt !== 'gif') {
        const maxT = inputMeta.durationSec ? Math.max(0, inputMeta.durationSec - 0.1) : 10;
        const ts = Math.min(Math.max(0, opts.frameTimestamp ?? 0.5), maxT);
        const vfParts: string[] = [];
        if (opts.imageMaxWidth && opts.imageMaxWidth > 0) {
          vfParts.push(`scale='min(${Math.round(opts.imageMaxWidth)},iw)':-1`);
        }
        if (opts.grayscale) vfParts.push('format=gray');

        const args = ['-y', '-ss', String(ts), '-i', params.inputPath, '-frames:v', '1'];
        if (vfParts.length > 0) args.push('-vf', vfParts.join(','));
        if (targetExt === 'webp') args.push('-c:v', 'libwebp', '-quality', String(opts.imageQuality ?? 88));
        args.push(outPath);
        await runBin('ffmpeg', args);

        const stat = await fs.stat(outPath);
        const meta = await probeMedia(outPath);
        return {
          outputPath: outPath,
          outputFilename: outFilename,
          outputMime: getMimeForExt(targetExt),
          outputSize: stat.size,
          isArchive: false,
          metadata: meta,
          summaryNote: `Captured frame at ${ts.toFixed(1)}s`,
        };
      }

      // Video -> Animated GIF
      if (targetExt === 'gif') {
        const fps = opts.videoFps && opts.videoFps !== 'original' ? opts.videoFps : '12';
        const width =
          opts.videoResolution === '480p' ? 480 : opts.videoResolution === '720p' ? 720 : 640;
        await runBin('ffmpeg', [
          '-y',
          '-i',
          params.inputPath,
          '-vf',
          `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
          outPath,
        ]);
        const stat = await fs.stat(outPath);
        const meta = await probeMedia(outPath);
        return {
          outputPath: outPath,
          outputFilename: outFilename,
          outputMime: 'image/gif',
          outputSize: stat.size,
          isArchive: false,
          metadata: meta,
          summaryNote: `Animated GIF (${fps} fps, ${width}px wide)`,
        };
      }

      // Video -> PDF Storyboard
      if (targetExt === 'pdf') {
        const duration = inputMeta.durationSec && inputMeta.durationSec > 0 ? inputMeta.durationSec : 2;
        const frameCount = Math.min(6, Math.max(2, Math.round(duration * 2)));
        const frames: Array<{ file: string; time: number }> = [];

        for (let i = 0; i < frameCount; i += 1) {
          const t = Number(((duration * (i + 0.5)) / frameCount).toFixed(2));
          const frameFile = path.join(workDir, `story-${i}.png`);
          await runBin('ffmpeg', ['-y', '-ss', String(t), '-i', params.inputPath, '-frames:v', '1', '-vf', 'scale=640:-1', frameFile]);
          frames.push({ file: frameFile, time: t });
        }

        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([612, 792]);
        const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const mono = await pdfDoc.embedFont(StandardFonts.Courier);

        page.drawText(`Video Storyboard: ${sanitizeWinAnsiText(params.originalName).slice(0, 48)}`, {
          x: 40,
          y: 748,
          size: 13,
          font: bold,
          color: rgb(0.06, 0.09, 0.16),
        });

        const cols = 2;
        const cellW = 256;
        const cellH = 190;
        const gapX = 20;
        const gapY = 34;

        for (let i = 0; i < frames.length; i += 1) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = 40 + col * (cellW + gapX);
          const topY = 716 - row * (cellH + gapY);

          const bytes = await fs.readFile(frames[i].file);
          const img = await pdfDoc.embedPng(bytes);
          const scale = Math.min(cellW / img.width, (cellH - 18) / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;

          page.drawImage(img, { x, y: topY - drawH, width: drawW, height: drawH });
          page.drawText(`Frame ${i + 1} · ${frames[i].time.toFixed(2)}s`, {
            x,
            y: topY - drawH - 13,
            size: 8.5,
            font: mono,
            color: rgb(0.39, 0.45, 0.55),
          });
        }

        const pdfBytes = await pdfDoc.save();
        await fs.writeFile(outPath, pdfBytes);
        return {
          outputPath: outPath,
          outputFilename: outFilename,
          outputMime: 'application/pdf',
          outputSize: pdfBytes.length,
          isArchive: false,
          metadata: { pageCount: 1 },
          summaryNote: `Storyboard PDF with ${frames.length} extracted keyframes`,
        };
      }

      // Video -> Video container transcode
      const args = ['-y', '-i', params.inputPath];
      const vfParts: string[] = [];
      if (opts.videoResolution === '1080p') vfParts.push('scale=-2:1080');
      else if (opts.videoResolution === '720p') vfParts.push('scale=-2:720');
      else if (opts.videoResolution === '480p') vfParts.push('scale=-2:480');
      else vfParts.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');

      if (vfParts.length > 0) args.push('-vf', vfParts.join(','));
      if (opts.videoFps && opts.videoFps !== 'original') args.push('-r', opts.videoFps);

      const crf = opts.videoPreset === 'high' ? '18' : opts.videoPreset === 'compact' ? '28' : '23';
      if (targetExt === 'webm') {
        args.push('-c:v', 'libvpx', '-b:v', '1M', '-crf', crf);
        if (opts.muteAudio) args.push('-an');
        else args.push('-c:a', 'libvorbis', '-b:a', opts.audioBitrate ?? '128k');
      } else if (targetExt === 'avi') {
        args.push('-c:v', 'mpeg4', '-q:v', opts.videoPreset === 'high' ? '2' : '5');
        if (opts.muteAudio) args.push('-an');
        else args.push('-c:a', 'libmp3lame', '-b:a', opts.audioBitrate ?? '192k');
      } else {
        args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', crf, '-pix_fmt', 'yuv420p');
        if (targetExt === 'mp4' || targetExt === 'mov') args.push('-movflags', '+faststart');
        if (opts.muteAudio) args.push('-an');
        else args.push('-c:a', 'aac', '-b:a', opts.audioBitrate ?? '192k');
      }

      args.push(outPath);
      await runBin('ffmpeg', args);
      const stat = await fs.stat(outPath);
      const meta = await probeMedia(outPath);
      return {
        outputPath: outPath,
        outputFilename: outFilename,
        outputMime: getMimeForExt(targetExt),
        outputSize: stat.size,
        isArchive: false,
        metadata: meta,
      };
    }

    // 4. AUDIO SOURCE
    if (sourceSpec.category === 'audio') {
      const outFilename = buildOutputFilename(params.originalName, targetExt);
      const outPath = path.join(params.outputDir, outFilename);

      if (targetSpec.category === 'audio') {
        await runBin('ffmpeg', ['-y', '-i', params.inputPath, ...buildAudioArgs(targetExt, opts), outPath]);
        const stat = await fs.stat(outPath);
        const meta = await probeMedia(outPath);
        return {
          outputPath: outPath,
          outputFilename: outFilename,
          outputMime: getMimeForExt(targetExt),
          outputSize: stat.size,
          isArchive: false,
          metadata: meta,
        };
      }

      // Audio -> Waveform Video (MP4 or WEBM)
      if (targetExt === 'mp4' || targetExt === 'webm') {
        const filter =
          'color=c=#0f172a:s=1280x720:r=25[bg];[0:a]showwaves=s=1280x720:mode=cline:rate=25:colors=#3b82f6|#93c5fd[waves];[bg][waves]overlay=shortest=1:format=auto[v]';
        const args = ['-y', '-i', params.inputPath, '-filter_complex', filter, '-map', '[v]', '-map', '0:a'];
        if (targetExt === 'mp4') {
          args.push('-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', opts.audioBitrate ?? '192k', '-shortest', '-movflags', '+faststart');
        } else {
          args.push('-c:v', 'libvpx', '-b:v', '1M', '-c:a', 'libvorbis', '-shortest');
        }
        args.push(outPath);
        await runBin('ffmpeg', args);
        const stat = await fs.stat(outPath);
        const meta = await probeMedia(outPath);
        return {
          outputPath: outPath,
          outputFilename: outFilename,
          outputMime: getMimeForExt(targetExt),
          outputSize: stat.size,
          isArchive: false,
          metadata: meta,
          summaryNote: 'Rendered waveform visualization video',
        };
      }

      // Audio -> Waveform Image (PNG or JPG)
      if (targetExt === 'png' || targetExt === 'jpg') {
        const rawWave = path.join(workDir, 'wave.png');
        await runBin('ffmpeg', [
          '-y',
          '-i',
          params.inputPath,
          '-filter_complex',
          'color=c=#f8fafc:s=1280x400[bg];[0:a]showwavespic=s=1280x400:colors=#2563eb[fg];[bg][fg]overlay=format=auto',
          '-frames:v',
          '1',
          rawWave,
        ]);
        if (targetExt === 'png') {
          await fs.copyFile(rawWave, outPath);
        } else {
          await convertImageFile(rawWave, 'png', 'jpg', outPath, opts);
        }
        const stat = await fs.stat(outPath);
        const meta = await probeMedia(outPath);
        return {
          outputPath: outPath,
          outputFilename: outFilename,
          outputMime: getMimeForExt(targetExt),
          outputSize: stat.size,
          isArchive: false,
          metadata: meta,
          summaryNote: 'Rendered 1280×400 audio waveform graphic',
        };
      }
    }

    // 5. DOCUMENT & STRUCTURED DATA SOURCES
    if (sourceSpec.category === 'document' || sourceSpec.category === 'data') {
      const content = await fs.readFile(params.inputPath, 'utf-8');
      const outFilename = buildOutputFilename(params.originalName, targetExt);
      const outPath = path.join(params.outputDir, outFilename);

      if (targetExt === 'pdf') {
        const bodyText =
          sourceExt === 'html'
            ? stripHtmlToText(content)
            : sourceSpec.category === 'data'
              ? convertStructuredData(sourceExt, 'txt', content, { prettyPrint: true })
              : content;
        const pageCount = await renderTextToPdf(
          bodyText,
          outPath,
          params.originalName,
          opts.pdfPageSize ?? 'letter',
          sourceSpec.category === 'data'
        );
        const stat = await fs.stat(outPath);
        return {
          outputPath: outPath,
          outputFilename: outFilename,
          outputMime: 'application/pdf',
          outputSize: stat.size,
          isArchive: false,
          metadata: { pageCount },
          summaryNote: `Formatted into ${pageCount}-page PDF`,
        };
      }

      if (targetExt === 'png' || targetExt === 'jpg') {
        const tempPdf = path.join(workDir, 'doc.pdf');
        const bodyText = sourceExt === 'html' ? stripHtmlToText(content) : content;
        await renderTextToPdf(bodyText, tempPdf, params.originalName, opts.pdfPageSize ?? 'letter', false);
        const pages = await renderPdfPagesToPng(tempPdf, workDir, opts.pdfDpi ?? 150, true);
        if (pages.length === 0) throw new Error('Unable to rasterize document.');
        await convertImageFile(pages[0], 'png', targetExt, outPath, opts);
        const stat = await fs.stat(outPath);
        const meta = await probeMedia(outPath);
        return {
          outputPath: outPath,
          outputFilename: outFilename,
          outputMime: getMimeForExt(targetExt),
          outputSize: stat.size,
          isArchive: false,
          metadata: meta,
          summaryNote: 'Rasterized document preview',
        };
      }

      const convertedText =
        sourceSpec.category === 'data'
          ? convertStructuredData(sourceExt, targetExt, content, {
              prettyPrint: opts.prettyPrint,
              title: params.originalName,
            })
          : convertDocumentText(sourceExt, targetExt, content, params.originalName);

      await fs.writeFile(outPath, convertedText, 'utf-8');
      const stat = await fs.stat(outPath);
      return {
        outputPath: outPath,
        outputFilename: outFilename,
        outputMime: getMimeForExt(targetExt),
        outputSize: stat.size,
        isArchive: false,
      };
    }

    throw new Error(`No conversion handler found for ${sourceExt} to ${targetExt}.`);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
