import { test, expect, type Page } from '@playwright/test';

/**
 * Live raid persistence (283) over the verified RaidStateMachine (152) and
 * Change 282's feedback projection.
 *
 * Proves through the REAL production bundle: an active raid survives a
 * pagehide flush + reload with equal wave/remaining/omen and a visible
 * #raid-feedback bar; world reset deletes the `__raid__` record so a reload
 * boots null with a hidden bar; a corrupt stored payload degrades to null
 * without breaking boot (fail-closed runtime); and the archive export/import
 * leg carries `raidData` (present ⇒ restored, absent ⇒ null, malformed ⇒
 * refuse-import with zero writes).
 */

type RaidStateView = {
  status: string;
  waveIndex: number;
  totalWaves: number;
  raidersRemaining: number;
  badOmenLevel: number;
  ticks: number;
  centerX: number;
  centerY: number;
  centerZ: number;
};

type GameHandle = {
  getRaidState(): RaidStateView | null;
  debugStartRaid(badOmenLevel?: number): RaidStateView;
  debugClearRaidWave(): RaidStateView | null;
  saveRaid(): void;
  persistence: {
    worldId: string;
    flush(): Promise<unknown>;
    resetCurrentWorld(): Promise<{ ok: true } | { ok: false; error: string }>;
    exportWorldBackup(): Promise<{ ok: true; json: string } | { ok: false; error: string }>;
    importWorldBackup(
      json: string,
    ): Promise<
      { ok: true; report: { raidDataImported: boolean; worldId: string } } | { ok: false; error: string }
    >;
    initialRaid: unknown;
  } | null;
};

async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 120_000 });
  await page.waitForFunction(
    () => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame != null,
    null,
    { timeout: 120_000 },
  );
}

async function raidState(page: Page): Promise<RaidStateView | null> {
  return page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    if (!g) throw new Error('no __voxelGame');
    return g.getRaidState();
  });
}

async function feedback(page: Page): Promise<{ hidden: boolean; status: string | null }> {
  return page.evaluate(() => {
    const el = document.getElementById('raid-feedback');
    if (!el) return { hidden: true, status: null };
    return { hidden: el.classList.contains('hidden'), status: el.getAttribute('data-status') };
  });
}

async function flushAndReload(page: Page): Promise<void> {
  // pagehide drains autosave (265/274/275 precedent); goto('/') for a clean boot.
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await page.waitForTimeout(2500);
  await waitForGame(page);
}

test.describe('live raid persistence (283)', () => {
  test('active raid survives pagehide + reload with equal state and visible bar', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    expect(await raidState(page)).toBeNull();
    const boot = await feedback(page);
    expect(boot.hidden).toBe(true);
    expect(boot.status).toBe('NONE');

    // Start a raid and advance past wave 1 so the restored counters are non-trivial.
    const before = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.debugStartRaid(2);
      g.debugClearRaidWave();
      g.saveRaid();
      return g.getRaidState()!;
    });
    expect(before.status).toBe('ACTIVE');
    expect(before.waveIndex).toBeGreaterThanOrEqual(1);
    expect(before.raidersRemaining).toBeGreaterThan(0);
    expect(before.badOmenLevel).toBe(2);

    const barBefore = await feedback(page);
    expect(barBefore.hidden).toBe(false);
    expect(barBefore.status).toBe('ACTIVE');

    await flushAndReload(page);

    const after = await raidState(page);
    expect(after).not.toBeNull();
    expect(after).toEqual(before);

    const barAfter = await feedback(page);
    expect(barAfter.hidden).toBe(false);
    expect(barAfter.status).toBe('ACTIVE');
  });

  test('reset deletes the __raid__ record; reload boots null with hidden bar', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.debugStartRaid(1);
      g.saveRaid();
    });
    expect(await raidState(page)).not.toBeNull();

    const reset = await page.evaluate(async () => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      if (!g.persistence) return { ok: false as const, error: 'no persistence' };
      return g.persistence.resetCurrentWorld();
    });
    expect(reset).toEqual({ ok: true });

    await waitForGame(page);
    expect(await raidState(page)).toBeNull();
    const bar = await feedback(page);
    expect(bar.hidden).toBe(true);
    expect(bar.status).toBe('NONE');
  });

  test('corrupt stored payload degrades to null without breaking boot', async ({ page }) => {
    test.setTimeout(300_000);
    await waitForGame(page);
    const worldId = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
      if (!g?.persistence) throw new Error('no persistence');
      return g.persistence.worldId;
    });
    expect(worldId.length).toBeGreaterThan(0);

    // Write a stale/corrupt payload under the live namespace, then hard-boot.
    await page.evaluate(
      async ({ worldId }) => {
        await new Promise<void>((resolve, reject) => {
          const req = window.indexedDB.open('voxel-world-db', 6);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('world-metadata', 'readwrite');
            const store = tx.objectStore('world-metadata');
            store.put({
              worldId: `__raid__:${worldId}`,
              payload: { schemaVersion: 99, status: 'ACTIVE', centerX: 0 },
              updatedAt: Date.now(),
            });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        });
      },
      { worldId },
    );

    await waitForGame(page);
    expect(await raidState(page)).toBeNull();
    const bar = await feedback(page);
    expect(bar.hidden).toBe(true);
    expect(bar.status).toBe('NONE');
    // Loading completed (no fatal boot error).
    await expect(page.locator('#loading')).toBeHidden({ timeout: 120_000 });
    await expect(page.locator('#error')).toBeHidden();
  });

  test('archive export/import carries raidData; malformed refuses import', async ({ page }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    // --- Export without raid: raidData absent/null, import reports false. ---
    const exportEmpty = await page.evaluate(async () => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      if (!g.persistence) throw new Error('no persistence');
      await g.persistence.flush();
      return g.persistence.exportWorldBackup();
    });
    expect(exportEmpty.ok).toBe(true);
    if (!exportEmpty.ok) throw new Error(exportEmpty.error);
    const emptyArchive = JSON.parse(exportEmpty.json) as { raidData?: unknown };
    expect(emptyArchive.raidData ?? null).toBeNull();

    // --- Export with active raid: raidData present. ---
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.debugStartRaid(1);
      g.saveRaid();
    });
    const exportRaid = await page.evaluate(async () => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      if (!g.persistence) throw new Error('no persistence');
      await g.persistence.flush();
      return g.persistence.exportWorldBackup();
    });
    expect(exportRaid.ok).toBe(true);
    if (!exportRaid.ok) throw new Error(exportRaid.error);
    const raidArchive = JSON.parse(exportRaid.json) as { raidData?: { schemaVersion?: number } };
    expect(raidArchive.raidData).not.toBeNull();
    expect(raidArchive.raidData?.schemaVersion).toBe(1);

    // --- Import the raid-bearing archive into a fresh record set. ---
    const importOk = await page.evaluate(async (json) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      if (!g.persistence) throw new Error('no persistence');
      return g.persistence.importWorldBackup(json);
    }, exportRaid.json);
    expect(importOk.ok).toBe(true);
    if (importOk.ok) {
      expect(importOk.report.raidDataImported).toBe(true);
      expect(importOk.report.worldId).toBe(
        await page.evaluate(() => {
          const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
          return g.persistence!.worldId;
        }),
      );
    }

    // Reload boots the imported raid.
    await flushAndReload(page);
    const restored = await raidState(page);
    expect(restored).not.toBeNull();
    expect(restored!.badOmenLevel).toBe(1);

    // --- Import without raid: raidDataImported false. ---
    const importEmpty = await page.evaluate(async (json) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      if (!g.persistence) throw new Error('no persistence');
      return g.persistence.importWorldBackup(json);
    }, exportEmpty.json);
    expect(importEmpty.ok).toBe(true);
    if (importEmpty.ok) expect(importEmpty.report.raidDataImported).toBe(false);

    // --- Malformed raidData refuses import (fail-closed, zero writes). ---
    const badArchive = JSON.parse(exportRaid.json) as Record<string, unknown>;
    badArchive.raidData = { ...(badArchive.raidData as object), status: 'NOPE' };
    const importBad = await page.evaluate(async (json) => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      if (!g.persistence) throw new Error('no persistence');
      return g.persistence.importWorldBackup(json);
    }, JSON.stringify(badArchive));
    expect(importBad.ok).toBe(false);
    if (!importBad.ok) {
      expect(importBad.error).toMatch(/WorldArchive|RaidPersistence|schemaVersion|status/i);
    }

    // Live state was not corrupted by the refused import: reload still boots.
    await flushAndReload(page);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 120_000 });
    await expect(page.locator('#error')).toBeHidden();
  });
});
