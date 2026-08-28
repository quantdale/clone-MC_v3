# Review Handoff

`origin/main` is the canonical boundary between autonomous development sessions and review.

## Development session requirements

At the beginning of a session:

1. Fetch the repository and use the current `main` branch.
2. Update the local checkout to current `origin/main` without rewriting published history.
3. Record the starting commit as `session_start_head`.
4. Read the active OpenSpec state and continue only the active numbered change.

Before the final session response:

1. Update tasks, verification evidence, and program state to match actual work.
2. Run the validation required by the active change.
3. Inspect the intended diff for unrelated changes.
4. Commit the coherent session work.
5. Publish the commit(s) directly to `origin/main` using a normal push.
6. Fetch the remote again and verify `origin/main` matches the published local HEAD.
7. Record that commit as `published_head`.

If repository files changed, the session must not end with those changes only local. If no files changed, no empty commit is required; still report the verified current `main` SHA.

Do not overwrite or discard remote history to complete the handoff. If the remote moved or conflicts cannot be resolved safely, record the blocker instead.

## Required final session report

Every session result must report:

- repository: `quantdale/clone-MC_v3`
- branch: `main`
- `session_start_head`
- `published_head`
- active numbered change
- change status
- completed/total tasks and percentage
- last completed task
- next exact action
- validation commands with PASS/FAIL/BLOCKED
- blockers
- confirmation that the work is published to `origin/main`

## Review procedure

When a session result is supplied for review, GitHub is the source of truth rather than the prose summary alone.

The reviewer must:

1. Inspect current `main` on GitHub.
2. Verify the reported `published_head` exists on the repository history.
3. Compare `session_start_head` to `published_head` when both are available.
4. Inspect the actual changed files and relevant surrounding execution paths.
5. Read the active change proposal, design, tasks, normative specs, verification evidence, and program state.
6. Check every claimed completed task and MUST/SHALL requirement against implementation and tests.
7. Identify correctness bugs, spec drift, missing validation, architecture regressions, compatibility/persistence risk, later-change scope creep, and false completion claims.
8. Distinguish blocking findings from non-blocking debt.

A review concludes with one status:

- `ACCEPTED`
- `ACCEPTED WITH NON-BLOCKING FINDINGS`
- `CHANGES REQUIRED`
- `STATE INVALID`

Publication to `main` does not itself mean a change is verified. The OpenSpec advancement gate still requires the configured completion, mandatory-requirement, and validation thresholds.
