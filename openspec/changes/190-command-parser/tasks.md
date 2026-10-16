# Tasks: 190-command-parser

## Implementation
- [x] `src/simulation/CommandParser.ts`: `CommandArgumentType` / `CommandArgumentSpec` /
      `CommandSpec` / `CommandArgumentValue` / `ParsedCommand` / `CommandParseResult`.
- [x] Quote-aware whitespace tokenizer.
- [x] `splitCommand` (optional slash, case-insensitive name, empty → null).
- [x] `parseCommand` (typed args per grammar, arity + type checks, descriptive errors, empty → null).
- [x] `hasCommandPermission` (`level >= required`).

## Tests
- [x] `tests/unit/CommandParser.test.ts`: split (slash/no-slash/case/trim/empty).
- [x] String args; optional boolean args; target + numeric args (ints and floats).
- [x] Quoted string args (double and single).
- [x] Case-insensitive command names.
- [x] Unknown command; missing args (correct positional error); unexpected args.
- [x] Type mismatches (boolean 'yes', float 'abc').
- [x] Empty input → null.
- [x] Permission levels (2 vs 2, 4 vs 2, 1 vs 2, 0 vs 0).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2499/2499 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 191-core-commands).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
