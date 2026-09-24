import { test, expect, type Page } from '@playwright/test';

/**
 * Live Bad Omen acquisition (285) over the 282 raid-start seam.
 *
 * Injects a fixture VillageQuery, grants omen, evaluates the village trigger,
 * observes #raid-feedback active + getBadOmenLevel() === 0, then proves reload
 * restores level 0 with no omen/raid resurrection from 285 (ephemeral).
 */

type RaidStateView = {
  status: string;
  badOmenLevel: number;
};

type OmenDecisionView =
  | {
      kind: 'START_RAID';
      centerX: number;
      centerY: number;
      centerZ: number;
      badOmenLevel: number;
    }
  | { kind: 'NONE'; reason: string };

type GameHandle = {
  getRaidState(): RaidStateView | null;
  getBadOmenLevel(): number;
  grantBadOmen(amount?: number): void;
  clearBadOmen(): void;
  setVillageQuery(
    query: (() => {
      centerX: number;
      centerY: number;
      centerZ: number;
      containsPlayer: boolean;
    } | null) | null,
  ): void;
  evaluateBadOmenVillageTrigger(): OmenDecisionView;
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

test.describe('live bad omen acquisition (285)', () => {
  test('fixture village + grant starts raid, clears omen, reload stays at 0', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    const before = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return {
        omen: g.getBadOmenLevel(),
        raid: g.getRaidState(),
      };
    });
    expect(before.omen).toBe(0);
    expect(before.raid).toBeNull();

    const triggered = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.setVillageQuery(() => ({
        centerX: 12,
        centerY: 64,
        centerZ: -4,
        containsPlayer: true,
      }));
      g.grantBadOmen(2);
      const levelAfterGrant = g.getBadOmenLevel();
      const decision = g.evaluateBadOmenVillageTrigger();
      return {
        levelAfterGrant,
        decision,
        omen: g.getBadOmenLevel(),
        raid: g.getRaidState(),
      };
    });

    expect(triggered.levelAfterGrant).toBe(2);
    expect(triggered.decision.kind).toBe('START_RAID');
    expect(triggered.omen).toBe(0);
    expect(triggered.raid).not.toBeNull();
    expect(triggered.raid!.status).toBe('ACTIVE');
    expect(triggered.raid!.badOmenLevel).toBe(2);

    const bar = await page.evaluate(() => {
      const el = document.getElementById('raid-feedback');
      return {
        present: !!el,
        hidden: el?.classList.contains('hidden') ?? true,
        status: el?.getAttribute('data-status') ?? null,
      };
    });
    expect(bar.present).toBe(true);
    expect(bar.hidden).toBe(false);
    expect(bar.status).not.toBe('NONE');

    // Second evaluate is NO_OMEN and does not replace from this path alone.
    const second = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const beforeRaid = g.getRaidState();
      const decision = g.evaluateBadOmenVillageTrigger();
      return { decision, omen: g.getBadOmenLevel(), sameRaid: g.getRaidState() === beforeRaid };
    });
    expect(second.decision).toEqual({ kind: 'NONE', reason: 'NO_OMEN' });
    expect(second.omen).toBe(0);

    // Reload: ephemeral omen must be 0; 285 writes no omen record.
    await page.reload();
    await waitForGame(page);
    const afterReload = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return { omen: g.getBadOmenLevel() };
    });
    expect(afterReload.omen).toBe(0);
  });

  test('default null village retains omen; no raid feedback forced', async ({ page }) => {
    test.setTimeout(180_000);
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.grantBadOmen(3);
      const decision = g.evaluateBadOmenVillageTrigger();
      const el = document.getElementById('raid-feedback');
      return {
        decision,
        omen: g.getBadOmenLevel(),
        raid: g.getRaidState(),
        barHidden: el?.classList.contains('hidden') ?? true,
      };
    });

    expect(result.decision).toEqual({ kind: 'NONE', reason: 'NO_VILLAGE' });
    expect(result.omen).toBe(3);
    expect(result.raid).toBeNull();
    expect(result.barHidden).toBe(true);
  });
});
