# Findings — Exhaustive Repository Certification Campaign

Severity model per the campaign brief (BLOCKER / HIGH / MEDIUM / LOW / INFO).
Every finding records evidence, root cause, fix, and regression oracle status.
`resolved` requires the oracle passing on the candidate tree.

## Resolved this campaign

### F-INV-1 · HIGH · Tools destroyed whole stacks on break — RESOLVED
- **Files:** src/inventory/ItemRegistry.ts (definitions), src/inventory/DurabilityRules.ts:89-91 (zeroing), src/inventory/Inventory.ts:209-216 (merge)
- **Evidence:** tools declared `stackSize: 64`; two crafted pickaxes merged into one shared-damage stack; `applyDamage` zeroes `count`, destroying every copy when the shared durability broke.
- **Root cause:** durable items stacked; wear/break operated on the whole stack.
- **Fix:** durable items now declare `stackSize: 1`; construction-time invariant `assertDurableItemsDoNotStack` rejects future stacking definitions.
- **Oracle:** tests/unit/ToolStackingRegression.test.ts (3 tests incl. break-one-survive-other); ItemRegistry invariant tests.
- **Disposition:** fixed-with-regression-test

### F-INV-2 · HIGH · Enchantments silently destroyed by save/load — RESOLVED
- **Files:** src/inventory/Inventory.ts (snapshot/restore/constructor)
- **Evidence:** `snapshot()` dropped all component maps except translated hotbar damage; enchantment serializers had zero production callers; pagehide persisted stripped stacks while XP/lapis stayed spent.
- **Root cause:** snapshot schema carried ids/counts/durability numbers only.
- **Fix:** additive JSON-safe `slotComponents` + storage-entry `components`; strict validated restore (rejects, never throws); constructor preserves storage components; pristine tools no longer gain phantom `{damage:0}` on restore (latent infidelity exposed by the new serialization and fixed).
- **Oracle:** tests/unit/InventoryComponentPersistence.test.ts (7 tests); ProgressionHarness determinism suite re-verified byte-identical restore hashes.
- **Disposition:** fixed-with-regression-test

### F-MINE-1 · HIGH · Quick click bypassed mining duration entirely — RESOLVED
- **Files:** src/player/PlayerInteraction.ts:199-278
- **Evidence:** release-within-220 ms (`breakClick`) called `finishBreak` unconditionally; `beginBreak(held=false)` finished immediately; any breakable block (incl. hardness-50 obsidian) popped in ≤0.25 s regardless of tool — contradicting README's hardness-based mining contract and C114's speed model.
- **Root cause:** press-style owned completion instead of break-duration progress.
- **Fix:** completion is owned exclusively by progress ≥ 1; clicks start attempts like holds; early release resets. Unit + e2e tests strengthened to hold-mine (no assertion weakened — they now exercise real mining).
- **Oracle:** PlayerInteraction.test.ts released-click regression test; three e2e tests converted to held mining with drained-air polling.
- **Disposition:** fixed-with-regression-test

### F-W-1 · MEDIUM · stateOverlay unbounded across sessions; reload resets stateful blocks — RESOLVED (bounded + documented)
- **Files:** src/world/World.ts (stateOverlay), README Known Limitations
- **Evidence:** no cap (editOverlay caps at 10k LRU); entries retained for unloaded chunks forever within a session; crop age/farmland moisture/fire age lost on reload. Change 125 explicitly scoped reload persistence out; no user-facing doc promised it.
- **Fix/disposition:** bound it — same 10k-chunk least-recently-written eviction discipline as editOverlay; session-only statefulness documented in README as genuine non-release debt (full block-state persistence deferred; would touch the most critical subsystem immediately after a READY declaration).
- **Oracle:** tests/unit/StateOverlayBoundedness.test.ts (cap + recency + emptied-layer removal).

### F-PERS-6 · MEDIUM · pendingEdits copies leaked for whole sessions — RESOLVED
- **Files:** src/storage/GamePersistence.ts, AutosaveCoordinator.ts, DirtySaveQueue.ts
- **Evidence:** pending overlay copies were pruned only by facade `flush()`; the periodic coordinator tick never pruned, retaining one full overlay copy per distinct edited chunk indefinitely.
- **Root cause:** drains did not report committed keys.
- **Fix:** `drainReport()` reports sink-accepted keys; coordinator fires `onUnitsCommitted`; facade releases exactly those pending copies (newest-wins preserved for re-marked keys).
- **Oracle:** tests/unit/CommitReporting.test.ts (6 tests).

### F-INV-3 · MEDIUM (latent HIGH consumer trap) · Stale enchanting session overwrote unrelated slot — RESOLVED
- **Files:** src/engine/Game.ts (openEnchanting/applyEnchantingOffer/updateHotbar), src/inventory/EnchantingTable.ts
- **Evidence:** applying an offer after changing selection wrote an enchanted copy of the captured stack into the newly selected slot (duplication + destruction) and spent XP/lapis.
- **Fix:** capture slot at open; apply voids the session (spending nothing) when selection moved or live stack identity (id/count/damage/enchantments) diverges; selection change clears the session. Pure guard extracted as `enchantingTargetMatches`.
- **Oracle:** tests/unit/EnchantingSessionGuard.test.ts (5 tests). Wiring-level browser test remains open debt (risk register R-3).

### F-INV-7 · MEDIUM · Hotbar icons/titles frozen at construction values — RESOLVED
- **Files:** src/inventory/Hotbar.ts, src/engine/Game.ts (post-construction restore path)
- **Evidence:** canvases/titles painted once from construction-time ids; restored saves and pickups into empty slots left stale visuals for the whole session.
- **Fix:** render() redraws icon+title when a slot's item id changes; restore triggers a render once construction completed (injected-persistence path builds the Hotbar after restore and needs no refresh).
- **Oracle:** tests/unit/HotbarIconRefresh.test.ts (DOM-shim draw-count assertions).

### F-RND-3 · LOW-MED · Respawn camera swept death-spot→spawn — RESOLVED
- **Files:** src/engine/RenderInterpolator.ts
- **Evidence:** `notifyTeleport()` latch was consumed before the same-tick post-physics `setState`, so the renderer blended pre→post teleport pose for one tick (~50 ms) — visible on respawn.
- **Fix:** latch marks the NEXT snapshot non-blendable; blending resumes on the following pair.
- **Oracle:** RenderInterpolator.test.ts teleport-latch cases (9 total pass).

### F-SIM-1 · MEDIUM (test-only reachability) · Wildcard `once()` listeners refired forever — RESOLVED
- **Files:** src/simulation/GameEventBus.ts:103
- **Fix:** one-shot removal keyed by the delivery bucket ('*'), not the event type.
- **Oracle:** GameEventBus.test.ts wildcard-once case.

### F-SIM-2 · MEDIUM (latent) · First message of an epoch (seq 0) always rejected — RESOLVED
- **Files:** src/simulation/NetworkAdversarialGuard.ts:59-76
- **Fix:** acceptance state tracked explicitly; seq 0 accepted as epoch start; replays within an epoch still duplicates.
- **Oracle:** NetworkAdversarialGuard.test.ts seq-0 cases (31 pass).

### F-SIM-3 · LOW · Locale-dependent save restore order — RESOLVED
- **Files:** src/simulation/ServerSaveLifecycle.ts:505-507
- **Fix:** numeric tuple comparator replaces `localeCompare`, restoring the machine-independent decode contract. Suite green (39).

### F-RND-9 · LOW · Duplicate translucent BufferGeometry garbage per remesh — RESOLVED
- **Files:** src/world/ChunkMesher.ts:212-220
- **Fix:** `transparent` aliases the translucent geometry (matching the documented intent); one build, one owner.
- **Oracle:** ChunkMesher suite green; World attaches exactly one translucent mesh.

## Governance findings

### GOV-STATE-ALIAS · MEDIUM · RESOLVED
`openspec/program-state.json` claimed change 002 ACTIVE against a terminal canonical state.
Alias reduced to a non-state redirect (canonical pointer + historical note); carrying stale
per-change fields is now a validator error.

### GOV-VALIDATOR · MEDIUM · RESOLVED
validate-state.mjs understood only the pre-241 interlock. Added terminal-program coherence
checks (COMPLETE ⇔ nextChange null ⇔ VERIFIED ⇔ 100% ⇔ advancement allowed; stranded
VERIFIED-with-null-successor detection), alias conformance, multi-interlock gating awareness,
and a `--root` harness. Oracles: tests/unit/ValidateStateInvalidStates.test.ts (7 synthetic
invalid states → exit 1; clean states → exit 0).

### AUDIT-EVIDENCE · MEDIUM · RESOLVED
gen-file-audit.mjs manufactured `findings:'none'/status:'audited'/integration:'integrated'`
from path prefixes. Rewritten as a pending-only inventory generator; new
validate-file-audit.mjs enforces bijection with git ls-files, completeness, justified
review levels, and refuses clean verdicts without evidence. This campaign's reviewed manifest
(2452 rows, 0 pending, 0 unclassified) lives in this package and validates green.

## Documentation drift — RESOLVED (README.md)
Node 18→20; localStorage→IndexedDB GamePersistence authority (settings remain localStorage);
hostile mobs + touch/gamepad support acknowledged; greedy meshing claim corrected (implemented,
worker-path-disabled); Shift=sneak/Ctrl=sprint control table fixed; architecture tree expanded;
session-only block-state limitation documented.

## Accepted (not fixed) — see risk-register.md
- F-TST-1 chunk-streaming e2e assertion strengthened (was unfalsifiable) — fixed, listed here for traceability of the test-quality pass; remaining test-quality gaps are registered as risks, not silently dropped: lifecycle-dispose browser proof, real worker teardown proof, storage-corruption boot recovery at browser level, player-state durability via real-IDB reload assertion.
- RND-4 sneak phantom-support via side-face contact (LOW-MED): collision-math change too risky late in certification; registered R-1.
- SIM-4/5 deserialize duplicate-id/validation gaps in unwired stores (LOW): registered R-4.
- RND-5 unconditional apple drop from leaves (MEDIUM parity deviation): likely intentional early-game food economy; registered R-2 for product decision.
- RND-6 Math.random in live drop paths: non-deterministic-by-design (replay operates on seeded harness); INFO.
- CI action pinning to immutable SHAs: network-constrained environment prevented fetching trusted immutable refs; tag refs operate under `permissions: contents: read` with no fork secrets; registered R-5.
