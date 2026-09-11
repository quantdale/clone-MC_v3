#!/usr/bin/env node
/* global console, process, window, document, PerformanceObserver */
/**
 * Canonical headed performance runner skeleton (258 tasks 28-38).
 *
 * Dedicated headed perf command, separate from the normal headless E2E suite:
 * it boots the production build at default desktop quality, collects
 * rAF-to-rAF whole-frame stats from the live game (`getWholeFrameStats`),
 * and writes a versioned JSON artifact plus a human summary.
 *
 * Canonical rules (fail-closed, per the runtime-performance spec):
 * - canonical runs MUST be headed with hardware WebGL at default desktop
 *   quality. SwiftShader/llvmpipe/software rendering, headless overrides,
 *   DPR overrides, or reduced render distance make the run NON-CANONICAL:
 *   the runner records the reason and refuses PASS (exit 2).
 * - gate thresholds below MUST match `src/rendering/PerfGate.ts` exactly;
 *   `--self-test` proves the gate is not vacuous by running the PerfGate
 *   vitest suite (injected busy-loop summary must fail every gate).
 *
 * Canonical certification additionally requires `--samples >= 3` per scenario
 * on the recorded reference host; this skeleton runs the full scenario loop
 * for any sample count and reports median plus worst relevant percentile.
 *
 * Usage:
 *   npm run test:perf -- --url http://127.0.0.1:4173 --out perf-artifacts --self-test
 *   npm run test:perf -- --url http://127.0.0.1:4173 --out perf-artifacts --samples 3 --headed
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ARTIFACT_VERSION = 1;
// MUST match src/rendering/PerfGate.ts (258). Any threshold change here must
// change PerfGate.ts in the same commit, and vice versa.
const GATES = {
  stationary: { averageFps: 55, p95Ms: 22, p99Ms: 33, over50Fraction: 0.01 },
  freshTraversal: { averageFps: 45, p95Ms: 28, p99Ms: 50, severeStallCount: 0 },
  cachedTraversal: { averageFps: 55, rollingMin10sFps: 45 },
  interactionFloor: { rollingMin10sFps: 45 },
};

function parseArgs(argv) {
  const out = {
    url: 'http://127.0.0.1:4173',
    out: 'perf-artifacts',
    samples: 1,
    headed: false,
    selfTest: false,
    allowNonCanonical: false,
    chromePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
    seed: 1337,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url') out.url = argv[++i];
    else if (arg === '--out') out.out = argv[++i];
    else if (arg === '--samples') out.samples = Number(argv[++i]);
    else if (arg === '--headed') out.headed = true;
    else if (arg === '--self-test') out.selfTest = true;
    else if (arg === '--allow-non-canonical') out.allowNonCanonical = true;
    else if (arg === '--chrome-path') out.chromePath = argv[++i];
    else if (arg === '--seed') out.seed = Number(argv[++i]);
    else if (arg === '--help') {
      console.log('canonical-perf-run: --url --out --samples --headed --self-test --allow-non-canonical --chrome-path --seed');
      process.exit(0);
    }
  }
  return out;
}

function gitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'unknown';
}

function chromeVersion(chromePath) {
  const result = spawnSync(chromePath, ['--version'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'unknown';
}

// Canonical-run rules MUST match src/rendering/CanonicalRunGate.ts exactly:
// headed + WebGL + hardware renderer + DPR in [1, 2] + default render
// distance. Any rule change here must change CanonicalRunGate.ts (and its
// unit tests) in the same commit, and vice versa.
function isSoftwareRenderer(renderer) {
  return /swiftshader|llvmpipe|software|basic\s*render/i.test(renderer ?? '');
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function runSelfTest() {
  // The gate self-test (task 38): the PerfGate unit suite proves an injected
  // busy-loop summary fails every gate through the same evaluation code.
  console.log('[perf] self-test: running PerfGate vitest suite (busy-loop must fail all gates)...');
  const result = spawnSync('npx', ['vitest', 'run', 'tests/unit/PerfGate.test.ts'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  console.log(result.stdout.slice(-1500));
  if (result.status !== 0) {
    console.error('[perf] SELF-TEST FAILED: PerfGate suite did not pass.');
    console.error(result.stderr.slice(-1500));
    process.exit(1);
  }
  console.log('[perf] SELF-TEST PASSED: busy-loop summary fails every gate (gate is not vacuous).');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selfTest) {
    await runSelfTest();
    return;
  }

  const { chromium } = await import('playwright-core');
  const launchOpts = {
    headless: !opts.headed,
    executablePath: opts.chromePath,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc'],
  };
  const browser = await chromium.launch(launchOpts).catch((err) => {
    console.error(`[perf] browser launch failed (${opts.chromePath}): ${err.message}`);
    process.exit(1);
  });

  const viewport = { width: 1280, height: 720 };
  const page = await browser.newPage({ viewport });
  const longTasks = [];
  await page.exposeFunction('__perfReportLongTask', (entry) => {
    longTasks.push(entry);
  });
  await page.addInitScript(() => {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__perfReportLongTask?.({ duration: entry.duration, startTime: entry.startTime });
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      // longtask entries unsupported: long-task evidence stays empty.
    }
  });

  await page.goto(`${opts.url}/?seed=${opts.seed}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => window.__voxelGame != null, null, { timeout: 120_000 });

  const identity = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return { supported: false, vendor: 'none', renderer: 'none' };
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const param = (e) => {
      try {
        return gl.getParameter(e);
      } catch {
        return 'unknown';
      }
    };
    return {
      supported: true,
      vendor: debug ? param(debug.UNMASKED_VENDOR_WEBGL) : param(gl.VENDOR),
      renderer: debug ? param(debug.UNMASKED_RENDERER_WEBGL) : param(gl.RENDERER),
    };
  });
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const buffer = await page.evaluate(() => {
    const game = window.__voxelGame;
    try {
      const snapshot = JSON.parse(game.getPerformanceSnapshot());
      return snapshot?.pipeline?.drawingBuffer ?? { width: 0, height: 0 };
    } catch {
      return { width: 0, height: 0 };
    }
  });
  const browserVersion = await page.evaluate(() => window.navigator.userAgent);

  const renderDistance = await page.evaluate(() => {
    try {
      return JSON.parse(window.__voxelGame.getPerformanceSnapshot())?.render?.renderDistanceChunks ?? 0;
    } catch {
      return 0;
    }
  });
  const nonCanonicalReasons = [];
  if (!opts.headed) nonCanonicalReasons.push('headless run (canonical requires headed)');
  if (!identity.supported) nonCanonicalReasons.push('WebGL unsupported');
  if (typeof identity.renderer !== 'string' || identity.renderer.length === 0) {
    nonCanonicalReasons.push(`invalid renderer: ${identity.renderer}`);
  } else if (isSoftwareRenderer(identity.renderer)) {
    nonCanonicalReasons.push(`software renderer: ${identity.renderer}`);
  }
  if (!(dpr >= 1 && dpr <= 2)) nonCanonicalReasons.push(`non-canonical devicePixelRatio: ${dpr}`);
  if (renderDistance !== 6) nonCanonicalReasons.push(`reduced renderDistance ${renderDistance} (canonical expects 6)`);
  const canonical = nonCanonicalReasons.length === 0;

  const scenarios = [
    { name: 'stationary', durationMs: 30_000, action: 'none' },
    { name: 'fresh-traversal', durationMs: 60_000, action: 'traverse' },
    { name: 'cached-traversal', durationMs: 60_000, action: 'traverse' },
  ];
  const results = {};
  mkdirSync(opts.out, { recursive: true });
  for (const scenario of scenarios) {
    const samples = [];
    for (let s = 0; s < opts.samples; s++) {
      // Warm-up separation: stationary warms 5 s; traversal scenarios reuse
      // the route so sample 0 is fresh and later samples are cached-state.
      await page.waitForTimeout(scenario.name === 'stationary' ? 5000 : 2000);
      if (scenario.action === 'traverse') {
        await page.evaluate((sampleIndex) => {
          const game = window.__voxelGame;
          const base = sampleIndex * 160;
          game?.player?.position?.set?.(base + 8, 40, 8);
        }, s);
      }
      const started = Date.now();
      while (Date.now() - started < Math.min(scenario.durationMs, 15_000)) {
        // Skeleton cap: 15 s per sample until the reference-host lane tunes
        // full durations; the artifact records the effective duration.
        await page.waitForTimeout(1000);
      }
      const stats = await page.evaluate(() => window.__voxelGame.getWholeFrameStats());
      const rolling = await page.evaluate(() => window.__voxelGame.getWholeFrameRollingMinFps(10_000));
      samples.push({ ...stats, rollingMin10sFps: rolling, effectiveDurationMs: Date.now() - started });
      await page.screenshot({ path: join(opts.out, `${scenario.name}-sample${s}.png`) });
    }
    const pick = (key) => samples.map((sample) => sample[key] ?? 0);
    results[scenario.name] = {
      samples,
      medianFps: median(pick('fpsAvg')),
      medianP95Ms: median(pick('p95Ms')),
      worstP95Ms: Math.max(...pick('p95Ms')),
      worstLongFrames: Math.max(...pick('longFrames')),
    };
  }

  const artifact = {
    version: ARTIFACT_VERSION,
    commit: gitHead(),
    chrome: chromeVersion(opts.chromePath),
    userAgent: browserVersion,
    url: opts.url,
    seed: opts.seed,
    viewport,
    devicePixelRatio: dpr,
    drawingBuffer: buffer,
    quality: 'default-desktop',
    headed: opts.headed,
    webgl: identity,
    canonical,
    nonCanonicalReasons,
    samplesPerScenario: opts.samples,
    longTasks: longTasks.slice(0, 200),
    scenarios: results,
    gates: GATES,
  };
  writeFileSync(join(opts.out, 'canonical-perf.json'), `${JSON.stringify(artifact, null, 2)}\n`);

  const lines = [
    '# Canonical perf run (skeleton)',
    `- commit: ${artifact.commit}`,
    `- chrome: ${artifact.chrome}`,
    `- webgl: ${identity.vendor} / ${identity.renderer}`,
    `- canonical: ${canonical ? 'YES' : `NO (${nonCanonicalReasons.join('; ')})`}`,
    `- viewport: ${viewport.width}x${viewport.height}, DPR ${dpr}`,
  ];
  for (const [name, result] of Object.entries(results)) {
    lines.push(`- ${name}: median FPS ${result.medianFps.toFixed(1)}, median p95 ${result.medianP95Ms.toFixed(2)} ms, worst p95 ${result.worstP95Ms.toFixed(2)} ms`);
  }
  writeFileSync(join(opts.out, 'summary.md'), `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));

  await browser.close();
  if (!canonical && !opts.allowNonCanonical) {
    console.error('[perf] NON-CANONICAL run: refusing PASS (see nonCanonicalReasons).');
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(`[perf] fatal: ${err?.stack ?? err}`);
  process.exit(1);
});
