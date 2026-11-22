import { useEffect, useRef, useState } from 'react';
import { Box, RotateCcw } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { detectSoftwareWebGL, loadThreeObjectFromBuffer } from '../lib/threeConverter';

interface ModelPreview3DProps {
  url: string;
  ext: string;
  filename: string;
}

export function ModelPreview3D({ url, ext, filename }: ModelPreview3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wireframeRef = useRef(wireframe);
  const resetCameraRef = useRef<(() => void) | null>(null);
  const requestRenderRef = useRef<(() => void) | null>(null);
  const loadedModelRef = useRef<THREE.Object3D | null>(null);

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
            if ('wireframe' in m) {
              (m as THREE.MeshStandardMaterial).wireframe = wireframe;
            }
          });
        }
      });
      requestRenderRef.current?.();
    }
  }, [wireframe]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = Math.max(container.clientWidth, 280);
    const height = 240;

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
    renderer.domElement.style.height = `${height}px`;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef2f6);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xffffff, 0x64748b, 1.0);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff7ed, 2.2);
    key.position.set(5, 8, 6);
    key.castShadow = !isSoftwareGl;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x93c5fd, 1.1);
    rim.position.set(-5, 4, -6);
    scene.add(rim);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.01, 500);
    camera.position.set(2.4, 1.8, 2.8);

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

    const defaultCamPos = new THREE.Vector3(2.4, 1.8, 2.8);
    const defaultTarget = new THREE.Vector3(0, 0.5, 0);

    resetCameraRef.current = () => {
      camera.position.copy(defaultCamPos);
      controls.target.copy(defaultTarget);
      controls.update();
      requestRender();
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(Math.floor(entry.contentRect.width), 240);
        camera.aspect = w / height;
        camera.updateProjectionMatrix();
        renderer.setSize(w, height);
        requestRender();
      }
    });
    resizeObserver.observe(container);

    setLoading(true);
    setError(null);

    fetch(url)
      .then((res) => res.arrayBuffer())
      .then((buf) => loadThreeObjectFromBuffer(buf, ext, filename))
      .then((model) => {
        if (disposed) return;

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.001);

        // Normalize to comfortable ~2.0 unit studio scale grounded at y=0
        const normScale = 2.0 / maxDim;
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

        const grid = new THREE.GridHelper(5, 14, 0x94a3b8, 0xcbd5e1);
        grid.position.y = -0.01;
        scene.add(grid);

        const h = size.y * normScale;
        defaultTarget.set(0, h * 0.45, 0);
        defaultCamPos.set(2.25, Math.max(1.35, h * 0.92), 2.45);
        camera.position.copy(defaultCamPos);
        controls.target.copy(defaultTarget);
        controls.update();

        renderer.render(scene, camera);
        setLoading(false);
        requestRender();
      })
      .catch((err) => {
        if (!disposed) {
          setError(err instanceof Error ? err.message : 'Unable to preview 3D model.');
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
      resetCameraRef.current = null;
      requestRenderRef.current = null;

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
  }, [url, ext, filename]);

  return (
    <div className="relative" data-testid="preview-3d-viewport">
      <div
        ref={mountRef}
        className="w-full h-[240px] bg-slate-100 cursor-grab active:cursor-grabbing"
        aria-label={`Interactive 3D preview of ${filename}`}
      />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/90 text-xs text-slate-600">
          Loading 3D preview...
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 px-4 text-center text-xs text-red-600">
          {error}
        </div>
      )}

      <div className="px-3 py-2 border-t border-slate-200 bg-white flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-500 whitespace-nowrap">Drag to orbit</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setWireframe((w) => !w)}
            aria-pressed={wireframe}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-medium transition-colors whitespace-nowrap ${
              wireframe
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Box className="w-3 h-3" aria-hidden="true" />
            Wireframe
          </button>
          <button
            type="button"
            onClick={() => resetCameraRef.current?.()}
            aria-label="Reset 3D camera view"
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 bg-white text-[11px] font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
