# F257-J Visual Tolerance Evidence

## Thresholds
- `PIXEL_DIFF.maxChangedFraction = 0.02` — full-frame
- `CLIPPED_DIFF.maxChangedFraction = 0.02` — element-clipped (same as PIXEL_DIFF, not stricter)

## Prior evidence (2026-08-22 validation, §C247)
- Environment: headless Chromium, SwiftShader software WebGL, 1920x1080, High quality
- Fixture: environment-day/high/1920x1080 (largest render cell)
- Measured noise ceiling: **0.0107** changed fraction across two independent pin→verify cycles
- Clipped cells: 0.000012–0.0107 range, hugging DOM-text glyph edges (font AA varies per capture under software rasterization)

## Justification
- 0.02 = ~2× measured ceiling (0.0107), safely above noise, below real regression (real regressions change >>2% pixels)
- Clipped 0.02 equals PIXEL_DIFF 0.02 (previous comment claimed "stricter" — fixed; both are equal)
- Raised from 0.01 (245 default) → 0.02 with evidence (248 session); retained at 257 reopen

## Evidence retention
- See `tests/e2e/visual-regression.spec.ts` lines 47-62 (threshold definitions + comments)
- CI software-rendering screenshots retained as `test-results/` artifacts on each run (9/9 void-world, plus full visual suite)
- This file satisfies F257-J: threshold is justified with measured noise distribution; misleading "stricter" comment fixed

## Remaining
- Repeated same-build same-fixture 10× screenshot collection under canonical CI would tighten the distribution but is not required to keep 0.02 (it is already conservative)
