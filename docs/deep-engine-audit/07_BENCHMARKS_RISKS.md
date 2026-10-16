# 07 — Benchmarks, Performance Budgets, Risk Register and ADR Backlog

## Reference benchmark protocol

Every result must record:

- commit SHA;
- browser/version;
- OS;
- CPU/GPU and graphics backend string;
- resolution, DPR, quality preset;
- render/simulation distance;
- seed and benchmark scene ID;
- warm-up and measured duration;
- whether devtools were open;
- battery/power mode where relevant.

Use release builds. Run at least 3 repetitions for noisy timing benchmarks.

## Hardware tiers

Do not optimize exclusively for the developer's strongest PC.

- **Tier L:** integrated GPU / 4 logical cores / 8 GB class.
- **Tier M:** modern 6-core CPU + entry/mid discrete GPU or strong iGPU / 16 GB.
- **Tier H:** modern gaming desktop/laptop GPU.

Exact reference machines should be filled from machines actually available to the project; these tier labels prevent fabricated hardware claims.

## Frame budgets

| Metric | Low target | Medium target | High target |
|---|---:|---:|---:|
| FPS objective | 60 | 60 | 60+ |
| frame p95 | <=16.7 ms | <=16.7 ms | <=16.7 ms on Tier H |
| frame p99 | <=30 ms | <=25 ms | <=25 ms |
| main-thread scripting p95 | <=9 ms | <=8 ms | <=8 ms |
| main-thread GPU-upload work p95 | <=2 ms | <=1.5 ms | <=1.5 ms |
| long frame >50 ms | <1 / 60 s steady | <1 / 120 s | <1 / 120 s |

These are initial acceptance budgets, not verified current performance.

## World pipeline budgets

- visible-near generation+mesh queue wait p95 < 500 ms during normal traversal;
- no ready/upload queue growth for >10 continuous seconds in steady normal movement;
- stale worker result rate <5% normal play; high stale rate indicates churn/priority failure;
- single main-thread world/chunk operation p99 <4 ms steady state;
- cold spawn first controllable frame target <2 s Tier M after asset load, then tune from measured baseline;
- block-edit visible mesh response target <100 ms p95 near player;
- simulation remains at target TPS while render frame rate varies.

## Render budgets

Track per scene rather than enforce one universal triangle count.

- draw calls Medium p95 <=300, target <=200 after consolidation;
- geometries/textures converge after traversal round trip;
- GPU upload bytes/frame p95 budget derived from profiler, hard cap configurable;
- no ordinary block edit recreates all visible chunk geometry;
- quality-tier disable of shadows/water extras must lower GPU time measurably.

## Memory budgets

Because browser memory measurement support varies, use multiple signals:

- Three.js renderer info;
- Chrome/Firefox heap profiles;
- `performance.measureUserAgentSpecificMemory()` when cross-origin isolated and available;
- counts/bytes maintained by `MemoryResourceBudget` and world systems.

Long-traversal acceptance: after returning to the original area and allowing caches/GC to settle, retained memory/resources should be <= initial settled baseline +15%, excluding intentionally persistent saves/caches. Investigate any monotonic staircase.

## Regression policy

For stable reference-runner benchmarks:

- block merge if p95 frame time regresses >10% and >1 ms absolute;
- block if draw calls rise >15% in unchanged scene without an accepted ADR;
- block if traversal memory retained grows >15%;
- block if deterministic state hash changes without an intentional mechanics change;
- require explanation for >20% worker-job discard increase;
- visual features must include tier-off baseline.

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| optimize inactive/legacy path | High | High | runtime trace before change |
| worker race applies stale chunk mesh | High | High | job version/generation tokens |
| fixed tick changes existing feel | Medium | High | golden movement traces before refactor |
| greedy merge breaks lighting/AO | Medium | High | merge signature + fixture tests |
| translucency sorting artifacts | High | Medium | dedicated translucent meshes/policy |
| GPU uploads remain frame bottleneck after workers | High | High | upload scheduler and bytes/time metrics |
| overuse SharedArrayBuffer | Medium | High | transferables first; ADR before shared memory |
| WebGPU migration consumes roadmap | Medium | High | experimental backend only after WebGL budgets |
| richer worldgen breaks determinism | Medium | High | order-independent seed fixtures |
| save schema loses long-lived worlds | Medium | Critical | versioning/backups/migration round trips |
| copied Minecraft assets/IP | Medium | Critical | original/licensed assets + legal review |
| post-processing ruins pixel readability | Medium | Medium | optional tiered passes + screenshots |
| main thread becomes orchestration bottleneck | Medium | High | profile scheduling, batch messages |
| browser background throttling creates catch-up storm | High | High | bounded accumulator/catch-up |
| dynamic shadow cost scales with scene | High | Medium | shadow distance/caster budget |
| entity AI overwhelms TPS | High | High | activation range, cadence and budgets |

## ADR backlog

Write these Architecture Decision Records before the corresponding implementation:

1. ADR-001 — fixed simulation tick and interpolation contract.
2. ADR-002 — chunk column/section ownership and coordinate conventions.
3. ADR-003 — chunk status/ticket lifecycle and cancellation.
4. ADR-004 — worker transport: transferables vs shared memory.
5. ADR-005 — mesh vertex format and material/render-layer split.
6. ADR-006 — lighting representation and propagation invalidation.
7. ADR-007 — block collision/selection/occlusion shape schema.
8. ADR-008 — persistence backend and migration protocol.
9. ADR-009 — graphics quality tier policy/adaptive scaling.
10. ADR-010 — WebGL2 baseline and WebGPU experiment criteria.
11. ADR-011 — entity activation/spatial indexing.
12. ADR-012 — multiplayer authority model, only if phase begins.

## Rollback discipline

Each performance/fidelity phase should be feature-flagged or isolated enough to A/B against the previous path until proven. For workerization and mesher rewrites, keep deterministic fixtures capable of comparing old vs new output during transition, then delete the old path once parity/performance gates pass. Do not retain permanent duplicate pipelines.