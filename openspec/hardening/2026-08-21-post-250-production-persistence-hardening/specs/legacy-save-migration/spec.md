# Spec: Legacy Save Migration

## Requirements

### MIGRATE-1 — copy then verify
Legacy localStorage edits/player state MUST remain untouched until the durable destination transaction commits and a read-back validation proves semantic equivalence.

### MIGRATE-2 — idempotent startup
Migration MUST be safe to run repeatedly. Already-migrated state MUST not duplicate, regress, or overwrite newer durable state.

### MIGRATE-3 — interruption safety
A crash/close between discovery, write, commit, verification, and completion-marker steps MUST leave at least one recoverable authoritative copy.

### MIGRATE-4 — corrupt source handling
Corrupt/invalid legacy data MUST NOT overwrite a valid durable save. The failure MUST be observable and the original source retained unless explicitly quarantined with reversible provenance.

### MIGRATE-5 — version compatibility
Migration MUST use existing persistent codecs/version rules where applicable and record enough migration/version state to distinguish legacy input from current durable format.

## Required tests

Cover valid migration, no-legacy startup, corrupt source, interrupted migration at each critical phase, repeated startup, already-migrated state, durable-newer-than-legacy state, and representative pre-hardening saves.
