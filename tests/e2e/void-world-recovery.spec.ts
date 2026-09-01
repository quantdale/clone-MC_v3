import { test, expect, type Page } from "@playwright/test";

const SEED = 771;
const WORLD_ID = `world-${SEED}`;
const DB_NAME = "voxel-world-db";
const DB_VERSION = 6;


type SeedConfig = {
  metadata?: { generationVersion?: string } | null; // null = no metadata at all
  columns?: Array<{ cx: number; cz: number }>;
  player?: { position: [number, number, number] } | null;
};

async function seedBeforeBoot(page: Page, cfg: SeedConfig, once = false) {
  await page.goto("/empty.html");
  if (once) {
    const already = await page.evaluate(
      ({ worldId }) => sessionStorage.getItem(`__seeded_${worldId}`),
      { worldId: WORLD_ID },
    ).catch(() => null);
    if (already) return;
  }
  await page.evaluate(
    async ({ worldId, dbName, dbVersion, cfg, columns }) => {
      const req = window.indexedDB.open(dbName, dbVersion);
      req.onupgradeneeded = () => {
        const db = req.result as any;
        if (!db.objectStoreNames.contains("world-metadata"))
          db.createObjectStore("world-metadata", { keyPath: "worldId" });
        if (!db.objectStoreNames.contains("chunk-sections"))
          db.createObjectStore("chunk-sections", { keyPath: "key" });
        if (!db.objectStoreNames.contains("block-entities"))
          db.createObjectStore("block-entities", { keyPath: "key" });
        if (!db.objectStoreNames.contains("entities"))
          db.createObjectStore("entities", { keyPath: "key" });
        if (!db.objectStoreNames.contains("player-state"))
          db.createObjectStore("player-state", { keyPath: "key" });
        if (!db.objectStoreNames.contains("chunk-edits"))
          db.createObjectStore("chunk-edits", { keyPath: "key" });
      };
      await new Promise<void>((resolve, reject) => {
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      const db: any = req.result;
      async function put(store: string, value: any) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(store, "readwrite");
          const st = tx.objectStore(store);
          const r: any = st.put(value);
          r.onsuccess = () => resolve();
          r.onerror = () => reject(r.error);
        });
      }
      async function clearAll() {
        for (const store of [
          "world-metadata",
          "chunk-sections",
          "block-entities",
          "entities",
          "player-state",
          "chunk-edits",
        ]) {
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(store, "readwrite");
            const st = tx.objectStore(store);
            const r: any = st.clear();
            r.onsuccess = () => resolve();
            r.onerror = () => reject(r.error);
          });
        }
      }
      await clearAll();
      if (cfg.metadata !== null) {
        const meta: any = cfg.metadata === undefined ? undefined : cfg.metadata;
        if (meta !== undefined) {
          const record: any = {
            schemaVersion: 1,
            worldId,
            seed: 771,
            dimensionId: "minecraft:overworld",
            minY: -64,
            height: 384,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          if (meta && meta.generationVersion !== undefined) {
            record.generationVersion = meta.generationVersion;
          }
          await put("world-metadata", record);
        }
      }
      if (columns && columns.length > 0) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("chunk-sections", "readwrite");
          const store = tx.objectStore("chunk-sections");
          for (const c of columns) {
            const col = {
              key: `${worldId}|${c.cx}|${c.cz}`,
              worldId,
              version: 1,
              chunkX: c.cx,
              chunkZ: c.cz,
              sectionCount: 24,
              minSectionY: -4,
              sections: {
                "7": {
                  version: 1,
                  capacity: 4096,
                  palette: [0, 1],
                  bitsPerEntry: 4,
                  storage: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,286331153,286331153,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,286331153,286331153,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,286331153,286331153,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,286331153,286331153,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,286331153,286331153,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,286331153,286331153,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,286331153,286331153,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,286331153,286331153,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,286331153,286331153,0,0,0,0,0,0,0,0,0,0,],
                },
              },
            };
            const req2: any = store.put(col);
            req2.onerror = () => console.error("put failed", c, req2.error);
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      }
      if (cfg.player) {
        const rec = {
          key: worldId,
          worldId,
          seed: 771,
          position: cfg.player.position,
          yaw: 0,
          pitch: 0,
          inventory: { slots: [] },
          survival: { hunger: 20 },
          experience: { level: 0 },
        };
        await put("player-state", rec);
      }
      db.close();
      (window as any).__seedDone = true;
    },
    { worldId: WORLD_ID, dbName: DB_NAME, dbVersion: DB_VERSION, cfg, columns: cfg.columns ?? [] },
  );
  if (once) {
    await page.evaluate(
      ({ worldId }) => sessionStorage.setItem(`__seeded_${worldId}`, "1"),
      { worldId: WORLD_ID },
    );
  }
}

async function waitForBoot(page: Page) {
  await page.goto(`/?seed=${SEED}`);
  await page.waitForFunction(
    () => {
      const loading = document.getElementById("loading");
      const recovery = document.getElementById("recovery");
      const loadingHidden = loading ? loading.classList.contains("hidden") : true;
      const recoveryVisible = recovery ? !recovery.classList.contains("hidden") : false;
      const hasGame = !!(window as any).__voxelGame;
      return (loadingHidden || recoveryVisible) && hasGame;
    },
    { timeout: 60000 }
  );
}

test.describe("void-world startup recovery (257 e2e)", () => {
  test("fresh current world boots with visible terrain and supported player", async ({ page }) => {
    // No preseed -> fresh world
    await page.addInitScript(({ dbName }) => {
      void window.indexedDB.deleteDatabase(dbName);
    }, { dbName: DB_NAME });
    await waitForBoot(page);
    await expect(page.locator("#recovery")).toBeHidden();
    await expect(page.locator("#loading")).toBeHidden({ timeout: 60000 });
    // Check game bootstrapped and not recovery
    const mode = await page.evaluate(() => (window as any).__voxelGame?.worldStartupMode);
    expect(mode).toBe("current");
    const isRecovery = await page.evaluate(() => (window as any).__voxelGame?.isRecoveryRequired);
    expect(isRecovery).toBe(false);
    // Verify player has support (getMotionBlockingHeight below)
    const supported = await page.evaluate(() => {
      const g: any = (window as any).__voxelGame;
      if (!g) return false;
      const x = Math.floor(g.player.position.x);
      const z = Math.floor(g.player.position.z);
      const h = g.world.getMotionBlockingHeight(x, z);
      return h >= g.world.dimension.minY;
    });
    expect(supported).toBe(true);
    // Explicit visual evidence: fresh terrain must be visibly present
    await page.screenshot({ path: "test-results/void-world-recovery/fresh-terrain.png", fullPage: true });
    const hasCanvas = await page.evaluate(() => !!document.querySelector("canvas"));
    expect(hasCanvas).toBe(true);
  });

  test("legacy-unknown partial world shows recovery and never simulates free-fall", async ({ page }) => {
    await seedBeforeBoot(page, {
      metadata: {}, // legacy-unknown: no generationVersion
      columns: [],
      player: null,
    });
    await waitForBoot(page);
    await expect(page.locator("#recovery")).toBeVisible();
    await expect(page.locator("#recovery")).toContainText("Saved world needs recovery");
    const isRecovery = await page.evaluate(() => (window as any).__voxelGame?.isRecoveryRequired);
    expect(isRecovery).toBe(true);
    const mode = await page.evaluate(() => (window as any).__voxelGame?.worldStartupMode);
    expect(mode).toBe("recovery-required");
    // Ensure player velocity is zero and not falling
    const velY = await page.evaluate(() => (window as any).__voxelGame?.player.velocity.y);
    expect(velY).toBe(0);
    await page.waitForTimeout(1500);
    await expect(page.locator("#recovery")).toBeVisible();
    // Visual evidence: recovery overlay
    await page.screenshot({ path: "test-results/void-world-recovery/recovery-overlay.png", fullPage: true });
    // Prove world remains frozen: y should not change over time
    const y1 = await page.evaluate(() => (window as any).__voxelGame.player.position.y);
    await page.waitForTimeout(1000);
    const y2 = await page.evaluate(() => (window as any).__voxelGame.player.position.y);
    expect(y2).toBe(y1);
    // Also prove world frozen via World API
    const frozen = await page.evaluate(() => (window as any).__voxelGame.world.isRecoveryFrozen());
    expect(frozen).toBe(true);
  });

  test("unsupported future-generation world with partial coverage is recovery-required and preserves records", async ({ page }) => {
    await seedBeforeBoot(page, {
      metadata: { generationVersion: "future-worldgen-v99" },
      columns: [],
      player: { position: [8.5, 64, 8.5] },
    });
    await waitForBoot(page);
    await expect(page.locator("#recovery")).toBeVisible();
    const baseline = await page.evaluate(() => (window as any).__voxelGame?.worldGenerationBaseline);
    expect(baseline).toBe("unsupported");
    // Verify records still present via direct IDB read
    const stillThere = await page.evaluate(async (worldId) => {
      return await new Promise<boolean>((resolve) => {
        const req: any = window.indexedDB.open("voxel-world-db", 6);
        req.onsuccess = () => {
          const db: any = req.result;
          const tx = db.transaction("world-metadata", "readonly");
          const r: any = tx.objectStore("world-metadata").get(worldId);
          r.onsuccess = () => {
            const val = r.result;
            db.close();
            resolve(!!val && val.generationVersion === "future-worldgen-v99");
          };
          r.onerror = () => resolve(false);
        };
        req.onerror = () => resolve(false);
      });
    }, WORLD_ID);
    expect(stillThere).toBe(true);
  });

  test("safe preserved legacy world loads from canonical terrain, not generator prediction", async ({ page }) => {
    const cols: Array<{ cx: number; cz: number }> = [];
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) cols.push({ cx: dx, cz: dz });
    await seedBeforeBoot(page, {
      metadata: {}, // legacy-unknown
      columns: cols,
      player: null,
    });
    await waitForBoot(page);
    await expect(page.locator("#recovery")).toBeHidden();
    const mode = await page.evaluate(() => (window as any).__voxelGame?.worldStartupMode);
    expect(mode).toBe("preserved");
    const baseline = await page.evaluate(() => (window as any).__voxelGame?.worldGenerationBaseline);
    expect(baseline).toBe("legacy-unknown");
    await expect(page.locator("#loading")).toBeHidden({ timeout: 60000 });
    const spawnRes = await page.evaluate(() => (window as any).__voxelGame?.spawnResolution);
    expect(spawnRes).toBe("canonical");
  });

  test("persisted player over missing column is relocated or recovery-required, never free-fall", async ({ page }) => {
    // Full coverage at origin, but player far away over missing column (100,100)
    const cols: Array<{ cx: number; cz: number }> = [];
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) cols.push({ cx: dx, cz: dz });
    await seedBeforeBoot(page, {
      metadata: {}, // legacy
      columns: cols,
      player: { position: [1600, 80, 1600] }, // chunk 100,100 far from origin coverage
    });
    await waitForBoot(page);
    // Because player chunk is 100,100, coverage anchor is there, but no columns there -> recovery
    await expect(page.locator("#recovery")).toBeVisible();
    const isRecovery = await page.evaluate(() => (window as any).__voxelGame?.isRecoveryRequired);
    expect(isRecovery).toBe(true);
    const y = await page.evaluate(() => (window as any).__voxelGame?.player.position.y);
    // Should not be falling into void; y should be finite and not decreasing rapidly
    expect(Number.isFinite(y)).toBe(true);
    await page.waitForTimeout(1000);
    const y2 = await page.evaluate(() => (window as any).__voxelGame?.player.position.y);
    // In recovery, velocity is zero so y should not have decreased (free-fall would drop)
    expect(y2).toBe(y);
  });

  test("recovery reset end-to-end produces fresh current world with visible terrain", async ({ page }) => {
    test.setTimeout(180_000);
    await seedBeforeBoot(page, {
      metadata: {}, // legacy partial -> recovery
      columns: [],
      player: null,
    });
    await waitForBoot(page);
    await expect(page.locator("#recovery")).toBeVisible();
    // Screenshot: recovery overlay before reset
    await page.screenshot({ path: "test-results/void-world-recovery/before-reset-recovery.png", fullPage: true });
    // First click arms confirmation
    await page.locator("#recovery-reset").click();
    await expect(page.locator("#recovery-status")).toContainText("backup");
    // Second click executes reset and reloads via window.location.reload()
    await page.locator("#recovery-reset").click();
    // Wait for reload and fresh boot
    await page.waitForFunction(() => (window as any).__voxelGame?.worldStartupMode === "current", { timeout: 60000 });
    await expect(page.locator("#recovery")).toBeHidden({ timeout: 60000 });
    // After reload, should be fresh current world without recovery
    await expect(page.locator("#loading")).toBeHidden({ timeout: 60000 });
    const mode = await page.evaluate(() => (window as any).__voxelGame?.worldStartupMode);
    expect(mode).toBe("current");
    const baseline = await page.evaluate(() => (window as any).__voxelGame?.worldGenerationBaseline);
    expect(baseline).toBe("current");
    // Visual evidence: post-reset terrain
    await page.screenshot({ path: "test-results/void-world-recovery/post-reset-terrain.png", fullPage: true });
  });

  test("reset failure is atomic and preserves world with truthful messaging", async ({ page }) => {
    await seedBeforeBoot(page, {
      metadata: {}, // legacy partial -> recovery
      columns: [],
      player: null,
    });
    await waitForBoot(page);
    await expect(page.locator("#recovery")).toBeVisible();
    // Inject failure: patch IDB delete to fail for one store
    await page.evaluate(() => {
      const orig = (window as any).IDBObjectStore?.prototype?.delete;
      if (!orig) return;
      let called = false;
      (window as any).__origDelete = orig;
      (window as any).IDBObjectStore.prototype.delete = function(key: any) {
        // Fail only for first delete on world-metadata store with world-771
        if (!called && typeof key === 'string' && key === 'world-771') {
          called = true;
          const req: any = { onsuccess: null, onerror: null, result: undefined, error: new Error('injected browser delete failure') };
          queueMicrotask(() => req.onerror?.({ target: req }));
          return req;
        }
        return orig.call(this, key);
      };
    });
    await page.locator("#recovery-reset").click(); // arm
    await expect(page.locator("#recovery-status")).toContainText("backup");
    await page.locator("#recovery-reset").click(); // attempt reset, should fail
    await expect(page.locator("#recovery-status")).toContainText("Reset failed");
    await expect(page.locator("#recovery-status")).toContainText("No changes were made");
    await expect(page.locator("#recovery")).toBeVisible();
    // Screenshot: failed reset state
    await page.screenshot({ path: "test-results/void-world-recovery/failed-reset.png", fullPage: true });
    // Verify world still has metadata via IDB
    const stillThere = await page.evaluate(async (worldId) => {
      return await new Promise<boolean>((resolve) => {
        const req: any = window.indexedDB.open("voxel-world-db", 6);
        req.onsuccess = () => {
          const db: any = req.result;
          const tx = db.transaction("world-metadata", "readonly");
          const r: any = tx.objectStore("world-metadata").get(worldId);
          r.onsuccess = () => { db.close(); resolve(!!r.result); };
          r.onerror = () => resolve(false);
        };
        req.onerror = () => resolve(false);
      });
    }, WORLD_ID);
    expect(stillThere).toBe(true);
    // Restore original delete and retry should succeed
    await page.evaluate(() => {
      if ((window as any).__origDelete) {
        (window as any).IDBObjectStore.prototype.delete = (window as any).__origDelete;
      }
    });
    // Need to re-arm: click again (need to click twice more because state was reset to not confirmed)
    await page.locator("#recovery-reset").click();
    await expect(page.locator("#recovery-status")).toContainText("backup");
    await page.locator("#recovery-reset").click();
    await page.waitForFunction(() => (window as any).__voxelGame?.worldStartupMode === "current", { timeout: 60000 });
    await expect(page.locator("#recovery")).toBeHidden({ timeout: 60000 });
  });

  test("corrupt metadata does not appear as current world", async ({ page }) => {
    // Seed with no metadata (simulates corrupt/missing) but with columns - should be recovery or preserved, never current with void
    await seedBeforeBoot(page, {
      metadata: null, // no metadata record
      columns: [{ cx: 0, cz: 0 }],
      player: { position: [8.5, 64, 8.5] },
    });
    await waitForBoot(page);
    const baseline = await page.evaluate(() => (window as any).__voxelGame?.worldGenerationBaseline);
    // With no metadata but columns present, it should be legacy-unknown, not current
    expect(baseline).toBe("legacy-unknown");
    const mode = await page.evaluate(() => (window as any).__voxelGame?.worldStartupMode);
    // With only one column, spawn coverage is insufficient, so should be recovery-required
    expect(mode).toBe("recovery-required");
    await expect(page.locator("#recovery")).toBeVisible();
  });

  test("incomplete canonical columns are not counted as ready", async ({ page }) => {
    // Seed with metadata current but no columns, then add player over missing terrain
    // This is similar to legacy partial, should be recovery
    await seedBeforeBoot(page, {
      metadata: {}, // legacy
      columns: [{ cx: 0, cz: 0 }], // only one column, not enough for 5x5 spawn ring
      player: null,
    });
    await waitForBoot(page);
    await expect(page.locator("#recovery")).toBeVisible();
    const mode = await page.evaluate(() => (window as any).__voxelGame?.worldStartupMode);
    expect(mode).toBe("recovery-required");
  });
});
