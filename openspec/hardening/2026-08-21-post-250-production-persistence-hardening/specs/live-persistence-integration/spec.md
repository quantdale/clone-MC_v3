# Spec: Live Persistence Integration

## Requirements

### PERSIST-LIVE-1 — shipped composition
The shipped game MUST construct and use one authoritative durable persistence composition. Storage components that exist only in tests, probes, or unused modules do not satisfy this requirement.

### PERSIST-LIVE-2 — no localStorage-only authority
Direct localStorage JSON writes MUST NOT remain the sole authoritative persistence mechanism for committed world edits or player progression. Legacy localStorage MAY be read for migration and MAY be retained as a compatibility source until migration is verified.

### PERSIST-LIVE-3 — lifecycle
The live composition MUST cover startup/open, load, dirty enqueue, flush/commit, pagehide/dispose, reload/recovery, and storage-health changes.

### PERSIST-LIVE-4 — truthful commit state
The game MUST distinguish in-memory/dirty, queued, committing, committed, and failed/retryable state sufficiently to prevent false durability claims.

### PERSIST-LIVE-5 — testability
Production composition MUST expose deterministic dependency/fault-injection seams without shipping an unconditional privileged test hook in release bundles.

## Verification

At least one test MUST fail if `Game`/bootstrap stops constructing the durable implementation and silently falls back to localStorage-only authority.
