# Tasks: 273-chunksection-isempty-air-check

- [x] 1. Control plane — `CHANGE_SEQUENCE_OVERRIDES.md` 273 authorization
  (273 sole ACTIVE + final-campaign stop rule, 258 BLOCKED intact, 259–272
  VERIFIED untouched); `CHANGE_SEQUENCE.md` 273 row; full package under
  `openspec/changes/273-chunksection-isempty-air-check/` (proposal/design/
  spec/tasks/verification) passing the SPEC_AUTHORING_PROTOCOL quality gate;
  PROGRAM_STATE.json/.md ACTIVE checkpoint (currentChange=273, lastCompleted
  =272, 258 BLOCKED); `npm run validate-state` PASS.
- [x] 2. Characterization — record pre-fix misclassification evidence: a
  deserialized mono-stone payload reports `isEmpty() === true` and
  `nonAirCount() === 0` (failing-first proof, scratch vitest run or analytic
  note in verification.md).
- [x] 3. Fix — `src/world/ChunkSection.ts` `isEmpty()`: require
  `paletteSize === 1` AND the single entry is `airId` (via `storage.get(0)`);
  update class/`isEmpty`/`nonAirCount` doc comments to the air-only contract;
  `nonAirCount` logic and `PalettedContainer` untouched; `ChunkMesher.ts`
  untouched (already correct once the predicate is truthful).
- [x] 4. Unit tests — extend `tests/unit/ChunkSection.test.ts` (273 block):
  all-air true; mono-stone-payload false + 4096; mixed false + exact partial;
  single-slot false + 1; fill(air) true/0; fill(stone) false/4096;
  serialize round-trip verdict preservation (air/stone/mixed); custom-airId
  case; existing tests unchanged and green.
- [x] 5. Mesher audit — prove the fast-path skips true air (all-null streams)
  and meshes solid mono-stone (non-null opaque geometry) post-fix; record
  whether the assertion lives in the 273 block or the existing mesher suite.
- [x] 6. Risk register — R-8 marked CLOSED (isEmpty half; brewing half already
  closed by 260) with closure evidence pointer (keep R-1..R-9 numbering
  contiguous; no other row touched).
- [x] 7. Focused gate — `npm run typecheck` 0 errors, `npm run lint`
  0 errors, `npx vitest run tests/unit/ChunkSection.test.ts` green
  (incl. pre-fix failing-first run recorded).
- [x] 8. Full baseline gate — `npm test` (full unit), `npm run build`,
  `npm run test:e2e` (full suite incl. visual matrix) all green with exact
  counts; zero golden churn (or per-cell justification + re-pin);
  no 259–272 regressions; no 258 headed work.
- [x] 9. Scope audit + matrix + checkpoint — `git diff --stat` allowlist:
  production diff only in `src/world/ChunkSection.ts` (predicate + comments);
  `PARITY_MATRIX.md` C273 exact row + counts reconciled; tasks.md/
  verification.md evidence-synced; `openspec/PROGRAM_STATE.json`/`.md`
  checkpoint (273 IMPLEMENTED 9/10 pre-publish, 258
  BLOCKED intact); `validate-state` PASS; file-audit clean.
- [ ] 10. Publish + VERIFIED — commit, push `origin/main`, verify remote
  head, record `published_head`, flip `verification.md` to VERIFIED with the
  advancement-gate computation, final session report with SHAs. Then STOP —
  do not author or activate 274+.
