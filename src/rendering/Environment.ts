import * as THREE from 'three';
import { CONFIG } from '../config';
import { PRNG } from '../math/PRNG';
import { CHUNK_DIMENSIONS } from '../world/WorldCoordinates';

/**
 * Manages the scene's environment (fog). Fog far is derived from the render
 * distance so the fog hides the chunk-loading boundary.
 */
export class Environment {
  private readonly scene: THREE.Scene;
  private readonly fog: THREE.Fog;
  private readonly sky: THREE.Mesh;
  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly clouds: THREE.Group;
  private readonly cloudGeometry: THREE.BoxGeometry | null;
  private readonly cloudMaterial: THREE.MeshLambertMaterial | null;
  private readonly dayFogColor = new THREE.Color(CONFIG.fog.color);
  private readonly nightFogColor = new THREE.Color(0x14243a);

  constructor(scene: THREE.Scene, renderDistance: number, seed: number = CONFIG.seed) {
    this.scene = scene;
    // The load square spans renderDistance chunks in each direction (Chebyshev);
    // its diagonal corners sit ~√2× further than the axis-aligned edge, so the
    // fog must reach that far or the corner chunks would be 100% fogged and
    // permanently invisible. Add a small margin beyond the corner distance.
    const chunkSpan = renderDistance * CHUNK_DIMENSIONS.width;
    const maxCornerDistance = chunkSpan * Math.SQRT2;
    const far = maxCornerDistance * 1.1;
    const near = far * CONFIG.fog.near;
    const fogFar = far * CONFIG.fog.far;
    this.fog = new THREE.Fog(CONFIG.fog.color, near, fogFar);
    scene.fog = this.fog;

    // A lightweight shader sky gives the world a readable horizon and zenith
    // gradient without adding texture memory or per-frame geometry work.
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        horizonColor: { value: new THREE.Color(0x9bd7e8) },
        zenithColor: { value: new THREE.Color(0x2d67b1) },
        sunColor: { value: new THREE.Color(0xffd9a0) },
        nightHorizonColor: { value: new THREE.Color(0x294568) },
        nightZenithColor: { value: new THREE.Color(0x050b20) },
        nightSunColor: { value: new THREE.Color(0x496a9d) },
        daylight: { value: 1 },
        sunDirection: { value: new THREE.Vector3(-0.35, 0.78, 0.22).normalize() },
      },
      vertexShader: `
        varying vec3 vSkyDirection;
        void main() {
          vSkyDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 horizonColor;
        uniform vec3 zenithColor;
        uniform vec3 sunColor;
        uniform vec3 nightHorizonColor;
        uniform vec3 nightZenithColor;
        uniform vec3 nightSunColor;
        uniform float daylight;
        uniform vec3 sunDirection;
        varying vec3 vSkyDirection;
        void main() {
          float height = clamp(vSkyDirection.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 activeHorizon = mix(nightHorizonColor, horizonColor, daylight);
          vec3 activeZenith = mix(nightZenithColor, zenithColor, daylight);
          vec3 activeSun = mix(nightSunColor, sunColor, daylight);
          vec3 sky = mix(activeHorizon, activeZenith, smoothstep(0.28, 0.86, height));
          float sunGlow = pow(max(dot(normalize(vSkyDirection), normalize(sunDirection)), 0.0), 64.0);
          gl_FragColor = vec4(sky + activeSun * sunGlow * mix(0.12, 0.42, daylight), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.skyMaterial = skyMaterial;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMaterial);
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.clouds = new THREE.Group();
    this.clouds.name = 'cloud-layer';
    scene.add(this.clouds);
    const headless = typeof navigator !== 'undefined' && navigator.webdriver;
    if (CONFIG.rendering.clouds && !headless) {
      this.cloudGeometry = new THREE.BoxGeometry(16, 1.2, 8);
      this.cloudMaterial = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        fog: true,
      });
      this.populateClouds(seed);
    } else {
      this.cloudGeometry = null;
      this.cloudMaterial = null;
    }
  }

  /** Keep the sky/cloud layer centered while synchronizing the day-night tint. */
  update(camera: THREE.PerspectiveCamera, daylight = 1, sunDirection?: THREE.Vector3): void {
    this.sky.position.copy(camera.position);
    this.skyMaterial.uniforms.daylight!.value = THREE.MathUtils.clamp(daylight, 0, 1);
    if (sunDirection) {
      (this.skyMaterial.uniforms.sunDirection!.value as THREE.Vector3).copy(sunDirection);
    }
    this.fog.color.lerpColors(this.nightFogColor, this.dayFogColor, this.skyMaterial.uniforms.daylight!.value as number);
    // Shift in broad 256-block cells so the procedural cloud field remains
    // present around the player without adding an unbounded world object.
    this.clouds.position.x = Math.floor(camera.position.x / 256) * 256;
    this.clouds.position.z = Math.floor(camera.position.z / 256) * 256;
  }

  private populateClouds(seed: number): void {
    if (!this.cloudGeometry || !this.cloudMaterial) {
      return;
    }
    const rng = new PRNG((seed ^ 0x51ed270b) >>> 0);
    for (let i = 0; i < 20; i++) {
      const cloud = new THREE.Mesh(this.cloudGeometry, this.cloudMaterial);
      cloud.position.set(
        rng.range(-240, 240),
        CONFIG.seaLevel + rng.range(27, 35),
        rng.range(-240, 240),
      );
      cloud.scale.set(rng.range(0.7, 2.2), rng.range(0.7, 1.4), rng.range(0.7, 1.8));
      cloud.rotation.y = rng.range(-0.2, 0.2);
      cloud.castShadow = false;
      cloud.receiveShadow = false;
      this.clouds.add(cloud);
    }
  }

  dispose(): void {
    this.scene.remove(this.sky, this.clouds);
    this.scene.fog = null;
    this.sky.geometry.dispose();
    if (!Array.isArray(this.sky.material)) {
      this.sky.material.dispose();
    }
    this.cloudGeometry?.dispose();
    this.cloudMaterial?.dispose();
  }
}
