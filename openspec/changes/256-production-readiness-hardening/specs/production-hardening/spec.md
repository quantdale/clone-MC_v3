# Spec: production-hardening

## Contract

This change hardens the already-VERIFIED 001–255 voxel game to production readiness without changing gameplay, save format, generation version, or public scope. All edits are cleanup, consolidation, typing, and defensive hardening with behavioral preservation. Every retained abstraction must have a live callsite; every MUST/SHALL is testable.

## Definitions

- **Orphan**: a `src/` module whose exports have zero importers in `src/` + `tests/` (excluding registry-driven indirection proven by a test) and zero dynamic `import()` consumers, as reported by `scripts/orphan-check.mjs` + `tsc` cross-check.
- **YAGNI violation**: an exported symbol, file, or abstraction that has no caller in the verified 001–255 gameplay and is not required by a test oracle or a persistence/migration seam.
- **Magic number**: a numeric literal that names a gameplay or economy constant (e.g., wither XP, toast duration) and should be a named module-level `const`.
- **Headless session**: `typeof navigator !== 'undefined' && navigator.webdriver === true`.

## Invariants

- Deterministic `runFixedTick` order and `worldReady` gate are unchanged.
- Generation seed/version and save-record shape are unchanged; existing IndexedDB records load identically.
- No `src/` edit without a task checkbox; no task without evidence.

## Requirements

### Requirement: Audited backlog before edits
The implementation MUST be preceded by an audited backlog derived from `scripts/validate-state.mjs`, `scripts/orphan-check.mjs`, file-audit, and greps for `TODO`, `FIXME`, `as any`, `@ts-ignore`, `@ts-expect-error`, and `void <identifier>;` noise.

#### Scenario: Backlog is recorded
- **GIVEN** a clean checkout at `4c7d2a4`
- **WHEN** the audit commands run
- **THEN** `verification.md` lists the triaged findings with disposition

### Requirement: YAGNI pruning
The implementation MUST remove every YAGNI violation and orphan proven by the audit; every retained exported symbol MUST have a live callsite in `src/` or `tests/` or a registry-driven test proving indirection.

#### Scenario: Retained export has a callsite
- **GIVEN** an exported symbol remains after 256
- **WHEN** grepping `src/` + `tests/` and checking registry tests
- **THEN** at least one importer or a test-proven indirection exists

#### Scenario: Orphan is removed
- **GIVEN** a file reported as orphan with zero importers
- **WHEN** 256 is VERIFIED
- **THEN** the file is deleted and `npm run typecheck` still passes

### Requirement: Magic-number consolidation
All gameplay/economy magic literals identified in the audit (including wither XP 50, skull cap 12, melee cooldown 10, effect period 40, toast 1500ms, FPS interval 0.5s, furnace use distance 8, headless-derived distances) MUST be named module-level `const` with JSDoc, and every callsite MUST read the constant.

#### Scenario: Wither reward is a constant
- **GIVEN** a wither defeat
- **WHEN** inspecting `src/engine/Game.ts`
- **THEN** the XP added is `WITHER_XP_REWARD` (value 50) and not a bare literal

#### Scenario: No bare literal at hardened sites
- **GIVEN** the hardened sites listed in design Detailed behavior
- **WHEN** grepping for the old bare literals
- **THEN** no bare literal remains at those sites

### Requirement: Duplicate headless helper consolidation
`runtimeRenderDistance()` and `runtimeSimulationDistance()` MUST delegate to a single `isHeadlessSession()` helper; the `navigator.webdriver` check MUST appear in exactly one place in `src/engine/Game.ts` (other files' headless checks are out of scope for this narrow change and remain).

#### Scenario: Single headless check in Game.ts
- **GIVEN** `src/engine/Game.ts`
- **WHEN** counting `navigator.webdriver` occurrences
- **THEN** the count is 1, inside `isHeadlessSession`

### Requirement: Boss-bar CSS extraction
The wither boss-bar MUST be constructed with CSS classes in `src/styles.css`, not inline `style.cssText` strings; the DOM construction in `Game.ts` MUST set `id` and toggle visibility via `classList`, not inline style mutations beyond the guarded `fill` width.

#### Scenario: Boss bar uses CSS
- **GIVEN** `src/engine/Game.ts` constructor
- **WHEN** inspecting boss-bar creation
- **THEN** no `style.cssText` literal containing `position:absolute;top:40px` exists

#### Scenario: Boss bar styling is in CSS
- **GIVEN** `src/styles.css`
- **WHEN** searching for `#wither-boss-bar`
- **THEN** a rule exists defining its position, size, background, border, and `display:none` default

### Requirement: void-noise and floating-promise hardening
Every `void <identifier>;` statement that discards a value without effect MUST be removed; every intentionally fire-and-forget `Promise` MUST be `void` with a `.catch(() => undefined)` or be awaited, and MUST NOT be a bare `void message;` noise.

#### Scenario: No void noise
- **GIVEN** `src/engine/Game.ts`
- **WHEN** grepping for `void message`
- **THEN** no match exists

#### Scenario: Floating promises are handled
- **GIVEN** any `void` on a `Promise` in `src/`
- **WHEN** inspecting the expression
- **THEN** it is `void <promise>.catch(...)` or `void <promise>.then(...).catch(...)`

### Requirement: Type-cast narrowing
The double cast `(x as unknown as { initialWithers: unknown[] })` MUST be replaced by a typed accessor (reading `initialWithers` as `unknown[]` from the typed `GamePersistence` facade) with defensive fallback `?? []`; the `as unknown as import('../world/CollisionResolver').ShapeWorld` double cast MUST be replaced — the adapter MUST be typed via the imported `ShapeWorld` interface and correctly implement `getCollisionShape`.

#### Scenario: No double cast for withers
- **GIVEN** `src/engine/Game.ts`
- **WHEN** grepping for `as unknown as.*initialWithers`
- **THEN** no match exists

#### Scenario: ShapeWorld adapter is typed correctly
- **GIVEN** `src/engine/Game.ts` `tickWithers` skull stepping
- **WHEN** inspecting the `shapeWorld` local
- **THEN** it satisfies `ShapeWorld` without `as unknown as import(` and implements `getCollisionShape`

### Requirement: Error-handling completeness
Every `try` that catches persistence or DOM access MUST have a comment stating the degraded behavior and MUST NOT swallow a failure that should surface via `bootSaveDegraded`/`health`/`console.warn`.

#### Scenario: Bootstrap catch is documented
- **GIVEN** `src/main.ts` `persistence.open()` catch
- **WHEN** reading the catch block
- **THEN** a comment states degraded memory-only play and health banner surfacing

### Requirement: Behavioral preservation
All gates that were PASS at `4c7d2a4` MUST remain PASS after hardening.

#### Scenario: Gates remain green
- **GIVEN** the hardened tree
- **WHEN** running `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
- **THEN** each reports PASS

### Requirement: No speculative optimization
Any claimed optimization MUST have a before/after measurement or be a trivial allocation removal with a comment.

#### Scenario: Optimization is measured or trivial
- **GIVEN** a change described as optimization in `verification.md`
- **WHEN** inspecting its evidence
- **THEN** either a bench measurement or a trivial-allocation justification is present

## Error and failure behavior

- Missing `canvas` or `UI root` still throws `Required UI element missing: #<id>`.
- `persistence.open()` failure still results in memory-only play with `bootSaveDegraded=true`.
- `deserializeWithers` throw still caught into `bootSaveDegraded=true`.

## Performance and resource bounds

- `runFixedTick` allocations not increased; constants are module-level.
- `tickWithers` skull cap remains 12.
- Bundle stays at 195 modules.

## Compatibility and migration

No persisted schema or generation version change.

## Security and integrity

No new network or storage attack surface.

## Observability

No new telemetry.

## Verification mapping

| Requirement | Evidence |
|---|---|
| Audited backlog before edits | verification.md triaged audit |
| YAGNI pruning | orphan-check 0, grep 0, typecheck PASS |
| Magic-number consolidation | grep old literals 0 at hardened sites |
| Duplicate headless helper | grep navigator.webdriver count 1 in Game.ts |
| Boss-bar CSS extraction | style.css rule 1, style.cssText 0 |
| void-noise | void message 0, void with .catch |
| Type-cast narrowing | as unknown as initialWithers 0, as unknown as import 0 |
| Error-handling | main.ts comment |
| Behavioral preservation | typecheck/lint/test/build PASS |
| No speculative optimization | bench or trivial justification |
