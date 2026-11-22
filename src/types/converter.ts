import { ConversionOptions, FormatSpec, MediaCategory } from '../lib/formats';

export type WorkspaceView = 'converter' | 'viewer3d' | 'pdfEditor' | 'matrix' | 'history';

export type JobStatus = 'ready' | 'converting' | 'completed' | 'error';

export interface ConversionResultData {
  jobId: string;
  sourceExt: string;
  targetExt: string;
  outputFilename: string;
  outputMime: string;
  outputSize: number;
  isArchive: boolean;
  downloadUrl: string;
  previewUrl: string;
  previewMime: string;
  previewModelExt?: string;
  isClientConverted?: boolean;
  durationMs: number;
  metadata?: {
    width?: number;
    height?: number;
    durationSec?: number;
    pageCount?: number;
    codec?: string;
    vertices?: number;
    triangles?: number;
    meshCount?: number;
    bounds?: string;
  };
  summaryNote?: string;
}

export interface QueueItem {
  id: string;
  file: File;
  sourceFormat: FormatSpec;
  targetExt: string;
  options: ConversionOptions;
  status: JobStatus;
  uploadProgress?: number; // 0-100 during streaming upload
  error?: string;
  result?: ConversionResultData;
  localBlob?: Blob;
}

export interface HistoryEntry {
  id: string;
  completedAt: string;
  inputName: string;
  inputSize: number;
  sourceCategory: MediaCategory;
  result: ConversionResultData;
}

export interface RoutePreset {
  sourceExt: string;
  targetExt: string;
}
