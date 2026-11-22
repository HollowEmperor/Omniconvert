import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Axis3d,
  Box,
  Camera,
  FolderOpen,
  Grid3x3,
  Moon,
  RotateCcw,
  Sun,
  Upload,
} from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  FORMAT_SPECS,
  SAMPLE_FILES,
  SampleFileDescriptor,
  detectFormat,
  formatBytes,
} from '../lib/formats';
import {
  collectSceneStats,
  detectSoftwareWebGL,
  loadThreeObjectFromBuffer,
} from '../lib/threeConverter';

interface Viewer3DViewProps {
  onSendToConverter: (file: File) => void;
}

interface ModelTelemetry {
  vertices: number;
  triangles: number;
  meshCount: number;
  width: number;
  height: number;
  depth: number;
}

type CameraPreset = 'iso' | 'front' | 'top' | 'side';

const MODEL_3D_ACCEPT = FORMAT_SPECS.filter((f) => f.category === '3d' && f.canBeInput)
  .map((f) => `.${f.ext}`)
  .join(',');

const MODEL_SAMPLES = SAMPLE_FILES.filter((s) => s.category === '3d');

export function Viewer3DView({ onSendToConverter }: Viewer3DViewProps) {
  const [loadedFile, setLoadedFile] = useState<File | null>(null);
  const [modelExt, setModelExt] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingSampleId, setLoadingSampleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [wireframe, setWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(false);
  const [darkBackdrop, setDarkBackdrop] = useState(false);
  const [stats, setStats] = useState<ModelTelemetry | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);

  const requestRenderRef = useRef<(() => void) | null>(null);
  const loadedModelRef = useRef<THREE.Object3D | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const axesRef = useRef<THREE.AxesHelper | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const setCameraPresetRef = useRef<((preset: CameraPreset) => void) | null>(null);

  const wireframeRef = useRef(wireframe);
  const showGridRef = useRef(showGrid);
  const showAxesRef = useRef(showAxes);
  const darkBackdropRef = useRef(darkBackdrop);

  const openModelFile = (file: File) => {
    const spec = detectFormat(file.name, file.type);
    if (!spec || spec.category !== '3d') {
      setError(
        `Unsupported 3D file "${file.name}". Supported: GLB, GLTF, OBJ, STL, PLY, FBX, DAE, 3MF, OFF, 3DM (Rhino), DXF (AutoCAD), 3DS (3ds Max).`
      );
      return;
    }
    setError(null);
    setModelExt(spec.ext);
    setLoadedFile(file);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      openModelFile(f);
      e.target.value = '';
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) openModelFile(f);
  };

  const handleLoadSample = async (sample: SampleFileDescriptor) => {
    setLoadingSampleId(sample.id);
    setError(null);
    try {
      const res = await fetch(`/api/samples/${encodeURIComponent(sample.id)}`);
      if (!res.ok) throw new Error(`Failed to fetch sample (${res.status}).`);
      const blob = await res.blob();
      const file = new File([blob], sample.name, {
        type: blob.type || 'application/octet-stream',
      });
      openModelFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load sample 3D model.');
    } finally {
      setLoadingSampleId(null);
    }
  };

  // Live toggle updates without reloading scene
  useEffect(() => {
    wireframeRef.current = wireframe;
    const model = loadedModelRef.current;
    if (model) {
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mats = Array.isArray((child as THREE.Mesh).material)
            ? ((child as THREE.Mesh).material as THREE.Material[])
            : [(child as THREE.Mesh).material as THREE.Material];
          mats.forEach((m) => {
            if (m && 'wireframe' in m) {
              (m as THREE.MeshStandardMaterial).wireframe = wireframe;
            }
          });
        }
      });
      requestRenderRef.current?.();
    }
  }, [wireframe]);

  useEffect(() => {
    showGridRef.current = showGrid;
    if (gridRef.current) {
      gridRef.current.visible = showGrid;
      requestRenderRef.current?.();
    }
  }, [showGrid]);

  useEffect(() => {
    showAxesRef.current = showAxes;
    if (axesRef.current) {
      axesRef.current.visible = showAxes;
      requestRenderRef.current?.();
    }
  }, [showAxes]);

  useEffect(() => {
    darkBackdropRef.current = darkBackdrop;
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(darkBackdrop ? 0x0f172a : 0xeef2f6);
      requestRenderRef.current?.();
    }
  }, [darkBackdrop]);

  // Mount & render Three.js studio whenever a new file is selected
  useEffect(() => {
    const container = mountRef.current;
    if (!loadedFile || !container) return;

    let disposed = false;
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 480);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(darkBackdropRef.current ? 0x0f172a : 0xeef2f6);
    sceneRef.current = scene;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xffffff, 0x64748b, 1.0);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff7ed, 2.2);
    key.position.set(6, 9, 7);
    key.castShadow = !isSoftwareGl;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x93c5fd, 1.1);
    rim.position.set(-6, 5, -6);
    scene.add(rim);

    const grid = new THREE.GridHelper(6, 20, 0x94a3b8, 0xcbd5e1);
    grid.position.y = -0.005;
    grid.visible = showGridRef.current;
    scene.add(grid);
    gridRef.current = grid;

    const axes = new THREE.AxesHelper(1.8);
    axes.visible = showAxesRef.current;
    scene.add(axes);
    axesRef.current = axes;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.01, 500);
    camera.position.set(2.6, 1.9, 2.8);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        controls.update();
        renderer.render(scene, camera);
        const done = () => {
          renderBusy = false;
          if (renderDirty && !disposed) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    requestRenderRef.current = requestRender;
    controls.addEventListener('change', requestRender);

    let modelHalfHeight = 0.6;

    const applyCameraPreset = (preset: CameraPreset) => {
      const target = new THREE.Vector3(0, modelHalfHeight, 0);
      controls.target.copy(target);
      if (preset === 'iso') {
        camera.position.set(2.45, Math.max(1.5, modelHalfHeight * 1.9), 2.65);
      } else if (preset === 'front') {
        camera.position.set(0, modelHalfHeight, 3.3);
      } else if (preset === 'top') {
        camera.position.set(0, modelHalfHeight + 3.6, 0.01);
      } else if (preset === 'side') {
        camera.position.set(3.3, modelHalfHeight, 0);
      }
      controls.update();
      requestRender();
    };
    setCameraPresetRef.current = applyCameraPreset;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(Math.floor(entry.contentRect.width), 300);
        const h = Math.max(Math.floor(entry.contentRect.height), 420);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        requestRender();
      }
    });
    resizeObserver.observe(container);

    setLoading(true);
    setError(null);

    loadedFile
      .arrayBuffer()
      .then((buf) => loadThreeObjectFromBuffer(buf, modelExt, loadedFile.name))
      .then((model) => {
        if (disposed) return;

        // Collect original unscaled model telemetry first
        const rawStats = collectSceneStats(model);
        setStats(rawStats);

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.001);

        // Normalize into ~2.2 unit studio stage sitting cleanly on y=0
        const normScale = 2.2 / maxDim;
        model.scale.multiplyScalar(normScale);
        model.position.set(
          -center.x * normScale,
          -box.min.y * normScale,
          -center.z * normScale
        );

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const m = child as THREE.Mesh;
            m.castShadow = !isSoftwareGl;
            m.receiveShadow = !isSoftwareGl;
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            mats.forEach((mat) => {
              if (mat && 'wireframe' in mat) {
                (mat as THREE.MeshStandardMaterial).wireframe = wireframeRef.current;
              }
            });
          }
        });

        scene.add(model);
        loadedModelRef.current = model;
        modelHalfHeight = Math.max(0.35, size.y * normScale * 0.45);
        applyCameraPreset('iso');
        renderer.render(scene, camera);
        setLoading(false);
        requestRender();
      })
      .catch((err) => {
        if (!disposed) {
          setError(err instanceof Error ? err.message : 'Unable to load 3D model.');
          setLoading(false);
        }
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      loadedModelRef.current = null;
      gridRef.current = null;
      axesRef.current = null;
      sceneRef.current = null;
      rendererRef.current = null;
      requestRenderRef.current = null;
      setCameraPresetRef.current = null;

      scene.traverse((child) => {
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
      envTex.dispose();
      renderer.dispose();
    };
  }, [loadedFile, modelExt]);

  const handleDownloadSnapshot = () => {
    const renderer = rendererRef.current;
    if (!renderer || !loadedFile) return;
    requestRenderRef.current?.();
    const dataUrl = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    const base = loadedFile.name.replace(/\.[^.]+$/, '') || 'model';
    a.download = `${base}_snapshot.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <section aria-label="Interactive 3D model viewer" className="space-y-5">
      <input
        ref={fileInputRef}
        type="file"
        accept={MODEL_3D_ACCEPT}
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            3D Model Viewer
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Inspect Rhino (.3dm), Autodesk (.dxf, .3ds, .fbx), glTF/GLB, OBJ, STL, PLY, and 3MF geometry locally in WebGL.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {loadedFile && (
            <button
              type="button"
              onClick={() => onSendToConverter(loadedFile)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
              Send to Converter
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <FolderOpen className="w-3.5 h-3.5" aria-hidden="true" />
            Open 3D File
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {!loadedFile ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
          }}
          onDrop={handleDrop}
          data-testid="viewer3d-dropzone"
          className={`rounded-lg border border-dashed px-6 py-14 sm:py-20 text-center transition-colors ${
            isDragging
              ? 'border-blue-600 bg-blue-50/70'
              : 'border-slate-300 bg-white hover:border-slate-400'
          }`}
        >
          <div className="max-w-lg mx-auto">
            <div className="mx-auto mb-4 flex items-center justify-center w-12 h-12 rounded-lg bg-slate-100 text-slate-700">
              <Upload className="w-5 h-5" aria-hidden="true" />
            </div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Drop a 3D or CAD model to inspect
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Supports Rhino 3DM, AutoCAD DXF, 3ds Max 3DS, Autodesk FBX, GLB, GLTF, OBJ, STL, PLY, DAE, 3MF, and OFF.
            </p>
            <div className="mt-5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                Choose 3D Model
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-200">
              <p className="text-xs font-medium text-slate-500 mb-3">
                Or open a sample model immediately
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {MODEL_SAMPLES.map((sample) => {
                  const busy = loadingSampleId === sample.id;
                  return (
                    <button
                      key={sample.id}
                      type="button"
                      disabled={busy}
                      onClick={() => handleLoadSample(sample)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 hover:border-slate-300 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {busy ? `Loading ${sample.label}...` : `${sample.label} (${sample.ext.toUpperCase()})`}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
          }}
          onDrop={handleDrop}
          className="bg-white border border-slate-200 rounded-lg overflow-hidden"
        >
          {/* Compact top studio control bar */}
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="font-mono text-xs font-semibold text-blue-700 shrink-0">
                {modelExt.toUpperCase()}
              </span>
              <span className="text-sm font-medium text-slate-900 truncate">
                {loadedFile.name}
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                {formatBytes(loadedFile.size)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {/* Camera presets */}
              <div className="inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5">
                {(['iso', 'front', 'top', 'side'] as CameraPreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCameraPresetRef.current?.(preset)}
                    className="px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded capitalize whitespace-nowrap"
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setWireframe((w) => !w)}
                aria-pressed={wireframe}
                className={`inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  wireframe
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Box className="w-3.5 h-3.5" aria-hidden="true" />
                Wireframe
              </button>

              <button
                type="button"
                onClick={() => setShowGrid((g) => !g)}
                aria-pressed={showGrid}
                className={`inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  showGrid
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Grid3x3 className="w-3.5 h-3.5" aria-hidden="true" />
                Grid
              </button>

              <button
                type="button"
                onClick={() => setShowAxes((a) => !a)}
                aria-pressed={showAxes}
                className={`inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  showAxes
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Axis3d className="w-3.5 h-3.5" aria-hidden="true" />
                Axes
              </button>

              <button
                type="button"
                onClick={() => setDarkBackdrop((d) => !d)}
                aria-label={darkBackdrop ? 'Switch to light studio backdrop' : 'Switch to dark studio backdrop'}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shrink-0"
              >
                {darkBackdrop ? (
                  <Sun className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <Moon className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setCameraPresetRef.current?.('iso')}
                aria-label="Reset camera view"
                className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={handleDownloadSnapshot}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                Snapshot
              </button>
            </div>
          </div>

          {/* Primary 3D WebGL stage */}
          <div className="relative" data-testid="standalone-3d-stage">
            <div
              ref={mountRef}
              className="w-full h-[480px] sm:h-[540px] cursor-grab active:cursor-grabbing bg-slate-100"
              aria-label={`Interactive 3D viewer for ${loadedFile.name}`}
            />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-50/90 text-sm text-slate-600">
                Parsing 3D geometry...
              </div>
            )}
          </div>

          {/* Bottom geometry telemetry & quick sample switcher */}
          <div className="px-4 py-3 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-slate-600">
              {stats ? (
                <>
                  <span>
                    Vertices:{' '}
                    <strong className="font-mono tabular-nums text-slate-900">
                      {stats.vertices.toLocaleString()}
                    </strong>
                  </span>
                  <span>
                    Triangles:{' '}
                    <strong className="font-mono tabular-nums text-slate-900">
                      {stats.triangles.toLocaleString()}
                    </strong>
                  </span>
                  <span>
                    Meshes:{' '}
                    <strong className="font-mono tabular-nums text-slate-900">
                      {stats.meshCount}
                    </strong>
                  </span>
                  <span>
                    Bounds (W×H×D):{' '}
                    <strong className="font-mono tabular-nums text-slate-900">
                      {stats.width} × {stats.height} × {stats.depth}
                    </strong>
                  </span>
                </>
              ) : (
                <span>Drag to orbit · Right-drag to pan · Scroll to zoom</span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 mr-1">Samples:</span>
              {MODEL_SAMPLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={loadingSampleId === s.id}
                  onClick={() => handleLoadSample(s)}
                  className="px-2 py-1 text-[11px] font-mono text-slate-600 bg-slate-50 border border-slate-200 rounded hover:border-slate-300 hover:text-slate-900 whitespace-nowrap"
                >
                  {s.ext.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
