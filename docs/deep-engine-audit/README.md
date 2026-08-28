# clone-MC_v3 Deep Engine Audit v2

Documentation-only engineering blueprint for improving `clone-MC_v3` toward much stronger Minecraft-like visual, simulation, interaction, and performance fidelity without sacrificing browser performance.

**Audit anchor:** `main` commit `471cf1eb5884a8e25c63c967cd0cf1d1ccc0a7d9` (2026-08-21), tree `f3612297de0d6b07a5ef7ff78872f220a638d769`.

## Rules for using this plan

- `[VERIFIED]` means inspected in the repository at the audit anchor or directly supported by an existing repository audit.
- `[HISTORICAL]` means supported by an earlier repository audit but must be re-measured before implementation.
- `[INFERRED]` means strongly suggested by structure/naming but not fully proven in this audit pass.
- `[PROPOSED]` means future work; it is not a claim about current behavior.
- No game/source implementation changes belong on this branch.
- Before every optimization phase, capture a reproducible baseline. Do not optimize from intuition alone.

## Documents

1. [00_MASTER_PLAN.md](00_MASTER_PLAN.md) — executive plan, priorities, dependency graph, critical path.
2. [01_CODEBASE_BASELINE.md](01_CODEBASE_BASELINE.md) — verified architecture and current-system inventory.
3. [02_PHYSICS_GAMEPLAY.md](02_PHYSICS_GAMEPLAY.md) — movement, collision, timestep, ray interaction, fluids, entities.
4. [03_RENDERING_GRAPHICS.md](03_RENDERING_GRAPHICS.md) — shaders, lighting, textures, atmosphere, fidelity tiers.
5. [04_WORLD_PERFORMANCE.md](04_WORLD_PERFORMANCE.md) — chunks, worldgen, meshing, streaming, workers, CPU/GPU/memory.
6. [05_ARCHITECTURE_TESTING.md](05_ARCHITECTURE_TESTING.md) — architecture, observability, testing, CI, persistence, security.
7. [06_PARITY_ROADMAP.md](06_PARITY_ROADMAP.md) — staged parity program and milestone exits.
8. [07_BENCHMARKS_RISKS.md](07_BENCHMARKS_RISKS.md) — benchmark matrix, budgets, risk register, ADR backlog.
9. [08_SOURCE_REGISTER.md](08_SOURCE_REGISTER.md) — primary/official research sources and applicability.

## First principle

The project should not attempt to become “real Minecraft” by layering expensive effects and mechanics onto the existing runtime. The correct order is: **measure → stabilize simulation contracts → make world/mesh work asynchronous and bounded → reduce render submission cost → establish a lighting/material pipeline → add fidelity features under quality tiers → validate parity and regressions continuously.**

This ordering prevents the common failure mode where better-looking content makes chunk stalls, garbage collection, GPU upload spikes, and inconsistent movement worse.