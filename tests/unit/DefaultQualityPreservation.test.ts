/**
 * 258 task 85: default desktop quality is preserved through the first
 * optimization pass. Pins the production defaults that the canonical headed
 * baseline measures so any silent render/simulation-distance, shadow, cloud,
 * or pixel-ratio cut fails loudly here instead of masquerading as an
 * optimization. Headless overrides stay a separate, explicitly reduced
 * profile and never rewrite the production defaults.
 */
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../src/config';

describe('258 default-quality preservation', () => {
  it('keeps production desktop defaults at full quality', () => {
    expect(CONFIG.renderDistance).toBe(6);
    expect(CONFIG.simulationDistance).toBe(6);
    expect(CONFIG.maxPixelRatio).toBe(2);
    expect(CONFIG.rendering.shadows).toBe(true);
    expect(CONFIG.rendering.clouds).toBe(true);
    expect(CONFIG.rendering.shadowMapSize).toBe(1024);
    expect(CONFIG.rendering.shadowDistance).toBe(96);
  });

  it('keeps the headless profile explicitly reduced and separate', () => {
    // The headless profile exists so automation stays responsive on software
    // rendering; it must never become the canonical quality or leak into the
    // production defaults above.
    expect(CONFIG.headless.renderDistance).toBeLessThan(CONFIG.renderDistance);
    expect(CONFIG.headless.maxPixelRatio).toBeLessThanOrEqual(1);
    expect(CONFIG.headless.clouds).toBe(false);
  });
});
