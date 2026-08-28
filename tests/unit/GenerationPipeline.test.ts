import { describe, it, expect } from 'vitest';
import {
  GenerationPipeline,
  GENERATION_STAGES,
  nextStage,
  stageIndex,
  validateGenerationStage,
} from '../../src/worldgen/GenerationPipeline';

describe('vocabulary', () => {
  it('is ordered and complete', () => {
    expect(GENERATION_STAGES).toEqual([
      'TERRAIN',
      'CLIMATE',
      'BIOMES',
      'SURFACE',
      'CAVES',
      'FLUIDS',
      'FEATURES',
      'FINAL',
    ]);
  });

  it('computes indices and next stages', () => {
    expect(stageIndex('SURFACE')).toBe(3);
    expect(stageIndex('FINAL')).toBe(7);
    expect(nextStage('SURFACE')).toBe('CAVES');
    expect(nextStage('FINAL')).toBeNull();
  });

  it('rejects unknown stages', () => {
    expect(() => validateGenerationStage('MOON')).toThrow(/stage/i);
    expect(() => validateGenerationStage(3)).toThrow(/stage/i);
    expect(() => validateGenerationStage(null)).toThrow(/stage/i);
  });
});

describe('GenerationPipeline', () => {
  it('defaults unknown columns to the first stage', () => {
    const pipeline = new GenerationPipeline();
    expect(pipeline.getStage(0, 0)).toBe('TERRAIN');
    expect(pipeline.isComplete(0, 0)).toBe(false);
  });

  it('advances forward with transition records', () => {
    const pipeline = new GenerationPipeline();
    const transition = pipeline.advanceTo(3, 5, 'SURFACE');

    expect(transition).toEqual({ columnKey: '3,5', from: 'TERRAIN', to: 'SURFACE', advanced: true });
    expect(pipeline.getStage(3, 5)).toBe('SURFACE');
    expect(pipeline.isAtLeast(3, 5, 'CAVES')).toBe(false);
    expect(pipeline.isAtLeast(3, 5, 'BIOMES')).toBe(true);
  });

  it('treats same-stage calls as no-ops', () => {
    const pipeline = new GenerationPipeline();
    pipeline.advanceTo(0, 0, 'CLIMATE');

    const transition = pipeline.advanceTo(0, 0, 'CLIMATE');

    expect(transition).toEqual({ columnKey: '0,0', from: 'CLIMATE', to: 'CLIMATE', advanced: false });
    expect(pipeline.getStage(0, 0)).toBe('CLIMATE');
  });

  it('throws on backward transitions without mutation', () => {
    const pipeline = new GenerationPipeline();
    pipeline.advanceTo(1, 1, 'SURFACE');

    expect(() => pipeline.advanceTo(1, 1, 'TERRAIN')).toThrow(/backward/i);
    expect(pipeline.getStage(1, 1)).toBe('SURFACE');
  });

  it('reports completion only at the final stage', () => {
    const pipeline = new GenerationPipeline();
    expect(pipeline.isComplete(0, 0)).toBe(false);

    for (const stage of GENERATION_STAGES) {
      pipeline.advanceTo(0, 0, stage);
    }
    expect(pipeline.getStage(0, 0)).toBe('FINAL');
    expect(pipeline.isComplete(0, 0)).toBe(true);
  });

  it('keeps column statuses independent', () => {
    const pipeline = new GenerationPipeline();
    pipeline.advanceTo(0, 0, 'FINAL');
    pipeline.advanceTo(2, 2, 'CLIMATE');

    expect(pipeline.getStage(0, 0)).toBe('FINAL');
    expect(pipeline.getStage(2, 2)).toBe('CLIMATE');
    expect(pipeline.getStage(0, 2)).toBe('TERRAIN');
  });

  it('is deterministic across identical sequences', () => {
    const run = () => {
      const pipeline = new GenerationPipeline();
      const records: unknown[] = [];
      records.push(pipeline.advanceTo(0, 0, 'BIOMES'));
      records.push(pipeline.advanceTo(0, 0, 'BIOMES'));
      records.push(pipeline.advanceTo(0, 0, 'FINAL'));
      records.push(pipeline.getStage(0, 0));
      records.push(pipeline.isComplete(0, 0));
      return records;
    };
    expect(run()).toEqual(run());
  });

  it('supports a custom stage vocabulary', () => {
    const stages = ['A', 'B', 'C'] as const;
    const pipeline = new GenerationPipeline(stages);
    expect(pipeline.getStage(0, 0)).toBe('A');
    pipeline.advanceTo(0, 0, 'C');
    expect(pipeline.isComplete(0, 0)).toBe(true);
    expect(() => pipeline.advanceTo(0, 0, 'D' as never)).toThrow(/stage/i);
  });
});
