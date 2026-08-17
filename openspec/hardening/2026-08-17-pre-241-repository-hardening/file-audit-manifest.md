# Repository File Audit Manifest

Status: **TEMPLATE / 0% ACCOUNTED**

The executor MUST generate the authoritative path list from `git ls-files` at the exact hardening review SHA. Do not manually assume this template lists the repository.

A generated sibling such as `file-audit-manifest.generated.tsv` or `.json` may be used for scale, but this file MUST record the generation command, schema, totals, completeness proof, and summary. Generated evidence must be committed if required by the hardening design and must remain reviewable.

## Required row schema

| Field | Allowed/required values |
|---|---|
| `path` | exact tracked repository path |
| `category` | production / test / spec / config / script / asset / generated / docs / other |
| `integration` | integrated / intentional-dormant / dead-unreachable / n-a |
| `review` | mechanical + semantic methods actually applied |
| `findings` | comma-separated HARD-* IDs or `none` |
| `status` | audited / blocked / unreviewed |
| `evidence` | concise citation to code/test/command/report evidence |

## Completeness invariants

1. The manifest MUST contain exactly one record for every path returned by `git ls-files` for the reviewed SHA.
2. No duplicate path is allowed.
3. No tracked path may remain `unreviewed` at completion.
4. Every production/source module MUST have a non-ambiguous integration classification.
5. `intentional-dormant` requires a spec/change owner and activation condition.
6. `dead-unreachable` is a finding unless deletion is demonstrably unsafe or a governing spec intentionally retains it.
7. Every `blocked` row links a finding and blocks completion unless the relevant hardening spec explicitly permits that external gap.
8. Binary/assets still receive provenance/usage/size/integration review even when line-by-line semantic review is not applicable.
9. Generated files must identify generator/source-of-truth and prove they are not stale or hand-edited copies.
10. Manifest SHA must match the code tree it claims to audit; if tracked paths change materially during fixes, regenerate and re-review affected rows before final verification.

## Mechanical review minimum

For applicable text/code/config files, inspect for:

- parse/type/lint/build errors;
- ignored or disabled diagnostics (`@ts-ignore`, broad lint disables, unsafe `any`/casts, non-null assertions where dangerous);
- TODO/FIXME/HACK/XXX debt and placeholder/throw-only implementations;
- secret/token/private-key/password patterns and accidentally tracked local config;
- path/case/Windows-vs-Linux portability hazards;
- duplicate/conflicting definitions and stale generated files;
- unused/dead exports and modules with no production reachability;
- resource ownership/disposal and event-listener cleanup where relevant;
- unbounded loops/queues/maps/caches/listeners and cancellation gaps;
- unsafe deserialization/trust-boundary behavior where relevant.

## Semantic review depth

Semantic review cannot be replaced by grep. Review interactions and invariants at least across:

- application boot and frame/tick lifecycle;
- rendering/WebGL context and GPU resource ownership;
- input/pointer-lock/focus state;
- chunk/world lifecycle and world generation determinism;
- simulation/RNG/time/replay boundary;
- persistence/save/recovery/migration atomicity;
- networking/protocol validation/authority/reconciliation;
- worker concurrency/cancellation/message ownership;
- entities/AI/inventory/crafting/registry/data validation;
- UI/HUD/error paths/accessibility-critical controls;
- unit/E2E harness authenticity and deterministic state forcing;
- CI/toolchain/dependency configuration;
- OpenSpec/control-plane truth and evidence provenance.

## Final summary (executor fills)

Reviewed SHA: `pending`

| Metric | Count |
|---|---:|
| `git ls-files` paths | pending |
| manifest records | 0 |
| audited | 0 |
| blocked | 0 |
| unreviewed | 0 |
| integrated source modules | pending |
| intentional-dormant source modules | pending |
| dead/unreachable source modules | pending |
| findings linked | pending |

Completeness proof command/output: `pending`
