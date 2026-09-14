import { test, expect, type Page } from '@playwright/test';

/**
 * Live weather cycle integration (275) over the VERIFIED WeatherFramework (196).
 *
 * Drives the wired Game seams: setWeather / setWeatherFromText (store + persist
 * + HUD #weather-indicator + presentation), the doWeatherCycle gamerule gate
 * (frozen vs. advancing fixed-tick advance), and pagehide + reload persistence
 * (I-5: restore kind/timers, no wake-on-boot mutation). __voxelGame seams only.
 */

type WeatherStateView = {
  weather: string;
  rainTime: number;
  thunderTime: number;
};

type GameHandle = {
  getWeatherState(): WeatherStateView;
  setWeather(kind: string, duration: number): boolean;
  setWeatherFromText(text: string): boolean;
  setGameRule(key: string, value: boolean | number | string): boolean;
  debugTickWeather(): void;
  getGameRules(): { get(key: string): boolean | number | string | undefined };
};

async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 120_000 });
  await page.waitForFunction(() => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame != null, null, {
    timeout: 120_000,
  });
}

async function weatherState(page: Page): Promise<WeatherStateView> {
  return page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    if (!g) throw new Error('no __voxelGame');
    const s = g.getWeatherState();
    return { weather: s.weather, rainTime: s.rainTime, thunderTime: s.thunderTime };
  });
}

async function indicatorVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.getElementById('weather-indicator');
    return !!el && !el.classList.contains('hidden');
  });
}

async function indicatorText(page: Page): Promise<string> {
  return page.evaluate(() => document.getElementById('weather-indicator')?.textContent ?? '');
}

async function reloadPersist(page: Page): Promise<void> {
  // pagehide drains autosave (265/267/274 precedent); goto('/') for a clean boot.
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await page.waitForTimeout(2500);
  await waitForGame(page);
}

test.describe('live weather cycle integration (275)', () => {
  test('setWeather drives store + HUD + presentation; reload restores kind/timers (I-4, I-5)', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    // Defaults: clear, timers zero, indicator hidden.
    expect(await weatherState(page)).toEqual({ weather: 'clear', rainTime: 0, thunderTime: 0 });
    expect(await indicatorVisible(page)).toBe(false);

    // Rain: store updates, indicator visible with rain label.
    const setRain = await page.evaluate(() => {
      return (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.setWeather('rain', 12000);
    });
    expect(setRain).toBe(true);
    const rainState = await weatherState(page);
    expect(rainState.weather).toBe('rain');
    expect(rainState.rainTime).toBe(12000);
    expect(await indicatorVisible(page)).toBe(true);
    expect(await indicatorText(page)).toContain('Rain');

    // Thunder: store updates, indicator switches to thunder label.
    const setThunder = await page.evaluate(() => {
      return (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.setWeather('thunder', 8000);
    });
    expect(setThunder).toBe(true);
    const thunderState = await weatherState(page);
    expect(thunderState.weather).toBe('thunder');
    expect(thunderState.rainTime).toBe(8000);
    expect(thunderState.thunderTime).toBe(8000);
    expect(await indicatorVisible(page)).toBe(true);
    expect(await indicatorText(page)).toContain('Thunder');

    // Text seam: valid token applies, invalid token is a no-op.
    const setText = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return { ok: g.setWeatherFromText('rain'), bad: g.setWeatherFromText('sunny') };
    });
    expect(setText.ok).toBe(true);
    expect(setText.bad).toBe(false);
    expect((await weatherState(page)).weather).toBe('rain');

    // Reload: kind + timers restored (no wake-on-boot mutation, unlike sleep).
    await reloadPersist(page);
    const restored = await weatherState(page);
    expect(restored.weather).toBe('rain');
    expect(restored.rainTime).toBeGreaterThan(0);
    expect(restored.rainTime).toBeLessThanOrEqual(12000);
    expect(await indicatorVisible(page)).toBe(true);
  });

  test('doWeatherCycle=false freezes the state across fixed ticks (I-2)', async ({ page }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    // Prove the seam advances (non-vacuous): with the rule ON, one fixed tick
    // moves the rain period down by exactly one.
    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.setGameRule('doWeatherCycle', true);
      g.setWeather('rain', 12000);
      g.debugTickWeather();
    });
    expect((await weatherState(page)).rainTime).toBe(11999);

    // Now freeze: the rule OFF must keep the state byte-for-byte identical
    // across many fixed ticks (196 identity no-op), unlike the ON tick above.
    const frozen = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.setGameRule('doWeatherCycle', false);
      const before = { ...g.getWeatherState() };
      for (let i = 0; i < 50; i++) g.debugTickWeather();
      return { before, after: g.getWeatherState() };
    });
    expect(frozen.after).toEqual(frozen.before);
  });

  test('doWeatherCycle=true advances the timers on fixed ticks (I-3)', async ({ page }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.setGameRule('doWeatherCycle', true);
      g.setWeather('rain', 12000);
    });
    const start = await weatherState(page);
    expect(start.rainTime).toBe(12000);

    // The real tickWeatherCycle path counts the rain period down one per tick.
    await page.evaluate(() => {
      (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!.debugTickWeather();
    });
    const advanced = await weatherState(page);
    expect(advanced.rainTime).toBe(11999);
  });
});
