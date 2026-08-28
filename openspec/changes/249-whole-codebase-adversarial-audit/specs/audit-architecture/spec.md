# Spec: audit-architecture

## Contract

The architecture audit verifies that the codebase respects its intended module boundaries and
determinism isolation: the headless simulation package is deterministic and free of DOM/render
dependencies (change 222), layer/dependency discipline holds across modules, state ownership is
clear, and dead/duplicate/legacy code is identified. It reconciles the legacy architecture
findings (`AUDIT-027` God-object `Game`, `AUDIT-028` `World` mixes data/logic/rendering,
`AUDIT-029` player state modified by multiple systems, `AUDIT-030` no event system, `AUDIT-024`
documentation drift) against the current tree.

## Definitions

- **Headless simulation boundary**: the package extracted by change 222 that MUST be deterministic
  and MUST NOT depend on DOM, rendering, or browser I/O.
- **Dependency direction**: which modules may import which (e.g. simulation must not depend on
  render; data/registry underpin simulation).
- **State owner**: the single module/system responsible for mutating a given authoritative state.

## Invariants

- A violation of the headless-simulation determinism boundary (simulation importing DOM/render)
  is `blocking`.
- An architecture finding is `confirmed` only with a code citation; otherwise it is
  `low`/`blocked`.

## Requirements

### Requirement: REQ-A1 — Headless simulation determinism boundary
The audit MUST verify that the headless simulation package (change 222) is deterministic and free
of DOM/render/browser-I/O dependencies, and that no render/UI module mutates authoritative
simulation state.

#### Scenario: simulation imports render
- **GIVEN** an `src/simulation/` module that imports from a render/UI module or touches DOM/`window`/
  `document`/`performance` in a way that breaks headless determinism,
- **WHEN** the audit inspects the boundary,
- **THEN** it MUST be recorded as a `blocking` architecture finding with the offending import/
  reference; the headless unit suite running the module without a DOM is evidence the boundary is
  otherwise intact.

#### Scenario: render mutates simulation state
- **GIVEN** a render/UI module that writes authoritative simulation state,
- **WHEN** the audit inspects it,
- **THEN** it MUST be recorded as a finding (cross-referenced to `concurrency` REQ-CO2), `blocking`
  if it corrupts a tick's result.

### Requirement: REQ-A2 — Layer/dependency discipline
The audit MUST verify dependency direction across the seven category surfaces — registries/data
underpin simulation; simulation underpin worldgen/entities; storage and network consume shared
codecs — and MUST record violations where a lower layer imports a higher layer or a cross-cutting
module depends on presentation.

#### Scenario: presentation depends on a high-level engine module
- **GIVEN** a module that imports `Game` or another composition root in a way that makes it
  untestable headless,
- **WHEN** the audit inspects it,
- **THEN** it MUST be recorded as a `non-blocking` architecture finding (or `blocking` if it breaks
  the headless boundary) with the import chain cited.

#### Scenario: no-violation layer confirmed
- **GIVEN** the `data/` → `simulation/` → higher layers dependency direction,
- **WHEN** the audit inspects it,
- **THEN** it MUST confirm the direction holds with representative import evidence and record the
  checked surfaces.

### Requirement: REQ-A3 — State ownership and composition-root concerns
The audit MUST evaluate the legacy God-object/composition-root concerns (`AUDIT-027/028/029/030`)
against the current tree and record each as `resolved`, `persists`, or a new finding with the
current ownership model documented.

#### Scenario: player state owner
- **GIVEN** legacy `AUDIT-029` (player state modified by multiple systems),
- **WHEN** the audit inspects the current player/movement/input modules,
- **THEN** it MUST record whether a single owner (e.g. the movement authority / player state
  module) now owns authoritative player state, map the legacy ID to its current status with
  evidence, and classify any residual multi-writer risk (`blocking` if it corrupts authoritative
  state).

#### Scenario: composition root still centralized
- **GIVEN** legacy `AUDIT-027` (God-object `Game`),
- **WHEN** the audit inspects it,
- **THEN** it MUST record whether `Game`/the composition root is still a central coordinator and
  classify the concern as `non-blocking` (INFO/architecture) unless it causes a concrete defect.

### Requirement: REQ-A4 — Dead, duplicate, and legacy code identification
The audit MUST identify dead, duplicate, and legacy code paths and documentation drift
(`AUDIT-024`) and record them as `non-blocking` architecture findings with evidence, without
removing any code.

#### Scenario: dead code identified
- **GIVEN** a function/export with no callers or a no-op placeholder,
- **WHEN** the audit inspects it,
- **THEN** it MUST be recorded as a `non-blocking` architecture finding with the file/line
  evidence; removal is out of scope for 249.

#### Scenario: documentation drift
- **GIVEN** a spec or comment that contradicts the implementation (legacy `AUDIT-024`),
- **WHEN** the audit inspects it,
- **THEN** it MUST be recorded with the spec/comment location and the actual behavior, classified
  `non-blocking` (or `blocking` only if the drift hides a correctness/data-loss risk, which is
  cross-referenced to the relevant category).

## Error and failure behavior

- A claimed architecture violation without a reproducible import/reference citation is not
  reported `confirmed`.
- A boundary risk only observable under a specific build mode is recorded with that mode noted.

## Performance and resource bounds

Architecture review is static (import graph and ownership inspection); no probes add runtime cost.

## Compatibility and migration

None — architecture audit changes no runtime behavior.

## Security and integrity

Architecture findings that create an exploitable path (e.g. presentation importing untrusted data
into simulation) are cross-referenced from `security`.

## Observability

Architecture findings are traceable by ID; each cites the import chain, owner, or dead path and
its evidence.

## Verification mapping

- REQ-A1 → headless boundary check (no DOM/render import in `src/simulation/`).
- REQ-A2 → dependency-direction spot checks.
- REQ-A3 → legacy `AUDIT-027/028/029/030` reconciled with current ownership model.
- REQ-A4 → dead/duplicate/legacy code and `AUDIT-024` recorded.
