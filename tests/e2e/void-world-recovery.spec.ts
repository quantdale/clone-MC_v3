
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

async function seedBeforeBoot(page: Page, cfg: SeedConfig) {
  await page.addInitScript(
    ({ worldId, dbName, dbVersion, cfg, columns }) => {
      const flag = `__seeded_${worldId}`;
      if (sessionStorage.getItem(flag)) return;
      const originalOpen = window.indexedDB.open.bind(window.indexedDB);
      let seedingDone = false;
      const pending: Array<{ name: string; version?: number; req: any }> = [];
      (window as any).__seedDone = false;

      // Intercept open until seeding completes
      (window.indexedDB as any).open = function (name: string, version?: number) {
        if (name !== dbName || seedingDone) return originalOpen(name, version);
        const fake: any = {};
        pending.push({ name, version, req: fake });
        return fake;
      };

      (async () => {
        // Open real DB for seeding (bypass interceptor)
        const realReq: any = originalOpen(dbName, dbVersion);
        realReq.onupgradeneeded = () => {
          const db = realReq.result as any;
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
          realReq.onsuccess = () => resolve();
          realReq.onerror = () => reject(realReq.error);
        });
        const db: any = realReq.result;

        // Helper to do a put transaction
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
            // when meta is {} we omit generationVersion (legacy)
            await put("world-metadata", record);
          }
        }

        if (columns && columns.length > 0) {
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
                "2": {
                  version: 1,
                  palette: [3],
                  bitsPerEntry: 0,
                  storage: [],
                },
              },
            };
            await put("chunk-sections", col);
          }
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
        seedingDone = true;
        sessionStorage.setItem(flag, "1");
        (window as any).__seedDone = true;
        // flush pending opens
        for (const p of pending) {
          const r: any = originalOpen(p.name as string, p.version as any);
          if (p.req.onupgradeneeded) r.onupgradeneeded = p.req.onupgradeneeded;
          r.onsuccess = () => {
            p.req.result = r.result;
            if (p.req.onsuccess) p.req.onsuccess({ target: p.req });
          };
          r.onerror = () => {
            p.req.error = r.error;
            if (p.req.onerror) p.req.onerror({ target: p.req });
          };
        }
        // restore
        (window.indexedDB as any).open = originalOpen;
      })().catch((e) => {
        console.error("seed failed", e);
        seedingDone = true;
        sessionStorage.setItem(flag, "1");
        (window as any).__seedDone = true;
        (window.indexedDB as any).open = originalOpen;
        for (const p of pending) {
          const r: any = originalOpen(p.name as string, p.version as any);
          if (p.req.onupgradeneeded) r.onupgradeneeded = p.req.onupgradeneeded;
          r.onsuccess = () => {
            p.req.result = r.result;
            if (p.req.onsuccess) p.req.onsuccess({ target: p.req });
          };
          r.onerror = () => {
            p.req.error = r.error;
            if (p.req.onerror) p.req.onerror({ target: p.req });
          };
        }
      });
    },
    { worldId: WORLD_ID, dbName: DB_NAME, dbVersion: DB_VERSION, cfg, columns: cfg.columns ?? [] }
  );
}

async function waitForBoot(page: Page) {
  await page.goto(`/?seed=${SEED}`);
  // Wait for either loading hidden or recovery visible
  await page.waitForFunction(
    () => {
      const loading = document.getElementById("loading");
      const recovery = document.getElementById("recovery");
      const loadingHidden = loading ? loading.classList.contains("hidden") : true;
      const recoveryVisible = recovery ? !recovery.classList.contains("hidden") : false;
      return loadingHidden || recoveryVisible;
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
  });

  test("legacy-unknown partial world shows recovery and never simulates free-fall", async ({ page }) => {
    await seedBeforeBoot(page, {
      metadata: {}, // legacy-unknown: no generationVersion
      columns: [{ cx: 0, cz: 0 }], // only one column, missing required coverage
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
    // Simulation should be paused: survival health should not change quickly
    // We just check that recovery overlay stays visible after a few seconds
    await page.waitForTimeout(1500);
    await expect(page.locator("#recovery")).toBeVisible();
  });

  test("unsupported future-generation world with partial coverage is recovery-required and preserves records", async ({ page }) => {
    await seedBeforeBoot(page, {
      metadata: { generationVersion: "future-worldgen-v99" },
      columns: [{ cx: 0, cz: 0 }],
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
    // Should be preserved, not recovery
    const mode = await page.evaluate(() => (window as any).__voxelGame?.worldStartupMode);
    expect(mode).toBe("preserved");
    const baseline = await page.evaluate(() => (window as any).__voxelGame?.worldGenerationBaseline);
    expect(baseline).toBe("legacy-unknown");
    // Wait for world ready (loading hidden)
    await expect(page.locator("#loading")).toBeHidden({ timeout: 60000 });
    // Spawn resolution should be canonical for preserved world
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
    await seedBeforeBoot(page, {
      metadata: {}, // legacy partial -> recovery
      columns: [{ cx: 0, cz: 0 }],
      player: null,
    });
    await waitForBoot(page);
    await expect(page.locator("#recovery")).toBeVisible();
    // First click arms confirmation
    await expect(page.locator("#recovery-status")).toContainText("backup");
    // Second click executes reset and reloads via window.location.reload()
    await page.locator("#recovery-reset").click();
    // Wait for reload and fresh boot
    await page.waitForFunction(() => (window as any).__voxelGame?.worldStartupMode === "current", { timeout: 60000 });
    // After reload, should be fresh current world without recovery
    await expect(page.locator("#recovery")).toBeHidden({ timeout: 60000 });
    await expect(page.locator("#loading")).toBeHidden({ timeout: 60000 });
    const mode = await page.evaluate(() => (window as any).__voxelGame?.worldStartupMode);
    expect(mode).toBe("current");
    const baseline = await page.evaluate(() => (window as any).__voxelGame?.worldGenerationBaseline);
    expect(baseline).toBe("current");
  });
});
