# Spec: audit-correctness

## Contract

The correctness audit verifies that deterministic simulation invariants hold, arithmetic and
boundary conditions are handled correctly, state-transition rules are sound, and all persistent
and network codecs round-trip and validate. It relies on the deterministic-replay evidence from
change 241 and the codec/validation work from 19/223, and reconciles legacy correctness-relevant
findings (`AUDIT-010` silent Air return, `AUDIT-012/013/014/015` coverage gaps) against the
current tree.

## Definitions

- **Deterministic invariant**: a property that MUST produce identical observable results for
  identical inputs/seed/order, across repeated runs.
- **Codec round-trip**: encoding then decoding (and vice versa) restores the original value for
  all valid inputs, and rejects invalid inputs without partial state change.

## Invariants

- A determinism violation is always classified `blocking`.
- A correctness claim is `confirmed` only with a reproducible headless observation or a direct
  code citation; otherwise it is `low`/`blocked`.

## Requirements

### Requirement: REQ-C1 — Deterministic simulation invariants
The audit MUST verify that the simulation produces identical authoritative state for identical
seeds and input schedules, using change 241 replay evidence and targeted probes where needed,
and MUST record any determinism violation as a blocking `correctness` finding.

#### Scenario: replay hash stable
- **GIVEN** the deterministic-replay suite from change 241,
- **WHEN** the correctness audit checks simulation determinism,
- **THEN** it MUST confirm the recorded replay evidence (same seed/input → same state hash) is
  still current by re-reading the 241 verification or re-running a representative probe, and
  record the result.

#### Scenario: determinism violation
- **GIVEN** two identical seed/schedule runs that produce different authoritative state,
- **WHEN** the divergence is observed,
- **THEN** it MUST be recorded as a `blocking` `correctness` finding with the probe that
  reproduces it.

### Requirement: REQ-C2 — Arithmetic and boundary correctness
The audit MUST verify arithmetic and boundary handling in the modules most exposed to extreme
values — coordinates (negative X/Y/Z), safe-integer bounds, counts/capacities, and Y-height
limits — and MUST record an overflow/out-of-bounds/wrong-sign bug as a `correctness` finding.

#### Scenario: negative-coordinate handling
- **GIVEN** the section/coordinate and vertical world modules (`src/world/`, `src/math/`),
- **WHEN** the audit inspects negative and high-Y coordinate conversion,
- **THEN** it MUST confirm negative-coordinate floor-division and high-Y access produce correct
  section/column keys with evidence (citing 21/26/33 verification or a probe); a wrong sign or
  off-by-one at a boundary is a `blocking` finding if it can corrupt storage or place blocks at
  the wrong location.

#### Scenario: integer/capacity boundary
- **GIVEN** counts and capacities (item counts, stack maxCount, palette sizes, queue caps),
- **WHEN** the audit inspects boundary behavior,
- **THEN** it MUST confirm values at `1`/`maxCount`/`max` and just beyond are handled without
  overflow or silent truncation; silent truncation of a stored value is `blocking`.

### Requirement: REQ-C3 — State-transition invariants
For the simulation subsystems with defined transition rules (block behavior, redstone order,
fluids, entity lifecycle, crafting/recipes, block events), the audit MUST verify a representative
sample of transitions match the documented rule and MUST record any deviation.

#### Scenario: representative transition sampled
- **GIVEN** a documented redstone or fluid or crafting rule and its implementation,
- **WHEN** the audit samples the transition,
- **THEN** it MUST confirm the observed result matches the documented rule (citing the module and,
  where relevant, a headless test), and record a mismatch as a finding classified by consequence.

#### Scenario: mismatch with silent corruption
- **GIVEN** a transition that produces a state contradicting the rule and silently persists that
  wrong state,
- **WHEN** classified,
- **THEN** it MUST be `blocking` (determinism/correctness) with evidence.

### Requirement: REQ-C4 — Codec round-trip and validation
The audit MUST verify that persistent and network codecs round-trip all valid inputs and reject
invalid inputs without leaving partial state, using 19/223 evidence and targeted probes.

#### Scenario: round-trip valid input
- **GIVEN** a persistent codec (e.g. a `PersistentWorldCodecs` serializer) and a valid record,
- **WHEN** the audit verifies round-trip,
- **THEN** encode→decode MUST restore the original record; failure is a `blocking` finding if it
  corrupts saved state.

#### Scenario: invalid input rejected atomically
- **GIVEN** a malformed record presented to a codec/validator,
- **WHEN** decoded,
- **THEN** it MUST be rejected by the documented error and MUST NOT insert a partial entry; a
  partial insertion is a `blocking` finding.

#### Scenario: boundary — empty record
- **GIVEN** an empty or minimal valid record at the codec's boundary,
- **WHEN** round-tripped,
- **THEN** it MUST decode to a defined empty state (not throw spuriously or produce an
  undefined blob), and the result MUST be recorded.

## Error and failure behavior

- A determinism or corruption symptom that cannot be reproduced headless is recorded
  `low`/`blocked`, not asserted.
- Legacy `AUDIT-010` (silent Air return) is reconciled: if the current `WorldBlockAccess`/
  chunk-access path still silently returns Air for unloaded data, the residual behavior is a
  finding with its consequence classified.

## Performance and resource bounds

Probes are bounded and headless; none alter the fixed-tick path.

## Compatibility and migration

None — correctness audit changes no runtime behavior.

## Security and integrity

Correctness findings that also enable exploitation (e.g. a boundary bug reachable via network)
are cross-referenced from the `security` category.

## Observability

Correctness findings are traceable by ID; each cites the module and the reproducing probe.

## Verification mapping

- REQ-C1 → deterministic-replay evidence recorded; no un-evidenced determinism claim.
- REQ-C2 → negative-coordinate and integer-boundary checks evidenced.
- REQ-C3 → representative transition samples evidenced.
- REQ-C4 → codec round-trip and rejection probes evidenced.
