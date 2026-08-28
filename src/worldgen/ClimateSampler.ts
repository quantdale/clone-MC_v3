/**
 * Climate sampler (089). `ClimateSampler` deterministically samples five MC-like climate fields at
 * (x, z) — temperature, humidity, continentalness, erosion, weirdness — each in [-1, 1], each
 * from its own seed-derived 087 noise field (documented scales). `validateClimateSample` accepts
 * exactly finite in-range values; `climateDistance` is the Euclidean distance over the five
 * fields (the 090 biome-matching metric).
 */
import { fbm3D, ValueNoise3D } from './DensityNoise';

/** Five MC-like climate fields, each in [-1, 1]. */
export interface ClimateSample {
  temperature: number;
  humidity: number;
  continentalness: number;
  erosion: number;
  weirdness: number;
}

interface FieldSpec {
  name: keyof ClimateSample;
  scale: number;
  seedXor: number;
}

const FIELDS: readonly FieldSpec[] = [
  { name: 'temperature', scale: 0.002, seedXor: 0x9e3779b9 },
  { name: 'humidity', scale: 0.003, seedXor: 0x85ebca6b },
  { name: 'continentalness', scale: 0.001, seedXor: 0xc2b2ae35 },
  { name: 'erosion', scale: 0.005, seedXor: 0x27d4eb2f },
  { name: 'weirdness', scale: 0.007, seedXor: 0x165667b1 },
];

const FBM_OCTAVES = 4;
const FBM_LACUNARITY = 2;
const FBM_GAIN = 0.5;

/** Deterministic 2D climate field sampler. */
export class ClimateSampler {
  private readonly noises: ReadonlyMap<keyof ClimateSample, ValueNoise3D>;

  constructor(worldSeed: number) {
    const noises = new Map<keyof ClimateSample, ValueNoise3D>();
    for (const field of FIELDS) {
      noises.set(field.name, new ValueNoise3D(worldSeed ^ field.seedXor));
    }
    this.noises = noises;
  }

  /** Sample the five climate fields at (x, z); pure and deterministic. */
  sample(x: number, z: number): ClimateSample {
    const out = {} as ClimateSample;
    for (const field of FIELDS) {
      const value = fbm3D(this.noises.get(field.name)!, FBM_OCTAVES, FBM_LACUNARITY, FBM_GAIN, x * field.scale, 0, z * field.scale);
      out[field.name] = Math.min(1, Math.max(-1, value));
    }
    return out;
  }
}

function isInRange(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -1 && v <= 1;
}

/** Validate an unknown value as a `ClimateSample`; throws a descriptive error otherwise. */
export function validateClimateSample(input: unknown): ClimateSample {
  if (typeof input !== 'object' || input === null) {
    throw new Error('ClimateSample: must be an object');
  }
  const r = input as Record<string, unknown>;
  for (const field of FIELDS) {
    if (!isInRange(r[field.name])) {
      throw new Error(`ClimateSample: ${field.name} must be a finite number in [-1, 1], got ${String(r[field.name])}`);
    }
  }
  return input as ClimateSample;
}

/** Euclidean distance between two climate samples over the five fields. */
export function climateDistance(a: ClimateSample, b: ClimateSample): number {
  let sum = 0;
  for (const field of FIELDS) {
    const d = a[field.name] - b[field.name];
    sum += d * d;
  }
  return Math.sqrt(sum);
}
