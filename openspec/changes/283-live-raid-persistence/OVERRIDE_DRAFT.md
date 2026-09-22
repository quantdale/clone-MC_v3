# OVERRIDE_DRAFT — ADDENDUM for openspec/CHANGE_SEQUENCE_OVERRIDES.md

> DRAFT ONLY. Do not paste this into the live `openspec/CHANGE_SEQUENCE_OVERRIDES.md` from
> branch `wt/283-live-raid-persistence`. Apply this snippet on `origin/main` at activation,
> after Change 282 is VERIFIED, alongside the `CHANGE_SEQUENCE.md` row and `PROGRAM_STATE`
> update.

## 283-live-raid-persistence activation — sequential non-GPU continuation (after 282 VERIFIED)

The product owner (Standing owner order, campaign through 300) authorizes activating
**283-live-raid-persistence** as the sole ACTIVE implementation change after published
Change **282-live-raid-feedback** is VERIFIED, while Change **258** remains **BLOCKED** and
Changes **259–282** remain **VERIFIED**.

- Change 258 stays BLOCKED at 40/100; no headed FPS/GPU work, no fake GPU evidence, and 258
  MUST NOT be marked VERIFIED by the 283 track.
- Changes 259–282 stand VERIFIED and MUST NOT be reopened unless a raid-persistence regression
  blocks the 283 path. 282's ephemeral feedback projection and `getRaidState()` contract are
  preserved byte-for-byte; 283 only adds the durable store behind that seam.
- Change 283 (`283-live-raid-persistence`) is authorized to: persist Game-owned `RaidState`
  under world-scoped `__raid__:<worldId>` via `serializeRaid`/`deserializeRaid`; hydrate and
  save at boot/autosave/dispose/pagehide with existing persistence guards; delete on reset;
  carry optional `raidData` through `WorldArchive`/`WorldArchiver` with fail-closed pre-write
  validation; degrade corrupt runtime payloads to null without partial writes; and prove
  reload/reset/archive behavior with unit + browser E2E.
- 283 MUST NOT register or spawn raider entities, detect settlements, acquire bad omen,
  redesign 282's HUD, or perform Change 258 headed work.
- Package source: `openspec/changes/283-live-raid-persistence/` (authored on
  `wt/283-live-raid-persistence` as SPEC-FIRST draft; live control-plane files are edited only
  at activation).
