# Spec: Dirty Edit Durability

## Requirements

### DIRTY-1 — no destructive dirty eviction
An in-memory cache cap MAY evict resident data, but eviction MUST NOT delete the only authoritative copy of committed unsaved edits.

### DIRTY-2 — ownership transfer
Before resident dirty data is discarded, its latest state MUST either be durably committed or atomically transferred to a bounded retry/durable queue that preserves recovery semantics.

### DIRTY-3 — ordering/version safety
Repeated edits to the same chunk across queueing, commit, unload, reload, and eviction MUST recover the newest committed logical version and MUST NOT resurrect stale edits.

### DIRTY-4 — boundedness
The implementation MUST remain bounded under sustained exploration/edit churn. Fixing DL-002 by retaining every dirty object forever is invalid.

### DIRTY-5 — >10k adversarial proof
A deterministic scenario editing more than `World.EDIT_OVERLAY_MAX_CHUNKS` distinct chunks MUST survive LRU eviction/unload and full save/reload with exact committed-edit equivalence.

## Verification

Tests must compare canonical exported/reloaded edits, not merely counts. Include repeated updates to early/LRU candidate chunks so stale-version bugs are observable.
