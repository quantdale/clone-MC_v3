import { test, expect, type Page } from '@playwright/test';

const SEED = 253083;
const STONE = 3;
const REDSTONE_LAMP = 45;

type GameHandle = {
  world: {
    setBlock(x: number, y: number, z: number, id: number): void;
    setBlockState?(x: number, y: number, z: number, blockId: number, properties: Record<string, boolean | number | string>): void;
    getBlock(x: number, y: number, z: number): number;
    getBlockState?(x: number, y: number, z: number): { getProperty(name: string): string | undefined };
    getStats(): { pendingMesh: number; pendingLight: number; geometries: number };
  };
  player: { position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void }; velocity: { set(x: number, y: number, z: number): void }; onGround: boolean; yaw: number; pitch: number };
  interaction?: { getTarget(): { blockX: number; blockY: number; blockZ: number } | null };
  renderer: { scene: { children: Array<{ isMesh?: boolean; position: { y: number } }> } };
  persistence: { flush(): Promise<{ committed: number; failed: number }> } | null;
  testSetCameraPose?(yaw: number, pitch: number): void;
};

async function waitReady(page: Page): Promise<void> {
  await page.goto(`/?seed=${SEED}`);
  await page.waitForFunction(
    () => (window as unknown as { __voxelGame?: unknown }).__voxelGame != null,
    { timeout: 60_000 },
  );
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 90_000 });
}

async function enterPointerLock(page: Page): Promise<void> {
  await page.click('#game-canvas');
  await page.waitForFunction(() => document.pointerLockElement !== null, { timeout: 5000 });
  await page.waitForFunction(
    () =>
      (window as unknown as { __voxelGame?: { inputHandle?: { isLocked(): boolean } } }).__voxelGame?.inputHandle?.isLocked?.() === true,
    { timeout: 5000 },
  );
}

async function spawnCell(page: Page): Promise<{ x: number; z: number }> {
  return page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    if (!g) throw new Error('game handle missing');
    return { x: Math.floor(g.player.position.x) + 2, z: Math.floor(g.player.position.z) };
  });
}

async function visibleSectionOrigins(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    if (!g) throw new Error('game handle missing');
    return g.renderer.scene.children
      .filter((child) => child.isMesh)
      .map((child) => Math.round(child.position.y))
      .filter((y) => [-64, 0, 48, 64, 304].includes(y));
  });
}

async function getBlocks(page: Page, cells: Array<[number, number, number]>): Promise<number[]> {
  return page.evaluate((input) => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    if (!g) throw new Error('game handle missing');
    return input.map(([x, y, z]) => g.world.getBlock(x, y, z));
  }, cells);
}

test.describe('live vertical-world seam journey (253)', () => {
  test('renders negative/seam/top sections and preserves them through save/reload', async ({ page }) => {
    test.setTimeout(240_000);
    await waitReady(page);
    const { x, z } = await spawnCell(page);
    const cells: Array<[number, number, number]> = [
      [x, -64, z],
      [x + 1, -1, z],
      [x + 2, 0, z],
      [x + 3, 63, z],
      [x + 4, 64, z],
      [x + 5, 319, z],
    ];

    await page.evaluate((input) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      if (!g) throw new Error('game handle missing');
      for (const [x, y, z] of input as Array<[number, number, number]>) {
        g.world.setBlock(x, y, z, 3);
      }
    }, cells);

    expect(await getBlocks(page, cells)).toEqual(cells.map(() => STONE));
    await page.waitForFunction(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      if (!g) return false;
      const stats = g.world.getStats();
      const origins = g.renderer.scene.children
        .filter((child) => child.isMesh)
        .map((child) => Math.round(child.position.y));
      return stats.pendingMesh === 0 && stats.geometries > 0 &&
        [-64, 0, 48, 64, 304].every((y) => origins.includes(y));
    }, { timeout: 90_000 });

    expect(await visibleSectionOrigins(page)).toEqual(expect.arrayContaining([-64, 0, 48, 64, 304]));
    const statsBeforeReload = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g?.world.getStats() ?? null;
    });
    expect(statsBeforeReload?.geometries).toBeGreaterThan(0);

    const flush = await page.evaluate(async () => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      if (!g?.persistence) throw new Error('persistence missing');
      return g.persistence.flush();
    });
    expect(flush.failed).toBe(0);
    // The World durability bridge may already have committed this edit before
    // the explicit flush; reload below is the durable proof.
    expect(flush.committed).toBeGreaterThanOrEqual(0);

    await page.reload();
    await page.waitForFunction(
      () => (window as unknown as { __voxelGame?: unknown }).__voxelGame != null,
      { timeout: 60_000 },
    );
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 90_000 });
    expect(await getBlocks(page, cells)).toEqual(cells.map(() => STONE));

    await page.waitForFunction(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      if (!g) return false;
      const stats = g.world.getStats();
      return stats.pendingMesh === 0 && stats.geometries > 0;
    }, { timeout: 90_000 });
    expect(await visibleSectionOrigins(page)).toEqual(expect.arrayContaining([-64, 0, 48, 64, 304]));
  });

  test('plays below zero, crosses a section seam, and mutates a property-bearing state', async ({ page }) => {
    test.setTimeout(240_000);
    await waitReady(page);
    const origin = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      if (!g) throw new Error('game handle missing');
      return { x: Math.floor(g.player.position.x), z: Math.floor(g.player.position.z) };
    });
    const floorY = -64;
    const platformY = -2;
    const shaftCells: Array<[number, number, number]> = [];
    for (let x = origin.x - 1; x <= origin.x + 1; x++) {
      for (let z = origin.z - 3; z <= origin.z + 1; z++) {
        for (let y = -63; y <= 4; y++) shaftCells.push([x, y, z]);
      }
    }
    await page.evaluate(({ origin, floorY, platformY, shaftCells, redstoneLamp }) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      if (!g) throw new Error('game handle missing');
      for (const [x, y, z] of shaftCells) g.world.setBlock(x, y, z, 0);
      for (let x = origin.x - 1; x <= origin.x + 1; x++) {
        for (let z = origin.z - 3; z <= origin.z + 1; z++) {
          g.world.setBlock(x, floorY, z, 3);
        }
      }
      for (let z = origin.z - 3; z <= origin.z + 1; z++) {
        g.world.setBlock(origin.x, platformY, z, 3);
      }
      if (!g.world.setBlockState) throw new Error('canonical state hook missing');
      g.world.setBlockState(origin.x, -1, origin.z - 2, redstoneLamp, { lit: true });
      g.player.position.set(origin.x + 0.5, -60, origin.z + 0.5);
      g.player.velocity.set(0, 0, 0);
    }, { origin, floorY, platformY, shaftCells, redstoneLamp: REDSTONE_LAMP });

    await enterPointerLock(page);
    const landedHandle = await page.waitForFunction((stone) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      if (!g || !g.player.onGround || !(g.player.position.y < 0 && g.player.position.y > -64)) return null;
      const supportY = Math.floor(g.player.position.y - 1e-4);
      const support = g.world.getBlock(Math.floor(g.player.position.x), supportY, Math.floor(g.player.position.z));
      return support === stone
        ? { y: g.player.position.y, support }
        : null;
    }, STONE, { timeout: 15_000 });
    const landed = await landedHandle.jsonValue() as { y: number; support: number };
    await landedHandle.dispose();
    expect(landed.y).toBeLessThan(0);
    expect(landed.y).toBeGreaterThan(-64);
    expect(landed.support).toBe(STONE);

    await page.evaluate(({ origin }) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      if (!g) throw new Error('game handle missing');
      g.player.position.set(origin.x + 0.5, -1, origin.z + 0.5);
      g.player.velocity.set(0, 0, 0);
      g.testSetCameraPose?.(0, -0.5);
    }, { origin });
    await page.waitForFunction(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return !!g && g.player.onGround && Math.abs(g.player.position.y - (-1)) < 0.1;
    }, { timeout: 10_000 });

    await page.keyboard.down('Space');
    let crossedSeam = false;
    const jumpDeadline = Date.now() + 4_000;
    while (Date.now() < jumpDeadline) {
      const y = await page.evaluate(() => {
        const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
        return g?.player.position.y ?? -Infinity;
      });
      if (y > 0) {
        crossedSeam = true;
        break;
      }
      await page.waitForTimeout(50);
    }
    await page.keyboard.up('Space');
    expect(crossedSeam).toBe(true);
    await page.waitForFunction(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return !!g && g.player.onGround && Math.abs(g.player.position.y - (-1)) < 0.1;
    }, { timeout: 10_000 });

    const targetCell = { x: origin.x, y: -1, z: origin.z - 2 };
    const beforeState = await page.evaluate((p) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g?.world.getBlockState?.(p.x, p.y, p.z)?.getProperty('lit') ?? null;
    }, targetCell);
    expect(beforeState).toBe('true');

    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      if (!g) throw new Error('game handle missing');
      g.testSetCameraPose?.(0, -0.5);
    });
    await page.waitForFunction((p) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      const target = g?.interaction?.getTarget();
      return target?.blockX === p.x && target.blockY === p.y && target.blockZ === p.z;
    }, targetCell, { timeout: 10_000 });
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    });
    await page.waitForFunction((p) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return (g?.world.getBlock(p.x, p.y, p.z) ?? -1) === 0;
    }, targetCell, { timeout: 8_000 });
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    });
    expect(await page.evaluate((p) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g?.world.getBlock(p.x, p.y, p.z) ?? -1;
    }, targetCell)).toBe(0);

    await page.waitForFunction(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      if (!g) return false;
      const origins = g.renderer.scene.children
        .filter((child) => child.isMesh)
        .map((child) => Math.round(child.position.y));
      return g.world.getStats().pendingMesh === 0 && origins.includes(-64) && origins.includes(-16) && origins.includes(0);
    }, { timeout: 90_000 });
  });
});
