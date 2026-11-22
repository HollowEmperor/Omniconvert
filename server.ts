import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import JSZip from 'jszip';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  ConversionOptions,
  detectFormat,
  isConversionSupported,
  normalizeExtension,
} from './src/lib/formats';
import { MediaMetadata, convertFile, renderPdfPagesAsDataUrls } from './src/server/conversionEngine';
import { getOrCreateSampleFile } from './src/server/sampleGenerator';

interface StoredJob {
  id: string;
  createdAt: number;
  dir: string;
  outputPath: string;
  outputFilename: string;
  outputMime: string;
  outputSize: number;
  isArchive: boolean;
  previewPath?: string;
  previewMime?: string;
  sourceExt: string;
  targetExt: string;
  metadata?: MediaMetadata;
  summaryNote?: string;
}

const JOB_TTL_MS = 30 * 60 * 1000;
const jobs = new Map<string, StoredJob>();

const UPLOAD_DIR = path.join(os.tmpdir(), 'transmute-uploads');
const OUTPUT_ROOT = path.join(os.tmpdir(), 'transmute-outputs');

async function initDirs() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
}

function pruneExpiredJobs() {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(id);
      fs.rm(job.dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

setInterval(pruneExpiredJobs, 5 * 60 * 1000).unref();

// Unbounded disk-backed uploads — no file size limit
const upload = multer({
  dest: UPLOAD_DIR,
});

async function startServer() {
  await initDirs();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Serve real generated sample files so users can test every category immediately
  app.get('/api/samples/:sampleId', async (req, res) => {
    try {
      const sample = await getOrCreateSampleFile(req.params.sampleId);
      res.setHeader('Content-Type', sample.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${sample.filename}"`);
      res.sendFile(sample.path);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to generate sample file.';
      res.status(404).json({ error: msg });
    }
  });

  // Render PDF pages to crisp PNG data URLs for the interactive PDF Viewer & Editor
  app.post('/api/pdf/render-pages', upload.single('file'), async (req, res) => {
    const uploadedFile = req.file;
    if (!uploadedFile) {
      res.status(400).json({ error: 'No PDF file uploaded.' });
      return;
    }

    try {
      const requestedDpi = Number(req.body?.dpi);
      const dpi = Number.isFinite(requestedDpi)
        ? Math.min(200, Math.max(72, Math.round(requestedDpi)))
        : 120;
      const rendered = await renderPdfPagesAsDataUrls(uploadedFile.path, dpi);
      res.json(rendered);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to render PDF pages.';
      res.status(500).json({ error: msg });
    } finally {
      await fs.rm(uploadedFile.path, { force: true }).catch(() => {});
    }
  });

  // Universal file conversion endpoint
  app.post('/api/convert', upload.single('file'), async (req, res) => {
    const uploadedFile = req.file;
    if (!uploadedFile) {
      res.status(400).json({ error: 'No file uploaded.' });
      return;
    }

    const jobId = crypto.randomUUID();
    const jobOutputDir = path.join(OUTPUT_ROOT, jobId);

    try {
      const rawTarget = typeof req.body.targetFormat === 'string' ? req.body.targetFormat : '';
      const targetExt = normalizeExtension(rawTarget);
      if (!targetExt) {
        res.status(400).json({ error: 'Target format is required.' });
        return;
      }

      const detected = detectFormat(uploadedFile.originalname, uploadedFile.mimetype);
      if (!detected) {
        res.status(400).json({
          error: `Unsupported source file format for "${uploadedFile.originalname}".`,
        });
        return;
      }

      if (!isConversionSupported(detected.ext, targetExt)) {
        res.status(400).json({
          error: `Converting ${detected.label} to ${targetExt.toUpperCase()} is not supported.`,
        });
        return;
      }

      let options: ConversionOptions = {};
      if (typeof req.body.options === 'string' && req.body.options.trim()) {
        try {
          options = JSON.parse(req.body.options) as ConversionOptions;
        } catch {
          res.status(400).json({ error: 'Invalid conversion options payload.' });
          return;
        }
      }

      await fs.mkdir(jobOutputDir, { recursive: true });
      const startedAt = Date.now();

      const result = await convertFile({
        inputPath: uploadedFile.path,
        originalName: uploadedFile.originalname,
        sourceExt: detected.ext,
        targetExt,
        options,
        outputDir: jobOutputDir,
      });

      const durationMs = Date.now() - startedAt;

      const stored: StoredJob = {
        id: jobId,
        createdAt: Date.now(),
        dir: jobOutputDir,
        outputPath: result.outputPath,
        outputFilename: result.outputFilename,
        outputMime: result.outputMime,
        outputSize: result.outputSize,
        isArchive: result.isArchive,
        previewPath: result.previewPath,
        previewMime: result.previewMime,
        sourceExt: detected.ext,
        targetExt,
        metadata: result.metadata,
        summaryNote: result.summaryNote,
      };
      jobs.set(jobId, stored);

      res.json({
        jobId,
        sourceExt: detected.ext,
        targetExt,
        outputFilename: stored.outputFilename,
        outputMime: stored.outputMime,
        outputSize: stored.outputSize,
        isArchive: stored.isArchive,
        downloadUrl: `/api/jobs/${jobId}/file?download=1`,
        previewUrl: stored.previewPath
          ? `/api/jobs/${jobId}/preview`
          : `/api/jobs/${jobId}/file`,
        previewMime: stored.previewMime ?? stored.outputMime,
        durationMs,
        metadata: stored.metadata,
        summaryNote: stored.summaryNote,
      });
    } catch (err) {
      await fs.rm(jobOutputDir, { recursive: true, force: true }).catch(() => {});
      const message = err instanceof Error ? err.message : 'Conversion failed unexpectedly.';
      res.status(500).json({ error: message });
    } finally {
      await fs.rm(uploadedFile.path, { force: true }).catch(() => {});
    }
  });

  // Download or inline-preview converted output
  app.get('/api/jobs/:jobId/file', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Converted file expired or not found.' });
      return;
    }
    const isDownload = req.query.download === '1';
    res.setHeader('Content-Type', job.outputMime);
    res.setHeader(
      'Content-Disposition',
      `${isDownload ? 'attachment' : 'inline'}; filename="${job.outputFilename}"`
    );
    res.sendFile(job.outputPath);
  });

  // Preview image for multi-page ZIP outputs
  app.get('/api/jobs/:jobId/preview', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job || !job.previewPath) {
      res.status(404).json({ error: 'Preview not available.' });
      return;
    }
    res.setHeader('Content-Type', job.previewMime ?? 'image/png');
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(job.previewPath);
  });

  // Bundle multiple completed jobs into a single ZIP download
  app.post('/api/download-zip', async (req, res) => {
    const jobIds = Array.isArray(req.body?.jobIds) ? (req.body.jobIds as string[]) : [];
    if (jobIds.length === 0) {
      res.status(400).json({ error: 'Provide at least one job ID.' });
      return;
    }

    const zip = new JSZip();
    const usedNames = new Set<string>();
    let added = 0;

    for (const id of jobIds) {
      const job = jobs.get(id);
      if (!job) continue;
      try {
        const bytes = await fs.readFile(job.outputPath);
        let name = job.outputFilename;
        let suffix = 1;
        while (usedNames.has(name)) {
          const dot = job.outputFilename.lastIndexOf('.');
          name =
            dot > 0
              ? `${job.outputFilename.slice(0, dot)}_${suffix}${job.outputFilename.slice(dot)}`
              : `${job.outputFilename}_${suffix}`;
          suffix += 1;
        }
        usedNames.add(name);
        zip.file(name, bytes);
        added += 1;
      } catch {
        // skip missing file
      }
    }

    if (added === 0) {
      res.status(404).json({ error: 'No converted files available to package.' });
      return;
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="transmute-converted.zip"');
    res.send(buffer);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Transmute server listening on http://localhost:${PORT}`);
  });
  // Disable HTTP request/socket timeouts to support arbitrarily large uploads and conversions
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  server.timeout = 0;
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
