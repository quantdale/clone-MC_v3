# Minecraft-Parity Program State

This file is the human-readable companion to `openspec/PROGRAM_STATE.json`.

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **001-autonomous-program-control**
- Active change: **002-resource-id-foundation**
- Next queued change: **003-generic-registry-core**
- Active change completion: **0% until its task file is finalized and implementation begins**
- Advancement allowed: **No**
- Default execution mode: **Headless autonomous**
- Canonical roadmap: `MINECRAFT_PARITY_MASTER_PLAN.md`
- Canonical ordered change graph: `openspec/CHANGE_SEQUENCE.md`

## Source of truth hierarchy

When recovering from context loss, use this order:

1. Actual repository code and Git state.
2. Active change normative specs.
3. Active change `tasks.md` and `verification.md`.
4. `openspec/PROGRAM_STATE.json`.
5. This file.
6. `openspec/CHANGE_SEQUENCE.md`.
7. `MINECRAFT_PARITY_MASTER_PLAN.md` for broader product intent.
8. Prior chat/session memory only as non-authoritative context.

If two durable sources disagree, stop advancement, re-inspect implementation and tests, and reconcile the state conservatively.

## Checkpoint fields every agent must maintain

`PROGRAM_STATE.json` must be updated whenever the active task/change materially changes. It records:

- active change and status;
- last completed change;
- next change;
- completed and total task counts;
- exact completion percentage;
- mandatory-requirement gate status;
- required-test gate status;
- advancement decision;
- any advancement exception;
- last known Git HEAD when available;
- last completed task;
- next exact action;
- blockers;
- last validation results.

The active change's `verification.md` stores detailed evidence; the JSON stores only the resumable summary.

## Completion arithmetic

Task completion percentage is calculated only from checkboxes in the active change `tasks.md`:

```text
percentage = floor((completed checkboxes / total checkboxes) * 10000) / 100
```

A task is either complete or incomplete. There is no fractional checkbox credit.

## Advancement policy

### Normal path

Advance only at 100% tasks complete and all mandatory requirements/tests passing.

### Exceptional path

90-99.99% can advance only when every unfinished task is explicitly non-mandatory and the active `verification.md` contains an `Advancement Exception` proving:

- why the task cannot or should not be completed now;
- why it is not required by any MUST/SHALL statement;
- why deferral does not create correctness, persistence, security, determinism, compatibility, performance-contract, or regression risk;
- where the deferred work is tracked;
- why the next change does not depend on it.

The exception must set `advancementAllowed=true` and `exceptionUsed=true` in JSON.

### Hard blockers

Advancement is always forbidden when any of the following is true:

- completion < 90%;
- a mandatory requirement is unverified or failing;
- a required unit/integration/E2E/property/performance check fails;
- known data-loss or data-corruption risk exists;
- deterministic behavior required by the spec is not demonstrated;
- migration compatibility required by the spec is not demonstrated;
- an active blocker is required by the next change.

## Change lifecycle

Expected progression:

```text
PLANNED -> ACTIVE -> IMPLEMENTED -> VERIFYING -> VERIFIED
                     |               |
                     +-> BLOCKED <---+
```

`VERIFIED` means implementation, tests, documentation, state, and spec reconciliation are all complete.

## Resume procedure

A new session should perform exactly this sequence:

1. Read `AGENTS.md` and `openspec/AUTONOMOUS_GOAL.md`.
2. Read JSON state and this summary.
3. Open all active-change artifacts.
4. Inspect the actual code and Git state touched by the active change.
5. Re-run the active change's resume validation.
6. If state is accurate, continue the first unchecked task.
7. If state is stale, repair state before continuing.

## Compaction procedure

Before context compaction, checkpoint at a coherent boundary whenever possible. Record the next action at command/symbol granularity, for example:

> `002-resource-id-foundation`, task 2.6. `ResourceId.ts` and unit tests are complete. Next: replace stringly-typed IDs at the registry data-boundary only; do not begin generic registries. Last narrow validation: `npm test -- ResourceId.test.ts` PASS. Full suite not yet rerun.

That is the level of detail required for a fresh session to resume safely.
