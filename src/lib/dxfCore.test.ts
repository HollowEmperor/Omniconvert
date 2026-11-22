import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateSampleCadBracketDxf, parseDxf, serializeDxf } from './dxfCore';
import { computeMeshStats } from './meshCore';

describe('dxfCore (Autodesk AutoCAD DXF)', () => {
  it('generates and parses the sample CAD bracket DXF', () => {
    const dxfText = generateSampleCadBracketDxf();
    assert.ok(dxfText.includes('3DFACE'));
    assert.ok(dxfText.includes('AC1009'));

    const parsed = parseDxf(dxfText, 'bracket');
    const stats = computeMeshStats(parsed);
    assert.ok(stats.triangles >= 40);
    assert.ok(stats.vertices >= 120);
    assert.ok(stats.bounds.width > 1.5);
    assert.ok(stats.bounds.height > 1.5);
  });

  it('round-trips 3DFACE mesh through serializeDxf and parseDxf', () => {
    const mesh = {
      name: 'tri_test',
      positions: new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0]),
      indices: new Uint32Array([0, 1, 2]),
    };
    const serialized = serializeDxf(mesh);
    const parsed = parseDxf(serialized, 'tri_test');
    const stats = computeMeshStats(parsed);
    assert.equal(stats.triangles, 1);
    assert.equal(stats.bounds.width, 2);
    assert.equal(stats.bounds.height, 2);
  });

  it('parses 2D drafting LINE and CIRCLE entities into valid 3D mesh geometry', () => {
    const dxf2d = [
      '0', 'SECTION',
      '2', 'ENTITIES',
      '0', 'LINE',
      '8', '0',
      '10', '0', '20', '0', '30', '0',
      '11', '10', '21', '0', '31', '0',
      '0', 'CIRCLE',
      '8', '0',
      '10', '5', '20', '5', '30', '0',
      '40', '2.5',
      '0', 'ENDSEC',
      '0', 'EOF',
    ].join('\n');

    const parsed = parseDxf(dxf2d, 'plan');
    const stats = computeMeshStats(parsed);
    assert.ok(stats.triangles > 100);
    assert.ok(stats.vertices > 100);
  });
});
