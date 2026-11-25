import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { methodBody, readSource } from '../support/sourceText';
import { GameAudio } from '../../src/audio/GameAudio';
import { OscillatorAmbientBackend } from '../../src/audio/AmbientSoundBackend';
import { PlayerInteraction } from '../../src/player/PlayerInteraction';
import { createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { createDefaultItemRegistry } from '../../src/inventory/ItemRegistry';

const REPO_ROOT = resolve(__dirname, '../..');
const GAME_SRC = resolve(REPO_ROOT, 'src/engine/Game.ts');

describe('GameLifecycleTeardown (309 / R2 & R3)', () => {
  const gameSource = readSource(GAME_SRC);

  describe('Wither skull presentation allocation & material leak prevention (R2)', () => {
    it('syncWitherPresentation does not allocate new SphereGeometry or MeshLambertMaterial per tick', () => {
      const syncBody = methodBody(gameSource, '  private syncWitherPresentation(): void');
      // Must not reallocate geometry or material on every tick inside the loop
      expect(syncBody).not.toMatch(/new THREE\.SphereGeometry\(0\.15/);
      expect(syncBody).not.toMatch(/new THREE\.MeshLambertMaterial\(\{ color: s\.kind === 'blue'/);
      // Must reuse shared static geometry and materials
      expect(syncBody).toContain('this.skullGeometry');
      expect(syncBody).toContain('this.skullMaterialBlue');
      expect(syncBody).toContain('this.skullMaterialNormal');
    });

    it('syncWitherPresentation disposes child mesh geometries and materials when a wither despawns', () => {
      const syncBody = methodBody(gameSource, '  private syncWitherPresentation(): void');
      expect(syncBody).toContain('group.traverse');
      expect(syncBody).toMatch(/child\.geometry\?\.dispose\(\)/);
      expect(syncBody).toMatch(/child\.material\?\.dispose\(\)/);
    });

    it('Game declares reusable skull geometry and materials as class fields', () => {
      expect(gameSource).toMatch(/private readonly skullGeometry = new THREE\.SphereGeometry\(0\.15, 6, 6\);/);
      expect(gameSource).toMatch(/private readonly skullMaterialNormal = new THREE\.MeshLambertMaterial\(\{ color: 0x333333 \}\);/);
      expect(gameSource).toMatch(/private readonly skullMaterialBlue = new THREE\.MeshLambertMaterial\(\{ color: 0x0066ff \}\);/);
    });
  });

  describe('Game.dispose comprehensive teardown (R3)', () => {
    it('Game.dispose cleans up wither groups, skull meshes, and static skull resources', () => {
      const disposeBody = methodBody(gameSource, '  dispose(): void');
      expect(disposeBody).toContain('this.skullGeometry.dispose()');
      expect(disposeBody).toContain('this.skullMaterialNormal.dispose()');
      expect(disposeBody).toContain('this.skullMaterialBlue.dispose()');
      expect(disposeBody).toContain('this.witherMeshes.clear()');
      expect(disposeBody).toContain('this.skullMeshes.clear()');
    });

    it('Game.dispose cleans up witherBossBarEl and ambientBackend', () => {
      const disposeBody = methodBody(gameSource, '  dispose(): void');
      expect(disposeBody).toContain('witherBossBarEl');
      expect(disposeBody).toContain('ambientBackend');
    });

    it('GameAudio.dispose safely closes active AudioContext', () => {
      const audio = new GameAudio();
      const closeSpy = vi.fn().mockResolvedValue(undefined);
      // Stub window.AudioContext
      const mockContext = {
        state: 'running',
        close: closeSpy,
      };
      (audio as unknown as { context: typeof mockContext | null }).context = mockContext;
      audio.dispose();
      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect((audio as unknown as { context: typeof mockContext | null }).context).toBeNull();
    });

    it('OscillatorAmbientBackend.dispose safely closes active AudioContext', () => {
      const backend = new OscillatorAmbientBackend();
      const closeSpy = vi.fn().mockResolvedValue(undefined);
      const mockContext = {
        state: 'running',
        close: closeSpy,
      };
      (backend as unknown as { context: typeof mockContext | null }).context = mockContext;
      backend.dispose();
      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect((backend as unknown as { context: typeof mockContext | null }).context).toBeNull();
    });

    it('PlayerInteraction.dispose releases target outline geometry and material', () => {
      const blockRegistry = createDefaultBlockRegistry();
      const itemRegistry = createDefaultItemRegistry();
      const fakeWorld = {
        getBlock: () => 0,
        setBlock: () => {},
        getBlockState: () => 0,
        setBlockState: () => {},
      };
      const interaction = new PlayerInteraction({
        world: fakeWorld as never,
        registry: blockRegistry,
        itemRegistry,
      } as never);

      const outline = interaction.addTargetOutline();
      expect(outline).not.toBeNull();
      const geoSpy = vi.spyOn(outline!.geometry, 'dispose');
      const matSpy = vi.spyOn(outline!.material as THREE.Material, 'dispose');

      interaction.dispose();
      expect(geoSpy).toHaveBeenCalledTimes(1);
      expect(matSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Game async open and flush dispose guards (313 / REQ-WMD-4)', () => {
    it('primary composed.open() .then/.catch continuations return immediately when this.disposed is true', () => {
      const openBlockStart = gameSource.indexOf('this.selfOpenPromise = composed');
      expect(openBlockStart).toBeGreaterThan(-1);
      const openBlock = gameSource.slice(
        openBlockStart,
        gameSource.indexOf('this.blockRegistry = createDefaultBlockRegistry();', openBlockStart),
      );
      const thenMatch = openBlock.match(/\.then\(\(result\)\s*=>\s*\{([\s\S]*?)\n\s*\}\)\s*\n\s*\.catch\(/);
      const catchMatch = openBlock.match(/\.catch\(\(\)\s*=>\s*\{([\s\S]*?)\}\);/);
      expect(thenMatch).not.toBeNull();
      expect(catchMatch).not.toBeNull();
      expect(thenMatch![1]).toMatch(/^\s*if\s*\(\s*this\.disposed\s*\)\s*return;/);
      expect(catchMatch![1]).toMatch(/^\s*if\s*\(\s*this\.disposed\s*\)\s*return;/);
    });

    it('savePlayerStateDurable() flush continuation returns immediately when this.disposed is true', () => {
      const saveBody = methodBody(gameSource, '  private savePlayerStateDurable(): void');
      const thenMatch = saveBody.match(/\.then\(\(r\)\s*=>\s*\{([\s\S]*?)\}\)/);
      expect(thenMatch).not.toBeNull();
      expect(thenMatch![1]).toMatch(/if\s*\(\s*this\.disposed\s*\)\s*return;/);
    });
  });
});
