import { test, expect, type Page } from '@playwright/test';
import type { AmbientCue } from '../../src/simulation/AmbientAudioFramework';

type GameHandle = {
  setAmbientSoundBackend(backend: { playAmbientCue(cue: AmbientCue): void; played: AmbientCue[] }): void;
  setAmbientMuted(muted: boolean): void;
  debugTickAmbient(times?: number): void;
  getAmbientState(): { musicDelay: number; cueDelay: number };
};

async function waitForGame(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as unknown as { __voxelGame?: unknown }).__voxelGame, null, {
    timeout: 120_000,
  });
}

test.describe('live ambient audio integration (277)', () => {
  test('debug ticks deliver cues to an injected silent backend', async ({ page }) => {
    await page.goto('/');
    await waitForGame(page);

    const played = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const backend = {
        played: [] as AmbientCue[],
        playAmbientCue(cue: AmbientCue) {
          this.played.push(cue);
        },
      };
      g.setAmbientSoundBackend(backend);
      g.setAmbientMuted(false);
      // Force many ticks; musicDelay/cueDelay from seeded rng will eventually fire.
      g.debugTickAmbient(30_000);
      return backend.played.map((c) => ({ kind: c.kind, soundEvent: c.soundEvent }));
    });

    expect(played.length).toBeGreaterThan(0);
  });
});
