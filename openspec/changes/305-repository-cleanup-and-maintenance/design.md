# Design: 305-repository-cleanup-and-maintenance

## Context/current state

Measured at session start `4323007f2e517ddeb5665f1f93faf295baf17fe1` (origin/main verified
equal after `git fetch --all --prune`).

### Toolchain

```
$ npm audit --json | jq '.vulnerabilities | to_entries[] | "\(.key) \(.value.severity) \(.value.range)"'
@vitest/mocker              moderate  <=4.1.11
@vitest/coverage-v8         moderate  2.1.0-beta.1 - 4.1.11
vitest                      moderate  2.1.0-beta.1 - 4.1.11
vite                        high      <=6.4.3
typescript-eslint chain     moderate  <=8.72.2
minimatch                   moderate  7.0.0 - 11.0.0
```

`package.json` declared `vite ^6.4.3`, `vitest ^4.1.11`, `@vitest/coverage-v8 ^4.1.11`,
so the installed tree sat at `vite 6.4.3` — inside the published high-severity
`launch-editor`/middleware ranges. The CI `gate` job's last step is
`npm audit --audit-level=high`, and canonical run `39806388101` (the push of the
current tip) **failed on that step**: `4 vulnerabilities (3 moderate, 1 high)`.

### Duplicated on-disk change package

```
$ diff -rq openspec/changes/256-production-readiness-hardening \
           openspec/changes/archive/2026-08-31-256-production-readiness-hardening
(no output — byte-identical: proposal, design, tasks, verification, specs/*)
```

The live copy was created by activation commit `ad75b651`; the archive copy was
created when the change closed (`309448a1`). Nothing rewrote the live copy, so two
copies of the same change exist and `PARITY_MATRIX.md` cites the live path.

### Obsolete Playwright config

```
$ git grep -l playwright.253
openspec/changes/archive/2026-08-29-253-live-world-architecture-convergence/verification.md
openspec/hardening/2026-08-23-exhaustive-repository-certification/file-audit-manifest.json
$ git grep -n playwright.253 -- package.json .github tests scripts
(no matches)
```

`playwright.253.config.ts` differs from `playwright.config.ts` only in the preview
port (4174 vs 4173), a duplicated `--expose-gc` flag, and comments. No test, script
or workflow consumes it; the archived 253 narrative is the only prose reference.

### Unenforced orphan gate

```
$ node scripts/orphan-check.mjs
Source files: 385
Files with zero internal importers (potential entry/dormant): 3
  - src/main.ts
  - src/rendering/MeshWorkerEntry.ts
  - src/worldgen/WorldgenWorkerEntry.ts
$ node scripts/orphan-check.mjs >/dev/null; echo $?
0
```

The script has no allow-list constant and calls `process.exit` nowhere, so any
future orphan also exits 0. `ONBOARDING.md` §7 row 8 claims "allow-list: the three
real entry points" — a claim the program does not implement.

### Dead exports (whole-repository census)

Method: extract every `export class/function/const/interface/type/enum` from `src/`,
then count whole-word occurrences across `src/`, `tests/`, `scripts/` (excluding
`openspec/`). Symbols whose only occurrence is their own declaration line:

| symbol | file | openspec mentions |
|---|---|---|
| `aoPatternId` | `src/rendering/GreedyMesher.ts` | 0 |
| `translucentSortKeys` | `src/rendering/TranslucentGeometry.ts` | 0 |
| `partitionQuadsByStream` | `src/rendering/TranslucentGeometry.ts` | 0 |
| `QUEUE_KINDS` | `src/rendering/RenderPerformanceMonitor.ts` | 0 |
| `ATLAS_SIZE` | `src/rendering/TextureAtlas.ts` | 0 |
| `UNPOWERED_WIRE_POWER` | `src/simulation/RedstoneWire.ts` | 0 |
| `chunkLifecycleName` (+ private `CHUNK_LIFECYCLE_NAMES`) | `src/world/ChunkStatus.ts` | 0 |
| `worldXToSection`, `worldZToSection` | `src/world/WorldCoordinates.ts` | 0 |
| `computeSkullExplosion`, `isProtectedBlock`, `skullExplosionEntityDamage` (+ private `isProtectedWrapped`) | `src/simulation/WitherSkull.ts` | 0 |
| `isWitherArmored` | `src/simulation/WitherBoss.ts` | 0 |
| `WITHER_MAX_SKULLS` | `src/simulation/WitherBoss.ts` | 0 |
| `WITHER_RECORD_VERSION` | `src/simulation/WitherBoss.ts` | 0 |
| `LAYER_TO_STREAM`, `streamForRenderLayer` | `src/rendering/RenderLayer.ts` | 0 |

`LAYER_TO_STREAM`/`streamForRenderLayer` were found during implementation, after the
first census: they were the only consumers of the `MeshStreamName` import in
`RenderLayer.ts`, and once `partitionQuadsByStream` (their sole caller) was removed
nothing imported `streamForRenderLayer` either. The live meshing path resolves
streams through `QuadOpaqueFaceQuad.renderStream` and `WorkerMeshing`'s
`isMeshStreamName`/`MESH_STREAM_NAMES`, so the 061/063 layer-to-stream table was an
unused parallel mapping. It is removed together with its type import.

Three of the table's entries are not "delete" but "make authoritative" cases, because
a live path re-implements them inline:

* `isWitherArmored` duplicates `WitherBoss.damageWither`'s inline
  `state.bossState.phaseIndex === 1 || (state.bossState.health / definition.maxHealth) <= WITHER_ARMORED_THRESHOLD` (line 384).
* `WITHER_MAX_SKULLS = 12` duplicates `Game.ts:406 const WITHER_SKULL_CAP = 12`.
* `WITHER_RECORD_VERSION = 1` duplicates the literal `v: 1` in `SerializedWither`
  and the `v: 1` written by `serializeWither`.

The skull-explosion trio is different: `Game.applyWitherExplosion` (line 4351)
implements the same policy inline (air excluded, bedrock + nether portal excluded,
resistance sentinel, cap 32, distance-scaled player damage). The trio is the
abandoned alternate implementation and its `isProtectedWrapped` helper relies on an
`as unknown as { isProtected?: (s:S)=>boolean }` escape — dead code with a type
hole. Deleting it removes the hole rather than preserving it.

### Duplicated helpers

```
$ git grep -c promisifyRequest -- src/storage
BlockEntityRepository.ts:5   ChunkEditRepository.ts:5   ChunkSectionRepository.ts:5
EntityRepository.ts:5        PlayerStateRepository.ts:5 WorldMetadataRepository.ts:34
$ git grep -c awaitRequest -- src/storage/GamePersistence.ts   -> 21 (1 decl + 20 calls)
$ git grep -c isFinitePosition -- src/simulation              -> MovementAuthority 4, MovementReconciler 3
$ git grep -c isValidRelativePath -- src/data                 -> DataPackManifest 2, ResourcePackManifest 2
$ git grep -c emptyGamepad / disconnectedGamepadFrame
  InputCoordinator.ts:3 / InputWiring.ts:2   (identical bodies)
```

Every `promisifyRequest` body is byte-identical
(`req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error instanceof Error ? req.error : new Error('IndexedDB request failed'))`),
and `awaitRequest` in `GamePersistence` is the same body under a different name.

### Parity record drift

`PARITY_MATRIX.md` declares "one row per numbered change 001–297" and "every
numbered change 001–297 appears in exactly one row", while
`openspec/PROGRAM_STATE.json` records 298, 299, 300, 301, 302, 303 and 304 as
VERIFIED. `grep -c 304 PARITY_MATRIX.md` = 0. `scripts/validate-state.mjs` only
bijects 001–250, so nothing caught it.

## Target state

1. Locked toolchain: `vite ^6.4.6`, `vitest ^4.1.12`, `@vitest/coverage-v8 ^4.1.12`;
   `npm audit --audit-level=high` exit 0 with only the dev-only `minimatch`
   advisories (no high, no critical); `npm audit --omit=dev` exit 0.
2. `src/` contains no exported runtime symbol with zero consumers except those
   named as contracts in OpenSpec design artifacts.
3. Exactly one `promisifyRequest` implementation, one `isFinitePosition`, one
   `isValidRelativePath`, one empty-gamepad factory.
4. One on-disk copy of change 256 (the archived one); no `playwright.253.config.ts`.
5. `scripts/orphan-check.mjs` fails closed on an unexpected orphan and passes on the
   three documented entry points, with the allow-list pinned by a unit test.
6. `PARITY_MATRIX.md` bijects C001–C304, its summary counts agree, and every row
   cites a VERIFIED artifact.
7. `ONBOARDING.md` names the actually-locked coverage provider version.
8. The file-audit manifest is a bijection with `git ls-files` on the published tree.

## Invariants

* No `src/**` runtime behaviour change: every deletion removes a symbol nothing
  calls; every consolidation replaces N identical bodies with 1 identical body.
* No golden change: `git diff --numstat -- tests/visual-golden/` MUST be empty.
* No threshold change: `vitest.config.ts` floors stay 91/88/94/93.
* No test deletion: the unit file count MUST NOT decrease; any removed test must
  correspond to a removed unit of behaviour (none is planned).
* `npm ci` stays the only install; `package-lock.json` is the single source of
  installed versions.

## API and data model

New shared modules (each a single responsibility, no new dependency):

```ts
// src/simulation/MovementGuards.ts
export interface Position { readonly x: number; readonly y: number; readonly z: number; }
export function isFinitePosition(value: unknown): value is Position;

// src/data/PackManifestPaths.ts
export function isValidRelativePath(path: unknown): path is string;
```

Both movement modules switch to
`import { isFinitePosition, type Position } from './MovementGuards'; export type { Position };`
so the existing import sites (`tests/unit/MovementAuthority.test.ts`,
`tests/unit/MovementReconciler.test.ts`) keep working unchanged.

`WorldMetadataRepository.promisifyRequest` becomes `export function`; five sibling
repositories and `GamePersistence` import it. `InputCoordinator` gains
`export function emptyGamepad()`; `InputWiring` imports it and drops its local copy.

## Control/data flow

Unchanged. The consolidated helpers are pure promise adapters and pure predicates;
their call sites keep the same arguments and the same awaited results.

## Detailed behavior

### Orphan gate semantics

```
allow-list = ['src/main.ts', 'src/rendering/MeshWorkerEntry.ts', 'src/worldgen/WorldgenWorkerEntry.ts']
orphans   = git ls-files src | *.ts (not *.d.ts) with zero internal importers
unexpected = orphans - allow-list
if unexpected.length > 0 -> print each, exit 1
else -> print the census, exit 0
```

`src/main.ts` is loaded by `index.html`; the two worker entries are loaded by
`new Worker(new URL(...))` construction and are therefore genuinely importer-free.

### Parity matrix rows

Seven new rows `C298`–`C304`, each citing its `openspec/changes/<dir>/verification.md`
(VERIFIED) plus the capability spec directory. Summary table:
`exact` 283 → 290, `Total rows` 299 → 306, and the "Change-rows-only split" line
updated (exact 282 → 289, total 297 → 304). The coverage statement changes from
"001–297" to "001–304".

## Failure modes

| Failure | Behaviour |
|---|---|
| A future source file has no importer | `verify:orphans` exits 1 naming the file (new gate behaviour) |
| A future dev-toolchain advisory crosses high | `npm audit --audit-level=high` fails CI (unchanged) |
| A deleted export is still needed | `tsc --noEmit` fails with "Cannot find name"; `noUnusedLocals` catches leftovers |
| An import path breaks | `verify:orphans` fails (0 importers) and `typecheck` fails |

## Compatibility/migration

No stored data or schema change. `SerializedWither.v` keeps the literal value `1`
through `typeof WITHER_RECORD_VERSION`, so persisted wither records still parse.
No public package surface exists (`"private": true`).

## Performance/resource constraints

Removing dead exports cannot increase bundle size; it slightly decreases it.
Consolidating helpers removes six duplicate function bodies from the module graph
(the bundler had already deduplicated, so runtime bytes are unchanged).

## Testing seams

* `tests/unit/VerificationGateWiring.test.ts` gains the orphan-gate contract:
  allow-list contents, exit-0 on the real tree, exit-1 on a synthetic orphan created
  in a temporary root.
* `tests/unit/MovementAuthority.test.ts` / `MovementReconciler.test.ts` already pin
  `isFinitePosition` through the public API (non-finite/null payload rejection).
* `tests/unit/ToolchainReproducibility.test.ts` pins the lockfile/installed
  agreement through `verify:deps`.
* Existing storage suites (`RecoveryBackupAndAtomicReset`, `SaveRecoveryMatrix`,
  `WorldArchive`, `DirtySaveQueue`) exercise every consolidated `promisifyRequest`
  call site through the mocked IDB factory.

## Observability/debugging

`verify:orphans` prints the reviewed allow-list and the unexpected set separately, so
a failure names the offending file rather than a count.

## Affected files/symbols

Delete/modify:

* `src/rendering/GreedyMesher.ts` (`aoPatternId`)
* `src/rendering/TranslucentGeometry.ts` (`translucentSortKeys`, `partitionQuadsByStream`)
* `src/rendering/RenderPerformanceMonitor.ts` (`QUEUE_KINDS`)
* `src/rendering/TextureAtlas.ts` (`ATLAS_SIZE`)
* `src/simulation/RedstoneWire.ts` (`UNPOWERED_WIRE_POWER`)
* `src/world/ChunkStatus.ts` (`chunkLifecycleName`, `CHUNK_LIFECYCLE_NAMES`)
* `src/world/WorldCoordinates.ts` (`worldXToSection`, `worldZToSection`)
* `src/simulation/WitherSkull.ts` (three exports + `isProtectedWrapped`, and the now
  unused `ExplosionCore` imports)
* `src/simulation/WitherBoss.ts` (use `isWitherArmored` at the damage site)
* `src/engine/Game.ts` (import `WITHER_MAX_SKULLS` instead of a local cap)
* `src/storage/{BlockEntity,ChunkEdit,ChunkSection,Entity,PlayerState}Repository.ts`
  and `GamePersistence.ts` (import `promisifyRequest`)
* `src/storage/WorldMetadataRepository.ts` (export `promisifyRequest`)
* `src/simulation/{MovementAuthority,MovementReconciler}.ts` (shared guard)
* `src/data/{DataPackManifest,ResourcePackManifest}.ts` (shared path validator)
* `src/simulation/{InputCoordinator,InputWiring}.ts` (shared empty gamepad)
* `scripts/orphan-check.mjs`
* `tests/unit/VerificationGateWiring.test.ts`
* `package.json`, `package-lock.json`
* `PARITY_MATRIX.md`, `ONBOARDING.md`, `vitest.config.ts` (stale provider comment)
* `openspec/hardening/2026-08-23-exhaustive-repository-certification/file-audit-manifest.json`
* `openspec/PROGRAM_STATE.json`, `openspec/PROGRAM_STATE.md`,
  `openspec/CHANGE_SEQUENCE.md`, `openspec/CHANGE_SEQUENCE_OVERRIDES.md`

Delete:

* `openspec/changes/256-production-readiness-hardening/`
* `playwright.253.config.ts`

## Rejected alternatives

* **Upgrade `typescript-eslint` to clear the `minimatch` moderates.**
  `8.72.2` is the latest version that exists on the registry; the advisory range is
  `<=8.72.2`, so no release fixes it. Waiting is the only option, and the
  repository's documented policy blocks high/critical only.
* **Delete `tests/visual-golden/win32-local/`** (the duplicate 60-PNG set). Change
  300 T13 explicitly decided to retain it: it is the only set a Windows contributor's
  local matrix run can compare against, and its refresh trigger is enforced by the
  CI staleness check. Deleting would turn every local Windows matrix run red.
* **Delete the historical audit/planning documents at the root** (`FULL_AUDIT_REPORT.md`,
  `NEXT_CAMPAIGN.md`, `MASTER_PLAN.md`, `prompt.txt`, `deep review resolve.txt`).
  They are cited by OpenSpec packages and `PARITY_MATRIX.md`; the campaign rule is
  "do not delete documentation merely because it is historical".
* **Rewrite `src/engine/Game.ts`** (7.5k lines, ~300 members). Real debt, but a
  large risky programme outside this change's scope; tracked as the next candidate.
* **`npm audit fix --force`** (would move majors including `vite` 7/8 and `vitest`
  5, invalidating the provider-calibrated coverage floors). Patch-level moves only.

## Downstream dependencies

`PARITY_MATRIX.md` is read by `scripts/validate-state.mjs`; the matrix edit must keep
the 001–250 bijection, the two `MP-*` rows, and the summary-count agreement intact.
`ONBOARDING.md` is the documented gate catalogue consumed by
`tests/unit/VerificationGateWiring.test.ts` (script-name assertions only).
