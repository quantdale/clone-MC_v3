import { test, expect, type Page } from "@playwright/test";

/**
 * Void-world startup recovery (257) — real IndexedDB browser certification.
 *
 * Exercises the exact user-reported failure path: a persisted world with an
 * old/unsupported generation baseline and missing canonical coverage must NOT
 * boot into an empty-air void with a free-falling player. Instead it must
 * enter the recovery-required product state, keep simulation paused, and offer
 * a world-scoped reset that produces a fresh visible world.
 */

const SEED = 257;
const WORLD_ID = `world-${SEED}`;
const DB_NAME = "voxel-world-db";
const DB_VERSION = 6;

type GameHandle = {
  world: {
    getBlock(x: number, y: number, z: number): number;
    getReadyProgress(cx: number, cz: number): number;
  };
  player: { position: { x: number; y: number; z: number } };
  worldStartupMode?: string;
  worldStartupReason?: string | null;
  isRecoveryRequired?: boolean;
  spawnResolution?: string;
};

async function clearIndexedDb(page: Page): Promise<void> {
  await page.evaluate(
    ({ dbName }) =>
      new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(dbName);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      }),
    { dbName: DB_NAME },
  );
}

async function seedWorldMetadata(
  page: Page,
  opts: { generationVersion?: string; seed?: number; minY?: number; height?: number } = {},
): Promise<void> {
  await page.evaluate(
    ({ dbName, dbVersion, worldId, generationVersion, seed, minY, height }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onupgradeneeded = () => {
          const db = req.result;
          const stores = [
            "world-metadata",
            "chunk-sections",
            "block-entities",
            "entities",
            "player-state",
            "chunk-edits",
          ];
          for (const s of stores) {
            if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("world-metadata", "readwrite");
          const store = tx.objectStore("world-metadata");
          const now = Date.now();
          const record: Record<string, unknown> = {
            schemaVersion: 1,
            worldId,
            seed: seed ?? 257,
            dimensionId: "minecraft:overworld",
            minY: minY ?? -64,
            height: height ?? 384,
            createdAt: now,
            updatedAt: now,
          };
          if (generationVersion !== undefined) record.generationVersion = generationVersion;
          const put = store.put(record, worldId);
          put.onsuccess = () => {
            db.close();
            resolve();
          };
          put.onerror = () => {
            db.close();
            reject(put.error);
          };
        };
        req.onerror = () => reject(req.error);
      });
    },
    {
      dbName: DB_NAME,
      dbVersion: DB_VERSION,
      worldId: WORLD_ID,
      generationVersion: opts.generationVersion,
      seed: opts.seed ?? SEED,
      minY: opts.minY,
      height: opts.height,
    },
  );
}

async function seedPlayerState(page: Page, position: [number, number, number]): Promise<void> {
  await page.evaluate(
    ({ dbName, dbVersion, worldId, position }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("player-state", "readwrite");
          const store = tx.objectStore("player-state");
          const record = {
            key: worldId,
            worldId,
            version: 1,
            seed: 257,
            player: { position, yaw: 0, pitch: 0 },
            inventory: { selected: 0, slots: [] },
            survival: { health: 20, hunger: 20 },
            experience: { level: 0, progress: 0 },
          };
          const put = store.put(record, worldId);
          put.onsuccess = () => {
            db.close();
            resolve();
          };
          put.onerror = () => {
            db.close();
            reject(put.error);
          };
        };
        req.onerror = () => reject(req.error);
      });
    },
    { dbName: DB_NAME, dbVersion: DB_VERSION, worldId: WORLD_ID, position },
  );
}

async function seedChunkSectionsFromGame(page: Page, _count = 25): Promise<void> {
  // Use the game's own serialization to create valid columns: boot once fresh,
  // export columns, then re-seed them under a legacy header. This guarantees
  // the stored payload is exactly what GamePersistence expects.
  await page.goto(`/?seed=${SEED}`);
  await page.waitForFunction(
    () => (window as unknown as { __voxelGame?: unknown }).__voxelGame != null,
    { timeout: 30_000 },
  );
  await page.waitForSelector("#loading", { state: "hidden", timeout: 60_000 });
  const columns: unknown[] = await page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: { world: { exportColumns(): unknown } } }).__voxelGame;
    if (!g) throw new Error("game missing");
    const exported = g.world.exportColumns() as { columns: unknown[] };
    return exported.columns.slice(0, 25);
  });
  // Persist them via direct IndexedDB put (world-scoped key)
  await page.evaluate(
    ({ dbName, dbVersion, worldId, columns }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("chunk-sections", "readwrite");
          const store = tx.objectStore("chunk-sections");
          let pending = columns.length;
          if (pending === 0) {
            db.close();
            resolve();
            return;
          }
          for (const col of columns as Array<{ chunkX: number; chunkZ: number }>) {
            const key = `${worldId}|${col.chunkX}|${col.chunkZ}`;
            const record = { ...(col as object), key, worldId };
            const put = store.put(record, key);
            put.onerror = () => {
              db.close();
              reject(put.error);
            };
            put.onsuccess = () => {
              pending--;
              if (pending === 0) {
                db.close();
                resolve();
              }
            };
          }
        };
        req.onerror = () => reject(req.error);
      });
    },
    { dbName: DB_NAME, dbVersion: DB_VERSION, worldId: WORLD_ID, columns },
  );
}

async function bootGame(page: Page): Promise<void> {
  await page.goto(`/?seed=${SEED}`);
  await page.waitForFunction(
    () => (window as unknown as { __voxelGame?: unknown }).__voxelGame != null,
    { timeout: 30_000 },
  );
  // Recovery UI or loading — wait for either to settle
  await page.waitForFunction(
    () => {
      const loading = document.getElementById("loading");
      const recovery = document.getElementById("recovery");
      const loadingHidden = !loading || loading.classList.contains("hidden");
      const recoveryVisible = recovery && !recovery.classList.contains("hidden");
      return loadingHidden || recoveryVisible;
    },
    { timeout: 60_000 },
  );
}

function gameHandle(page: Page): Promise<GameHandle | undefined> {
  return page.evaluate(
    () => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame,
  );
}

test.describe("void-world startup recovery (257)", () => {
  test("fresh/current world boots with visible terrain and supported player", async ({ page }) => {
    test.setTimeout(90_000);
    await clearIndexedDb(page);
    await bootGame(page);
    const g = await gameHandle(page);
    expect(g).toBeDefined();
    expect(g?.isRecoveryRequired).toBe(false);
    // Terrain visible: block at player's feet column must be solid
    const supported = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      if (!g) return false;
      const x = Math.floor(g.player.position.x);
      const z = Math.floor(g.player.position.z);
      const y = Math.floor(g.player.position.y) - 1;
      return g.world.getBlock(x, y, z) !== 0;
    });
    expect(supported).toBe(true);
    // Recovery UI hidden
    await expect(page.locator("#recovery")).toBeHidden();
    await expect(page.locator("#loading")).toBeHidden();
  });

  test("legacy-unknown partial world enters recovery, never free-fall", async ({ page }) => {
    test.setTimeout(90_000);
    // Seed via blank page so DB is written before game boot
    await page.goto("about:blank");
    await clearIndexedDb(page);
    // Legacy header (no generationVersion) + no canonical columns => must recover
    await seedWorldMetadata(page, { seed: SEED });
    await bootGame(page);
    const g = await gameHandle(page);
    expect(g?.isRecoveryRequired).toBe(true);
    expect(g?.worldStartupMode).toBe("recovery-required");
    await expect(page.locator("#recovery")).toBeVisible();
    await expect(page.locator("#recovery-title")).toContainText("Saved world needs recovery");
    // No simulation: player velocity must stay zero (checked via position stability)
    const pos1 = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g ? { ...g.player.position } : null;
    });
    await page.waitForTimeout(800);
    const pos2 = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g ? { ...g.player.position } : null;
    });
    expect(pos1).toEqual(pos2);
  });

  test("unsupported future version without coverage enters recovery and preserves records", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("about:blank");
    await clearIndexedDb(page);
    await seedWorldMetadata(page, { generationVersion: "v9999-future", seed: SEED });
    await bootGame(page);
    const g = await gameHandle(page);
    expect(g?.isRecoveryRequired).toBe(true);
    await expect(page.locator("#recovery")).toBeVisible();
    // Original metadata must remain (not overwritten to current)
    const meta = await page.evaluate(
      ({ dbName, worldId }) =>
        new Promise<Record<string, unknown> | null>((resolve, reject) => {
          const req = indexedDB.open(dbName);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("world-metadata", "readonly");
            const get = tx.objectStore("world-metadata").get(worldId);
            get.onsuccess = () => {
              db.close();
              resolve((get.result as Record<string, unknown> | undefined) ?? null);
            };
            get.onerror = () => {
              db.close();
              reject(get.error);
            };
          };
          req.onerror = () => reject(req.error);
        }),
      { dbName: DB_NAME, worldId: WORLD_ID },
    );
    expect(meta).not.toBeNull();
    expect(meta?.generationVersion).toBe("v9999-future");
  });

  test("sparse edits without canonical terrain enter recovery", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("about:blank");
    await clearIndexedDb(page);
    await seedWorldMetadata(page, { seed: SEED });
    // Add a chunk-edit record without any canonical columns
    await page.evaluate(
      ({ dbName, worldId }) =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.open(dbName);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("chunk-edits", "readwrite");
            const store = tx.objectStore("chunk-edits");
            const key = `${worldId}|0|0|0`;
            const rec = { key, worldId, chunkX: 0, chunkY: 0, chunkZ: 0, changes: [[0, 3]] };
            const put = store.put(rec, key);
            put.onsuccess = () => {
              db.close();
              resolve();
            };
            put.onerror = () => {
              db.close();
              reject(put.error);
            };
          };
          req.onerror = () => reject(req.error);
        }),
      { dbName: DB_NAME, worldId: WORLD_ID },
    );
    await bootGame(page);
    const g = await gameHandle(page);
    expect(g?.isRecoveryRequired).toBe(true);
    await expect(page.locator("#recovery")).toBeVisible();
  });

  test("saved player over absent column is relocated or recovers, never falling", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("about:blank");
    await clearIndexedDb(page);
    await seedWorldMetadata(page, { seed: SEED });
    await seedPlayerState(page, [0.5, 80, 0.5]);
    await bootGame(page);
    const g = await gameHandle(page);
    // Either relocated to safe terrain or entered recovery — but never free-fall void
    expect(g?.isRecoveryRequired === true || g?.spawnResolution === "relocated" || g?.spawnResolution === "restored").toBe(true);
    await page.waitForTimeout(600);
    const pos = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      return g ? g.player.position.y : null;
    });
    // Player must not be in free-fall below world (would be < -60 and decreasing)
    expect(pos).not.toBeNull();
    expect(pos as number).toBeGreaterThan(-64);
  });

  test("safe preserved legacy world loads from canonical terrain without recovery", async ({ page }) => {
    test.setTimeout(120_000);
    // Create a preserved world: legacy header + full 5x5 canonical coverage around origin
    await page.goto("about:blank");
    await clearIndexedDb(page);
    await seedWorldMetadata(page, { seed: SEED });
    // Seed coverage via the game's own export (ensures valid serialization)
    await seedChunkSectionsFromGame(page, 25);
    // Re-apply legacy header after column seeding (columns written above, header stays legacy)
    await seedWorldMetadata(page, { seed: SEED });
    await bootGame(page);
    const g = await gameHandle(page);
    // With full 5x5 coverage (radius 2) around origin, legacy world is preserved, not recovery
    expect(g?.isRecoveryRequired).toBe(false);
    expect(g?.worldStartupMode).toBe("preserved");
    await expect(page.locator("#recovery")).toBeHidden();
    await expect(page.locator("#loading")).toBeHidden({ timeout: 30_000 });
  });

  test("one-click Start Fresh World resets and reloads to visible terrain", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("about:blank");
    await clearIndexedDb(page);
    await seedWorldMetadata(page, { seed: SEED });
    await bootGame(page);
    await expect(page.locator("#recovery")).toBeVisible();
    // Two-step confirm: first click arms, second click executes
    await page.click("#recovery-reset");
    await expect(page.locator("#recovery-status")).toContainText("permanently deletes");
    await page.click("#recovery-reset");
    // Page reloads — wait for fresh boot
    await page.waitForFunction(
      () => (window as unknown as { __voxelGame?: unknown }).__voxelGame != null,
      { timeout: 30_000 },
    );
    await page.waitForSelector("#loading", { state: "hidden", timeout: 60_000 });
    const g = await gameHandle(page);
    expect(g?.isRecoveryRequired).toBe(false);
    await expect(page.locator("#recovery")).toBeHidden();
    // Terrain visible after reset
    const hasTerrain = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      if (!g) return false;
      const x = Math.floor(g.player.position.x);
      const z = Math.floor(g.player.position.z);
      const y = Math.floor(g.player.position.y) - 1;
      return g.world.getBlock(x, y, z) !== 0;
    });
    expect(hasTerrain).toBe(true);
    // Persistence healthy: new metadata is current
    const baseline = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: { worldStartupMode?: string } }).__voxelGame;
      return g?.worldStartupMode ?? null;
    });
    expect(baseline).toBe("current");
  });

  test("reset is world-scoped and does not delete foreign world data", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("about:blank");
    await clearIndexedDb(page);
    await seedWorldMetadata(page, { seed: SEED });
    // Seed a foreign world
    await page.evaluate(
      ({ dbName, worldId }) =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.open(dbName);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("world-metadata", "readwrite");
            const rec = {
              schemaVersion: 1,
              worldId,
              seed: 999,
              dimensionId: "minecraft:overworld",
              minY: -64,
              height: 384,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              generationVersion: "v1",
            };
            const put = tx.objectStore("world-metadata").put(rec, worldId);
            put.onsuccess = () => {
              db.close();
              resolve();
            };
            put.onerror = () => {
              db.close();
              reject(put.error);
            };
          };
          req.onerror = () => reject(req.error);
        }),
      { dbName: DB_NAME, worldId: "world-other" },
    );
    await bootGame(page);
    await expect(page.locator("#recovery")).toBeVisible();
    await page.click("#recovery-reset");
    await page.click("#recovery-reset");
    await page.waitForFunction(
      () => (window as unknown as { __voxelGame?: unknown }).__voxelGame != null,
      { timeout: 30_000 },
    );
    await page.waitForSelector("#loading", { state: "hidden", timeout: 60_000 });
    // Foreign world must still exist
    const foreign = await page.evaluate(
      ({ dbName, worldId }) =>
        new Promise<unknown>((resolve, reject) => {
          const req = indexedDB.open(dbName);
          req.onsuccess = () => {
            const db = req.result;
            const get = db.transaction("world-metadata", "readonly").objectStore("world-metadata").get(worldId);
            get.onsuccess = () => {
              db.close();
              resolve(get.result ?? null);
            };
            get.onerror = () => {
              db.close();
              reject(get.error);
            };
          };
          req.onerror = () => reject(req.error);
        }),
      { dbName: DB_NAME, worldId: "world-other" },
    );
    expect(foreign).not.toBeNull();
  });
});
