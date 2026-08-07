import * as THREE from 'three';
import { CONFIG } from '../config';

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

  constructor(
    canvas: HTMLCanvasElement,
    onContextLost?: () => void,
    onContextRestored?: () => void,
  ) {
    this.canvas = canvas;
    this.onContextLostCallback = onContextLost;
    this.onContextRestoredCallback = onContextRestored;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.fog.color);

    // Initialize the aspect ratio from the current viewport so the projection
    // is correct from the first frame — not just after the first window resize.
    const initialAspect = window.innerWidth / Math.max(1, window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(75, initialAspect, 0.1, 1024);

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      // WebGL is unavailable. Leave renderer null so the game can enter its
      // init-error state (rendererCreated === false) instead of crashing. Do
      // not retry construction here — a no-WebGL environment would throw
      // again, defeating the error state the try/catch exists for.
    }
    this.rendererCreated = renderer !== null;
    this.renderer = renderer;

    if (this.renderer) {
      this.applyPixelRatio();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
  }

  /** Re-applies the pixel-ratio cap (e.g. after moving to a different-DPI monitor). */
  private applyPixelRatio(): void {
    if (this.renderer) {
      this.renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, CONFIG.maxPixelRatio),
      );
    }
  }

  /** Resizes the renderer and camera aspect to match the window. */
  resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (this.renderer) {
      this.applyPixelRatio();
      this.renderer.setSize(width, height);
    }
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Renders the scene with the camera. */
  render(): void {
    if (this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /** Releases the WebGL renderer and its GPU resources. */
  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.renderer?.dispose();
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
      renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    } catch {
      // Restoration failed — leave rendererCreated false.
    }
    this.renderer = renderer;
    this.rendererCreated = renderer !== null;

    if (this.renderer) {
      this.applyPixelRatio();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    this.onContextRestoredCallback?.();
  };
}