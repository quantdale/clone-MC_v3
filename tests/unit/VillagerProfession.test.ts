import { describe, expect, it } from 'vitest';
import { PointOfInterestManager } from '../../src/simulation/PointOfInterest';
import {
  createDefaultVillagerProfessionRegistry,
  scheduleForHour,
  VillagerProfessionSystem,
} from '../../src/simulation/VillagerProfession';

describe('VillagerProfessionRegistry', () => {
  it('registers and looks up the default professions by key', () => {
    const registry = createDefaultVillagerProfessionRegistry();
    expect(registry.finalized).toBe(true);
    expect(registry.size).toBe(3);
    expect(registry.getByKey('farmer')).toBeDefined();
    expect(registry.getByKey('librarian')).toBeDefined();
    expect(registry.getByKey('weaponsmith')).toBeDefined();
    expect(registry.getByKey('nonexistent')).toBeUndefined();
  });

  it('never contains an "unemployed" entry', () => {
    const registry = createDefaultVillagerProfessionRegistry();
    expect(registry.entries().some((p) => p.key === 'unemployed' || p.key === 'none')).toBe(false);
  });

  it('exposes entries in registration order', () => {
    const registry = createDefaultVillagerProfessionRegistry();
    expect(registry.entries().map((p) => p.key)).toEqual(['farmer', 'librarian', 'weaponsmith']);
  });
});

describe('scheduleForHour', () => {
  it('resolves boundary hours to the correct phase', () => {
    expect(scheduleForHour(0)).toBe('REST');
    expect(scheduleForHour(5.999)).toBe('REST');
    expect(scheduleForHour(6)).toBe('WORK');
    expect(scheduleForHour(17.999)).toBe('WORK');
    expect(scheduleForHour(18)).toBe('MEANDER');
    expect(scheduleForHour(21.999)).toBe('MEANDER');
    expect(scheduleForHour(22)).toBe('REST');
    expect(scheduleForHour(23.999)).toBe('REST');
  });
});

describe('VillagerProfessionSystem.assignProfession', () => {
  const professions = createDefaultVillagerProfessionRegistry().entries();
  const farmer = professions.find((p) => p.key === 'farmer')!;
  const librarian = professions.find((p) => p.key === 'librarian')!;

  it('assigns the only available profession and claims its workstation', () => {
    const poiManager = new PointOfInterestManager();
    poiManager.add(farmer.workstationType, 1, 5, 0);
    const system = new VillagerProfessionSystem();

    const result = system.assignProfession(1, poiManager, professions, 0, 5, 0, 100);

    expect(result).toEqual(farmer.id);
    expect(poiManager.get(1, 5, 0)!.claimed).toBe(true);
    expect(system.getAssignment(1)).toMatchObject({ professionId: farmer.id, poiX: 1, poiY: 5, poiZ: 0 });
  });

  it('picks the earlier-priority profession even if its workstation is farther', () => {
    const poiManager = new PointOfInterestManager();
    poiManager.add(farmer.workstationType, 20, 5, 0); // farther
    poiManager.add(librarian.workstationType, 2, 5, 0); // nearer
    const system = new VillagerProfessionSystem();

    const result = system.assignProfession(1, poiManager, professions, 0, 5, 0, 100);

    expect(result).toEqual(farmer.id);
    expect(poiManager.get(20, 5, 0)!.claimed).toBe(true);
    expect(poiManager.get(2, 5, 0)!.claimed).toBe(false);
  });

  it('returns null and claims nothing when no workstation is available', () => {
    const poiManager = new PointOfInterestManager();
    const system = new VillagerProfessionSystem();

    const result = system.assignProfession(1, poiManager, professions, 0, 5, 0, 100);

    expect(result).toBeNull();
    expect(system.getAssignment(1)).toBeUndefined();
  });

  it('does not reassign an already-assigned villager', () => {
    const poiManager = new PointOfInterestManager();
    poiManager.add(farmer.workstationType, 1, 5, 0);
    poiManager.add(librarian.workstationType, 2, 5, 0);
    const system = new VillagerProfessionSystem();

    system.assignProfession(1, poiManager, professions, 0, 5, 0, 100);
    const secondResult = system.assignProfession(1, poiManager, professions, 0, 5, 0, 100);

    expect(secondResult).toEqual(farmer.id);
    // The librarian POI was never touched by the second call.
    expect(poiManager.get(2, 5, 0)!.claimed).toBe(false);
  });
});

describe('VillagerProfessionSystem.unassign', () => {
  const professions = createDefaultVillagerProfessionRegistry().entries();
  const farmer = professions.find((p) => p.key === 'farmer')!;

  it('releases the claimed POI and clears the assignment', () => {
    const poiManager = new PointOfInterestManager();
    poiManager.add(farmer.workstationType, 1, 5, 0);
    const system = new VillagerProfessionSystem();
    system.assignProfession(1, poiManager, professions, 0, 5, 0, 100);

    const released = system.unassign(1, poiManager);

    expect(released).toBe(true);
    expect(poiManager.get(1, 5, 0)!.claimed).toBe(false);
    expect(system.getAssignment(1)).toBeUndefined();
  });

  it('is a no-op for a villager with no tracked assignment', () => {
    const poiManager = new PointOfInterestManager();
    const system = new VillagerProfessionSystem();

    expect(system.unassign(1, poiManager)).toBe(false);
  });
});
