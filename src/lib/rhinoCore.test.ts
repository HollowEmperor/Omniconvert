import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeMeshStats } from './meshCore';
import { generateSampleRhinoShell3dm, parse3dm, serialize3dm } from './rhinoCore';

describe('rhinoCore (Rhinoceros 3D .3dm)', () => {
  it('generates and parses the sample Rhino 3D pavilion shell .3dm', async () => {
    const bytes = await generateSampleRhinoShell3dm();
    assert.ok(bytes.byteLength > 5000);

    const parsed = await parse3dm(bytes, 'rhino_pavilion');
    const stats = computeMeshStats(parsed);
    assert.ok(stats.triangles > 2000, `Expected rich pavilion mesh, got ${stats.triangles}`);
    assert.ok(stats.vertices > 1000);
    assert.ok(stats.bounds.width > 2.0);
  });

  it('round-trips a custom mesh through serialize3dm and parse3dm', async () => {
    const mesh = {
      name: 'unit_pyramid',
      positions: new Float32Array([
        0, 0, 0,
        2, 0, 0,
        1, 0, 2,
        1, 2, 1,
      ]),
      indices: new Uint32Array([
        0, 1, 2,
        0, 1, 3,
        1, 2, 3,
        2, 0, 3,
      ]),
    };

    const bytes = await serialize3dm(mesh);
    const parsed = await parse3dm(bytes, 'unit_pyramid');
    const stats = computeMeshStats(parsed);
    assert.equal(stats.triangles, 4);
    assert.equal(stats.vertices, 4);
  });
});
