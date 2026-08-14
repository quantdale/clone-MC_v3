# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **054-deterministic-rng-streams — VERIFIED 100%**
- Active implementation change: **054-deterministic-rng-streams — VERIFIED**
- Next change: **055-simulation-test-harness — NOT YET ACTIVE (artifacts pending)**
- 054 task ledger: **4 total tasks, 4 completed**
- 054 completion: **100%**
- 054 mandatory deterministic-rng-streams requirements: **PASS**
- 054 required-test gate: **PASS — unit 667/667, E2E 19/19**
- 054 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `56a933ddd2a31f0abe768383e6954abc8e3c7d70`
- Next exact action: **Advance to 055-simulation-test-harness. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (055 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement a headless tick-stepping harness with fixture worlds, state assertions, and deterministic replay hooks, verify full gate, commit + push, advance program state.**

## What 054 implemented

Change 054 adds deterministic, named RNG streams for simulation subsystems.

- `src/simulation/SeedRng.ts` (NEW) — mulberry32 `SeedRng` (`next`/`nextFloat`/`nextInt`/
  `nextIntInclusive`/`nextBoolean`/`fork(name)`/`state`) with the algorithm pinned for determinism;
  `createNamedRng(worldSeed, streamName)` derives isolated, reproducible per-subsystem streams (FNV-1a
  string hash); `fork` derives deterministic child streams from the parent's current state; invalid
  arguments throw `RangeError`.
- `tests/unit/SeedRng.test.ts` (NEW) — 9 tests: same-seed determinism, seed variation, named-stream
  isolation/reproducibility, 1000-draw range checks, booleans, fork determinism + parent advancement,
  name-differing forks, state exposure (uint32, twin equality), and invalid-argument rejection.

## Validation evidence (054)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 667/667 (prior 658 + 9 new SeedRng tests), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 054 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 054 suite
(9/9), the full unit suite (667/667, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed. The fixed-tick simulation section (044-054) is complete.

## Next change: 055 (pending artifacts)

`055-simulation-test-harness` is named in `CHANGE_SEQUENCE.md` with scope "Headless tick stepping,
fixture worlds, state assertions, and deterministic replay hooks." Per `AGENTS.md`, a change lacking
full artifacts is a hard pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 054 verification.
Change 055 is the next change; its artifacts must be authored and validated before implementation
begins.
