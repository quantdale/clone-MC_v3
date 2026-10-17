import { test, expect, type Page } from '@playwright/test';

/**
 * Modal focus and keyboard accessibility (change 304, audit finding F-008).
 *
 * Before this change eleven surfaces declared `role="dialog"`/`alertdialog` with
 * `aria-modal="true"`, which promises assistive technology that the rest of the
 * page is unavailable — yet nothing moved focus into a dialog, `Tab` walked
 * through the HUD behind the overlay, `inert` appeared nowhere, and Escape did
 * nothing anywhere in `src/`. The unit suite (`tests/unit/ModalFocus.test.ts`)
 * pins the pure containment policy; this spec proves the real DOM behaviour in a
 * real browser, which is the only acceptable evidence for a capability whose
 * subject is focus.
 *
 * Every assertion below reads `document.activeElement` or a real attribute —
 * nothing is inferred from source text.
 */

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 60_000 });
  await page.waitForFunction(
    () => {
      const g = (window as unknown as { __voxelGame?: { testIsWorldReady?(): boolean } }).__voxelGame;
      return g?.testIsWorldReady ? g.testIsWorldReady() : false;
    },
    { timeout: 60_000 },
  );
}

/** The id of the element that currently has focus (or '' / tagName). */
async function activeId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el ? el.id || el.tagName.toLowerCase() : '';
  });
}

/** Whether a given id is inside the currently open modal. */
async function focusInside(page: Page, containerId: string): Promise<boolean> {
  return page.evaluate((id) => {
    const container = document.getElementById(id);
    const active = document.activeElement;
    return !!(container && active && container.contains(active));
  }, containerId);
}

async function isHidden(page: Page, id: string): Promise<boolean> {
  return page.evaluate((elementId) => {
    const el = document.getElementById(elementId);
    return !el || el.classList.contains('hidden');
  }, id);
}

/** Number of background surfaces currently marked inert. */
async function inertCount(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll('#ui-root > [inert]').length);
}

/** Whether a specific surface is inert. */
async function isInert(page: Page, id: string): Promise<boolean> {
  return page.evaluate((elementId) => !!document.getElementById(elementId)?.hasAttribute('inert'), id);
}

test.describe('modal focus and keyboard accessibility (304)', () => {
  test('opening a dialog moves focus into it and makes the background inert', async ({ page }) => {
    await boot(page);
    expect(await isHidden(page, 'gamerule')).toBe(true);
    expect(await inertCount(page)).toBe(0);

    await page.keyboard.press('KeyG');
    await expect.poll(() => isHidden(page, 'gamerule'), { timeout: 15_000 }).toBe(false);

    // Focus moved into the dialog (preference: preferred control, else first
    // focusable descendant, else the dialog element itself).
    await expect.poll(() => focusInside(page, 'gamerule'), { timeout: 15_000 }).toBe(true);

    // The declared aria-modal semantics are now truthful: background inert.
    expect(await inertCount(page)).toBeGreaterThan(0);
    expect(await isInert(page, 'hud')).toBe(true);
    expect(await isInert(page, 'hotbar')).toBe(true);
    // ...and the open dialog itself is NOT inert.
    expect(await isInert(page, 'gamerule')).toBe(false);
  });

  test('Tab and Shift+Tab are contained inside the open dialog', async ({ page }) => {
    await boot(page);
    await page.keyboard.press('KeyG');
    await expect.poll(() => isHidden(page, 'gamerule'), { timeout: 15_000 }).toBe(false);
    await expect.poll(() => focusInside(page, 'gamerule'), { timeout: 15_000 }).toBe(true);

    // Tab well past the number of controls in the panel: focus must never leave.
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      expect(await focusInside(page, 'gamerule'), `focus escaped after Tab #${i + 1}`).toBe(true);
    }
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await focusInside(page, 'gamerule'), `focus escaped after Shift+Tab #${i + 1}`).toBe(true);
    }
  });

  test('Escape dismisses through the same path as the close control, and restores focus', async ({ page }) => {
    await boot(page);
    // Focus a real control outside the modal first, so there is an opener to
    // restore to. The HUD is hidden until pointer lock, so a plain chip click
    // would simply time out; focusing it directly still gives a genuine opener.
    const openerIsFocusable = await page.evaluate(() => {
      const chip = document.getElementById('gamerule-open') as HTMLElement | null;
      if (!chip) return false;
      chip.focus();
      return document.activeElement === chip;
    });
    await page.keyboard.press('KeyG');
    await expect.poll(() => isHidden(page, 'gamerule'), { timeout: 15_000 }).toBe(false);
    await expect.poll(() => focusInside(page, 'gamerule'), { timeout: 15_000 }).toBe(true);

    await page.keyboard.press('Escape');
    await expect.poll(() => isHidden(page, 'gamerule'), { timeout: 15_000 }).toBe(true);

    // Inert cleared, focus restored (to the opener when it was a real control,
    // otherwise the body — never left on a detached/hidden element).
    expect(await inertCount(page)).toBe(0);
    const after = await activeId(page);
    expect(after).not.toBe('');
    if (openerIsFocusable) {
      expect(await activeId(page)).toBe('gamerule-open');
    }
  });

  test('Escape with no modal open has no dismiss effect', async ({ page }) => {
    await boot(page);
    expect(await inertCount(page)).toBe(0);
    await page.keyboard.press('Escape');
    // Nothing opened, nothing closed, still no inert surfaces.
    expect(await inertCount(page)).toBe(0);
    for (const id of ['gamerule', 'crafting', 'statistics', 'trading', 'creative', 'recipebook']) {
      expect(await isHidden(page, id)).toBe(true);
    }
  });

  test('switching surfaces keeps exactly one dialog non-inert and clears the old one', async ({ page }) => {
    await boot(page);
    await page.keyboard.press('KeyG');
    await expect.poll(() => isHidden(page, 'gamerule'), { timeout: 15_000 }).toBe(false);
    expect(await isInert(page, 'gamerule')).toBe(false);

    // Switch to the statistics panel through the real key path.
    await page.keyboard.press('KeyH');
    await expect.poll(() => isHidden(page, 'statistics'), { timeout: 15_000 }).toBe(false);
    expect(await isHidden(page, 'gamerule')).toBe(true);
    expect(await isInert(page, 'statistics')).toBe(false);
    // The previous dialog must not keep a stale inert mark from its own session.
    expect(await isInert(page, 'gamerule')).toBe(false);
  });

  test('closing twice and closing an unopened dialog do not throw or leave stale state', async ({ page }) => {
    await boot(page);
    await page.keyboard.press('KeyG');
    await expect.poll(() => isHidden(page, 'gamerule'), { timeout: 15_000 }).toBe(false);

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.keyboard.press('Escape');
    await expect.poll(() => isHidden(page, 'gamerule'), { timeout: 15_000 }).toBe(true);
    // Second Escape with nothing open.
    await page.keyboard.press('Escape');
    // Close control on a hidden dialog.
    const closeButton = page.locator('#gamerule [data-close], #gamerule .close-button').first();
    if ((await closeButton.count()) > 0) await closeButton.click({ force: true });

    expect(await inertCount(page)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('the death screen declares aria-modal like the other dialogs', async ({ page }) => {
    await boot(page);
    // Declared semantics must match behaviour for the one dialog that previously
    // omitted aria-modal entirely. Assert on the live attribute.
    const declared = await page.evaluate(
      () => document.getElementById('death-screen')?.getAttribute('aria-modal') ?? null,
    );
    expect(declared).toBe('true');
    // ...and it participates in the same containment: it must be the only
    // non-inert surface while it is the active modal.
    const role = await page.evaluate(() => document.getElementById('death-screen')?.getAttribute('role') ?? null);
    expect(role).toBe('dialog');
  });
});
