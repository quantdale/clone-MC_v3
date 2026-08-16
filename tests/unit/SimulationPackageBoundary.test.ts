import { describe, it, expect } from 'vitest';
import {
  boundaryViolations,
  createSimulationPackageBoundary,
  moduleByName,
  sharableModules,
  validateSimulationPackageBoundary,
  type SimulationModule,
} from '../../src/simulation/SimulationPackageBoundary';

const CLEAN: SimulationModule = {
  name: 'simulation/GameRuleFramework',
  deterministic: true,
  headlessSafe: true,
  externalDeps: [],
};
const CHECKSUMMED: SimulationModule = {
  name: 'simulation/WeatherFramework',
  deterministic: true,
  headlessSafe: true,
  externalDeps: [],
  checksum: 'abc123',
};

describe('creation', () => {
  it('builds and round-trips a valid boundary', () => {
    const boundary = createSimulationPackageBoundary([CLEAN, CHECKSUMMED]);
    expect(boundary.version).toBe(1);
    expect(validateSimulationPackageBoundary(boundary)).toEqual(boundary);
    expect(boundary.modules).toHaveLength(2);
  });
});

describe('rejections', () => {
  it('rejects bad payloads and fields', () => {
    expect(() => validateSimulationPackageBoundary(null)).toThrow(
      'SimulationBoundary: expected an object',
    );
    expect(() => validateSimulationPackageBoundary({ version: 0, modules: [] })).toThrow(
      'SimulationBoundary: unsupported version 0',
    );
    expect(() => validateSimulationPackageBoundary({ version: 1, modules: 'x' })).toThrow(
      'SimulationBoundary: modules must be an array',
    );
    expect(() =>
      createSimulationPackageBoundary([{ ...CLEAN, name: '' }]),
    ).toThrow('SimulationBoundary: modules 0.name must be a non-empty string');
    expect(() => createSimulationPackageBoundary([CLEAN, CLEAN])).toThrow(
      'SimulationBoundary: duplicate module simulation/GameRuleFramework',
    );
    expect(() =>
      createSimulationPackageBoundary([{ ...CLEAN, deterministic: 'yes' as never }]),
    ).toThrow('SimulationBoundary: modules 0.deterministic must be a boolean');
    expect(() =>
      createSimulationPackageBoundary([{ ...CLEAN, externalDeps: [''] }]),
    ).toThrow('SimulationBoundary: modules 0.externalDeps must be non-empty strings');
    expect(() =>
      createSimulationPackageBoundary([{ ...CLEAN, checksum: '' }]),
    ).toThrow('SimulationBoundary: modules 0.checksum must be a non-empty string when present');
    expect(() =>
      validateSimulationPackageBoundary({ version: 1, modules: [], extra: true }),
    ).toThrow('SimulationBoundary: unknown key extra');
  });
});

describe('violations', () => {
  it('reports deterministic-with-deps and headlessSafe-with-dom/indexeddb', () => {
    const boundary = createSimulationPackageBoundary([
      { ...CLEAN, name: 'a', externalDeps: ['three'] },
      { ...CLEAN, name: 'b', externalDeps: ['dom'] },
      { ...CLEAN, name: 'c', externalDeps: ['indexeddb'] },
      CLEAN,
    ]);
    expect(boundaryViolations(boundary)).toEqual([
      { module: 'a', reason: 'deterministic module must have no external deps' },
      { module: 'b', reason: 'deterministic module must have no external deps' },
      { module: 'b', reason: 'headlessSafe module must not depend on dom or indexeddb' },
      { module: 'c', reason: 'deterministic module must have no external deps' },
      { module: 'c', reason: 'headlessSafe module must not depend on dom or indexeddb' },
    ]);
  });

  it('yields no violations for clean modules', () => {
    expect(boundaryViolations(createSimulationPackageBoundary([CLEAN]))).toEqual([]);
  });
});

describe('queries', () => {
  it('filters shareable modules in registration order', () => {
    const nonShareable: SimulationModule = { ...CLEAN, name: 'x', externalDeps: ['three'] };
    const boundary = createSimulationPackageBoundary([nonShareable, CLEAN]);
    expect(sharableModules(boundary)).toEqual([CLEAN]);
  });

  it('looks up modules by name, undefined when missing', () => {
    const boundary = createSimulationPackageBoundary([CLEAN]);
    expect(moduleByName(boundary, 'simulation/GameRuleFramework')).toEqual(CLEAN);
    expect(moduleByName(boundary, 'nope')).toBeUndefined();
  });

  it('supports empty boundaries', () => {
    const empty = createSimulationPackageBoundary([]);
    expect(sharableModules(empty)).toEqual([]);
    expect(boundaryViolations(empty)).toEqual([]);
    expect(moduleByName(empty, 'a')).toBeUndefined();
  });
});
