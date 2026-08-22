import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Lighting } from "../../src/rendering/Lighting";
import { CONFIG } from "../../src/config";

/**
 * The Lighting scene-graph owner is headless-constructible: three.js lights and
 * scenes need no WebGL. These tests pin the day-night clock, analytic freeze
 * hook (245), focus-driven shadow targeting and teardown semantics.
 */
function makeLighting(): { lighting: Lighting; scene: THREE.Scene } {
  const scene = new THREE.Scene();
  return { lighting: new Lighting(scene), scene };
}

describe("Lighting", () => {
  it("adds hemisphere + sun + target lights to the scene at construction", () => {
    const { lighting, scene } = makeLighting();
    const children = scene.children.filter(
      (o) =>
        o instanceof THREE.HemisphereLight ||
        o instanceof THREE.DirectionalLight,
    );
    expect(children.length).toBe(2);
    lighting.dispose();
  });

  it("starts the clock at noon and advances time-of-day with update()", () => {
    const { lighting } = makeLighting();
    expect(lighting.getTimeOfDayHours()).toBeCloseTo(12, 5);

    // A quarter of a 600 s day = 6 h; update clamps per-frame deltas, so step
    // at the configured maximum.
    const steps = Math.ceil(150 / CONFIG.maxDeltaTime);
    for (let i = 0; i < steps; i++) lighting.update(CONFIG.maxDeltaTime);
    expect(lighting.getTimeOfDayHours()).toBeCloseTo(18, 2);
    expect(lighting.getDaylightFactor()).toBeGreaterThanOrEqual(0);
    expect(lighting.getDaylightFactor()).toBeLessThanOrEqual(1);

    // Time wraps modulo the day length without ever leaving [0, 24).
    for (let i = 0; i < 10; i++) lighting.update(CONFIG.dayNight.dayLength);
    const hours = lighting.getTimeOfDayHours();
    expect(hours).toBeGreaterThanOrEqual(0);
    expect(hours).toBeLessThan(24);
  });

  it("clamps negative deltas to zero so a regressed clock cannot rewind", () => {
    const { lighting } = makeLighting();
    lighting.update(-50);
    expect(lighting.getTimeOfDayHours()).toBeCloseTo(12, 5);
  });

  it("rotates the sun direction around +Z while enabled", () => {
    const { lighting } = makeLighting();
    const before = lighting.getSunDirection(new THREE.Vector3());
    lighting.update(1);
    const after = lighting.getSunDirection(new THREE.Vector3());
    expect(after.distanceTo(before)).toBeGreaterThan(0);
    // Rotation stays in the XY plane: z is invariant.
    expect(after.z).toBeCloseTo(before.z, 5);
    expect(after.length()).toBeCloseTo(1, 5); // stays unit-length
  });

  it("freezeDayNight pins daylight analytically and halts the clock", () => {
    const { lighting } = makeLighting();
    lighting.freezeDayNight(1);
    lighting.update(1000); // frozen: recomputes factor from the pinned direction, advances nothing
    expect(lighting.getDaylightFactor()).toBe(1);
    const pinned = lighting.getSunDirection(new THREE.Vector3());
    lighting.update(1000);
    expect(
      lighting.getSunDirection(new THREE.Vector3()).distanceTo(pinned),
    ).toBe(0);

    // Midnight freeze (the factor lands on the next update from pinned y=-0.18).
    lighting.freezeDayNight(0);
    lighting.update(0.001);
    expect(lighting.getDaylightFactor()).toBe(0);
    expect(lighting.getSunDirection(new THREE.Vector3()).y).toBeCloseTo(
      -0.18,
      5,
    );

    // Out-of-range freezes clamp.
    lighting.freezeDayNight(5);
    lighting.update(0.001);
    expect(lighting.getDaylightFactor()).toBe(1);
    lighting.freezeDayNight(-3);
    lighting.update(0.001);
    expect(lighting.getDaylightFactor()).toBe(0);
  });

  it("tracks a moving shadow focus and repositions sun/target coherently", () => {
    const { lighting, scene } = makeLighting();
    const sun = scene.children.find(
      (o) => o instanceof THREE.DirectionalLight,
    ) as THREE.DirectionalLight;

    const focusA = new THREE.Vector3(0, 64, 0);
    lighting.update(0.001, focusA);
    expect(sun.target.position.distanceTo(focusA)).toBeLessThan(1e-6);
    // Sun sits one shadow-distance along the current direction from the focus.
    const expectedSun = focusA
      .clone()
      .addScaledVector(
        lighting.getSunDirection(new THREE.Vector3()),
        CONFIG.rendering.shadowDistance,
      );
    expect(sun.position.distanceTo(expectedSun)).toBeLessThan(1e-6);

    // While FROZEN the direction never changes, so a sub-threshold move keeps
    // the previous anchor (no per-frame churn).
    lighting.freezeDayNight(1);
    const targetBefore = sun.target.position.clone();
    lighting.update(0.001, focusA.clone().add(new THREE.Vector3(0.1, 0, 0)));
    expect(sun.target.position.distanceTo(targetBefore)).toBe(0);

    // Large movement re-anchors.
    const focusB = new THREE.Vector3(40, 64, -30);
    lighting.update(0.001, focusB);
    expect(sun.target.position.distanceTo(focusB)).toBeLessThan(1e-6);
  });

  it("dispose removes its lights from the scene", () => {
    const { lighting, scene } = makeLighting();
    lighting.dispose();
    const lights = scene.children.filter(
      (o) =>
        o instanceof THREE.HemisphereLight ||
        o instanceof THREE.DirectionalLight,
    );
    expect(lights.length).toBe(0);
  });
});
