# Resuming Change 258 on a hardware-WebGL host

Status: Change `258-real-world-runtime-performance-fps-recovery` is **BLOCKED** at 40/100
by owner deferral (2026-09-11, Michael via Minecraft Clone Dev). This note tells a future
session how to resume headed work. It authorizes no scope change and advances nothing by
itself — the advancement gate still applies.

## Required host

- Headed Chrome/Chromium with **hardware WebGL** (discrete or integrated GPU, `/dev/dri`
  present or equivalent). SwiftShader / headless / software rendering MUST NOT count as
  canonical evidence (`CanonicalRunGate` rejects them; the runner exits 2 on PASS claims).
- Default desktop quality: render distance 6, DPR cap 2, shadows/clouds on (pinned by
  `DefaultQualityPreservation.test.ts`).

## Resume order

1. **Task 3** — record exact reference host/browser/GPU/renderer/viewport/DPR/
   display-refresh/quality configuration into the run artifacts.
2. **Tasks 6–15** — unmodified final-257 production candidate, headed at default desktop
   settings: 30 s warmed stationary (8), 60 s deterministic fresh-chunk traversal (9),
   60 s cached/revisit traversal (10), block break/place workload (11), day/night +
   mobs/entities workload (12), with p50/p95/p99 + FPS + long-frame tables (13),
   draw/triangle/resource/buffer/queue/worker metrics (14), screenshots + trace/long-task
   artifact + top-three bottleneck table (15).
3. **Tasks 29/34** — actual production build at default quality (29); at least three
   samples/scenario, median plus worst relevant percentile (34). Use
   `npm run test:perf` (skeleton + 5 scenarios already landed); headed adequacy is what is
   missing, not the harness.
4. **Governor/worker wiring with headed proof** — tasks 39, 41, 48–57, 59–63, 65, 67–76,
   78–81, 83, 86–90. Environment-independent cores (`FrameBudgetGovernor`,
   `WorkerMeshCapability`, `CanonicalRunGate`, `PerfGate`, whole-frame/World-internal
   telemetry) are landed and headless-verified; production wiring needs headed profiling
   before any retune. Production default stays sync meshing until headed proof lands.
5. **Tasks 91–95** — final FPS/resource certification gates (stationary ≥55 avg,
   fresh ≥45 avg, cached ≥55 avg with no 10 s window below 45, interaction/entity
   scenarios, sustained-resource stability).
6. **Tasks 97–100** — final screenshot/behavior comparison (97), before/after metrics
   record (98), OpenSpec/state reconciliation + `origin/main` publication with successful
   CI on the exact published SHA (99). Mark VERIFIED (100) only when every headed
   performance + correctness/visual/memory/full-regression gate passes.

## Constraints carried forward

- Do NOT substitute headless or software rendering for any canonical result.
- Do NOT retune default quality to pass; structural fixes first, and any intentional
  default presentation change needs task 86/90 proof + review + re-pinned goldens.
- Keep task checkboxes honest: `[x]` only with implementation + passing required
  tests/evidence + covered edge/failure behavior.
