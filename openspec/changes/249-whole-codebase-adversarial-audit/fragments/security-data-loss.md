# Security + Data-loss audit fragment (249)

Auditor scope: `audit-security` (REQ-S1..S5) and `audit-data-loss` (REQ-D1..D4).
Entry commit `b56529e` (baseline green per 249 `verification.md`). Read-only audit;
the only writes were this fragment and one regeneration of the gitignored `dist/`
build artifact (documented under 249-SEC-001 evidence).

## Coverage

### Scope examined

Security:
- `src/main.ts` — bootstrap, `VITE_E2E` gating (`main.ts:31`, `main.ts:60-62`),
  fatal-error message path (`main.ts:40-43`).
- Production bundle inspection: `dist/assets/index-*.js` greps for
  `__voxelGame` / `VITE_E2E` / `__voxelQualityProfile` (dynamic evidence below).
- `playwright.config.ts:25-35` — where `VITE_E2E` is injected.
- URL-parameter surface: `seed` (`src/engine/Game.ts:1642-1652`); runtime
  `navigator.webdriver` quality override (`src/engine/Game.ts:1655-1664`).
- Storage/import validation: `src/storage/WorldArchive.ts` (`validateWorldArchive`,
  lines 85-147), `src/storage/WorldArchiver.ts` (`importWorld`, lines 94-127),
  `src/simulation/PersistentWorldCodecs.ts` (`validatePersistentUnit` 136-158,
  encode/decode 231-423), `src/storage/StorageHealth.ts` (`classifyStorageError`
  40-50), localStorage payload loads in `src/engine/Game.ts:1087-1114`.
- Supply chain: `npm audit` (recorded below).

Data-loss:
- `src/engine/Game.ts` production save path: `saveEdits`/`savePlayerState`
  (1523-1552), `onPageHide` (1483-1486, listener at 489), dispose save (519),
  corrupt-payload loads `loadSavedEdits` (1488-1498) and `loadPlayerState`
  (1500-1521), validated settings/keybinding/accessibility loads (1053-1114).
- Edit overlay eviction: `src/world/World.ts:73-80, 758-791`.
- IndexedDB stack (headless-exercised): `DirtySaveQueue.ts` (drain/requeue
  51-70), `AutosaveCoordinator.ts` (pagehide flush 66-68, 120-130),
  `ServerSaveLifecycle.ts` (all-or-nothing load 202-302, drain/requeue 407-471,
  bounded failure log 473-479), `DataMigration.ts` (chain 104-134),
  `SaveRecoveryMatrix.ts` (five-axis matrix, 381-1089), `StorageHealth.ts`
  (monitor 56-129, probe 148-184).

### Method

Static file:line review of every surface above; targeted read-only probes:
`npm audit`, production-bundle greps, one clean `npm run build` regeneration,
grep sweeps for storage wiring. Prior-change evidence cited instead of re-derived.

### Prior evidence cited

- 240 (`save-recovery-stress`) via the in-tree deterministic matrix
  `src/storage/SaveRecoveryMatrix.ts` (abrupt-close, partial-write, migration,
  quota, import-export axes; scenarios cited per finding).
- 237 network adversarial validation — out of my file set (network codecs are
  another auditor's surface); not re-derived.
- 249 baseline gate (`verification.md`): unit 292 files / 3827 passed, e2e 40/40.

### minimumMet

- security: **true** — all REQ-S1..S5 surfaces inspected with static + dynamic
  evidence. Gap: none material.
- data-loss: **true** with one honesty gap recorded as 249-DL-005: the
  transactional IndexedDB stack that REQ-D1/D3 evidence covers is **not wired
  into the shipped game**; the production save path is seed-scoped localStorage.
  REQ-D1/D3 are therefore verified at component level, not end-to-end in the
  shipped product.

## Findings

### 249-SEC-001 — Post-e2e `dist/` artifact ships an unconditional `window.__voxelGame` test hook

- id: `249-SEC-001`
- category: security
- classification: **non-blocking**
- severity: high
- confidence: confirmed
- evidenceTier: mixed
- status: open
- affected: `dist/` output directory shared by `npm run build` and
  `npm run test:e2e`; `playwright.config.ts:28-33`; `src/main.ts:31,60-62`
- description: The e2e webServer builds the "production" artifact with
  `VITE_E2E: 'true'` into the same `dist/` directory a release build uses. A
  dist produced by (or left over from) `npm run test:e2e` contains
  `window.__voxelGame=n` and the `window.__voxelQualityProfile` read with **no
  conditional guard at all** — the build-time gate was constant-folded to true.
- trigger: Anyone builds via `npm run test:e2e` (or sets `VITE_E2E` in the
  environment) and then deploys the resulting `dist/`.
- impact: Full game-state manipulation handle (teleport, block edit, inventory,
  dispose) exposed to every visitor of the deployed artifact — exactly the
  AUDIT-004 capability, reintroduced through the build pipeline rather than the
  URL.
- evidence:
  - dynamic: `grep -o ".\{400\}window.__voxelGame=n" dist/assets/index-iHr43Hja.js`
    (post-e2e artifact, built 12:33 today) shows `n.start(),window.__voxelGame=n`
    unguarded; `window.__voxelQualityProfile` also read unconditionally.
  - dynamic: `npm run build` (no `VITE_E2E`) then
    `grep -c "__voxelGame" dist/assets/index-*.js` → `0`. A clean production
    build eliminates the hook entirely (dead-code eliminated).
  - static: `playwright.config.ts:31-33` sets `env: { VITE_E2E: 'true' }` for
    the webServer whose command is `npm run build && npm run preview ...`;
    `src/main.ts:60-62` gates the hook on `import.meta.env.DEV ||
    import.meta.env.VITE_E2E === 'true'`.
- classification justification: non-blocking because no correctly produced
  release artifact (`npm run build` alone) exposes the hook — there is no
  exploit path in the canonical production build, only in a stale/mis-built
  artifact. It is high severity because the failure mode is silent and the
  remedy is procedural.
- recommendation: Build e2e artifacts into a separate `outDir` (or add a
  `clean` step / distinct mode so the release artifact can never be the e2e
  artifact); optionally assert in CI that a fresh `npm run build` bundle does
  not contain `__voxelGame`.

### 249-DL-001 — Production save path silently swallows quota/private-mode write failures

- id: `249-DL-001`
- category: data-loss
- classification: **blocking**
- severity: high
- confidence: confirmed
- evidenceTier: static
- status: open
- affected: `src/engine/Game.ts:1523-1532` (`saveEdits`), `src/engine/Game.ts:1534-1552` (`savePlayerState`)
- description: The only wired-in persistence path (localStorage edits snapshot +
  player state) wraps every write in `try { ... } catch {}` with a comment that
  errors are "non-fatal". A `QuotaExceededError` or private-mode `SecurityError`
  on `setItem` discards the flush with no log, no user-visible warning, and no
  retry; the in-memory overlay keeps playing until the tab dies, then all
  unsaved progress is gone.
- trigger: Storage quota exhausted, private/incognito browsing, or blocked
  storage at any `pagehide`/dispose flush.
- impact: Committed player progress lost silently — precisely REQ-D3's "silent
  drop is blocking" case. The user receives no signal that saves stopped
  working.
- evidence:
  - static: `Game.ts:1527-1530` empty catch ("Quota/private-mode errors are
    non-fatal"); `Game.ts:1549-1551` empty catch; contrast with the load side,
    which at least warns (`Game.ts:1106,1111`).
  - static: the 043 machinery built for exactly this (`StorageHealthMonitor`
    status/listeners, `StorageHealth.ts:56-129`) is never constructed outside
    tests/probes (see 249-DL-005).
- classification justification: genuine silent loss of committed progress on a
  reachable normal path (quota exhaustion), per the audit-data-loss invariant
  "any path that silently loses committed progress is a blocking finding".
- recommendation: Surface a persistent warning when a save fails (reuse
  `showToast`/error UI), and wire `StorageHealthMonitor` around the localStorage
  path or migrate the live game onto the 034-043 stack.

### 249-DL-002 — Edit-overlay LRU eviction still silently discards committed-but-unsaved edits (AUDIT-005 mitigated, not closed)

- id: `249-DL-002`
- category: data-loss
- classification: **blocking**
- severity: medium
- confidence: confirmed
- evidenceTier: static
- status: open
- affected: `src/world/World.ts:777-791` (`touchEditOverlay`), `World.ts:80`
  (`EDIT_OVERLAY_MAX_CHUNKS = 10_000`)
- description: Eviction deletes overlay entries outright; it does not persist
  them first, and the only flush points are `pagehide`/dispose
  (`Game.ts:489,519`). In a single session that edits more than 10,000 distinct
  chunks without an intervening pagehide, the least-recently-used chunk's edits
  are dropped from memory and will never appear in any future snapshot.
- trigger: >10,000 distinct edited chunks in one session before any
  pagehide/dispose save.
- impact: Silent loss of committed edits (player returns to find blocks
  reverted, no warning). LRU makes the victim the least-recently-touched chunk
  rather than the earliest-edited, which mitigates AUDIT-005's FIFO unfairness
  but does not eliminate the loss.
- evidence:
  - static: `World.ts:784-790` evicts via `editOverlay.delete(lruKey)` with no
    persistence; `exportEdits` iterates only surviving overlay entries
    (`World.ts:329`).
  - static: LRU access-order tracking present (`World.ts:74-77,777-782`),
    confirming AUDIT-005's recommended fix was implemented.
- classification justification: per REQ-D2 scenario "eviction never silently
  discards unsaved committed progress... if it does, the finding is blocking",
  and the spec invariant applies regardless of trigger frequency. Severity kept
  medium because the threshold (10k distinct chunks in one session) is extreme
  in practice.
- recommendation: Persist evicted chunks' edits to the save sink before delete,
  or lower the risk by flushing dirty overlay chunks incrementally.

### 249-DL-003 — Corrupt localStorage payloads fall back silently and inconsistently

- id: `249-DL-003`
- category: data-loss
- classification: non-blocking
- severity: medium
- confidence: confirmed
- evidenceTier: static
- status: open
- affected: `src/engine/Game.ts:1488-1498` (`loadSavedEdits`),
  `src/engine/Game.ts:1500-1521` (`loadPlayerState`)
- description: Both loaders catch every failure — including `JSON.parse` throws
  on a corrupt payload — with fully silent fallbacks. A corrupt edits key
  silently discards all prior edits (fresh world); a corrupt state key silently
  resets player position/inventory/survival. This is inconsistent with
  `loadStoredPayload` (`Game.ts:1106,1111`), which warns on the same condition
  for settings/keybindings/accessibility.
- trigger: Corrupt/truncated localStorage payload (partial write, external
  modification, version drift).
- impact: Loss is real but its cause precedes the app (the payload was already
  unreadable); the gap is observability, not prevention. Users get no hint their
  save was discarded.
- evidence: static citations above; `isGameSaveSnapshot` shape guard at
  `Game.ts:1558-1583` correctly rejects malformed snapshots (including
  non-finite positions and out-of-bounds Y) before use.
- classification justification: non-blocking — the fallback preserves
  playability and the corrupted data was already unusable; no code path here
  *causes* corruption. Noted explicitly because a strict reading of the spec's
  "swallowed error implies silent loss" could argue blocking; the auditor's
  judgment is that the loss event is upstream of this handler.
- recommendation: Add the same `console.warn` (and ideally a one-time toast)
  used by `loadStoredPayload`.

### 249-DL-004 — `WorldArchiver.importWorld` overwrites an existing world with no backup or existence check

- id: `249-DL-004`
- category: data-loss
- classification: non-blocking
- severity: low
- confidence: confirmed
- evidenceTier: static
- status: open
- affected: `src/storage/WorldArchiver.ts:93-127`
- description: `importWorld` validates then overwrites the target worldId's
  records ("overwriting the world's prior records", line 93) with no
  existing-world check, backup, or confirmation seam at this layer.
- trigger: Importing an archive whose `worldId` collides with an existing world.
- impact: Irreversible replacement of the target world's records — but currently
  unreachable from the shipped game: no production caller constructs
  `WorldArchiver` (grep: usages exist only in `src/storage/*` and headless
  matrices/tests), so no user can hit it today.
- evidence: static citations above; grep sweep showing no wiring outside
  `src/storage/` and test harnesses.
- classification justification: non-blocking because the destructive path has
  no production entry point; becomes blocking the moment an import UI lands
  without a guard.
- recommendation: When import is wired into UI, require explicit confirmation
  and/or export-before-overwrite.

### 249-DL-005 — Transactional IndexedDB persistence stack (034-043, 234) is not wired into the shipped game

- id: `249-DL-005`
- category: data-loss
- classification: non-blocking
- severity: high
- confidence: confirmed
- evidenceTier: static
- status: open
- affected: `src/storage/*` (repositories, `RepositorySaveSink`,
  `AutosaveCoordinator`, `StorageHealthMonitor`, `WorldArchiver`),
  `src/simulation/ServerSaveLifecycle.ts`, `src/engine/Game.ts` (localStorage path)
- description: The entire crash-safe persistence layer — five repositories,
  dirty-save queue, autosave coordinator with pagehide flush, storage-health
  gate, archiver, server save lifecycle — is exercised only by headless
  matrices/tests and the ReleasePerformanceGate probe. Grep for
  `WorldMetadataRepository|WorldArchiver|StorageHealthMonitor|AutosaveCoordinator|ServerSaveLifecycle`
  finds no construction in `src/main.ts` or `src/engine/Game.ts`; the live game
  persists exclusively through seed-scoped localStorage JSON
  (`Game.ts:1523-1552`).
- trigger: n/a (structural integration gap, not a runtime fault).
- impact: REQ-D1/D3 guarantees (transactional autosave, partial-write recovery,
  quota gating, newest-snapshot recovery) hold only for components the shipped
  product never uses; the actual player-facing durability is single-copy
  localStorage with the gaps in 249-DL-001/003. Prior-change evidence (240)
  is component-level, not end-to-end.
- evidence:
  - static: grep sweep above (no production construction sites);
    `src/main.ts` contains no storage references; `ReleasePerformanceGate.ts:750,776`
    constructs `ServerSaveLifecycle` only inside the performance probe.
  - static: `Game.ts:1526,1548` are the only production `setItem` calls.
- classification justification: non-blocking under the taxonomy because no
  additional silent-loss path beyond those already reported (DL-001/002/003) is
  introduced — but it is the root cause of DL-001 and caps the value of the
  REQ-D1/D3 evidence. Tracked forward as the highest-leverage remediation.
- recommendation: Wire the 034-043 stack into Game as the primary save path
  (with localStorage as legacy import via `LegacyLocalStorageMigrator`), or
  restate the parity plan for persistence explicitly.

### 249-SEC-002 — AUDIT-004 resolved: no URL-controlled test hook in source; capability flags are build-time only

- id: `249-SEC-002`
- category: security
- classification: non-blocking
- severity: info
- confidence: confirmed
- evidenceTier: mixed
- status: resolved
- affected: `src/main.ts:31,60-62`, `playwright.config.ts:31-33`
- description: The legacy `?e2e` URL parameter is gone from source. The hook
  gates on `import.meta.env.DEV || import.meta.env.VITE_E2E === 'true'`, and
  `VITE_E2E` is supplied only as a build-time env var in the Playwright
  webServer — never readable from query/header in production. Residual risk is
  the artifact-confusion hazard tracked separately as 249-SEC-001.
- trigger: n/a.
- impact: none in a clean production build.
- evidence:
  - static: `main.ts:57-59` comment plus gate; no `URLSearchParams` reference
    near the hook (only `seed` at `Game.ts:1643`).
  - dynamic: fresh `npm run build` bundle contains zero occurrences of
    `__voxelGame` (grep count 0, recorded under 249-SEC-001).
- recommendation: keep the CI assertion suggested in 249-SEC-001.

### 249-SEC-003 — `npm audit`: zero vulnerabilities

- id: `249-SEC-003`
- category: security
- classification: non-blocking
- severity: info
- confidence: confirmed
- evidenceTier: dynamic
- status: not-an-issue
- affected: dependency tree (274 packages)
- description: REQ-S4 supply-chain posture is clean.
- trigger: n/a.
- impact: none.
- evidence: dynamic — `npm audit` (run during this audit): "found 0
  vulnerabilities"; `npm audit --json` metadata shows total 274 packages, 0
  of any severity.
- recommendation: none.

### 249-SEC-004 — Untrusted-input surface enumeration (REQ-S1)

- id: `249-SEC-004`
- category: security
- classification: non-blocking
- severity: info
- confidence: confirmed
- evidenceTier: static
- status: not-an-issue
- affected: `src/engine/Game.ts:1642-1652` (`seed` param), `src/engine/Game.ts:1655-1664` (`navigator.webdriver`), localStorage keys, imported archives
- description: Complete surface enumeration and disposition:
  - `?seed`: parsed with `Number.isFinite` guard and `>>> 0` normalization
    (`Game.ts:1645-1650`); gates only world generation, no capability. Safe.
  - `navigator.webdriver`: reduces render/simulation distance in automated
    browsers (`Game.ts:1656-1663`). Quality downgrade only; not a capability
    gate; not attacker-useful. Info note only.
  - localStorage payloads: settings/keybindings/accessibility validated with
    deserializer fallbacks (`Game.ts:1087-1114`); player state shape-guarded
    (`Game.ts:1558-1583`); edits snapshot passed to `world.importEdits` as
    `unknown` (validated downstream in `World.importEdits`).
  - Imported archives: fully validated before first write
    (`WorldArchive.ts:85-147`; `WorldArchiver.ts:95`), foreign worldId/coords
    rejected in codecs (`PersistentWorldCodecs.ts:336-341,347-352,361-364`).
  - Network messages: covered by change 237 evidence (out of this fragment's
    file set; cited, not re-derived).
- trigger: n/a.
- impact: none found; no surface gates a capability in production without a
  build-time gate.
- evidence: static citations above.
- recommendation: none.

### 249-SEC-005 — Fatal-error message embeds raw exception text (minor information disclosure)

- id: `249-SEC-005`
- category: security
- classification: non-blocking
- severity: low
- confidence: confirmed
- evidenceTier: static
- status: open
- affected: `src/main.ts:39-43`
- description: `showFatalError` renders `err.message` (or `String(err)`) into
  the user-visible error element. Browser exception messages can include
  internal paths/symbols. No secrets or credentials are involved anywhere in
  the codebase (no tokens/network credentials exist; grep found none on these
  paths).
- trigger: Any constructor throw during bootstrap.
- impact: Cosmetic information disclosure only; no exploit-enabling secret.
- evidence: static citation `main.ts:41`.
- classification justification: non-blocking per REQ-S5 (would be blocking only
  if it revealed an exploit-enabling secret — it does not).
- recommendation: Log full detail to console; show a generic message plus the
  retry affordance already present (`main.ts:18-19`).

### 249-DL-006 — REQ-D1/D4 component guarantees verified (no finding; evidence record)

- id: `249-DL-006`
- category: data-loss
- classification: non-blocking
- severity: info
- confidence: confirmed
- evidenceTier: mixed
- status: not-an-issue
- affected: `src/storage/SaveRecoveryMatrix.ts`, `src/simulation/ServerSaveLifecycle.ts`, `src/storage/DataMigration.ts`, `src/storage/DirtySaveQueue.ts`
- description: Positive verification record for REQ-D1 and REQ-D4 at component
  level (subject to 249-DL-005's wiring caveat):
  - Partial-write crash recovery: failed writes leave no partial record and
    re-queue (`DirtySaveQueue.ts:57-66`; matrix scenarios
    `partial-write.requeue-retry`, `partial-write.atomic-per-unit`).
  - All-or-nothing load: every record decoded/validated before any restore;
    failure rolls back to `unloaded` (`ServerSaveLifecycle.ts:236-301`);
    duplicate-key ambiguity rejected (`ServerSaveLifecycle.ts:485-508`).
  - Migration runs once and is idempotent; downgrades/unknown versions refused;
    chains reject gaps/duplicates eagerly (`DataMigration.ts:61-83,104-134`;
    matrix scenarios `migration.schema-upgrade`, `migration.idempotent`,
    `migration.chain-refused-*`).
  - Export→import round-trip restores all five stores; hostile archives rejected
    atomically with stores left clean; worldId normalization prevents cross-key
    leaks (`SaveRecoveryMatrix.ts:889-949`; `WorldArchive.ts:85-147`).
  - Newest-valid recovery semantics: pending-at-kill units are absent after
    reopen and acknowledged writes survive (`abrupt-close.drain-then-kill`,
    `abrupt-close.no-partial-on-kill`, `abrupt-close.server-save-lifecycle`).
- trigger: n/a.
- impact: none.
- evidence: static citations above; these scenarios are the executable form of
  change 240's recorded matrix and run green in the baseline unit gate (3827
  passed, 249 verification.md).
- recommendation: none beyond 249-DL-005.

## Legacy reconciliation

| ID | Category | Status | Current-tree evidence |
|---|---|---|---|
| AUDIT-004 | Security | **resolved** | `?e2e` removed from source; hook gated on build-time `DEV`/`VITE_E2E` only (`src/main.ts:60-62`); flag injected solely by `playwright.config.ts:31-33`; clean prod bundle contains no `__voxelGame` (grep 0). Residual artifact hazard tracked as 249-SEC-001. |
| AUDIT-005 | Reliability/Data-loss | **persists (mitigated)** | FIFO eviction replaced by LRU (`src/world/World.ts:74-77,777-791`) as recommended, but eviction still silently drops committed-but-unsaved edits past the 10k-chunk cap — tracked as blocking finding 249-DL-002. |
| AUDIT-010 | Reliability | out of scope for this fragment (not storage/security) | World `getBlock` unloaded-chunk semantics — left to reliability/correctness auditors. |
| AUDIT-011 | Reliability | out of scope for this fragment | ResourceManager dispose isolation — reliability auditor. |
| AUDIT-012..015 | Testing | out of scope for this fragment | Test-coverage findings — correctness/architecture auditors; baseline now 292 unit files vs 76 at legacy-audit time, so materially improved. |
| AUDIT-022 | Build | **resolved** (verified although build is nominally another auditor's lane) | `.github/workflows/*.yml:47-50` caches `~/.cache/ms-playwright` keyed on `package-lock.json` via `actions/cache@v4`. |

## Summary counts

- Findings: 11 total — blocking 2 (249-DL-001, 249-DL-002), non-blocking 9.
- By status: open 7 (249-SEC-001, 249-SEC-005, 249-DL-001, 249-DL-002,
  249-DL-003, 249-DL-004, 249-DL-005), resolved 1 (249-SEC-002),
  not-an-issue 3 (249-SEC-003, 249-SEC-004, 249-DL-006).
- Coverage minimumMet: security true; data-loss true (gap recorded in DL-005).
