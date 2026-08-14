# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **093-aquifer-system — VERIFIED 100%**
- Active implementation change: **093-aquifer-system — VERIFIED**
- Next change: **094-configured-feature-core — NOT YET ACTIVE (artifacts pending)**
- 093 task ledger: **4 total tasks, 4 completed**
- 093 completion: **100%**
- 093 mandatory aquifer-system requirements: **PASS**
- 093 required-test gate: **PASS — unit 1038/1038, E2E 19/19**
- 093 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `55429cf080024b5ec2e7ad900b8711ed3a001936`
- Next exact action: **Advance to 094-configured-feature-core. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (094 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement data-driven worldgen feature definitions (deterministic; registry-backed, 003 patterns), verify full gate, commit + push, advance program state.**

## What 093 implemented

Change 093 adds underground water/lava aquifer decisions.

- `src/worldgen/AquiferSystem.ts` (NEW) — `AquiferDecision` (`WATER | LAVA | NONE`);
  `AquiferConfig` (defaults: seaLevel 63, lavaLevel -54 exclusive, dryThreshold 0.4);
  `AquiferBlockIds` (defaults water 8 / lava 10); `classifyAquifer(seed, x, y, z, config?)`:
  above sea level → NONE; dryness fbm3 noise above the threshold → NONE; below `lavaLevel` →
  LAVA; otherwise WATER; `applyAquifers(column, carved, seed, config?, ids?)`: pure fill of 092
  carved cells with the fluid ids (dry/above-sea carved cells stay air), everything else
  preserved. Strict config validation.
- `tests/unit/AquiferSystem.test.ts` (NEW) — 8 tests: exact y-table with dryness forced off/on
  (thresholds outside the fbm bound), default-config determinism and decision set, applyAquifers
  fill/preserve/purity, config validation.

## Validation evidence (093)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1038/1038 (prior 1030 + 8 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 093 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 093 suites,
the full unit suite (1038/1038, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 094 (pending artifacts)

`094-configured-feature-core` is named in `CHANGE_SEQUENCE.md` with scope "Data-driven worldgen
feature definitions." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md`
before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 093 verification.
Change 094 is the next change; its artifacts must be authored and validated before implementation
begins.
