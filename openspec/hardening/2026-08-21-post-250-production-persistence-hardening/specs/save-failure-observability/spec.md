# Spec: Save Failure Observability and Recovery

## Requirements

### SAVE-FAIL-1 — no silent failure
Any production persistence failure for committed world/player progress MUST be detected. Empty catches that discard the failure are forbidden.

### SAVE-FAIL-2 — preserve retryable data
On quota, unavailable/security-equivalent, transaction abort, or transient unknown failure, the latest unsaved state MUST remain recoverable for retry when technically possible.

### SAVE-FAIL-3 — user-visible health state
A failed save MUST produce a persistent user-visible durability warning/status. Console logging alone is insufficient. The warning MUST clear only after a later verified durable commit restores healthy state.

### SAVE-FAIL-4 — bounded retry
Retry bookkeeping MUST be bounded and idempotent and MUST NOT leak listeners, callbacks, promises, or unbounded snapshots under repeated failure.

### SAVE-FAIL-5 — no false success
UI/state/telemetry hooks MUST NOT report a save as successful before the durable sink confirms the commit.

## Required tests

Fault-inject quota, unavailable/security-equivalent storage, transaction abort, repeated failures, and recovery. Assert dirty-state retention, visible health state, bounded resources, and eventual correct reload after recovery.
