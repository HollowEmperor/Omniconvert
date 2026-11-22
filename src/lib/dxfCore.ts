/**
 * Pure TypeScript Autodesk AutoCAD DXF (Drawing Exchange Format) parser and serializer.
 * Supports 3DFACE, LINE, LWPOLYLINE, and CIRCLE entities for 3D CAD mesh interchange
 * and 2D vector drafting import/export.
 */

import { MeshData, computeVertexNormals } from './meshCore';

interface DxfPair {
  code: number;
  value: string;
}

function tokenizeDxf(text: string): DxfPair[] {
  const rawLines = text.split(/\r?\n/);
  const pairs: DxfPair[] = [];
  for (let i = 0; i + 1 < rawLines.length; i += 2) {
    const code = Number.parseInt(rawLines[i].trim(), 10);
    if (Number.isNaN(code)) continue;
    pairs.push({ code, value: rawLines[i + 1].trim() });
  }
  return pairs;
}

function pushRibbonSegment(
  positions: number[],
  indices: number[],
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  thickness: number
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return;

  // Build perpendicular offset vector
  let px = -dy;
  let py = dx;
  let pz = 0;
  let plen = Math.hypot(px, py, pz);
  if (plen < 1e-6) {
    px = 0;
    py = -dz;
    pz = dy;
    plen = Math.hypot(px, py, pz) || 1;
  }
  px = (px / plen) * thickness * 0.5;
  py = (py / plen) * thickness * 0.5;
  pz = (pz / plen) * thickness * 0.5;

  const base = positions.length / 3;
  // Two-sided vertical ribbon (height = thickness)
  positions.push(
    x1 - px, y1 - py, z1 - pz,
    x1 + px, y1 + py, z1 + pz,
    x2 + px, y2 + py, z2 + pz,
    x2 - px, y2 - py, z2 - pz,
    x1 - px, y1 - py, z1 - pz + thickness,
    x1 + px, y1 + py, z1 + pz + thickness,
    x2 + px, y2 + py, z2 + pz + thickness,
    x2 - px, y2 - py, z2 - pz + thickness
  );

  // Bottom, Top, and Side faces
  indices.push(
    base + 0, base + 1, base + 2, base + 0, base + 2, base + 3,
    base + 4, base + 6, base + 5, base + 4, base + 7, base + 6,
    base + 0, base + 3, base + 7, base + 0, base + 7, base + 4,
    base + 1, base + 5, base + 6, base + 1, base + 6, base + 2
  );
}

export function parseDxf(text: string, name = 'dxf_model'): MeshData {
  const pairs = tokenizeDxf(text);
  const positions: number[] = [];
  const indices: number[] = [];
  const wireframeSegments: Array<[number, number, number, number, number, number]> = [];

  let inEntities = false;
  let i = 0;

  while (i < pairs.length) {
    const pair = pairs[i];
    if (pair.code === 0 && pair.value === 'SECTION') {
      const next = pairs[i + 1];
      if (next && next.code === 2 && next.value.toUpperCase() === 'ENTITIES') {
        inEntities = true;
        i += 2;
        continue;
      }
    }
    if (pair.code === 0 && pair.value === 'ENDSEC') {
      inEntities = false;
      i += 1;
      continue;
    }

    if (!inEntities) {
      i += 1;
      continue;
    }

    if (pair.code === 0) {
      const entityType = pair.value.toUpperCase();
      const props: DxfPair[] = [];
      i += 1;
      while (i < pairs.length && pairs[i].code !== 0) {
        props.push(pairs[i]);
        i += 1;
      }

      if (entityType === '3DFACE') {
        const getNum = (c: number, fallback = 0) => {
          const found = props.find((p) => p.code === c);
          return found ? Number.parseFloat(found.value) || 0 : fallback;
        };
        const x0 = getNum(10);
        const y0 = getNum(20);
        const z0 = getNum(30);
        const x1 = getNum(11);
        const y1 = getNum(21);
        const z1 = getNum(31);
        const x2 = getNum(12);
        const y2 = getNum(22);
        const z2 = getNum(32);
        const x3 = getNum(13, x2);
        const y3 = getNum(23, y2);
        const z3 = getNum(33, z2);

        const base = positions.length / 3;
        positions.push(x0, y0, z0, x1, y1, z1, x2, y2, z2);
        indices.push(base, base + 1, base + 2);

        const hasFourth =
          Math.abs(x3 - x2) > 1e-6 || Math.abs(y3 - y2) > 1e-6 || Math.abs(z3 - z2) > 1e-6;
        if (hasFourth) {
          positions.push(x3, y3, z3);
          indices.push(base, base + 2, base + 3);
        }
      } else if (entityType === 'LINE') {
        const getNum = (c: number) => {
          const found = props.find((p) => p.code === c);
          return found ? Number.parseFloat(found.value) || 0 : 0;
        };
        wireframeSegments.push([
          getNum(10),
          getNum(20),
          getNum(30),
          getNum(11),
          getNum(21),
          getNum(31),
        ]);
      } else if (entityType === 'LWPOLYLINE') {
        const pts: Array<[number, number, number]> = [];
        let closed = false;
        let elev = 0;
        let curX: number | null = null;
        for (const p of props) {
          if (p.code === 70) {
            closed = (Number.parseInt(p.value, 10) & 1) === 1;
          } else if (p.code === 38) {
            elev = Number.parseFloat(p.value) || 0;
          } else if (p.code === 10) {
            curX = Number.parseFloat(p.value) || 0;
          } else if (p.code === 20 && curX !== null) {
            pts.push([curX, Number.parseFloat(p.value) || 0, elev]);
            curX = null;
          }
        }
        for (let k = 0; k + 1 < pts.length; k += 1) {
          wireframeSegments.push([...pts[k], ...pts[k + 1]]);
        }
        if (closed && pts.length >= 3) {
          wireframeSegments.push([...pts[pts.length - 1], ...pts[0]]);
        }
      } else if (entityType === 'CIRCLE') {
        const getNum = (c: number) => {
          const found = props.find((p) => p.code === c);
          return found ? Number.parseFloat(found.value) || 0 : 0;
        };
        const cx = getNum(10);
        const cy = getNum(20);
        const cz = getNum(30);
        const r = getNum(40);
        if (r > 0) {
          const segs = 28;
          for (let k = 0; k < segs; k += 1) {
            const a0 = (k / segs) * Math.PI * 2;
            const a1 = ((k + 1) / segs) * Math.PI * 2;
            wireframeSegments.push([
              cx + Math.cos(a0) * r,
              cy + Math.sin(a0) * r,
              cz,
              cx + Math.cos(a1) * r,
              cy + Math.sin(a1) * r,
              cz,
            ]);
          }
        }
      }
      continue;
    }

    i += 1;
  }

  // If the DXF is a 2D/wireframe drawing (LINE/LWPOLYLINE/CIRCLE) with no 3DFACE meshes,
  // extrude clean thin 3D drafting geometry so it renders and converts cleanly as a mesh.
  if (indices.length === 0 && wireframeSegments.length > 0) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const seg of wireframeSegments) {
      minX = Math.min(minX, seg[0], seg[3]);
      maxX = Math.max(maxX, seg[0], seg[3]);
      minY = Math.min(minY, seg[1], seg[4]);
      maxY = Math.max(maxY, seg[1], seg[4]);
    }
    const span = Math.max(maxX - minX, maxY - minY, 1);
    const thickness = Math.max(span * 0.012, 0.02);
    for (const [x1, y1, z1, x2, y2, z2] of wireframeSegments) {
      pushRibbonSegment(positions, indices, x1, y1, z1, x2, y2, z2, thickness);
    }
  }

  if (positions.length === 0 || indices.length === 0) {
    throw new Error('DXF file contains no supported 3DFACE, LINE, LWPOLYLINE, or CIRCLE geometry.');
  }

  const posArr = new Float32Array(positions);
  const idxArr = new Uint32Array(indices);
  return {
    name,
    positions: posArr,
    normals: computeVertexNormals(posArr, idxArr),
    indices: idxArr,
  };
}

export function serializeDxf(mesh: MeshData): string {
  const lines: string[] = [
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$ACADVER',
    '1', 'AC1009',
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'ENTITIES',
  ];

  const layer = (mesh.name || 'MODEL').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 31) || 'MODEL';

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ia = mesh.indices[i] * 3;
    const ib = mesh.indices[i + 1] * 3;
    const ic = mesh.indices[i + 2] * 3;

    const ax = mesh.positions[ia].toFixed(6);
    const ay = mesh.positions[ia + 1].toFixed(6);
    const az = mesh.positions[ia + 2].toFixed(6);
    const bx = mesh.positions[ib].toFixed(6);
    const by = mesh.positions[ib + 1].toFixed(6);
    const bz = mesh.positions[ib + 2].toFixed(6);
    const cx = mesh.positions[ic].toFixed(6);
    const cy = mesh.positions[ic + 1].toFixed(6);
    const cz = mesh.positions[ic + 2].toFixed(6);

    lines.push(
      '0', '3DFACE',
      '8', layer,
      '10', ax, '20', ay, '30', az,
      '11', bx, '21', by, '31', bz,
      '12', cx, '22', cy, '32', cz,
      '13', cx, '23', cy, '33', cz
    );
  }

  lines.push('0', 'ENDSEC', '0', 'EOF');
  return `${lines.join('\n')}\n`;
}

/**
 * Generates a realistic Autodesk CAD L-Bracket 3D assembly in standard ASCII DXF format.
 */
export function generateSampleCadBracketDxf(): string {
  const positions: number[] = [];
  const indices: number[] = [];

  const pushBox = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) => {
    const base = positions.length / 3;
    const hx = sx * 0.5;
    const hy = sy * 0.5;
    const hz = sz * 0.5;
    const corners: Array<[number, number, number]> = [
      [-hx, -hy, -hz],
      [hx, -hy, -hz],
      [hx, hy, -hz],
      [-hx, hy, -hz],
      [-hx, -hy, hz],
      [hx, -hy, hz],
      [hx, hy, hz],
      [-hx, hy, hz],
    ];
    for (const [x, y, z] of corners) {
      positions.push(x + cx, y + cy, z + cz);
    }
    const faces = [
      [0, 2, 1], [0, 3, 2],
      [4, 5, 6], [4, 6, 7],
      [0, 1, 5], [0, 5, 4],
      [3, 7, 6], [3, 6, 2],
      [0, 4, 7], [0, 7, 3],
      [1, 2, 6], [1, 6, 5],
    ];
    for (const [a, b, c] of faces) {
      indices.push(base + a, base + b, base + c);
    }
  };

  const pushPrismGusset = (zCenter: number, thickness: number) => {
    const base = positions.length / 3;
    const hz = thickness * 0.5;
    // Right-triangle reinforcement gusset connecting base & vertical wall
    positions.push(
      -0.8, 0.25, zCenter - hz,
      0.85, 0.25, zCenter - hz,
      -0.8, 1.85, zCenter - hz,
      -0.8, 0.25, zCenter + hz,
      0.85, 0.25, zCenter + hz,
      -0.8, 1.85, zCenter + hz
    );
    indices.push(
      base + 0, base + 2, base + 1,
      base + 3, base + 4, base + 5,
      base + 0, base + 1, base + 4, base + 0, base + 4, base + 3,
      base + 1, base + 2, base + 5, base + 1, base + 5, base + 4,
      base + 2, base + 0, base + 3, base + 2, base + 3, base + 5
    );
  };

  // Horizontal mounting base plate
  pushBox(0, 0.125, 0, 2.2, 0.25, 1.6);
  // Vertical structural flange
  pushBox(-0.975, 1.15, 0, 0.25, 2.05, 1.6);
  // Twin triangular reinforcement ribs
  pushPrismGusset(-0.48, 0.14);
  pushPrismGusset(0.48, 0.14);
  // Two raised bolt bosses on horizontal plate
  pushBox(0.55, 0.31, -0.45, 0.34, 0.12, 0.34);
  pushBox(0.55, 0.31, 0.45, 0.34, 0.12, 0.34);

  const posArr = new Float32Array(positions);
  const idxArr = new Uint32Array(indices);
  return serializeDxf({
    name: 'CAD_BRACKET',
    positions: posArr,
    normals: computeVertexNormals(posArr, idxArr),
    indices: idxArr,
  });
}
