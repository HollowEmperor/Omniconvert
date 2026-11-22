/**
 * Pure TypeScript 3D triangle mesh representation and parsers/serializers
 * for OBJ, STL (ASCII & Binary), PLY (ASCII), OFF, and GLB (glTF 2.0 binary).
 * Works identically in Node.js (server & unit tests) and browser runtimes.
 */

export interface MeshData {
  name: string;
  /** Flat array of [x, y, z, ...] vertex positions */
  positions: Float32Array;
  /** Flat array of [nx, ny, nz, ...] vertex normals (optional) */
  normals?: Float32Array;
  /** Flat array of triangle vertex indices [i0, i1, i2, ...] */
  indices: Uint32Array;
}

export interface MeshTransformOptions {
  scale?: number;
  center?: boolean;
  axisSwap?: 'none' | 'z-to-y' | 'y-to-z';
  recomputeNormals?: boolean;
}

export interface MeshStats {
  vertices: number;
  triangles: number;
  bounds: { width: number; height: number; depth: number };
}

export function computeMeshStats(mesh: MeshData): MeshStats {
  const vertices = Math.floor(mesh.positions.length / 3);
  const triangles = Math.floor(mesh.indices.length / 3);
  if (vertices === 0) {
    return { vertices: 0, triangles: 0, bounds: { width: 0, height: 0, depth: 0 } };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < vertices; i += 1) {
    const x = mesh.positions[i * 3];
    const y = mesh.positions[i * 3 + 1];
    const z = mesh.positions[i * 3 + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  return {
    vertices,
    triangles,
    bounds: {
      width: Number((maxX - minX).toFixed(3)),
      height: Number((maxY - minY).toFixed(3)),
      depth: Number((maxZ - minZ).toFixed(3)),
    },
  };
}

export function computeVertexNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);

  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;

    const ax = positions[ia];
    const ay = positions[ia + 1];
    const az = positions[ia + 2];

    const abx = positions[ib] - ax;
    const aby = positions[ib + 1] - ay;
    const abz = positions[ib + 2] - az;

    const acx = positions[ic] - ax;
    const acy = positions[ic + 1] - ay;
    const acz = positions[ic + 2] - az;

    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;

    normals[ia] += nx;
    normals[ia + 1] += ny;
    normals[ia + 2] += nz;
    normals[ib] += nx;
    normals[ib + 1] += ny;
    normals[ib + 2] += nz;
    normals[ic] += nx;
    normals[ic + 1] += ny;
    normals[ic + 2] += nz;
  }

  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (len > 1e-8) {
      normals[i] /= len;
      normals[i + 1] /= len;
      normals[i + 2] /= len;
    } else {
      normals[i] = 0;
      normals[i + 1] = 1;
      normals[i + 2] = 0;
    }
  }
  return normals;
}

export function transformMesh(mesh: MeshData, opts: MeshTransformOptions): MeshData {
  const positions = new Float32Array(mesh.positions);
  const count = Math.floor(positions.length / 3);
  const scale = opts.scale && opts.scale > 0 ? opts.scale : 1;

  if (opts.axisSwap === 'z-to-y') {
    for (let i = 0; i < count; i += 1) {
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      positions[i * 3 + 1] = z;
      positions[i * 3 + 2] = -y;
    }
  } else if (opts.axisSwap === 'y-to-z') {
    for (let i = 0; i < count; i += 1) {
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      positions[i * 3 + 1] = -z;
      positions[i * 3 + 2] = y;
    }
  }

  if (opts.center && count > 0) {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < count; i += 1) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] -= cx;
      positions[i * 3 + 1] -= cy;
      positions[i * 3 + 2] -= cz;
    }
  }

  if (scale !== 1) {
    for (let i = 0; i < positions.length; i += 1) {
      positions[i] *= scale;
    }
  }

  const normals =
    opts.recomputeNormals || opts.axisSwap !== 'none' || !mesh.normals
      ? computeVertexNormals(positions, mesh.indices)
      : new Float32Array(mesh.normals);

  return {
    name: mesh.name,
    positions,
    normals,
    indices: new Uint32Array(mesh.indices),
  };
}

export function parseObj(text: string, name = 'mesh'): MeshData {
  const verts: number[] = [];
  const indices: number[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts[0] === 'v' && parts.length >= 4) {
      verts.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
    } else if (parts[0] === 'f' && parts.length >= 4) {
      const vertCount = verts.length / 3;
      const faceIdx: number[] = [];
      for (let i = 1; i < parts.length; i += 1) {
        const rawIdx = Number(parts[i].split('/')[0]);
        if (!Number.isFinite(rawIdx) || rawIdx === 0) continue;
        const resolved = rawIdx > 0 ? rawIdx - 1 : vertCount + rawIdx;
        if (resolved >= 0 && resolved < vertCount) {
          faceIdx.push(resolved);
        }
      }
      // Fan triangulation for n-gons
      for (let i = 1; i + 1 < faceIdx.length; i += 1) {
        indices.push(faceIdx[0], faceIdx[i], faceIdx[i + 1]);
      }
    }
  }

  if (verts.length === 0 || indices.length === 0) {
    throw new Error('OBJ file contains no valid vertices or faces.');
  }

  const positions = new Float32Array(verts);
  const idx = new Uint32Array(indices);
  return {
    name,
    positions,
    normals: computeVertexNormals(positions, idx),
    indices: idx,
  };
}

export function serializeObj(mesh: MeshData): string {
  const lines: string[] = [`# Exported by Transmute`, `o ${mesh.name || 'model'}`];
  const vCount = Math.floor(mesh.positions.length / 3);
  for (let i = 0; i < vCount; i += 1) {
    lines.push(
      `v ${mesh.positions[i * 3].toFixed(6)} ${mesh.positions[i * 3 + 1].toFixed(6)} ${mesh.positions[i * 3 + 2].toFixed(6)}`
    );
  }
  const normals = mesh.normals ?? computeVertexNormals(mesh.positions, mesh.indices);
  for (let i = 0; i < vCount; i += 1) {
    lines.push(
      `vn ${normals[i * 3].toFixed(6)} ${normals[i * 3 + 1].toFixed(6)} ${normals[i * 3 + 2].toFixed(6)}`
    );
  }
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i] + 1;
    const b = mesh.indices[i + 1] + 1;
    const c = mesh.indices[i + 2] + 1;
    lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
  }
  return `${lines.join('\n')}\n`;
}

export function parseOff(text: string, name = 'mesh'): MeshData {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2 || !lines[0].toUpperCase().startsWith('OFF')) {
    throw new Error('Invalid OFF header.');
  }

  let cursor = 1;
  let countsLine = lines[0].slice(3).trim();
  if (!countsLine) {
    countsLine = lines[1];
    cursor = 2;
  }

  const [numVerts, numFaces] = countsLine.split(/\s+/).map(Number);
  if (!Number.isFinite(numVerts) || !Number.isFinite(numFaces) || numVerts <= 0) {
    throw new Error('Invalid OFF vertex/face counts.');
  }

  const positions = new Float32Array(numVerts * 3);
  for (let i = 0; i < numVerts; i += 1) {
    const parts = (lines[cursor + i] ?? '').split(/\s+/).map(Number);
    positions[i * 3] = parts[0] ?? 0;
    positions[i * 3 + 1] = parts[1] ?? 0;
    positions[i * 3 + 2] = parts[2] ?? 0;
  }

  const indices: number[] = [];
  for (let i = 0; i < numFaces; i += 1) {
    const parts = (lines[cursor + numVerts + i] ?? '').split(/\s+/).map(Number);
    const n = parts[0];
    if (!Number.isFinite(n) || n < 3) continue;
    for (let k = 1; k + 1 < n; k += 1) {
      indices.push(parts[1], parts[1 + k], parts[2 + k]);
    }
  }

  const idx = new Uint32Array(indices);
  return {
    name,
    positions,
    normals: computeVertexNormals(positions, idx),
    indices: idx,
  };
}

export function serializeOff(mesh: MeshData): string {
  const vCount = Math.floor(mesh.positions.length / 3);
  const fCount = Math.floor(mesh.indices.length / 3);
  const lines: string[] = ['OFF', `${vCount} ${fCount} 0`];
  for (let i = 0; i < vCount; i += 1) {
    lines.push(
      `${mesh.positions[i * 3].toFixed(6)} ${mesh.positions[i * 3 + 1].toFixed(6)} ${mesh.positions[i * 3 + 2].toFixed(6)}`
    );
  }
  for (let i = 0; i < mesh.indices.length; i += 3) {
    lines.push(`3 ${mesh.indices[i]} ${mesh.indices[i + 1]} ${mesh.indices[i + 2]}`);
  }
  return `${lines.join('\n')}\n`;
}

export function serializeStlBinary(mesh: MeshData): Uint8Array {
  const triCount = Math.floor(mesh.indices.length / 3);
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);
  const headerText = 'Exported by Transmute Universal 3D Converter';
  for (let i = 0; i < headerText.length && i < 80; i += 1) {
    view.setUint8(i, headerText.charCodeAt(i));
  }
  view.setUint32(80, triCount, true);

  let offset = 84;
  for (let t = 0; t < triCount; t += 1) {
    const ia = mesh.indices[t * 3] * 3;
    const ib = mesh.indices[t * 3 + 1] * 3;
    const ic = mesh.indices[t * 3 + 2] * 3;

    const ax = mesh.positions[ia];
    const ay = mesh.positions[ia + 1];
    const az = mesh.positions[ia + 2];
    const bx = mesh.positions[ib];
    const by = mesh.positions[ib + 1];
    const bz = mesh.positions[ib + 2];
    const cx = mesh.positions[ic];
    const cy = mesh.positions[ic + 1];
    const cz = mesh.positions[ic + 2];

    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-8) {
      nx /= len;
      ny /= len;
      nz /= len;
    }

    view.setFloat32(offset, nx, true);
    view.setFloat32(offset + 4, ny, true);
    view.setFloat32(offset + 8, nz, true);
    view.setFloat32(offset + 12, ax, true);
    view.setFloat32(offset + 16, ay, true);
    view.setFloat32(offset + 20, az, true);
    view.setFloat32(offset + 24, bx, true);
    view.setFloat32(offset + 28, by, true);
    view.setFloat32(offset + 32, bz, true);
    view.setFloat32(offset + 36, cx, true);
    view.setFloat32(offset + 40, cy, true);
    view.setFloat32(offset + 44, cz, true);
    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }

  return new Uint8Array(buffer);
}

export function serializeStlAscii(mesh: MeshData): string {
  const name = (mesh.name || 'model').replace(/\s+/g, '_');
  const lines: string[] = [`solid ${name}`];
  const triCount = Math.floor(mesh.indices.length / 3);

  for (let t = 0; t < triCount; t += 1) {
    const ia = mesh.indices[t * 3] * 3;
    const ib = mesh.indices[t * 3 + 1] * 3;
    const ic = mesh.indices[t * 3 + 2] * 3;

    const ax = mesh.positions[ia];
    const ay = mesh.positions[ia + 1];
    const az = mesh.positions[ia + 2];
    const bx = mesh.positions[ib];
    const by = mesh.positions[ib + 1];
    const bz = mesh.positions[ib + 2];
    const cx = mesh.positions[ic];
    const cy = mesh.positions[ic + 1];
    const cz = mesh.positions[ic + 2];

    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-8) {
      nx /= len;
      ny /= len;
      nz /= len;
    }

    lines.push(`  facet normal ${nx.toExponential(6)} ${ny.toExponential(6)} ${nz.toExponential(6)}`);
    lines.push('    outer loop');
    lines.push(`      vertex ${ax.toExponential(6)} ${ay.toExponential(6)} ${az.toExponential(6)}`);
    lines.push(`      vertex ${bx.toExponential(6)} ${by.toExponential(6)} ${bz.toExponential(6)}`);
    lines.push(`      vertex ${cx.toExponential(6)} ${cy.toExponential(6)} ${cz.toExponential(6)}`);
    lines.push('    endloop');
    lines.push('  endfacet');
  }

  lines.push(`endsolid ${name}`);
  return `${lines.join('\n')}\n`;
}

export function parseStl(bytes: Uint8Array, name = 'mesh'): MeshData {
  // Detect binary STL by exact expected byte size
  if (bytes.byteLength >= 84) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const triCount = view.getUint32(80, true);
    if (84 + triCount * 50 === bytes.byteLength && triCount > 0) {
      const positions = new Float32Array(triCount * 9);
      const indices = new Uint32Array(triCount * 3);
      let offset = 84;
      for (let t = 0; t < triCount; t += 1) {
        offset += 12; // skip facet normal
        for (let v = 0; v < 3; v += 1) {
          const base = (t * 3 + v) * 3;
          positions[base] = view.getFloat32(offset, true);
          positions[base + 1] = view.getFloat32(offset + 4, true);
          positions[base + 2] = view.getFloat32(offset + 8, true);
          indices[t * 3 + v] = t * 3 + v;
          offset += 12;
        }
        offset += 2; // attribute byte count
      }
      return {
        name,
        positions,
        normals: computeVertexNormals(positions, indices),
        indices,
      };
    }
  }

  // Fallback ASCII STL
  const text = new TextDecoder('utf-8').decode(bytes);
  const verts: number[] = [];
  const regex = /vertex\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    verts.push(Number(match[1]), Number(match[2]), Number(match[3]));
  }
  if (verts.length < 9) {
    throw new Error('STL file contains no valid triangles.');
  }
  const positions = new Float32Array(verts);
  const vCount = Math.floor(positions.length / 3);
  const indices = new Uint32Array(vCount);
  for (let i = 0; i < vCount; i += 1) indices[i] = i;
  return {
    name,
    positions,
    normals: computeVertexNormals(positions, indices),
    indices,
  };
}

export function serializePlyAscii(mesh: MeshData): string {
  const vCount = Math.floor(mesh.positions.length / 3);
  const fCount = Math.floor(mesh.indices.length / 3);
  const normals = mesh.normals ?? computeVertexNormals(mesh.positions, mesh.indices);

  const lines = [
    'ply',
    'format ascii 1.0',
    `element vertex ${vCount}`,
    'property float x',
    'property float y',
    'property float z',
    'property float nx',
    'property float ny',
    'property float nz',
    `element face ${fCount}`,
    'property list uchar int vertex_indices',
    'end_header',
  ];

  for (let i = 0; i < vCount; i += 1) {
    lines.push(
      `${mesh.positions[i * 3].toFixed(6)} ${mesh.positions[i * 3 + 1].toFixed(6)} ${mesh.positions[i * 3 + 2].toFixed(6)} ${normals[i * 3].toFixed(6)} ${normals[i * 3 + 1].toFixed(6)} ${normals[i * 3 + 2].toFixed(6)}`
    );
  }
  for (let i = 0; i < mesh.indices.length; i += 3) {
    lines.push(`3 ${mesh.indices[i]} ${mesh.indices[i + 1]} ${mesh.indices[i + 2]}`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Parses Autodesk 3ds Max binary .3ds meshes (chunks 0x4D4D -> 0x3D3D -> 0x4000 -> 0x4100 -> 0x4110/0x4120).
 */
export function parse3ds(bytes: Uint8Array, name = 'mesh_3ds'): MeshData {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 6 || view.getUint16(0, true) !== 0x4d4d) {
    throw new Error('Invalid 3DS file header (expected 0x4D4D main chunk).');
  }

  const allPositions: number[] = [];
  const allIndices: number[] = [];

  const readChunks = (start: number, end: number, currentVertBase: number) => {
    let offset = start;
    let vertBase = currentVertBase;

    while (offset + 6 <= end) {
      const chunkId = view.getUint16(offset, true);
      const chunkLen = view.getUint32(offset + 2, true);
      if (chunkLen < 6 || offset + chunkLen > end) break;
      const bodyStart = offset + 6;
      const bodyEnd = offset + chunkLen;

      if (chunkId === 0x4d4d || chunkId === 0x3d3d || chunkId === 0x4100) {
        readChunks(bodyStart, bodyEnd, vertBase);
      } else if (chunkId === 0x4000) {
        // Object block: null-terminated ASCII name followed by sub-chunks
        let nameEnd = bodyStart;
        while (nameEnd < bodyEnd && bytes[nameEnd] !== 0) {
          nameEnd += 1;
        }
        vertBase = allPositions.length / 3;
        readChunks(nameEnd + 1, bodyEnd, vertBase);
      } else if (chunkId === 0x4110) {
        // Vertices list
        if (bodyStart + 2 <= bodyEnd) {
          const count = view.getUint16(bodyStart, true);
          vertBase = allPositions.length / 3;
          let posOff = bodyStart + 2;
          for (let i = 0; i < count && posOff + 12 <= bodyEnd; i += 1) {
            const x = view.getFloat32(posOff, true);
            const y = view.getFloat32(posOff + 4, true);
            const z = view.getFloat32(posOff + 8, true);
            allPositions.push(x, y, z);
            posOff += 12;
          }
        }
      } else if (chunkId === 0x4120) {
        // Faces description
        if (bodyStart + 2 <= bodyEnd) {
          const count = view.getUint16(bodyStart, true);
          let faceOff = bodyStart + 2;
          for (let i = 0; i < count && faceOff + 8 <= bodyEnd; i += 1) {
            const a = view.getUint16(faceOff, true);
            const b = view.getUint16(faceOff + 2, true);
            const c = view.getUint16(faceOff + 4, true);
            allIndices.push(vertBase + a, vertBase + b, vertBase + c);
            faceOff += 8;
          }
        }
      }

      offset = bodyEnd;
    }
  };

  readChunks(0, bytes.byteLength, 0);

  if (allPositions.length === 0 || allIndices.length === 0) {
    throw new Error('3DS file contains no valid triangle mesh geometry.');
  }

  const posArr = new Float32Array(allPositions);
  const idxArr = new Uint32Array(allIndices);
  return {
    name,
    positions: posArr,
    normals: computeVertexNormals(posArr, idxArr),
    indices: idxArr,
  };
}

/**
 * Serializes a triangle mesh into Autodesk 3ds Max binary .3ds format.
 * Automatically splits meshes exceeding 65,535 vertices into multiple 3DS object blocks.
 */
export function serialize3ds(mesh: MeshData): Uint8Array {
  const MAX_CHUNK_TRIS = 21000; // <= 63,000 vertices per object chunk (fits uint16)
  const totalTris = Math.floor(mesh.indices.length / 3);
  const objectChunks: Uint8Array[] = [];
  const baseName = (mesh.name || 'model').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 8) || 'model';

  for (let startTri = 0; startTri < totalTris; startTri += MAX_CHUNK_TRIS) {
    const endTri = Math.min(totalTris, startTri + MAX_CHUNK_TRIS);
    const localVerts: number[] = [];
    const localFaces: number[] = [];
    const vertRemap = new Map<number, number>();

    for (let t = startTri; t < endTri; t += 1) {
      for (let k = 0; k < 3; k += 1) {
        const origIdx = mesh.indices[t * 3 + k];
        let localIdx = vertRemap.get(origIdx);
        if (localIdx === undefined) {
          localIdx = localVerts.length / 3;
          vertRemap.set(origIdx, localIdx);
          localVerts.push(
            mesh.positions[origIdx * 3],
            mesh.positions[origIdx * 3 + 1],
            mesh.positions[origIdx * 3 + 2]
          );
        }
        localFaces.push(localIdx);
      }
    }

    const vCount = localVerts.length / 3;
    const fCount = localFaces.length / 3;
    const vertsChunkLen = 6 + 2 + vCount * 12;
    const facesChunkLen = 6 + 2 + fCount * 8;
    const meshChunkLen = 6 + vertsChunkLen + facesChunkLen;

    const partName = `${baseName}${objectChunks.length > 0 ? objectChunks.length : ''}\0`;
    const objChunkLen = 6 + partName.length + meshChunkLen;

    const buf = new ArrayBuffer(objChunkLen);
    const view = new DataView(buf);
    const arr = new Uint8Array(buf);
    let off = 0;

    // 0x4000 Object Block
    view.setUint16(off, 0x4000, true);
    view.setUint32(off + 2, objChunkLen, true);
    off += 6;
    for (let i = 0; i < partName.length; i += 1) {
      arr[off + i] = partName.charCodeAt(i);
    }
    off += partName.length;

    // 0x4100 Triangular Mesh
    view.setUint16(off, 0x4100, true);
    view.setUint32(off + 2, meshChunkLen, true);
    off += 6;

    // 0x4110 Vertices List
    view.setUint16(off, 0x4110, true);
    view.setUint32(off + 2, vertsChunkLen, true);
    view.setUint16(off + 6, vCount, true);
    off += 8;
    for (let i = 0; i < localVerts.length; i += 1) {
      view.setFloat32(off, localVerts[i], true);
      off += 4;
    }

    // 0x4120 Faces Description
    view.setUint16(off, 0x4120, true);
    view.setUint32(off + 2, facesChunkLen, true);
    view.setUint16(off + 6, fCount, true);
    off += 8;
    for (let i = 0; i < localFaces.length; i += 3) {
      view.setUint16(off, localFaces[i], true);
      view.setUint16(off + 2, localFaces[i + 1], true);
      view.setUint16(off + 4, localFaces[i + 2], true);
      view.setUint16(off + 6, 0x0007, true);
      off += 8;
    }

    objectChunks.push(arr);
  }

  const objectsTotal = objectChunks.reduce((sum, c) => sum + c.byteLength, 0);
  const editorChunkLen = 6 + objectsTotal;
  const mainChunkLen = 6 + editorChunkLen;

  const out = new Uint8Array(mainChunkLen);
  const outView = new DataView(out.buffer);
  outView.setUint16(0, 0x4d4d, true);
  outView.setUint32(2, mainChunkLen, true);
  outView.setUint16(6, 0x3d3d, true);
  outView.setUint32(8, editorChunkLen, true);

  let cursor = 12;
  for (const chunk of objectChunks) {
    out.set(chunk, cursor);
    cursor += chunk.byteLength;
  }

  return out;
}

/**
 * Generates a realistic multi-part procedural 3D mechanical Orbital Hub mesh (OBJ)
 * consisting of a beveled main hub cylinder, 6 radial mounting flanges, an upper collar ring,
 * and an inner axle bore — all clean watertight triangle geometry.
 */
export function generateSampleOrbitalHubObj(): string {
  const positions: number[] = [];
  const indices: number[] = [];

  const pushCylinder = (
    radiusBottom: number,
    radiusTop: number,
    yBottom: number,
    yTop: number,
    segments: number,
    offsetX = 0,
    offsetZ = 0
  ) => {
    const base = positions.length / 3;
    // Bottom center & top center
    positions.push(offsetX, yBottom, offsetZ); // base + 0
    positions.push(offsetX, yTop, offsetZ); // base + 1

    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      positions.push(offsetX + cos * radiusBottom, yBottom, offsetZ + sin * radiusBottom);
      positions.push(offsetX + cos * radiusTop, yTop, offsetZ + sin * radiusTop);
    }

    for (let i = 0; i < segments; i += 1) {
      const next = (i + 1) % segments;
      const b0 = base + 2 + i * 2;
      const t0 = b0 + 1;
      const b1 = base + 2 + next * 2;
      const t1 = b1 + 1;
      // Side quad
      indices.push(b0, b1, t1, b0, t1, t0);
      // Bottom cap
      indices.push(base, b1, b0);
      // Top cap
      indices.push(base + 1, t0, t1);
    }
  };

  const pushBox = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rotY = 0) => {
    const base = positions.length / 3;
    const hx = sx * 0.5;
    const hy = sy * 0.5;
    const hz = sz * 0.5;
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
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
      const rx = x * cos - z * sin + cx;
      const rz = x * sin + z * cos + cz;
      positions.push(rx, y + cy, rz);
    }
    const faces = [
      [0, 2, 1], [0, 3, 2], // back
      [4, 5, 6], [4, 6, 7], // front
      [0, 1, 5], [0, 5, 4], // bottom
      [3, 7, 6], [3, 6, 2], // top
      [0, 4, 7], [0, 7, 3], // left
      [1, 2, 6], [1, 6, 5], // right
    ];
    for (const [a, b, c] of faces) {
      indices.push(base + a, base + b, base + c);
    }
  };

  // 1. Primary beveled base ring + main hub drum
  pushCylinder(1.35, 1.28, 0.0, 0.28, 36);
  pushCylinder(1.05, 0.98, 0.28, 0.96, 36);
  // 2. Upper chamfered collar + central spindle
  pushCylinder(0.76, 0.64, 0.96, 1.32, 32);
  pushCylinder(0.38, 0.34, 1.32, 1.62, 24);
  // 3. 6 radial structural ribs + perimeter mounting bosses
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const rx = Math.cos(angle) * 1.18;
    const rz = Math.sin(angle) * 1.18;
    pushBox(Math.cos(angle) * 0.98, 0.62, Math.sin(angle) * 0.98, 0.56, 0.52, 0.18, -angle);
    pushCylinder(0.22, 0.2, 0.0, 0.44, 18, rx, rz);
  }

  const posArr = new Float32Array(positions);
  const idxArr = new Uint32Array(indices);
  return serializeObj({
    name: 'orbital_hub',
    positions: posArr,
    normals: computeVertexNormals(posArr, idxArr),
    indices: idxArr,
  });
}
