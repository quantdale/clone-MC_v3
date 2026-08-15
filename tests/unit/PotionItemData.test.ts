import { describe, expect, it } from 'vitest';
import {
  POTION_CONTENTS_COMPONENT,
  POTION_SPLASH_RADIUS,
  buildConsumePayload,
  buildSplashPayload,
  createPotionContents,
  getEffectiveEffects,
  potionContentsComponentType,
} from '../../src/data/PotionItemData';
import {
  createDefaultStackComponentRegistry,
  StackComponentMap,
} from '../../src/inventory/StackDataComponents';
import { createResourceId } from '../../src/data/ResourceId';

const speed = 'minecraft:effect/speed';
const strength = 'minecraft:effect/strength';

describe('potion contents factory', () => {
  it('builds a normal potion with the requested effects', () => {
    const c = createPotionContents({ kind: 'NORMAL', customEffects: [{ typeId: speed, duration: 100, amplifier: 1 }] });
    expect(c.kind).toBe('NORMAL');
    expect(c.customEffects.length).toBe(1);
    expect(c.customEffects[0]!.typeId).toBe(speed);
    expect(c.customEffects[0]!.duration).toBe(100);
    expect(c.customEffects[0]!.amplifier).toBe(1);
  });

  it('defaults kind to NORMAL when omitted', () => {
    const c = createPotionContents({ customEffects: [{ typeId: speed, duration: 10, amplifier: 0 }] });
    expect(c.kind).toBe('NORMAL');
  });

  it('stores an opaque base reference', () => {
    const c = createPotionContents({ base: 'minecraft:potion/water', customEffects: [{ typeId: speed, duration: 10, amplifier: 0 }] });
    expect(c.base).toBe('minecraft:potion/water');
  });

  it('floors a fractional amplifier and passes a finite duration through', () => {
    const c = createPotionContents({ customEffects: [{ typeId: speed, duration: 3.9, amplifier: 2.9 }] });
    expect(c.customEffects[0]!.duration).toBe(3.9);
    expect(c.customEffects[0]!.amplifier).toBe(2);
  });
});

describe('potion contents validation', () => {
  it('rejects an empty effects list', () => {
    expect(() => createPotionContents({ customEffects: [] })).toThrow();
  });

  it('rejects an unknown kind', () => {
    expect(() => createPotionContents({ kind: 'FIZZ' as never, customEffects: [{ typeId: speed, duration: 1, amplifier: 0 }] })).toThrow();
  });

  it('rejects a negative duration', () => {
    expect(() => createPotionContents({ customEffects: [{ typeId: speed, duration: -5, amplifier: 0 }] })).toThrow();
  });

  it('floors a non-integer amplifier', () => {
    const c = createPotionContents({ customEffects: [{ typeId: speed, duration: 5, amplifier: 1.5 }] });
    expect(c.customEffects[0]!.amplifier).toBe(1);
  });

  it('rejects a duplicate effect typeId', () => {
    expect(() =>
      createPotionContents({ customEffects: [
        { typeId: speed, duration: 5, amplifier: 0 },
        { typeId: speed, duration: 5, amplifier: 1 },
      ] }),
    ).toThrow();
  });

  it('rejects a non-string base', () => {
    expect(() => createPotionContents({ base: 5 as never, customEffects: [{ typeId: speed, duration: 5, amplifier: 0 }] })).toThrow();
  });
});

describe('effect resolution and payloads', () => {
  const contents = createPotionContents({
    kind: 'SPLASH',
    customEffects: [
      { typeId: speed, duration: 100, amplifier: 1 },
      { typeId: strength, duration: 90, amplifier: 2 },
    ],
  });

  it('getEffectiveEffects returns the custom effects in order', () => {
    const effects = getEffectiveEffects(contents);
    expect(effects.length).toBe(2);
    expect(effects[0]!.typeId).toBe(speed);
    expect(effects[1]!.typeId).toBe(strength);
  });

  it('buildConsumePayload carries the effects', () => {
    const payload = buildConsumePayload(contents);
    expect(payload.effects.length).toBe(2);
    expect(payload.effects).toEqual(getEffectiveEffects(contents));
  });

  it('buildSplashPayload uses the splash radius for SPLASH', () => {
    const payload = buildSplashPayload(contents);
    expect(payload.radius).toBe(POTION_SPLASH_RADIUS);
    expect(payload.effects.length).toBe(2);
  });

  it('buildSplashPayload yields radius 0 for NORMAL', () => {
    const normal = createPotionContents({ kind: 'NORMAL', customEffects: [{ typeId: speed, duration: 10, amplifier: 0 }] });
    expect(buildSplashPayload(normal).radius).toBe(0);
  });

  it('buildSplashPayload yields the splash radius for LINGERING too', () => {
    const lingering = createPotionContents({ kind: 'LINGERING', customEffects: [{ typeId: speed, duration: 10, amplifier: 0 }] });
    expect(buildSplashPayload(lingering).radius).toBe(POTION_SPLASH_RADIUS);
  });
});

describe('component type + registry', () => {
  it('is registered in the default stack-component registry', () => {
    const registry = createDefaultStackComponentRegistry();
    expect(registry.has(POTION_CONTENTS_COMPONENT)).toBe(true);
  });

  it('validates a well-formed value', () => {
    expect(
      potionContentsComponentType.validate({ kind: 'NORMAL', customEffects: [{ typeId: speed, duration: 10, amplifier: 0 }] }),
    ).toBe(true);
  });

  it('rejects a value missing customEffects', () => {
    expect(potionContentsComponentType.validate({ kind: 'NORMAL' })).toBe(false);
  });

  it('rejects a value with a duplicate effect', () => {
    expect(
      potionContentsComponentType.validate({ kind: 'NORMAL', customEffects: [
        { typeId: speed, duration: 10, amplifier: 0 },
        { typeId: speed, duration: 10, amplifier: 1 },
      ] }),
    ).toBe(false);
  });

  it('round-trips through a StackComponentMap', () => {
    const registry = createDefaultStackComponentRegistry();
    const contents = createPotionContents({ kind: 'SPLASH', customEffects: [{ typeId: speed, duration: 50, amplifier: 1 }] });
    // Stored value is the flat, already-validated plain object (StackComponentValue).
    const map = new StackComponentMap(registry).with(POTION_CONTENTS_COMPONENT, contents as unknown as never);
    expect(map.has(POTION_CONTENTS_COMPONENT)).toBe(true);
    const stored = map.get(POTION_CONTENTS_COMPONENT) as ReturnType<typeof createPotionContents>;
    expect(stored.kind).toBe('SPLASH');
    expect(stored.customEffects[0]!.typeId).toBe(speed);
  });

  it('StackComponentMap rejects a malformed potion value', () => {
    const registry = createDefaultStackComponentRegistry();
    const before = new StackComponentMap(registry);
    expect(() => before.with(POTION_CONTENTS_COMPONENT, { kind: 'NORMAL' } as never)).toThrow();
  });
});

describe('regression: existing registries unchanged', () => {
  it('the component registry still contains exactly the base types plus potion', () => {
    const registry = createDefaultStackComponentRegistry();
    expect(registry.all().length).toBe(3);
  });

  it('a real ResourceId for an effect is still formable', () => {
    expect(createResourceId('minecraft', 'effect/speed').namespace).toBe('minecraft');
  });
});
