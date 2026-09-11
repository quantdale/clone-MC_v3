/**
 * Canonical headed-run gate (258 task 31, pure core).
 *
 * The runtime-performance spec makes headed hardware-WebGL production runs
 * the primary release-performance authority: SwiftShader/software rendering,
 * headless overrides, or reduced quality MUST make a run non-canonical and
 * can never primary-PASS. This module is the deterministic classifier; the
 * headed runner (`scripts/perf/canonical-perf-run.mjs`) mirrors these rules
 * and MUST be kept in sync (both files carry MUST-match comments).
 *
 * Pure and headless-safe. Malformed identities fail closed (non-canonical
 * with a named reason, never a throw to the harness).
 */

/** Measured identity of one perf-run browser session. */
export interface CanonicalRunIdentity {
  /** Whether the browser ran headed (false = headless override). */
  headed: boolean;
  /** Whether WebGL context creation succeeded. */
  webglSupported: boolean;
  /** `WEBGL_debug_renderer_info` vendor string (or fallback). */
  vendor: string;
  /** `WEBGL_debug_renderer_info` renderer string (or fallback). */
  renderer: string;
  /** Actual device pixel ratio. */
  devicePixelRatio: number;
  /** Actual render distance in chunks. */
  renderDistance: number;
  /** Expected default-desktop render distance (canonical quality). */
  expectedRenderDistance: number;
}

/** Classification verdict with machine-checkable reasons. */
export interface CanonicalRunVerdict {
  canonical: boolean;
  reasons: string[];
}

/** Renderer substrings that mark software rasterization (non-canonical). */
const SOFTWARE_RENDERER_PATTERNS = [/swiftshader/i, /llvmpipe/i, /software/i, /basic\s*render/i];

/** Whether a renderer string identifies software rasterization. */
export function isSoftwareRenderer(renderer: unknown): boolean {
  if (typeof renderer !== 'string') return true;
  return SOFTWARE_RENDERER_PATTERNS.some((pattern) => pattern.test(renderer));
}

/**
 * Classify a run identity. Returns `{ canonical: true, reasons: [] }` only
 * when every canonical condition holds; otherwise `{ canonical: false }`
 * with one reason per violated condition. Never throws on malformed input.
 */
export function evaluateCanonicalRun(input: unknown): CanonicalRunVerdict {
  const reasons: string[] = [];
  if (typeof input !== 'object' || input === null) {
    return { canonical: false, reasons: ['identity must be an object'] };
  }
  const identity = input as Record<string, unknown>;

  if (identity.headed !== true) {
    reasons.push('headless run (canonical requires headed)');
  }
  if (identity.webglSupported !== true) {
    reasons.push('WebGL unsupported');
  }
  if (typeof identity.vendor !== 'string' || identity.vendor.length === 0) {
    reasons.push(`invalid vendor: ${String(identity.vendor)}`);
  }
  if (typeof identity.renderer !== 'string' || identity.renderer.length === 0) {
    reasons.push(`invalid renderer: ${String(identity.renderer)}`);
  } else if (isSoftwareRenderer(identity.renderer)) {
    reasons.push(`software renderer: ${identity.renderer}`);
  }
  const dpr = identity.devicePixelRatio;
  if (typeof dpr !== 'number' || !Number.isFinite(dpr) || dpr < 1 || dpr > 2) {
    reasons.push(`non-canonical devicePixelRatio: ${String(dpr)}`);
  }
  const distance = identity.renderDistance;
  const expected = identity.expectedRenderDistance;
  if (typeof distance !== 'number' || !Number.isInteger(distance) || distance <= 0) {
    reasons.push(`invalid renderDistance: ${String(distance)}`);
  } else if (typeof expected !== 'number' || !Number.isInteger(expected) || expected <= 0) {
    reasons.push(`invalid expectedRenderDistance: ${String(expected)}`);
  } else if (distance !== expected) {
    reasons.push(`reduced renderDistance ${distance} (canonical expects ${expected})`);
  }
  return { canonical: reasons.length === 0, reasons };
}
