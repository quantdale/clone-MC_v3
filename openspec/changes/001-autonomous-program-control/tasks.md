# Tasks: 001-autonomous-program-control

## 1. Durable control files

- [x] 1.1 Add root `AGENTS.md` with first-read, resume, headless, scope, checkpoint, and advancement rules.
- [x] 1.2 Add `openspec/AUTONOMOUS_GOAL.md` defining the repeatable `/goal` execution loop.
- [x] 1.3 Add canonical `openspec/PROGRAM_STATE.json` and human-readable `openspec/PROGRAM_STATE.md`.
- [x] 1.4 Add `openspec/CHANGE_SEQUENCE.md` with strict numeric ordering from program control through final verification.
- [x] 1.5 Add `openspec/SPEC_AUTHORING_PROTOCOL.md` so future missing change artifacts are authored and validated before implementation.
- [x] 1.6 Strengthen `openspec/config.yaml` with narrow-scope, normative-spec, task, and verification rules.

## 2. Gate semantics

- [x] 2.1 Define one-active-change semantics and allowed lifecycle states.
- [x] 2.2 Define 100% as the target completion threshold.
- [x] 2.3 Define 90% as an exceptional minimum that cannot override failed mandatory requirements/tests.
- [x] 2.4 Define exact checkbox-based completion accounting and prohibit partial checkbox credit.
- [x] 2.5 Define required checkpoint fields for context/session recovery.
- [x] 2.6 Define behavior for stale state, unavailable mandatory validation, blockers, and spec drift.

## 3. Recovery and context-window behavior

- [x] 3.1 Establish repository state as authoritative over prior session memory.
- [x] 3.2 Establish a compact first-read sequence so normal work does not require loading the full parity master plan.
- [x] 3.3 Require actual Git/code/test inspection before trusting an optimistic checkpoint on resume.
- [x] 3.4 Require durable state updates before expected context compaction/session end.

## 4. Self-verification

- [x] 4.1 Confirm the canonical state activates `002-resource-id-foundation` and records 001 as last completed.
- [x] 4.2 Confirm the ordered sequence begins with 001 then 002 then 003.
- [x] 4.3 Confirm the spec-authoring protocol requires complete artifacts before production implementation.
- [x] 4.4 Confirm no runtime source, gameplay behavior, or save schema is changed by 001.
- [x] 4.5 Record verification evidence and final advancement decision.
