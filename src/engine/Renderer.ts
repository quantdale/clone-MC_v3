import * as THREE from 'three';
import { CONFIG, type QualityTier } from '../config';
import {
  DynamicResolutionController,
  type DynamicResolutionMetrics,
  type DynamicResolutionState,
  type DynamicResolutionUpdate,
} from '../rendering/DynamicResolution';

/**
 * Owns the Three.js scene, camera, and WebGL renderer.
 *
 * The renderer construction is wrapped in a try/catch so that an environment
 * without WebGL support can be detected (rendererCreated === false) and the
 * game can enter its init-error state instead of crashing.
 *
 * WebGL context loss/restoration events are handled so the game can pause on
 * loss and transparently rebuild the renderer on restoration.
 */
export class Renderer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer | null;

  /** Whether the WebGL renderer was successfully created. */
  rendererCreated: boolean;

  private readonly canvas: HTMLCanvasElement;
  private readonly onContextLostCallback?: () => void;
  private readonly onContextRestoredCallback?: () => void;
  /** Dynamic pixel scale is presentation-only; callers feed completed-frame metrics. */
  readonly dynamicResolution: DynamicResolutionController;

  constructor(
    canvas: HTMLCanvasElement,
    onContextLost?: () => void,
    onContextRestored?: () => void,
    dynamicResolution: DynamicResolutionController = new DynamicResolutionController('medium'),
  ) {
    this.canvas = canvas;
    this.onContextLostCallback = onContextLost;
    this.onContextRestoredCallback = onContextRestored;
    this.dynamicResolution = dynamicResolution;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.fog.color);

    // Initialize the aspect ratio from the current viewport so the projection
    // is correct from the first frame — not just after the first window resize.
    const initialAspect = window.innerWidth / Math.max(1, window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(75, initialAspect, 0.1, 1024);

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      // WebGL is unavailable. Leave renderer null so the game can enter its
      // init-error state (rendererCreated === false) instead of crashing. Do
      // not retry construction here — a no-WebGL environment would throw
      // again, defeating the error state the try/catch exists for.
    }
    this.rendererCreated = renderer !== null;
    this.renderer = renderer;

    if (this.renderer) {
      this.configureRenderer(this.renderer);
    }

    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
  }

  /** Re-applies the pixel-ratio cap and active dynamic scale. */
  private applyPixelRatio(): void {
    if (this.renderer) {
      const headless = typeof navigator !== 'undefined' && navigator.webdriver;
      const deviceCap = headless ? CONFIG.headless.maxPixelRatio : CONFIG.maxPixelRatio;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, deviceCap) * this.dynamicResolution.getScale());
    }
  }

  /** Change the render-quality tier without changing simulation or camera semantics. */
  setDynamicResolutionTier(tier: QualityTier): void {
    this.dynamicResolution.setTier(tier);
    this.applyDynamicResolutionSize();
  }

  /** Feed a completed-frame timing sample and apply only accepted pixel-scale changes. */
  updateDynamicResolution(nowMs: number, metrics: DynamicResolutionMetrics): DynamicResolutionUpdate {
    const update = this.dynamicResolution.update(nowMs, metrics);
    if (update.changed) {
      this.applyDynamicResolutionSize();
    }
    return update;
  }

  /** Snapshot dynamic-resolution state for debug/observability callers. */
  dynamicResolutionState(): DynamicResolutionState {
    return this.dynamicResolution.state();
  }

  private applyDynamicResolutionSize(): void {
    if (this.renderer) {
      this.applyPixelRatio();
      this.renderer.setSize(window.innerWidth, Math.max(1, window.innerHeight), false);
    }
  }

  /** Apply quality and color-management settings consistently after recreation. */
  private configureRenderer(renderer: THREE.WebGLRenderer): void {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const headless = typeof navigator !== 'undefined' && navigator.webdriver;
    renderer.shadowMap.enabled = CONFIG.rendering.shadows && !headless;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.applyPixelRatio();
    renderer.setSize(window.innerWidth, Math.max(1, window.innerHeight));
  }

  /** Resizes the renderer and camera aspect to match the window. */
  resize(): void {
    const width = window.innerWidth;
    const height = Math.max(1, window.innerHeight);
    if (this.renderer) {
      this.applyPixelRatio();
      this.renderer.setSize(width, height);
    }
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Return the actual physical drawing-buffer dimensions, not CSS viewport dimensions. */
  actualDrawingBufferSize(): { width: number; height: number } {
    if (!this.renderer) return { width: 0, height: 0 };
    const size = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(size);
    return { width: Math.max(0, Math.floor(size.x)), height: Math.max(0, Math.floor(size.y)) };
  }

  /** Renders the scene with the camera. */
  render(): void {
    if (this.renderer && this.rendererCreated) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /** Releases the WebGL renderer and its GPU resources. */
  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.renderer?.dispose();
    this.renderer = null;
    this.rendererCreated = false;
  }

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.rendererCreated = false;
    this.onContextLostCallback?.();
  };

  private readonly handleContextRestored = (): void => {
    if (this.renderer) {
      this.renderer.dispose();
    }
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      // Restoration failed — leave rendererCreated false.
    }
    this.renderer = renderer;
    this.rendererCreated = renderer !== null;

    if (this.renderer) {
      this.configureRenderer(this.renderer);
    }

    this.onContextRestoredCallback?.();
  };
}
