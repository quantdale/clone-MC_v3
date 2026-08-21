# 01 — Codebase Baseline and Audit Map

## Audit anchor

- Repository: `quantdale/clone-MC_v3`
- Default branch: `main`
- Audited commit: `471cf1eb5884a8e25c63c967cd0cf1d1ccc0a7d9`
- Tree: `f3612297de0d6b07a5ef7ff78872f220a638d769`
- Audit date: 2026-08-21

The documentation branch was created from this exact commit. Any later implementation session must first diff current `main` against this anchor and update affected findings.

## Verified stack

From `package.json`:

- TypeScript ES-module application
- Three.js `^0.169.0`
- Vite `^6.4.3`
- TypeScript `^5.6.0`
- Vitest `^3.2.7` + V8 coverage
- Playwright `^1.62.1`
- ESLint 9 + typescript-eslint
- Node >=20
- scripts for build, lint, typecheck, unit tests, coverage, E2E and state validation

This is a strong enough toolchain to support benchmark gates without changing frameworks.

## Verified source topology

```text
src/
  audio/
  config/
  data/
  engine/
  inventory/
  math/
  player/
  rendering/
  simulation/
  storage/
  ui/
  world/
  worldgen/
```

### Engine
Verified files include `Game.ts` (~63 KB at the anchor), `GameLoop.ts`, `SimulationClock.ts`, `RenderInterpolator.ts`, `Renderer.ts`, `InputManager.ts`, `PauseManager.ts`, and `ResourceManager.ts`.

**Finding:** `Game.ts` is a large coordinator. This is not automatically wrong for a composition root, but it raises three risks: hidden update-order coupling, lifecycle/disposal coupling, and difficulty benchmarking systems independently. Future refactoring should extract system orchestration only when tests identify stable boundaries; do not split it merely to reduce line count.

### Player
Verified files include `Player`, `PlayerController`, `PlayerInteraction`, `PlayerPhysics`, `SurvivalSystem`, `ExperienceSystem`, `ArmorProtection`, and `FoodComponentRuntime`.

`PlayerPhysics.update()`:

- clamps `dt` to `CONFIG.maxDeltaTime`;
- clears/recomputes ground contact each update;
- samples water/lava from world blocks;
- applies medium-specific gravity/terminal velocity;
- accumulates fall distance;
- computes substep count from maximum displacement;
- resolves Y, then X, then Z per substep;
- scans overlapped voxel cells;
- attempts step-up on grounded horizontal collision;
- caps collision-resolution retry loop at 10;
- records landings and can trample farmland.

This is a kinematic voxel controller, not a general rigid-body engine.

### World
Verified current files include `BlockPropertySchema`, `BlockRegistry`, `BlockStateRegistry`, multiple block-entity implementations, `Chunk`, `ChunkColumn`, `ChunkSection`, `ChunkStatus`, `ChunkTicket`, `ChunkManager`, `ChunkMesher`, and `CollisionResolver`.

**Important:** older project audit material describes a 16×64×16 chunk model. Current `CONFIG.chunk` still exposes width 16, height 64, depth 16, while the presence of `ChunkColumn`/`ChunkSection` indicates architectural evolution. Treat “chunk” terminology carefully: future work must document whether storage/lighting/meshing units are whole columns, fixed-height sections, or both.

### Rendering
Verified files include `AmbientOcclusion`, `AnimatedTextureFrame`, `BiomeTint`, `BlockLightEngine`, `Environment`, `FluidSurfaceMesher`, `GreedyMesher`, `HostileMobRenderer`, `LightSaturation`, `LightStorage`, `LightUpdateEngine`, `Lighting`, `Materials`, and `MemoryResourceBudget`.

**Finding:** many features usually proposed for a Minecraft-like renderer already have named implementations. Therefore the next phase is not “add AO/greedy meshing/lighting”; it is **trace authoritative runtime usage, benchmark quality/cost, close fidelity gaps, and remove duplicate/legacy paths.**

### Configuration
Current tunables include:

- render distance 6 chunks;
- simulation distance 6;
- sea level 32;
- reach 5 blocks;
- max DDA steps 512;
- walk 4.32 blocks/s, sprint 6.0, jump velocity 8.0, gravity 26.0;
- acceleration 50, damping 12, terminal velocity 54;
- collision max substep displacement 0.25;
- step height 1.0;
- per-frame generation/mesh/unload budgets 2/3/4;
- preload radius 3;
- queue cap 512;
- max pixel ratio 2;
- shadow map 1024 and shadow distance 96;
- 600-second day length;
- headless render/simulation distance 2 and DPR 1.

These numbers are **implementation constants, not proof of Minecraft parity**. Every physics constant should be validated against behavior-level fixtures, not copied blindly from community tables.

## Existing project audits

The repository already contains `FULL_AUDIT_REPORT.md`, `MINECRAFT_PARITY_MASTER_PLAN.md`, and `PARITY_MATRIX.md`.

[HISTORICAL] The earlier full audit reported a clean build/test/lint state at its August 7 run and identified context-loss handling, synchronous spawn preload, pointer-lock error handling, edit persistence, queue sorting/allocations, hot-path registry lookups, meshing allocations and render submission as concerns. Do not copy its test counts forward as current evidence; rerun gates from the audit anchor or current main before work begins.

## Required runtime trace before implementation

For each subsystem, produce a one-page “who calls whom” trace from `Game` initialization through update/render/dispose:

1. Game creation/bootstrap.
2. simulation clock and render loop relationship.
3. player controller → physics → interaction order.
4. world tick/streaming order.
5. chunk ticket/status transitions.
6. generation → lighting → mesh → GPU activation path.
7. entity/mob/projectile update and render ownership.
8. save/load ownership.
9. resource disposal/context recovery.

The purpose is to prevent adding a new optimized path alongside an older active path.