import * as THREE from 'three';
import { CONFIG } from '../config';
import { PRNG } from '../math/PRNG';
import { CHUNK_DIMENSIONS } from '../world/WorldCoordinates';

/**
 * Shared environment state plus the scene-side sky/fog/cloud layer that consumes it. The pure
 * {@link computeEnvironmentState} derives one authoritative state object from time-of-day (and
 * optionally weather); every other system should read that object rather than inventing its own
 * day/night curve. {@link toLightingView} adapts a state to the getter shape the legacy
 * `Lighting` wrapper exposes, so both sources stay interchangeable.
 */

/** Hour the in-world clock starts at (noon, matching `Lighting`). */
const START_HOUR = 12;

/** Base sun direction at noon before rotation (matches `Lighting`'s initial vector). */
const BASE_SUN_DIRECTION = { x: 0.5, y: 1, z: 0.3 };

/** Daylight curve anchors shared with `Lighting`. */
const DAYLIGHT_OFFSET = 0.18;
const DAYLIGHT_SCALE = 1.05;

/** Palette entries (sRGB 0-1 floats), kept module-level instead of CONFIG edits. */
const COLOR_DAY_ZENITH = { r: 0x2d / 0xff, g: 0x67 / 0xff, b: 0xb1 / 0xff };
const COLOR_DAY_HORIZON = { r: 0x9b / 0xff, g: 0xd7 / 0xff, b: 0xe8 / 0xff };
const COLOR_NIGHT_ZENITH = { r: 0x05 / 0xff, g: 0x0b / 0xff, b: 0x20 / 0xff };
const COLOR_NIGHT_HORIZON = { r: 0x29 / 0xff, g: 0x45 / 0xff, b: 0x68 / 0xff };
const COLOR_DAY_SUN = { r: 0xff / 0xff, g: 0xd9 / 0xff, b: 0xa0 / 0xff };
const COLOR_NIGHT_SUN = { r: 0x49 / 0xff, g: 0x6a / 0xff, b: 0x9d / 0xff };
const COLOR_DAY_FOG = hexToRgb(CONFIG.fog.color);
const COLOR_NIGHT_FOG = { r: 0x14 / 0xff, g: 0x24 / 0xff, b: 0x3a / 0xff };

function hexToRgb(hex: number): { r: number; g: number; b: number } {
  return {
    r: ((hex >> 16) & 0xff) / 0xff,
    g: ((hex >> 8) & 0xff) / 0xff,
    b: (hex & 0xff) / 0xff,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(out: { r: number; g: number; b: number }, night: { readonly r: number; readonly g: number; readonly b: number }, day: { readonly r: number; readonly g: number; readonly b: number }, t: number): void {
  out.r = lerp(night.r, day.r, t);
  out.g = lerp(night.g, day.g, t);
  out.b = lerp(night.b, day.b, t);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Plain-data color (sRGB, 0-1); THREE-free so the state is worker-transportable. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * The single shared environment snapshot other systems consume. Reused objects are written in
 * place by `computeEnvironmentState(state)` — no per-frame allocation.
 */
export interface EnvironmentState {
  /** In-world clock hour in `[0, 24)`. */
  timeOfDayHours: number;
  /** Unit vector from the world toward the sun. */
  sunDirection: { x: number; y: number; z: number };
  /** 0 = full night, 1 = full day (shared curve with `Lighting`). */
  daylightFactor: number;
  /** Global brightness multiplier suggestion (post-processing/exposure). */
  exposure: number;
  /** Sky gradient endpoints. */
  skyZenith: Rgb;
  skyHorizon: Rgb;
  /** Fog color synchronized to sky/time. */
  fogColor: Rgb;
  /** Sun disc/light tint. */
  sunColor: Rgb;
  /** 0 = clear, 1 = full rain (tiered by weather presentation). */
  precipitationIntensity: number;
  /** 0 = no lightning, 1 = thunderstorm. */
  thunderIntensity: number;
}

/** Optional weather inputs for environment computation. */
export interface EnvironmentWeatherInput {
  precipitationIntensity?: number;
  thunderIntensity?: number;
}

/**
 * Compute the shared environment state from time-of-day. With an `out` object the result is
 * written into it (and returned) allocation-free; otherwise a fresh state is produced.
 */
export function computeEnvironmentState(
  timeOfDayHours: number,
  weather?: EnvironmentWeatherInput,
  out?: EnvironmentState,
): EnvironmentState {
  const state =
    out ??
    ({
      timeOfDayHours: 0,
      sunDirection: { x: 0, y: 1, z: 0 },
      daylightFactor: 1,
      exposure: 1,
      skyZenith: { r: 0, g: 0, b: 0 },
      skyHorizon: { r: 0, g: 0, b: 0 },
      fogColor: { r: 0, g: 0, b: 0 },
      sunColor: { r: 0, g: 0, b: 0 },
      precipitationIntensity: 0,
      thunderIntensity: 0,
    } as EnvironmentState);

  const hours = ((timeOfDayHours % 24) + 24) % 24;
  state.timeOfDayHours = hours;

  // Sun rotates around +Z starting from the canonical noon direction, matching `Lighting`.
  const fraction = (((hours - START_HOUR) % 24) + 24) % 24 / 24;
  const angle = -Math.PI * 2 * fraction;
  const baseLen = Math.hypot(BASE_SUN_DIRECTION.x, BASE_SUN_DIRECTION.y, BASE_SUN_DIRECTION.z);
  const bx = BASE_SUN_DIRECTION.x / baseLen;
  const by = BASE_SUN_DIRECTION.y / baseLen;
  const bz = BASE_SUN_DIRECTION.z / baseLen;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  state.sunDirection.x = bx * cos - by * sin;
  state.sunDirection.y = bx * sin + by * cos;
  state.sunDirection.z = bz;

  const daylight = clamp01((state.sunDirection.y + DAYLIGHT_OFFSET) / DAYLIGHT_SCALE);
  state.daylightFactor = daylight;
  state.exposure = 0.6 + 0.4 * daylight;
  lerpRgb(state.skyZenith, COLOR_NIGHT_ZENITH, COLOR_DAY_ZENITH, daylight);
  lerpRgb(state.skyHorizon, COLOR_NIGHT_HORIZON, COLOR_DAY_HORIZON, daylight);
  lerpRgb(state.fogColor, COLOR_NIGHT_FOG, COLOR_DAY_FOG, daylight);
  lerpRgb(state.sunColor, COLOR_NIGHT_SUN, COLOR_DAY_SUN, daylight);
  state.precipitationIntensity = clamp01(weather?.precipitationIntensity ?? 0);
  state.thunderIntensity = clamp01(weather?.thunderIntensity ?? 0);
  return state;
}

/** Getter surface mirroring `Lighting.ts`'s public accessors, backed by an environment state. */
export interface LightingView {
  getDaylightFactor(): number;
  getTimeOfDayHours(): number;
  /** Copy the current sun direction into a caller-owned `{x, y, z}` target. */
  getSunDirection<T extends { x: number; y: number; z: number }>(target: T): T;
}

/** Adapt an environment state to the legacy `Lighting` getter shape (no `Lighting` import needed). */
export function toLightingView(state: EnvironmentState): LightingView {
  return {
    getDaylightFactor: () => state.daylightFactor,
    getTimeOfDayHours: () => state.timeOfDayHours,
    getSunDirection: <T extends { x: number; y: number; z: number }>(target: T): T => {
      target.x = state.sunDirection.x;
      target.y = state.sunDirection.y;
      target.z = state.sunDirection.z;
      return target;
    },
  };
}

/**
 * Manages the scene's environment (fog). Fog far is derived from the render distance so the fog
 * hides the chunk-loading boundary. Its {@link Environment.environment} state is the shared source
 * other systems will consume; callers may either pass explicit day-night values (the legacy
 * `Lighting`-driven path) or drive the clock through {@link setTimeOfDayHours}.
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
  /** Shared, reusable environment state; identity-stable across frames. */
  private readonly envState: EnvironmentState = computeEnvironmentState(START_HOUR);

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

  /**
   * The shared environment state. Identity is stable; consumers may hold the reference and read
   * fresh values after each `update()`/`applyWeather()`.
   */
  get environment(): EnvironmentState {
    return this.envState;
  }

  /** Override the clock used when `update` receives no explicit daylight/direction. */
  setTimeOfDayHours(hours: number): void {
    computeEnvironmentState(hours, undefined, this.envState);
  }

  /** Fold weather intensities into the shared state (typically from `presentWeather`). */
  applyWeather(weather: EnvironmentWeatherInput): void {
    if (weather.precipitationIntensity !== undefined) {
      this.envState.precipitationIntensity = clamp01(weather.precipitationIntensity);
    }
    if (weather.thunderIntensity !== undefined) {
      this.envState.thunderIntensity = clamp01(weather.thunderIntensity);
    }
  }

  /** Push a fully external state into the shared state (e.g. from a worker or replay). */
  applyEnvironmentState(source: EnvironmentState): void {
    computeEnvironmentState(source.timeOfDayHours, source, this.envState);
  }

  /** Keep the sky/cloud layer centered while synchronizing the day-night tint. */
  update(camera: THREE.PerspectiveCamera, daylight = 1, sunDirection?: THREE.Vector3): void {
    this.sky.position.copy(camera.position);
    const effectiveDaylight = THREE.MathUtils.clamp(daylight, 0, 1);
    this.skyMaterial.uniforms.daylight!.value = effectiveDaylight;
    const dirUniform = this.skyMaterial.uniforms.sunDirection!.value as THREE.Vector3;
    if (sunDirection) {
      dirUniform.copy(sunDirection);
    }

    // Synchronize the shared state with whatever drove this frame (legacy Lighting path or clock).
    this.envState.daylightFactor = effectiveDaylight;
    if (sunDirection) {
      this.envState.sunDirection.x = sunDirection.x;
      this.envState.sunDirection.y = sunDirection.y;
      this.envState.sunDirection.z = sunDirection.z;
    }
    lerpRgb(this.envState.fogColor, COLOR_NIGHT_FOG, COLOR_DAY_FOG, effectiveDaylight);

    // Fog color follows the shared state; weather darkens it coherently with the sky.
    const weatherDarkening = 1 - 0.6 * this.envState.precipitationIntensity;
    this.fog.color.setRGB(
      this.envState.fogColor.r * weatherDarkening,
      this.envState.fogColor.g * weatherDarkening,
      this.envState.fogColor.b * weatherDarkening,
    );

    // Shift in broad 256-block cells so the procedural cloud field remains
    // present around the player without adding an unbounded world object.
    this.clouds.position.x = Math.floor(camera.position.x / 256) * 256;
    this.clouds.position.z = Math.floor(camera.position.z / 256) * 256;
    if (this.cloudMaterial) {
      // Rain thickens the cloud layer toward a muted gray ceiling.
      const gray = lerp(1, 0.45, this.envState.precipitationIntensity);
      this.cloudMaterial.color.setRGB(gray, gray, gray);
      this.cloudMaterial.opacity = lerp(0.62, 0.85, this.envState.precipitationIntensity);
    }
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
