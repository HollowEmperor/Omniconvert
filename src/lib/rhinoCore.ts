/**
 * Rhinoceros 3D (.3dm) OpenNURBS parser, serializer, and sample generator
 * powered by the official McNeel rhino3dm WebAssembly library.
 */

import rhino3dm from 'rhino3dm';
import { MeshData, computeVertexNormals } from './meshCore';

type RhinoModule = Awaited<ReturnType<typeof rhino3dm>>;

let rhinoPromise: Promise<RhinoModule> | null = null;

export function getRhino3dm(): Promise<RhinoModule> {
  if (!rhinoPromise) {
    const isBrowser = typeof window !== 'undefined';
    rhinoPromise = rhino3dm(
      isBrowser
        ? {
            locateFile: (file: string) =>
              file.endsWith('.wasm') ? '/rhino3dm/rhino3dm.wasm' : file,
          }
        : undefined
    );
  }
  return rhinoPromise;
}

function appendRhinoMesh(
  rhinoMesh: any,
  allPositions: number[],
  allIndices: number[]
): void {
  if (!rhinoMesh) return;
  const verts = rhinoMesh.vertices();
  const faces = rhinoMesh.faces();
  const vCount: number = verts?.count ?? 0;
  const fCount: number = faces?.count ?? 0;
  if (vCount === 0 || fCount === 0) return;

  const base = allPositions.length / 3;
  for (let i = 0; i < vCount; i += 1) {
    const pt = verts.get(i);
    allPositions.push(pt[0], pt[1], pt[2]);
  }

  for (let i = 0; i < fCount; i += 1) {
    const f = faces.get(i);
    const a = f[0];
    const b = f[1];
    const c = f[2];
    const d = f[3];
    allIndices.push(base + a, base + b, base + c);
    if (d !== undefined && d !== c) {
      allIndices.push(base + a, base + c, base + d);
    }
  }
}

function deleteWasm(obj: unknown): void {
  if (obj && typeof (obj as { delete?: () => void }).delete === 'function') {
    (obj as { delete: () => void }).delete();
  }
}

export async function parse3dm(bytes: Uint8Array, name = 'rhino_model'): Promise<MeshData> {
  const rhino = await getRhino3dm();
  const doc = rhino.File3dm.fromByteArray(bytes);
  if (!doc) {
    throw new Error('Unable to parse Rhino .3dm file.');
  }

  const allPositions: number[] = [];
  const allIndices: number[] = [];

  try {
    const objects = doc.objects();
    const count = objects.count;

    for (let i = 0; i < count; i += 1) {
      const obj = objects.get(i);
      const geom = obj.geometry() as any;
      if (!geom) continue;

      if (geom.objectType === rhino.ObjectType.Mesh) {
        appendRhinoMesh(geom, allPositions, allIndices);
      } else if (geom.objectType === rhino.ObjectType.Brep && typeof geom.faces === 'function') {
        const brepFaces = geom.faces();
        const faceCount = brepFaces?.count ?? 0;
        for (let f = 0; f < faceCount; f += 1) {
          const bf = brepFaces.get(f);
          const renderMesh = bf?.getMesh?.(rhino.MeshType.Any);
          if (renderMesh) {
            appendRhinoMesh(renderMesh, allPositions, allIndices);
            deleteWasm(renderMesh);
          }
        }
      } else if (geom.objectType === rhino.ObjectType.Extrusion && typeof geom.getMesh === 'function') {
        const extMesh = geom.getMesh(rhino.MeshType.Any);
        if (extMesh) {
          appendRhinoMesh(extMesh, allPositions, allIndices);
          deleteWasm(extMesh);
        }
      } else if (geom.objectType === rhino.ObjectType.SubD) {
        const subdFactory = (rhino.Mesh as any).createFromSubDControlNet;
        const subdMesh = typeof subdFactory === 'function' ? subdFactory(geom) : null;
        if (subdMesh) {
          appendRhinoMesh(subdMesh, allPositions, allIndices);
          deleteWasm(subdMesh);
        }
      }
      deleteWasm(geom);
    }
  } finally {
    deleteWasm(doc);
  }

  if (allPositions.length === 0 || allIndices.length === 0) {
    throw new Error(
      'Rhino .3dm file contains no polygon or cached render meshes. Save with shaded render meshes in Rhino to convert.'
    );
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

export async function serialize3dm(mesh: MeshData): Promise<Uint8Array> {
  const rhino = await getRhino3dm();
  const doc = new rhino.File3dm();
  const rMesh = new rhino.Mesh();

  try {
    const vCount = Math.floor(mesh.positions.length / 3);
    for (let i = 0; i < vCount; i += 1) {
      rMesh.vertices().add(
        mesh.positions[i * 3],
        mesh.positions[i * 3 + 1],
        mesh.positions[i * 3 + 2]
      );
    }

    for (let i = 0; i < mesh.indices.length; i += 3) {
      rMesh.faces().addTriFace(
        mesh.indices[i],
        mesh.indices[i + 1],
        mesh.indices[i + 2]
      );
    }

    rMesh.normals().computeNormals();
    rMesh.compact();

    const attrs = new rhino.ObjectAttributes();
    attrs.name = mesh.name || 'transmute_mesh';
    doc.objects().addMesh(rMesh, attrs);
    deleteWasm(attrs);

    const rawBytes = doc.toByteArray();
    return new Uint8Array(rawBytes);
  } finally {
    deleteWasm(rMesh);
    deleteWasm(doc);
  }
}

/**
 * Generates a real Rhinoceros 3D (.3dm) architectural doubly-curved hyperbolic pavilion canopy
 * with thickened ribs and base plinth.
 */
export async function generateSampleRhinoShell3dm(): Promise<Uint8Array> {
  const positions: number[] = [];
  const indices: number[] = [];

  const cols = 24;
  const rows = 24;
  const span = 2.6;
  const thickness = 0.09;

  const heightAt = (u: number, v: number) => {
    const x = (u - 0.5) * 2;
    const z = (v - 0.5) * 2;
    // Architectural hyperbolic paraboloid canopy lifted gracefully off ground
    return 0.92 + 0.42 * (x * x - z * z) + 0.18 * Math.cos(x * Math.PI * 0.5) * Math.cos(z * Math.PI * 0.5);
  };

  // Top & bottom shell vertex grids
  const topBase = 0;
  for (let r = 0; r <= rows; r += 1) {
    const v = r / rows;
    for (let c = 0; c <= cols; c += 1) {
      const u = c / cols;
      const x = (u - 0.5) * span;
      const z = (v - 0.5) * span;
      const y = heightAt(u, v);
      positions.push(x, y, z);
    }
  }

  const stride = cols + 1;
  const botBase = positions.length / 3;
  for (let r = 0; r <= rows; r += 1) {
    const v = r / rows;
    for (let c = 0; c <= cols; c += 1) {
      const u = c / cols;
      const x = (u - 0.5) * span;
      const z = (v - 0.5) * span;
      const y = heightAt(u, v) - thickness;
      positions.push(x, y, z);
    }
  }

  // Top & bottom surface quads
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const a = topBase + r * stride + c;
      const b = a + 1;
      const d = a + stride;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);

      const ba = botBase + r * stride + c;
      const bb = ba + 1;
      const bd = ba + stride;
      const be = bd + 1;
      indices.push(ba, bb, bd, bb, be, bd);
    }
  }

  // Stitch perimeter edges so shell is watertight
  for (let c = 0; c < cols; c += 1) {
    // Front edge (r = 0)
    const t0 = topBase + c;
    const t1 = t0 + 1;
    const b0 = botBase + c;
    const b1 = b0 + 1;
    indices.push(t0, t1, b1, t0, b1, b0);

    // Back edge (r = rows)
    const tr0 = topBase + rows * stride + c;
    const tr1 = tr0 + 1;
    const br0 = botBase + rows * stride + c;
    const br1 = br0 + 1;
    indices.push(tr0, br1, tr1, tr0, br0, br1);
  }
  for (let r = 0; r < rows; r += 1) {
    // Left edge (c = 0)
    const t0 = topBase + r * stride;
    const t1 = t0 + stride;
    const b0 = botBase + r * stride;
    const b1 = b0 + stride;
    indices.push(t0, b1, t1, t0, b0, b1);

    // Right edge (c = cols)
    const tr0 = topBase + r * stride + cols;
    const tr1 = tr0 + stride;
    const br0 = botBase + r * stride + cols;
    const br1 = br0 + stride;
    indices.push(tr0, tr1, br1, tr0, br1, br0);
  }

  // 4 slender architectural support columns down to y=0
  const pushColumn = (cx: number, cz: number, topY: number) => {
    const base = positions.length / 3;
    const rad = 0.075;
    const segs = 12;
    for (let i = 0; i < segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      positions.push(cx + Math.cos(a) * rad, 0, cz + Math.sin(a) * rad);
      positions.push(cx + Math.cos(a) * rad, topY, cz + Math.sin(a) * rad);
    }
    for (let i = 0; i < segs; i += 1) {
      const next = (i + 1) % segs;
      const b0 = base + i * 2;
      const t0 = b0 + 1;
      const b1 = base + next * 2;
      const t1 = b1 + 1;
      indices.push(b0, b1, t1, b0, t1, t0);
    }
  };

  const colOffset = span * 0.36;
  const colPositions: Array<[number, number, number, number]> = [
    [-colOffset, -colOffset, 0.14, 0.14],
    [colOffset, -colOffset, 0.86, 0.14],
    [-colOffset, colOffset, 0.14, 0.86],
    [colOffset, colOffset, 0.86, 0.86],
  ];
  for (const [cx, cz, u, v] of colPositions) {
    pushColumn(cx, cz, heightAt(u, v) - thickness * 0.5);
  }

  const posArr = new Float32Array(positions);
  const idxArr = new Uint32Array(indices);
  return serialize3dm({
    name: 'rhino_pavilion_shell',
    positions: posArr,
    normals: computeVertexNormals(posArr, idxArr),
    indices: idxArr,
  });
}
