import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeMeshStats,
  generateSampleOrbitalHubObj,
  parse3ds,
  parseObj,
  parseOff,
  parseStl,
  serialize3ds,
  serializeObj,
  serializeOff,
  serializePlyAscii,
  serializeStlAscii,
  serializeStlBinary,
  transformMesh,
} from './meshCore';

test('generates and parses multi-part Orbital Hub OBJ cleanly', () => {
  const objText = generateSampleOrbitalHubObj();
  const mesh = parseObj(objText, 'orbital_hub');
  const stats = computeMeshStats(mesh);
  assert.ok(stats.vertices > 200, 'Expected rich multi-part vertex count');
  assert.ok(stats.triangles > 300, 'Expected rich multi-part triangle count');
  assert.ok(stats.bounds.width > 2.5);
  assert.ok(stats.bounds.height > 1.5);
});

test('round-trips OBJ -> Binary STL -> OFF -> ASCII STL -> PLY -> Autodesk 3DS without triangle loss', () => {
  const sample = parseObj(generateSampleOrbitalHubObj(), 'hub');
  const originalTris = computeMeshStats(sample).triangles;

  const binStl = serializeStlBinary(sample);
  const fromBinStl = parseStl(binStl, 'hub');
  assert.equal(computeMeshStats(fromBinStl).triangles, originalTris);

  const asciiStl = serializeStlAscii(sample);
  const fromAsciiStl = parseStl(new TextEncoder().encode(asciiStl), 'hub');
  assert.equal(computeMeshStats(fromAsciiStl).triangles, originalTris);

  const offText = serializeOff(sample);
  const fromOff = parseOff(offText, 'hub');
  assert.equal(computeMeshStats(fromOff).triangles, originalTris);

  const plyText = serializePlyAscii(sample);
  assert.ok(plyText.startsWith('ply\nformat ascii 1.0'));
  assert.ok(plyText.includes(`element face ${originalTris}`));

  const bin3ds = serialize3ds(sample);
  const from3ds = parse3ds(bin3ds, 'hub');
  assert.equal(computeMeshStats(from3ds).triangles, originalTris);

  const objRoundtrip = serializeObj(fromOff);
  assert.equal(computeMeshStats(parseObj(objRoundtrip)).triangles, originalTris);
});

test('applies uniform scaling, centering, and Z-Up to Y-Up axis swaps accurately', () => {
  const raw = parseObj(
    [
      'v 10 20 30',
      'v 14 20 30',
      'v 10 24 30',
      'f 1 2 3',
    ].join('\n'),
    'tri'
  );

  const centeredScaled = transformMesh(raw, { center: true, scale: 0.5, axisSwap: 'none' });
  const stats = computeMeshStats(centeredScaled);
  assert.equal(stats.bounds.width, 2);
  assert.equal(stats.bounds.height, 2);

  const swapped = transformMesh(raw, { axisSwap: 'z-to-y', scale: 1 });
  // (x, y, z) -> (x, z, -y): vertex 0 (10, 20, 30) -> (10, 30, -20)
  assert.equal(swapped.positions[0], 10);
  assert.equal(swapped.positions[1], 30);
  assert.equal(swapped.positions[2], -20);
});
