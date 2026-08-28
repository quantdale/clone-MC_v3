# Remediation Matrix

| Finding | Current production evidence | Required remediation | Required proof |
|---|---|---|---|
| 249-DL-001 | `Game.saveEdits` and `savePlayerState` catch storage failures without signal/retry | durable production save path + structured failure + retained dirty state + user-visible save-health state + recovery | fault-injected quota/unavailable/retry tests and browser E2E |
| 249-DL-002 | `World.touchEditOverlay` deletes LRU entry when cap exceeded | separate resident-cache eviction from dirty durability ownership; never delete sole dirty copy | >10k distinct edited chunks, eviction/unload, save/reload, exact edit equality |
| 249-DL-005 | transactional IndexedDB/storage stack exists but shipped game uses localStorage | construct/use durable stack in production composition or equivalent satisfying same guarantees | production composition test + real browser save/reload + fault matrix |
| 249-DL-003 | corrupt legacy payload can silently fall back | make corruption observable and migration/recovery explicit | corrupt payload tests + user-visible state where data cannot be recovered |
| 249-DL-004 | import can overwrite existing world at component layer | if import is made reachable, guard/backup/confirm; otherwise preserve unreachable classification with tests | integration evidence |
| 249-SEC-001 | E2E build can leave test hook in shared dist artifact | ensure release build artifact cannot inherit E2E hook | clean/release bundle assertion |

## Closure semantics

`resolved` means current production code and tests eliminate the finding's failure mode under its stated trigger. `accepted`, `deferred`, `rare`, `extreme`, `documentation-only`, or `post-release` do not close DL-001/DL-002/DL-005 for this campaign.

If implementation reveals that the existing 034-043/234 stack cannot safely serve the browser game, amend `design.md` before replacing it. The replacement must meet or exceed the same durability, atomicity, recovery, health, and migration guarantees.
