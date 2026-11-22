import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOutputFilename,
  detectFormat,
  formatBytes,
  formatSizeDelta,
  getDefaultTargetForSource,
  getTargetFormatsForSource,
  groupFormatsByCategory,
  isConversionSupported,
  normalizeExtension,
} from './formats';

test('normalizes extension aliases consistently', () => {
  assert.equal(normalizeExtension('.JPEG'), 'jpg');
  assert.equal(normalizeExtension('yml'), 'yaml');
  assert.equal(normalizeExtension('TIF'), 'tiff');
  assert.equal(normalizeExtension('htm'), 'html');
});

test('detects format from filename or fallback MIME type', () => {
  assert.equal(detectFormat('report.PDF')?.ext, 'pdf');
  assert.equal(detectFormat('photo.jpeg')?.ext, 'jpg');
  assert.equal(detectFormat('clip.mp4')?.category, 'video');
  assert.equal(detectFormat('track.wav')?.category, 'audio');
  assert.equal(detectFormat('blob', 'image/webp')?.ext, 'webp');
  assert.equal(detectFormat('unknown.xyz'), null);
});

test('supports universal cross-media conversion paths', () => {
  // PDF -> Image, Video, Text
  assert.equal(isConversionSupported('pdf', 'png'), true);
  assert.equal(isConversionSupported('pdf', 'mp4'), true);
  assert.equal(isConversionSupported('pdf', 'txt'), true);
  // Image -> PDF, Video, Image
  assert.equal(isConversionSupported('png', 'pdf'), true);
  assert.equal(isConversionSupported('png', 'mp4'), true);
  assert.equal(isConversionSupported('jpg', 'webp'), true);
  // Video -> Audio, GIF, Image, PDF
  assert.equal(isConversionSupported('mp4', 'mp3'), true);
  assert.equal(isConversionSupported('mp4', 'gif'), true);
  assert.equal(isConversionSupported('mp4', 'png'), true);
  assert.equal(isConversionSupported('mp4', 'pdf'), true);
  // Audio -> Audio, Waveform Video, Waveform Image
  assert.equal(isConversionSupported('wav', 'mp3'), true);
  assert.equal(isConversionSupported('wav', 'mp4'), true);
  assert.equal(isConversionSupported('mp3', 'png'), true);
  // 3D Models -> GLB, GLTF, OBJ, STL, PLY, USDZ, OFF, PNG/JPG render
  assert.equal(detectFormat('assembly.glb')?.category, '3d');
  assert.equal(detectFormat('bracket.stl')?.category, '3d');
  assert.equal(detectFormat('character.fbx')?.ecosystem, 'autodesk');
  assert.equal(detectFormat('floorplan.dxf')?.ecosystem, 'autodesk');
  assert.equal(detectFormat('legacy.3ds')?.ecosystem, 'autodesk');
  assert.equal(detectFormat('pavilion.3dm')?.ecosystem, 'rhino');
  assert.equal(detectFormat('poster.psd')?.ecosystem, 'adobe');
  assert.equal(detectFormat('large.psb')?.ecosystem, 'adobe');
  assert.equal(detectFormat('logo.ai')?.ecosystem, 'adobe');
  assert.equal(detectFormat('print.eps')?.ecosystem, 'adobe');
  assert.equal(detectFormat('raw.dng')?.ecosystem, 'adobe');

  assert.equal(isConversionSupported('obj', 'glb'), true);
  assert.equal(isConversionSupported('glb', 'stl'), true);
  assert.equal(isConversionSupported('fbx', 'usdz'), true);
  assert.equal(isConversionSupported('stl', 'png'), true);
  assert.equal(isConversionSupported('3dm', 'glb'), true);
  assert.equal(isConversionSupported('dxf', '3dm'), true);
  assert.equal(isConversionSupported('obj', '3ds'), true);
  assert.equal(isConversionSupported('psd', 'png'), true);
  assert.equal(isConversionSupported('png', 'psd'), true);
  assert.equal(isConversionSupported('eps', 'pdf'), true);
  assert.equal(isConversionSupported('pdf', 'eps'), true);
  assert.equal(isConversionSupported('ai', 'png'), true);
  // Same-format conversion disallowed
  assert.equal(isConversionSupported('png', 'png'), false);
  assert.equal(isConversionSupported('pdf', 'pdf'), false);
  assert.equal(isConversionSupported('glb', 'glb'), false);
  assert.equal(isConversionSupported('3dm', '3dm'), false);
});

test('picks sensible defaults and groups targets by category', () => {
  assert.equal(getDefaultTargetForSource('pdf'), 'png');
  assert.equal(getDefaultTargetForSource('png'), 'webp');
  assert.equal(getDefaultTargetForSource('mp4'), 'mp3');
  assert.equal(getDefaultTargetForSource('wav'), 'mp3');
  assert.equal(getDefaultTargetForSource('obj'), 'glb');
  assert.equal(getDefaultTargetForSource('glb'), 'stl');

  const videoTargets = getTargetFormatsForSource('mp4');
  const groups = groupFormatsByCategory(videoTargets);
  const cats = groups.map((g) => g.category);
  assert.ok(cats.includes('video'));
  assert.ok(cats.includes('audio'));
  assert.ok(cats.includes('image'));
  assert.ok(cats.includes('pdf'));
});

test('formats output filenames, bytes (including GB/TB), and size deltas', () => {
  assert.equal(buildOutputFilename('Q4 Report (Final).pdf', 'png'), 'Q4_Report_Final.png');
  assert.equal(buildOutputFilename('deck.pdf', 'jpg', true), 'deck_jpg_pages.zip');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(2.5 * 1024 * 1024), '2.5 MB');
  assert.equal(formatBytes(3.5 * 1024 * 1024 * 1024), '3.5 GB');
  assert.equal(formatSizeDelta(1000, 500), '-50%');
  assert.equal(formatSizeDelta(1000, 1250), '+25%');
});
