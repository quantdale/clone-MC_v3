import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * Owns the scene's sun and ambient lighting.
 *
 * A hemisphere light provides soft sky/ground fill; a directional light plays
 * the role of the sun. When CONFIG.dayNight.enabled, the sun is rotated
 * smoothly around the sky so the angle changes slowly and continuously (no
 * flicker); otherwise update() is a no-op.
 */
export class Lighting {
  private readonly scene: THREE.Scene;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  /** Fixed rotation axis for the day-night cycle (reused to avoid hot-path allocation). */
  private readonly dayNightAxis = new THREE.Vector3(0, 0, 1);
  /** Direction from the shadow focus toward the sun. */
  private readonly sunDirection = new THREE.Vector3(0.5, 1, 0.3).normalize();
  /** Last focus position used to update the shadow camera. */
  private readonly lastFocus = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN);
  private readonly shadowFocus = new THREE.Vector3();
  private readonly daySkyColor = new THREE.Color(0xbfe7ff);
  private readonly nightSkyColor = new THREE.Color(0x294568);
  private readonly dayGroundColor = new THREE.Color(0x5a4635);
  private readonly nightGroundColor = new THREE.Color(0x171c2d);
  private readonly daySunColor = new THREE.Color(0xfff2d2);
  private readonly nightSunColor = new THREE.Color(0x6f86b3);
  private daylightFactor = 1;
  private worldSeconds = 0;
  /** Test-only freeze flag (245): when set, the clock and sun direction never advance. */
  private frozen = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.hemisphere = new THREE.HemisphereLight(this.daySkyColor, this.dayGroundColor, 1.0);
    this.hemisphere.position.set(0, 1, 0);
    scene.add(this.hemisphere);

    this.sun = new THREE.DirectionalLight(this.daySunColor, 1.8);
    this.sun.position.copy(this.sunDirection).multiplyScalar(CONFIG.rendering.shadowDistance);
    scene.add(this.sun.target);
    const headless = typeof navigator !== 'undefined' && navigator.webdriver;
    this.sun.castShadow = CONFIG.rendering.shadows && !headless;
    this.sun.shadow.mapSize.set(CONFIG.rendering.shadowMapSize, CONFIG.rendering.shadowMapSize);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = CONFIG.rendering.shadowDistance * 2;
    this.sun.shadow.camera.left = -CONFIG.rendering.shadowDistance;
    this.sun.shadow.camera.right = CONFIG.rendering.shadowDistance;
    this.sun.shadow.camera.top = CONFIG.rendering.shadowDistance;
    this.sun.shadow.camera.bottom = -CONFIG.rendering.shadowDistance;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun);
  }

  /**
   * Advances the day-night cycle. When disabled, does nothing so the static
   * scene lighting is untouched.
   */
  update(dt: number, focus?: THREE.Vector3): void {
    const effectiveDt = this.frozen ? 0 : Math.max(0, Math.min(dt, CONFIG.maxDeltaTime));
    this.worldSeconds = (this.worldSeconds + effectiveDt) % CONFIG.dayNight.dayLength;
    let directionChanged = false;
    if (CONFIG.dayNight.enabled && !this.frozen) {
      const anglePerSecond = (Math.PI * 2) / CONFIG.dayNight.dayLength;
      this.sunDirection.applyAxisAngle(this.dayNightAxis, -anglePerSecond * dt);
      directionChanged = true;
    }

    this.daylightFactor = CONFIG.dayNight.enabled
      ? THREE.MathUtils.clamp((this.sunDirection.y + 0.18) / 1.05, 0, 1)
      : 1;
    this.hemisphere.intensity = 0.28 + this.daylightFactor * 0.72;
    this.sun.intensity = 0.12 + this.daylightFactor * 1.68;
    this.hemisphere.color.lerpColors(this.nightSkyColor, this.daySkyColor, this.daylightFactor);
    this.hemisphere.groundColor.lerpColors(this.nightGroundColor, this.dayGroundColor, this.daylightFactor);
    this.sun.color.lerpColors(this.nightSunColor, this.daySunColor, this.daylightFactor);

    if (focus) {
      const moved =
        !Number.isFinite(this.lastFocus.x) ||
        this.lastFocus.distanceToSquared(focus) >= 0.25;
      if (moved || directionChanged) {
        this.shadowFocus.copy(focus);
        this.lastFocus.copy(focus);
        this.sun.target.position.copy(this.shadowFocus);
        this.sun.position.copy(this.shadowFocus).addScaledVector(
          this.sunDirection,
          CONFIG.rendering.shadowDistance,
        );
        this.sun.target.updateMatrixWorld();
      }
    }
  }

  /**
   * Test-only hook (245): freezes the day-night clock at a fixed daylight factor.
   * Pins the sun direction analytically (solving d = (y + 0.18) / 1.05 for the unit
   * direction's y with the canonical azimuth ratio) so repeated captures are identical.
   */
  freezeDayNight(daylight: number): void {
    const d = THREE.MathUtils.clamp(daylight, 0, 1);
    this.frozen = true;
    const y = 1.05 * d - 0.18;
    const horiz = Math.sqrt(Math.max(0, 1 - y * y));
    const hLen = Math.hypot(0.5, 0.3);
    this.sunDirection.set((0.5 / hLen) * horiz, y, (0.3 / hLen) * horiz);
  }

  /** Current normalized brightness used to synchronize the sky shader. */
  getDaylightFactor(): number {
    return this.daylightFactor;
  }

  /** Current in-world clock hour, starting at noon when a session begins. */
  getTimeOfDayHours(): number {
    return (12 + (this.worldSeconds / CONFIG.dayNight.dayLength) * 24) % 24;
  }

  /** Copy the current sun direction into a caller-owned vector. */
  getSunDirection(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.sunDirection);
  }

  /** Remove scene-owned lights during teardown. */
  dispose(): void {
    this.scene.remove(this.hemisphere, this.sun, this.sun.target);
  }
}
