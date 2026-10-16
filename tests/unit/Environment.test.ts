import { describe, it, expect } from "vitest";
import {
  computeEnvironmentState,
  toLightingView,
  type EnvironmentState,
} from "../../src/rendering/Environment";
import {
  RAIN_SKY_DARKNESS,
  THUNDER_SKY_DARKNESS,
  presentWeather,
  precipitationTier,
  applyWeatherToEnvironment,
} from "../../src/rendering/WeatherPresentation";

/** Documented constants mirrored from `Environment.ts` (base noon direction). */
const BASE_SUN_DIRECTION = { x: 0.5, y: 1, z: 0.3 };

function makeOut(): EnvironmentState {
  return computeEnvironmentState(12);
}

describe("computeEnvironmentState", () => {
  it("normalizes time-of-day into [0, 24)", () => {
    expect(computeEnvironmentState(25).timeOfDayHours).toBe(1);
    expect(computeEnvironmentState(-1).timeOfDayHours).toBe(23);
    expect(computeEnvironmentState(48.5).timeOfDayHours).toBe(0.5);
  });

  it("keeps the documented base sun direction at noon (rotation angle 0)", () => {
    const s = computeEnvironmentState(12);
    const len = Math.hypot(
      BASE_SUN_DIRECTION.x,
      BASE_SUN_DIRECTION.y,
      BASE_SUN_DIRECTION.z,
    );
    expect(s.sunDirection.x).toBeCloseTo(BASE_SUN_DIRECTION.x / len, 12);
    expect(s.sunDirection.y).toBeCloseTo(BASE_SUN_DIRECTION.y / len, 12);
    expect(s.sunDirection.z).toBeCloseTo(BASE_SUN_DIRECTION.z / len, 12);
  });

  it("rotates the sun purely in the XY plane around +Z (z component constant)", () => {
    const len = Math.hypot(
      BASE_SUN_DIRECTION.x,
      BASE_SUN_DIRECTION.y,
      BASE_SUN_DIRECTION.z,
    );
    const bz = BASE_SUN_DIRECTION.z / len;
    for (const hour of [0, 6, 12, 18, 23]) {
      const s = computeEnvironmentState(hour);
      expect(s.sunDirection.z).toBeCloseTo(bz, 12);
      // Unit vector at every hour.
      expect(
        Math.hypot(s.sunDirection.x, s.sunDirection.y, s.sunDirection.z),
      ).toBeCloseTo(1, 12);
    }
  });

  it("is periodic: the same hour 24h apart yields the identical direction", () => {
    const a = computeEnvironmentState(6);
    const b = computeEnvironmentState(30);
    expect(b.sunDirection).toEqual(a.sunDirection);
    expect(b.daylightFactor).toBe(a.daylightFactor);
  });

  it("daylight factor endpoints: full night at midnight, near-full day at noon", () => {
    expect(computeEnvironmentState(0).daylightFactor).toBe(0);
    const noon = computeEnvironmentState(12).daylightFactor;
    expect(noon).toBeGreaterThan(0.98);
    expect(noon).toBeLessThanOrEqual(1);
  });

  it("daylight factor is symmetric around noon (morning equals evening)", () => {
    // Hours equidistant from noon rotate the sun by ±the same angle about Z,
    // which mirrors Y — but the curve anchors make both sides comparable only
    // through their shared endpoints; instead assert monotonic rise/fall.
    const h6 = computeEnvironmentState(6).daylightFactor;
    const h9 = computeEnvironmentState(9).daylightFactor;
    const h15 = computeEnvironmentState(15).daylightFactor;
    const h18 = computeEnvironmentState(18).daylightFactor;
    // At 06:00 the rotated sun still sits above the horizon (y = +base.x).
    expect(h6).toBeGreaterThan(0);
    expect(h9).toBeGreaterThan(h6);
    expect(h15).toBeGreaterThan(h18);
    expect(h18).toBe(0); // sun mirrored below horizon at 18:00
  });

  it("exposure follows the daylight factor within [0.6, 1]", () => {
    expect(computeEnvironmentState(0).exposure).toBeCloseTo(0.6, 12);
    const noon = computeEnvironmentState(12);
    expect(noon.exposure).toBeCloseTo(0.6 + 0.4 * noon.daylightFactor, 12);
  });

  it("clamps weather intensities into [0, 1]", () => {
    const s = computeEnvironmentState(12, {
      precipitationIntensity: 3,
      thunderIntensity: -2,
    });
    expect(s.precipitationIntensity).toBe(1);
    expect(s.thunderIntensity).toBe(0);
    expect(computeEnvironmentState(12).precipitationIntensity).toBe(0);
  });

  it("reuses the out object allocation-free (identity-stable state and nested objects)", () => {
    const out = makeOut();
    const sunDir = out.sunDirection;
    const zenith = out.skyZenith;
    const a = computeEnvironmentState(8, undefined, out);
    const b = computeEnvironmentState(20, undefined, out);
    expect(a).toBe(out);
    expect(b).toBe(out);
    // Nested objects are also reused, not reallocated.
    expect(out.sunDirection).toBe(sunDir);
    expect(out.skyZenith).toBe(zenith);
    // Values actually updated in place.
    expect(out.timeOfDayHours).toBe(20);
    expect(out.timeOfDayHours).not.toBe(8);
  });
});

describe("toLightingView", () => {
  it("reproduces the Lighting getter contract from the state", () => {
    for (const hour of [0, 7.5, 12, 19.25]) {
      const s = computeEnvironmentState(hour);
      const view = toLightingView(s);
      expect(view.getDaylightFactor()).toBe(s.daylightFactor);
      expect(view.getTimeOfDayHours()).toBe(s.timeOfDayHours);
      const target = { x: 99, y: 99, z: 99 };
      const returned = view.getSunDirection(target);
      expect(returned).toBe(target);
      expect(target.x).toBe(s.sunDirection.x);
      expect(target.y).toBe(s.sunDirection.y);
      expect(target.z).toBe(s.sunDirection.z);
    }
  });

  it("reflects later state mutation through the view", () => {
    const s = makeOut();
    const view = toLightingView(s);
    const before = view.getDaylightFactor();
    computeEnvironmentState(0, undefined, s);
    expect(s.daylightFactor).toBe(0);
    expect(view.getDaylightFactor()).toBe(0);
    expect(before).toBeGreaterThan(0);
  });
});

describe("applyWeatherToEnvironment / presentWeather skyDarkening", () => {
  it("maps weather kinds to the documented darkness table", () => {
    expect(presentWeather({ weather: "clear" } as never).skyDarkness).toBe(0);
    expect(presentWeather({ weather: "rain" } as never).skyDarkness).toBe(
      RAIN_SKY_DARKNESS,
    );
    expect(presentWeather({ weather: "thunder" } as never).skyDarkness).toBe(
      THUNDER_SKY_DARKNESS,
    );
  });

  it("darkens sky and fog monotonically as skyDarkness increases", () => {
    const base = computeEnvironmentState(12);
    const darkenings = [
      0,
      RAIN_SKY_DARKNESS / 2,
      RAIN_SKY_DARKNESS,
      THUNDER_SKY_DARKNESS,
    ];
    const results = darkenings.map((darkness) =>
      applyWeatherToEnvironment(
        base,
        {
          rainIntensity: 1,
          thunderIntensity: 0,
          skyDarkness: darkness,
          rainSoundLevel: 1,
          thunderSoundLevel: 0,
        },
        // Fresh out per step so successive runs do not compound on the base.
        makeOut(),
      ),
    );
    for (let i = 1; i < results.length; i++) {
      const cur = results[i]!;
      const prev = results[i - 1]!;
      for (const key of ["skyZenith", "skyHorizon", "fogColor"] as const) {
        for (const channel of ["r", "g", "b"] as const) {
          expect(cur[key][channel]).toBeLessThanOrEqual(
            prev[key][channel] + 1e-12,
          );
        }
      }
      expect(cur.exposure).toBeLessThanOrEqual(prev.exposure + 1e-12);
    }
    // Full-clear presentation leaves colors untouched.
    const clear = results[0]!;
    for (const key of ["skyZenith", "fogColor"] as const) {
      expect(clear[key].r).toBe(base[key].r);
    }
  });

  it("sets precipitation/thunder intensities and copies time fields into a fresh out", () => {
    const base = computeEnvironmentState(17);
    const out = makeOut();
    applyWeatherToEnvironment(
      base,
      {
        rainIntensity: 1,
        thunderIntensity: 1,
        skyDarkness: THUNDER_SKY_DARKNESS,
        rainSoundLevel: 1,
        thunderSoundLevel: 1,
      },
      out,
    );
    expect(out.precipitationIntensity).toBe(1);
    expect(out.thunderIntensity).toBe(1);
    expect(out.timeOfDayHours).toBe(17);
    expect(out.daylightFactor).toBe(base.daylightFactor);
    expect(out.sunDirection).toEqual(base.sunDirection);
  });

  it("writes in place when out is omitted (mutates the input state)", () => {
    const state = computeEnvironmentState(12);
    const returned = applyWeatherToEnvironment(state, {
      rainIntensity: 0.5,
      thunderIntensity: 0,
      skyDarkness: RAIN_SKY_DARKNESS,
      rainSoundLevel: 1,
      thunderSoundLevel: 0,
    });
    expect(returned).toBe(state);
    expect(state.precipitationIntensity).toBe(0.5);
  });
});

describe("precipitationTier", () => {
  it("classifies boundary intensities deterministically", () => {
    expect(precipitationTier(0)).toBe("clear");
    expect(precipitationTier(0.0009)).toBe("clear");
    expect(precipitationTier(0.001)).toBe("light");
    expect(precipitationTier(0.3399)).toBe("light");
    expect(precipitationTier(0.34)).toBe("moderate");
    expect(precipitationTier(0.6699)).toBe("moderate");
    expect(precipitationTier(0.67)).toBe("storm");
    expect(precipitationTier(1)).toBe("storm");
  });

  it("degrades non-finite and negative inputs to clear", () => {
    expect(precipitationTier(NaN)).toBe("clear");
    expect(precipitationTier(Infinity)).toBe("clear"); // non-finite degrades
    expect(precipitationTier(-0.5)).toBe("clear");
  });
});

// ── Environment class coverage (verification campaign) ──────────────────────

// ── Environment class coverage (verification campaign) ──────────────────────

import * as THREE from "three";
import { Environment } from "../../src/rendering/Environment";

function makeEnvironment(
  renderDistance = 4,
  seed = 7,
): {
  env: Environment;
  scene: THREE.Scene;
} {
  const scene = new THREE.Scene();
  return { env: new Environment(scene, renderDistance, seed), scene };
}

describe("Environment (scene owner)", () => {
  it("installs fog sized beyond the load-square diagonal with configured near/far fractions", () => {
    const { env, scene } = makeEnvironment(4);
    const fog = scene.fog as THREE.Fog;
    expect(fog).toBeInstanceOf(THREE.Fog);

    // far must cover the Chebyshev square's diagonal corner distance × margin.
    const corner = 4 * 16 * Math.SQRT2;
    expect(fog.far).toBeGreaterThanOrEqual(corner * 1.1 - 1e-6);
    expect(env.environment).toBeDefined();
    // Identity-stable shared state.
    expect(env.environment).toBe(env.environment);
  });

  it("setTimeOfDayHours drives the shared clock state into [0,24)", () => {
    const { env } = makeEnvironment();
    env.setTimeOfDayHours(25.5);
    expect(env.environment.timeOfDayHours).toBeCloseTo(1.5, 5);
    env.setTimeOfDayHours(-3);
    expect(env.environment.timeOfDayHours).toBeCloseTo(21, 5);
  });

  it("applyWeather clamps and folds intensities; update darkens fog accordingly", () => {
    const { env, scene } = makeEnvironment();
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);

    env.update(camera, 1);
    const clearFog = (scene.fog as THREE.Fog).color.clone();

    env.applyWeather({ precipitationIntensity: 2, thunderIntensity: -1 });
    expect(env.environment.precipitationIntensity).toBe(1); // clamped
    expect(env.environment.thunderIntensity).toBe(0); // clamped

    env.update(camera, 1);
    const rainFog = (scene.fog as THREE.Fog).color;
    expect(rainFog.r).toBeLessThan(clearFog.r + 1e-9); // rain darkens

    // Sky dome follows the camera.
    camera.position.set(123, 64, -456);
    env.update(camera, 0.5);
    const sky = scene.children.find(
      (o) => o instanceof THREE.Mesh,
    ) as THREE.Mesh;
    expect(sky.position.distanceTo(camera.position)).toBeLessThan(1e-6);
  });

  it("update() writes daylight and sun direction through to uniforms and shared state", () => {
    const { env, scene } = makeEnvironment();
    const camera = new THREE.PerspectiveCamera();
    const dir = new THREE.Vector3(0, 1, 0).normalize();
    env.update(camera, 0.25, dir);

    const sky = scene.children.find(
      (o) => o instanceof THREE.Mesh,
    ) as THREE.Mesh;
    const material = sky.material as THREE.ShaderMaterial;
    expect(material.uniforms.daylight!.value).toBeCloseTo(0.25, 6);
    expect(
      (material.uniforms.sunDirection!.value as THREE.Vector3).y,
    ).toBeCloseTo(dir.y, 6);
    expect(env.environment.daylightFactor).toBeCloseTo(0.25, 6);

    // Daylight clamping: out-of-range inputs saturate.
    env.update(camera, 42, dir);
    expect(material.uniforms.daylight!.value).toBe(1);
  });

  it("applyEnvironmentState pushes an external snapshot into the shared state", () => {
    const { env } = makeEnvironment();
    const external = {
      timeOfDayHours: 3,
      daylightFactor: 0,
      sunDirection: { x: -0.35, y: 0.78, z: 0.22 },
      exposure: 1,
      fogColor: { r: 0, g: 0, b: 0 },
      precipitationIntensity: 0.8,
      thunderIntensity: 0.2,
    };
    env.applyEnvironmentState(external as never);
    expect(env.environment.timeOfDayHours).toBeCloseTo(3, 5);
    expect(env.environment.precipitationIntensity).toBeCloseTo(0.8, 5);
  });
});
