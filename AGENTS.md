# Autonomous Development Protocol

This repository is designed to support long-running autonomous development across context compaction and completely fresh CLI sessions.

## Authoritative sources

At the start of every development session, read these files in order:

1. `AGENTS.md`
2. `openspec/AUTONOMOUS_GOAL.md`
3. `openspec/program-state.json`
4. `openspec/PROGRAM_STATE.md`
5. `openspec/CHANGE_SEQUENCE.md`
6. The active change under `openspec/changes/<number>-*/`
7. `MINECRAFT_PARITY_MASTER_PLAN.md` only when broader rationale is required.

Repository files are authoritative. Never rely on previous chat/session memory when repository state disagrees with it.

## `/goal` continuation semantics

When instructed with `/goal`, `continue`, `continue development until done`, or equivalent:

1. Load the authoritative sources above.
2. Determine `current_change` from `openspec/program-state.json`.
3. Inspect Git status / current HEAD when a local checkout is available.
4. Re-run the active change's resume validation before modifying code.
5. Continue the first unchecked, unblocked task in the active change.
6. Work headlessly. Do not ask routine confirmation questions.
7. Do not implement a higher-numbered change while a lower-numbered change is active or blocked.
8. Keep implementation, tests, specs, verification evidence, and program state synchronized.
9. Before context compaction or ending a session, checkpoint durable state as described below.
10. When a change passes its gate, mark it VERIFIED, update the state files, then proceed to the next numbered change.

## One-active-change rule

Exactly one numbered parity change may be `ACTIVE` at a time.

Allowed statuses:

- `PLANNED`
- `ACTIVE`
- `BLOCKED`
- `IMPLEMENTED`
- `VERIFYING`
- `VERIFIED`
- `DEFERRED`

`VERIFIED` is the only normal status that permits automatic advancement.

## Advancement gate

Target: **100% of the active change's tasks completed and all mandatory requirements verified.**

Absolute minimum: **90% task completion**, but 90-99% does NOT automatically permit advancement. An advancement exception is valid only when:

- every incomplete task is explicitly listed in `verification.md`;
- every incomplete task is proven non-blocking;
- no incomplete task implements or verifies a MUST/SHALL requirement;
- no required test is failing;
- no data-loss, corruption, security, determinism, compatibility, or regression risk remains unresolved;
- `advancement_allowed` is explicitly set to `true` with rationale in both `verification.md` and `program-state.json`.

Below 90%, advancement is forbidden.

Any failed MUST/SHALL requirement blocks advancement regardless of percentage.

## Task completion rules

A checkbox may be changed to `[x]` only when:

- the corresponding implementation exists;
- required tests exist and pass, or the task is itself documentation-only;
- edge/failure behavior required by the spec is covered;
- no known regression invalidates the result;
- evidence can be cited in `verification.md`.

Do not count partially completed tasks as completed.

## Mandatory validation discipline

For every change, run the change-specific checks plus the repository baseline defined by its `verification.md`. Unless a change explicitly justifies a narrower gate, the final gate should include:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

If a required command cannot run because of an external blocker, record the exact command, error, dependency, and impact. Do not fabricate a pass.

## Durable checkpoint protocol

Before ending a session, before intentional context compaction, and after every meaningful milestone:

1. Update `openspec/program-state.json`.
2. Update the active change `tasks.md` checkboxes.
3. Append/reconcile `verification.md` with actual evidence.
4. Update `openspec/PROGRAM_STATE.md` if the human-readable summary changed materially.
5. Record:
   - active change;
   - active task;
   - exact last completed task;
   - current completion percentage;
   - last validation commands/results;
   - current Git HEAD when known;
   - modified/uncommitted files when known;
   - blockers;
   - next exact action.
6. Prefer a coherent Git commit/checkpoint when the environment permits it.

A fresh agent must be able to resume without knowing anything about the prior session.

## Headless behavior

Operate without interactive UI where possible:

- use deterministic unit/integration tests;
- use Playwright headlessly;
- use generated fixtures and snapshots;
- inspect screenshots/artifacts only when necessary;
- do not wait for manual QA when automated evidence can establish the requirement.

Manual intervention is appropriate only for genuinely external constraints such as credentials, unavailable services, proprietary assets, or destructive user decisions.

## Scope discipline

The parity roadmap is intentionally decomposed into small changes. Do not opportunistically implement later roadmap features while working on an earlier primitive unless required to satisfy the active change's tests. If an unrelated defect is discovered:

- fix it immediately only if it blocks the active change or presents a critical correctness/data-loss/security issue;
- otherwise record it as follow-up debt without expanding active scope.

## Spec synchronization

If implementation reveals that an active spec is incorrect or impossible, update the active proposal/design/spec first, explain the reason, and keep the change internally consistent. Never silently diverge from the normative spec.

## Original implementation requirement

Behavioral/system parity is the target. Do not copy Mojang/Microsoft source code, proprietary textures, sounds, music, branding, or other protected assets. Use independently authored code and original/procedural assets.
