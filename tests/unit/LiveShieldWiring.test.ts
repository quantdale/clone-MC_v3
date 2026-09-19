import { describe, expect, it } from 'vitest';
import { resolveShieldBlock } from '../../src/simulation/ShieldBlocking';
import { canRaiseShield, playerYawToShieldBearing } from '../../src/simulation/LiveShieldWiring';

describe('live shield wiring adapters (279)', () => {
  it('converts Player -Z-forward yaw into ShieldBlocking bearings', () => {
    expect(playerYawToShieldBearing(0)).toBe(-180);
    expect(playerYawToShieldBearing(Math.PI / 2)).toBeCloseTo(-90);
    expect(playerYawToShieldBearing(-Math.PI / 2)).toBeCloseTo(90);
    expect(playerYawToShieldBearing(Number.NaN)).toBe(0);
  });

  it('raises only for a locked, interactive, held, equipped, enabled state', () => {
    expect(canRaiseShield(true, true, true, true, false)).toBe(true);
    expect(canRaiseShield(false, true, true, true, false)).toBe(false);
    expect(canRaiseShield(true, false, true, true, false)).toBe(false);
    expect(canRaiseShield(true, true, false, true, false)).toBe(false);
    expect(canRaiseShield(true, true, true, false, false)).toBe(false);
    expect(canRaiseShield(true, true, true, true, true)).toBe(false);
  });

  it('composes Player yaw with the existing front/edge/rear resolver rule', () => {
    const facing = playerYawToShieldBearing(0);
    const front = resolveShieldBlock(true, false, facing, 0, 0, 0, -1, 6);
    expect(front.blocked).toBe(true);

    const edgeBearing = 135;
    const edgeRadians = (edgeBearing * Math.PI) / 180;
    const edge = resolveShieldBlock(
      true,
      false,
      facing,
      0,
      0,
      Math.sin(edgeRadians),
      Math.cos(edgeRadians),
      6,
    );
    expect(edge.blocked).toBe(true);

    const rear = resolveShieldBlock(true, false, facing, 0, 0, 0, 1, 6);
    expect(rear.blocked).toBe(false);
    expect(rear.damageAfterBlock).toBe(6);
  });
});
