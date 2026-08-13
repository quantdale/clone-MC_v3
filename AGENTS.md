# Autonomous Development Protocol

This repository supports long-running autonomous development across context compaction and fresh CLI sessions.

## Read first

Every development session MUST read, in order:

1. `AGENTS.md`
2. `openspec/AUTONOMOUS_GOAL.md`
3. `openspec/PROGRAM_STATE.json`
4. `openspec/PROGRAM_STATE.md`
5. `openspec/CHANGE_SEQUENCE.md`
6. `openspec/CHANGE_SEQUENCE_OVERRIDES.md`
7. all files in the active numbered change
8. `openspec/SPEC_AUTHORING_PROTOCOL.md` if the next numbered change is not fully specified
9. `MINECRAFT_PARITY_MASTER_PLAN.md` only when broader rationale is needed

Repository state is authoritative. Previous chat/session memory is not.

## `/goal` behavior

When told `/goal`, `continue`, or `continue development until done`:

- read the sources above;
- recover `currentChange` from `PROGRAM_STATE.json`;
- resolve any numbered-directory rename through `CHANGE_SEQUENCE_OVERRIDES.md`;
- inspect actual Git/code state;
- rerun the active change's resume checks;
- continue the first unchecked, unblocked task;
- work headlessly and do not ask routine confirmation questions;
- never implement a higher-numbered change while a lower-numbered change is incomplete;
- keep code, tests, specs, tasks, verification, and state synchronized;
- if the next change lacks full artifacts, author and validate them using `SPEC_AUTHORING_PROTOCOL.md` before touching production code;
- checkpoint durable state before ending or before expected context compaction.

## One active change

Exactly one numbered parity change may be `ACTIVE`. Normal lifecycle:

`PLANNED -> ACTIVE -> IMPLEMENTED -> VERIFYING -> VERIFIED`

`BLOCKED` may interrupt that flow. `VERIFIED` is the normal prerequisite for advancing.

## Advancement gate

Target **100%** task completion plus all mandatory requirements and tests passing.

The absolute floor is **90%**, but 90-99.99% may advance only through an explicit `Advancement Exception` in `verification.md` proving every incomplete task is non-blocking and implements/verifies no MUST/SHALL requirement. Required tests must pass and no unresolved data-loss, corruption, determinism, compatibility, security, or regression blocker may remain.

Below 90%, or with any failed/unverified MUST/SHALL requirement, advancement is forbidden.

## Checkbox rule

Mark a task `[x]` only when its implementation exists, required tests/evidence pass, edge/failure behavior required by the spec is covered, and no known regression invalidates it. Partial work receives no checkbox credit.

## Baseline verification

Unless the active change explicitly and validly requires more, the final gate includes:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Never fabricate evidence. Record exact blockers when a mandatory command cannot run.

## Durable checkpoint

After meaningful task groups, failures/blockers, successful verification, before changing numbered changes, and before ending/compaction:

1. update `openspec/PROGRAM_STATE.json`;
2. update active `tasks.md`;
3. update active `verification.md` with actual evidence;
4. update `openspec/PROGRAM_STATE.md` when the human summary changes;
5. record active task, last completed task, completion %, validations, Git HEAD when known, modified files when known, blockers, and the next exact action.

A fresh agent must be able to resume from repository files alone.

## Scope discipline

Do not opportunistically implement later roadmap features. Fix unrelated work only when it blocks the active change or is an urgent correctness/integrity issue; otherwise track it for the appropriate later change.

If implementation shows the active spec is wrong, amend the active proposal/design/spec first and explain the reason. Never silently diverge from normative requirements.

## Original implementation

Target behavior and systems parity using independently authored code and original/procedural assets. Do not copy proprietary source code or assets.
