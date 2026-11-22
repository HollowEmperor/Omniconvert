import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { PLYExporter } from 'three/addons/exporters/PLYExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';
import {
  ConversionOptions,
  DEFAULT_OPTIONS,
  buildOutputFilename,
  getFormatSpec,
  normalizeExtension,
} from './formats';
import { parseDxf, serializeDxf } from './dxfCore';
import { MeshData, parse3ds, parseOff, serialize3ds, serializeOff } from './meshCore';
import { parse3dm, serialize3dm } from './rhinoCore';
import { ConversionResultData } from '../types/converter';

export function detectSoftwareWebGL(): boolean {
  if (typeof document === 'undefined') return true;
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

function createStudioMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.45,
    roughness: 0.36,
    side: THREE.DoubleSide,
  });
}

function meshDataToGroup(mesh: MeshData): THREE.Group {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  if (mesh.normals) {
    geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  }
  geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  if (!mesh.normals) {
    geo.computeVertexNormals();
  }
  const obj = new THREE.Mesh(geo, createStudioMaterial());
  obj.name = mesh.name || 'model';
  const group = new THREE.Group();
  group.add(obj);
  return group;
}

export async function loadThreeObjectFromBuffer(
  buffer: ArrayBuffer,
  sourceExt: string,
  fileName: string
): Promise<THREE.Group> {
  const ext = normalizeExtension(sourceExt);
  const group = new THREE.Group();
  group.name = fileName.replace(/\.[^.]+$/, '') || 'model';

  if (ext === 'glb' || ext === 'gltf') {
    const loader = new GLTFLoader();
    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
      loader.parse(buffer, '', resolve, reject);
    });
    group.add(gltf.scene);
    return group;
  }

  if (ext === 'obj') {
    const text = new TextDecoder('utf-8').decode(buffer);
    const parsed = new OBJLoader().parse(text);
    parsed.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const m = child as THREE.Mesh;
        // OBJLoader creates a default white MeshPhongMaterial when no MTL is present;
        // replace with PBR MeshStandardMaterial so glTF/GLB/USDZ exports cleanly with studio shading.
        const mat = m.material as THREE.MeshPhongMaterial | undefined;
        if (!mat || (mat.isMeshPhongMaterial && !mat.map)) {
          m.material = createStudioMaterial();
        }
      }
    });
    group.add(parsed);
    return group;
  }

  if (ext === 'stl') {
    const geo = new STLLoader().parse(buffer);
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, createStudioMaterial()));
    return group;
  }

  if (ext === 'ply') {
    const geo = new PLYLoader().parse(buffer);
    geo.computeVertexNormals();
    const hasColors = Boolean(geo.getAttribute('color'));
    const mat = new THREE.MeshStandardMaterial({
      color: hasColors ? 0xffffff : 0xcbd5e1,
      vertexColors: hasColors,
      metalness: 0.25,
      roughness: 0.45,
      side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(geo, mat));
    return group;
  }

  if (ext === 'fbx') {
    const parsed = new FBXLoader().parse(buffer, '');
    group.add(parsed);
    return group;
  }

  if (ext === 'dae') {
    const text = new TextDecoder('utf-8').decode(buffer);
    const collada = new ColladaLoader().parse(text, '');
    if (!collada || !collada.scene) {
      throw new Error('COLLADA (.dae) file could not be parsed.');
    }
    group.add(collada.scene);
    return group;
  }

  if (ext === '3mf') {
    const parsed = new ThreeMFLoader().parse(buffer);
    group.add(parsed);
    return group;
  }

  if (ext === 'off') {
    const text = new TextDecoder('utf-8').decode(buffer);
    const parsed = parseOff(text, group.name);
    return meshDataToGroup(parsed);
  }

  if (ext === 'dxf') {
    const text = new TextDecoder('utf-8').decode(buffer);
    const parsed = parseDxf(text, group.name);
    return meshDataToGroup(parsed);
  }

  if (ext === '3ds') {
    const parsed = parse3ds(new Uint8Array(buffer), group.name);
    return meshDataToGroup(parsed);
  }

  if (ext === '3dm') {
    const parsed = await parse3dm(new Uint8Array(buffer), group.name);
    return meshDataToGroup(parsed);
  }

  throw new Error(`Unsupported 3D input format: ${ext.toUpperCase()}`);
}

export function collectSceneStats(root: THREE.Object3D): {
  vertices: number;
  triangles: number;
  meshCount: number;
  width: number;
  height: number;
  depth: number;
} {
  root.updateMatrixWorld(true);
  let vertices = 0;
  let triangles = 0;
  let meshCount = 0;

  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      meshCount += 1;
      const posAttr = mesh.geometry?.getAttribute('position');
      if (posAttr) {
        vertices += posAttr.count;
        if (mesh.geometry.index) {
          triangles += Math.floor(mesh.geometry.index.count / 3);
        } else {
          triangles += Math.floor(posAttr.count / 3);
        }
      }
    }
  });

  const box = new THREE.Box3().setFromObject(root);
  const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
  return {
    vertices,
    triangles,
    meshCount,
    width: Number(size.x.toFixed(2)),
    height: Number(size.y.toFixed(2)),
    depth: Number(size.z.toFixed(2)),
  };
}

function applyTransformsAndCollectStats(
  root: THREE.Group,
  opts: ConversionOptions
): { vertices: number; triangles: number; meshCount: number; width: number; height: number; depth: number } {
  root.updateMatrixWorld(true);

  if (opts.modelAxisSwap === 'z-to-y') {
    root.rotation.x -= Math.PI / 2;
  } else if (opts.modelAxisSwap === 'y-to-z') {
    root.rotation.x += Math.PI / 2;
  }
  root.updateMatrixWorld(true);

  if (opts.modelCenter) {
    const box = new THREE.Box3().setFromObject(root);
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      root.position.sub(center);
      root.updateMatrixWorld(true);
    }
  }

  const scale = opts.modelScale && opts.modelScale > 0 ? opts.modelScale : 1;
  if (scale !== 1) {
    root.scale.multiplyScalar(scale);
    root.updateMatrixWorld(true);
  }

  // Bake root transform into child geometries so every exporter (OBJ/STL/PLY/GLB/USDZ) reflects exact options
  const rootMatrix = root.matrixWorld.clone();
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);

  let vertices = 0;
  let triangles = 0;
  let meshCount = 0;

  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      meshCount += 1;
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(rootMatrix);
      if (opts.modelRecomputeNormals || !geo.getAttribute('normal')) {
        geo.computeVertexNormals();
      }
      mesh.geometry.dispose();
      mesh.geometry = geo;

      const posAttr = geo.getAttribute('position');
      if (posAttr) {
        vertices += posAttr.count;
        if (geo.index) {
          triangles += Math.floor(geo.index.count / 3);
        } else {
          triangles += Math.floor(posAttr.count / 3);
        }
      }
    }
  });

  const finalBox = new THREE.Box3().setFromObject(root);
  const size = finalBox.isEmpty() ? new THREE.Vector3() : finalBox.getSize(new THREE.Vector3());

  return {
    vertices,
    triangles,
    meshCount,
    width: Number(size.x.toFixed(2)),
    height: Number(size.y.toFixed(2)),
    depth: Number(size.z.toFixed(2)),
  };
}

function extractCombinedMeshData(root: THREE.Group, name: string): MeshData {
  root.updateMatrixWorld(true);
  const allPos: number[] = [];
  const allIdx: number[] = [];
  const v = new THREE.Vector3();

  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const geo = mesh.geometry;
      const pos = geo.getAttribute('position');
      if (!pos) return;

      const base = allPos.length / 3;
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        allPos.push(v.x, v.y, v.z);
      }

      if (geo.index) {
        for (let i = 0; i < geo.index.count; i += 1) {
          allIdx.push(base + geo.index.getX(i));
        }
      } else {
        for (let i = 0; i < pos.count; i += 1) {
          allIdx.push(base + i);
        }
      }
    }
  });

  return {
    name,
    positions: new Float32Array(allPos),
    indices: new Uint32Array(allIdx),
  };
}

async function renderStudioSnapshot(
  root: THREE.Group,
  targetExt: 'png' | 'jpg',
  quality: number
): Promise<Blob> {
  const isSoftwareGl = detectSoftwareWebGL();
  const width = 1024;
  const height = 768;

  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf8fafc);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0xf1f5f9, 0x94a3b8, 0.9);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff7ed, 2.0);
  key.position.set(5, 8, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdbeafe, 0.9);
  rim.position.set(-6, 4, -5);
  scene.add(rim);

  const clone = root.clone(true);
  const box = new THREE.Box3().setFromObject(clone);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);

  clone.position.sub(center);
  clone.position.y += size.y * 0.5;
  scene.add(clone);

  const grid = new THREE.GridHelper(maxDim * 3.5, 16, 0xcbd5e1, 0xe2e8f0);
  grid.position.y = -0.01;
  scene.add(grid);

  const camera = new THREE.PerspectiveCamera(40, width / height, maxDim * 0.01, maxDim * 100);
  const dist = maxDim * 1.95;
  camera.position.set(dist * 0.82, maxDim * 0.95, dist * 0.92);
  camera.lookAt(0, size.y * 0.45, 0);

  renderer.render(scene, camera);

  const mime = targetExt === 'jpg' ? 'image/jpeg' : 'image/png';
  const blob = await new Promise<Blob>((resolve, reject) => {
    renderer.domElement.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to capture 3D render snapshot.'))),
      mime,
      Math.min(1, Math.max(0.1, quality / 100))
    );
  });

  envTex.dispose();
  renderer.dispose();
  return blob;
}

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material?.dispose();
      }
    }
  });
}

export async function convertThreeModelFile(params: {
  file: File;
  sourceExt: string;
  targetExt: string;
  options?: ConversionOptions;
}): Promise<{ result: ConversionResultData; blob: Blob }> {
  const startedAt = performance.now();
  const sourceExt = normalizeExtension(params.sourceExt);
  const targetExt = normalizeExtension(params.targetExt);
  const opts: ConversionOptions = { ...DEFAULT_OPTIONS, ...(params.options ?? {}) };

  const buffer = await params.file.arrayBuffer();
  const root = await loadThreeObjectFromBuffer(buffer, sourceExt, params.file.name);

  try {
    const stats = applyTransformsAndCollectStats(root, opts);
    if (stats.meshCount === 0 || stats.vertices === 0) {
      throw new Error('No 3D mesh geometry was found in the uploaded file.');
    }

    const outFilename = buildOutputFilename(params.file.name, targetExt);
    const targetSpec = getFormatSpec(targetExt);
    const outMime = targetSpec?.mimeTypes[0] ?? 'application/octet-stream';
    const binaryOut = opts.modelBinaryOutput !== false;

    let blob: Blob;

    if (targetExt === 'glb' || targetExt === 'gltf') {
      const exporter = new GLTFExporter();
      const exported = await new Promise<ArrayBuffer | Record<string, unknown>>((resolve, reject) => {
        exporter.parse(
          root,
          (res) => resolve(res),
          (err) => reject(err instanceof Error ? err : new Error('glTF export failed.')),
          { binary: targetExt === 'glb' }
        );
      });
      if (exported instanceof ArrayBuffer) {
        blob = new Blob([exported], { type: 'model/gltf-binary' });
      } else {
        const jsonStr = JSON.stringify(exported, null, opts.prettyPrint !== false ? 2 : 0);
        blob = new Blob([jsonStr], { type: 'model/gltf+json' });
      }
    } else if (targetExt === 'obj') {
      const text = new OBJExporter().parse(root);
      blob = new Blob([text], { type: 'model/obj' });
    } else if (targetExt === 'stl') {
      const exporter = new STLExporter();
      const exported = exporter.parse(root, { binary: binaryOut });
      if (exported instanceof DataView) {
        blob = new Blob([exported.buffer as ArrayBuffer], { type: 'model/stl' });
      } else {
        blob = new Blob([exported], { type: 'model/stl' });
      }
    } else if (targetExt === 'ply') {
      const exporter = new PLYExporter();
      const exported = await new Promise<ArrayBuffer | string>((resolve, reject) => {
        exporter.parse(
          root,
          (res) => resolve(res),
          { binary: binaryOut }
        );
        // PLYExporter is synchronous in Three.js; safeguard against silent failure
        setTimeout(() => reject(new Error('PLY export timed out.')), 15000);
      });
      blob = new Blob([exported], { type: 'model/ply' });
    } else if (targetExt === 'usdz') {
      const exporter = new USDZExporter();
      const usdzBytes = await exporter.parseAsync(root);
      blob = new Blob([usdzBytes.buffer as ArrayBuffer], { type: 'model/vnd.usdz+zip' });
    } else if (targetExt === 'off') {
      const combined = extractCombinedMeshData(root, root.name);
      blob = new Blob([serializeOff(combined)], { type: 'model/off' });
    } else if (targetExt === 'dxf') {
      const combined = extractCombinedMeshData(root, root.name);
      blob = new Blob([serializeDxf(combined)], { type: 'image/vnd.dxf' });
    } else if (targetExt === '3ds') {
      const combined = extractCombinedMeshData(root, root.name);
      const bytes3ds = serialize3ds(combined);
      blob = new Blob([bytes3ds.buffer as ArrayBuffer], { type: 'image/x-3ds' });
    } else if (targetExt === '3dm') {
      const combined = extractCombinedMeshData(root, root.name);
      const bytes3dm = await serialize3dm(combined);
      blob = new Blob([bytes3dm.buffer as ArrayBuffer], { type: 'model/vnd.rhino' });
    } else if (targetExt === 'json') {
      const jsonText = JSON.stringify(root.toJSON(), null, opts.prettyPrint !== false ? 2 : 0);
      blob = new Blob([jsonText], { type: 'application/json' });
    } else if (targetExt === 'png' || targetExt === 'jpg') {
      blob = await renderStudioSnapshot(root, targetExt, opts.imageQuality ?? 90);
    } else {
      throw new Error(`Unsupported 3D export target: ${targetExt.toUpperCase()}`);
    }

    const downloadUrl = URL.createObjectURL(blob);

    // For USDZ (not directly loadable by Three.js loaders), also generate a lightweight GLB preview blob
    // so the interactive 3D studio preview works even when exporting to Apple USDZ!
    let previewUrl = downloadUrl;
    let previewMime = outMime;
    let previewModelExt: string | undefined =
      targetSpec?.category === '3d' ? targetExt : undefined;

    if (targetExt === 'usdz') {
      const exporter = new GLTFExporter();
      const glbPreview = await new Promise<ArrayBuffer>((resolve, reject) => {
        exporter.parse(
          root,
          (res) => resolve(res as ArrayBuffer),
          (err) => reject(err),
          { binary: true }
        );
      });
      previewUrl = URL.createObjectURL(new Blob([glbPreview], { type: 'model/gltf-binary' }));
      previewMime = 'model/gltf-binary';
      previewModelExt = 'glb';
    }

    const durationMs = Math.max(1, Math.round(performance.now() - startedAt));
    const jobId = `local-3d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return {
      blob,
      result: {
        jobId,
        sourceExt,
        targetExt,
        outputFilename: outFilename,
        outputMime: outMime,
        outputSize: blob.size,
        isArchive: false,
        downloadUrl,
        previewUrl,
        previewMime,
        previewModelExt,
        isClientConverted: true,
        durationMs,
        metadata: {
          vertices: stats.vertices,
          triangles: stats.triangles,
          meshCount: stats.meshCount,
          bounds: `${stats.width} × ${stats.height} × ${stats.depth}`,
        },
        summaryNote: `${stats.triangles.toLocaleString()} tris · ${stats.vertices.toLocaleString()} verts`,
      },
    };
  } finally {
    disposeObject3D(root);
  }
}
