/**
 * Shared-simulation package boundary (222): the declaration of which simulation modules are
 * deterministic/headless-safe and dependency-free, the shareability rule that makes them
 * client/server-shareable, and a violation audit. Pure and headless-safe: no import analysis
 * (authors declare deps), no mutation of inputs, no IO.
 *
 * Determinism rules:
 * - `version` is 1; module names are non-empty and unique; flags are booleans;
 *   `externalDeps` are strings (default []); `checksum` is optional non-empty.
 * - Shareability: `deterministic && headlessSafe && externalDeps.length === 0`.
 * - Violations (registration order): a deterministic module with external deps; a headlessSafe
 *   module with 'dom' or 'indexeddb' deps.
 */
export interface SimulationModule {
  /** Unique non-empty module path. */
  readonly name: string;
  readonly deterministic: boolean;
  readonly headlessSafe: boolean;
  /** Default []. */
  readonly externalDeps: readonly string[];
  /** Optional non-empty. */
  readonly checksum?: string;
}

/** The validated package boundary. */
export interface SimulationPackageBoundary {
  readonly version: 1;
  readonly modules: readonly SimulationModule[];
}

function validateModule(value: unknown, index: number): SimulationModule {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`SimulationBoundary: modules ${index} must be an object`);
  }
  const m = value as Record<string, unknown>;
  if (typeof m.name !== 'string' || m.name.length === 0) {
    throw new Error(`SimulationBoundary: modules ${index}.name must be a non-empty string`);
  }
  if (typeof m.deterministic !== 'boolean') {
    throw new Error(`SimulationBoundary: modules ${index}.deterministic must be a boolean`);
  }
  if (typeof m.headlessSafe !== 'boolean') {
    throw new Error(`SimulationBoundary: modules ${index}.headlessSafe must be a boolean`);
  }
  const deps = m.externalDeps ?? [];
  if (!Array.isArray(deps)) {
    throw new Error(`SimulationBoundary: modules ${index}.externalDeps must be non-empty strings`);
  }
  for (const dep of deps) {
    if (typeof dep !== 'string' || dep.length === 0) {
      throw new Error(`SimulationBoundary: modules ${index}.externalDeps must be non-empty strings`);
    }
  }
  if (
    m.checksum !== undefined &&
    (typeof m.checksum !== 'string' || m.checksum.length === 0)
  ) {
    throw new Error(
      `SimulationBoundary: modules ${index}.checksum must be a non-empty string when present`,
    );
  }
  return {
    name: m.name,
    deterministic: m.deterministic,
    headlessSafe: m.headlessSafe,
    externalDeps: [...deps],
    ...(m.checksum !== undefined ? { checksum: m.checksum } : {}),
  };
}

/** Validate an unknown value as a boundary; throws descriptively, accepts nothing partially. */
export function validateSimulationPackageBoundary(input: unknown): SimulationPackageBoundary {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('SimulationBoundary: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.version !== 1) {
    throw new Error(`SimulationBoundary: unsupported version ${String(r.version)}`);
  }
  if (!Array.isArray(r.modules)) {
    throw new Error('SimulationBoundary: modules must be an array');
  }
  const modules: SimulationModule[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < r.modules.length; i += 1) {
    const module = validateModule(r.modules[i], i);
    if (seen.has(module.name)) {
      throw new Error(`SimulationBoundary: duplicate module ${module.name}`);
    }
    seen.add(module.name);
    modules.push(module);
  }
  for (const key of Object.keys(r)) {
    if (key !== 'version' && key !== 'modules') {
      throw new Error(`SimulationBoundary: unknown key ${key}`);
    }
  }
  return { version: 1, modules };
}

/** Build a validated boundary. */
export function createSimulationPackageBoundary(
  modules: readonly SimulationModule[],
): SimulationPackageBoundary {
  return validateSimulationPackageBoundary({ version: 1, modules });
}

/** A boundary audit entry. */
export interface BoundaryViolation {
  readonly module: string;
  readonly reason: string;
}

/**
 * The boundary violations in registration order: deterministic modules with external deps, and
 * headlessSafe modules depending on 'dom' or 'indexeddb'.
 */
export function boundaryViolations(boundary: SimulationPackageBoundary): readonly BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];
  for (const module of boundary.modules) {
    if (module.deterministic && module.externalDeps.length > 0) {
      violations.push({
        module: module.name,
        reason: 'deterministic module must have no external deps',
      });
    }
    if (
      module.headlessSafe &&
      (module.externalDeps.includes('dom') || module.externalDeps.includes('indexeddb'))
    ) {
      violations.push({
        module: module.name,
        reason: 'headlessSafe module must not depend on dom or indexeddb',
      });
    }
  }
  return violations;
}

/** The client/server-shareable modules, in registration order. */
export function sharableModules(boundary: SimulationPackageBoundary): readonly SimulationModule[] {
  return boundary.modules.filter(
    (m) => m.deterministic && m.headlessSafe && m.externalDeps.length === 0,
  );
}

/** Look up a module by name; undefined when missing. */
export function moduleByName(
  boundary: SimulationPackageBoundary,
  name: string,
): SimulationModule | undefined {
  return boundary.modules.find((m) => m.name === name);
}

/**
 * The shared-simulation replay modules introduced by change 241
 * (deterministic-replay-suite). They are deterministic, headless-safe, and have
 * no external deps, so they are client/server-shareable under the boundary rule.
 */
export const SHARED_SIMULATION_REPLAY_MODULES: readonly SimulationModule[] = [
  { name: 'simulation/ReplayRecording', deterministic: true, headlessSafe: true, externalDeps: [] },
  { name: 'simulation/StateHasher', deterministic: true, headlessSafe: true, externalDeps: [] },
  { name: 'simulation/ReplayVerifier', deterministic: true, headlessSafe: true, externalDeps: [] },
  { name: 'simulation/ReplayFixtures', deterministic: true, headlessSafe: true, externalDeps: [] },
];


