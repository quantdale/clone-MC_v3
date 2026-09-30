# Design: 298-verification-portability-eol-and-source-guards

## Context/current state

The repository declares its stack as TypeScript + Vite + Vitest + Playwright and
runs its browser gate on `ubuntu-latest` in GitHub Actions. The verification
loop documented in `AGENTS.md` requires an implementing agent to run
`npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and
`npm run test:e2e` locally before it may claim a change verified.

Two facts break that loop on the authoring platform:

1. **There is no `.gitattributes`.** The authoring host runs
   `core.autocrlf=true`, so 2661 of 2939 tracked text files are checked out CRLF.
   CI checks out LF. The repository therefore has two different byte sequences
   for the same commit depending on who runs the gate.
2. **Eight unit suites read production source as text and assert on anchors
   that embed `\n`.** Those assertions are, by construction, satisfiable on one
   platform and unsatisfiable on the other.

Measured at base `2ecf781`:

```
$ git config core.autocrlf
true
$ ls .gitattributes
ls: cannot access '.gitattributes': No such file or directory
$ file src/engine/Game.ts
src/engine/Game.ts: JavaScript source, Unicode text, UTF-8 text, with CRLF line terminators
$ node -e "const s=require('fs').readFileSync('src/engine/Game.ts','utf8');
           console.log((s.match(/\r\n/g)||[]).length, (s.match(/[^\r]\n/g)||[]).length)"
7381 0
```

```
$ npm test
Test Files  2 failed | 474 passed (476)
     Tests  2 failed | 5711 passed | 1 skipped (5714)

FAIL tests/unit/LiveSplashPotion.test.ts > Game splash potion source guards (295)
     > tick 5.10 steps potions after the raid and patrol ticks
     AssertionError: expected -1 to be greater than -1

FAIL tests/unit/LiveStatusEffectPersistence.test.ts > Game source guards (292)
     > fixed tick counts the omen down beside the status-effect tick
     AssertionError: expected 'import * as THREE from 'three';\r\n…' to match
       /this\.playerEffects\.tick\(dt\);\n\s*\/\/ 292[^\n]*\n\s*this\.tickBadOmenDuration\(dt\);/
```

The affected reader sites and their anchor counts (measured by normalising the
test files themselves and counting `\n`-bearing string literals):

| Test file | Reader line(s) | Anchors |
|---|---|---|
| `tests/unit/RaiderRenderer.test.ts` | 298–299 | 94 |
| `tests/unit/LiveSplashPotion.test.ts` | 233–235 | 81 |
| `tests/unit/LiveStatusEffectPersistence.test.ts` | 287 | 74 |
| `tests/unit/LiveRaidEscalation.test.ts` | 275 | 70 |
| `tests/unit/LivePeriodicStatusEffects.test.ts` | 238 | 62 |
| `tests/unit/LivePillagerPatrol.test.ts` | 206 | 49 |
| `tests/unit/LiveWitchGunpowderDrops.test.ts` | 216 | 49 |
| `tests/unit/SplashPotionRenderer.test.ts` | 102–103 | 45 |

Why the assertions exist: `src/engine/Game.ts` is a 7381-line DOM-bound
aggregate with no headless harness, so wiring cannot be exercised in a unit
test. The suites therefore build a real behavioural harness for the *pure*
subsystem and then verify the `Game` composition by reading its text. That is a
defensible compromise for wiring, but the current anchors are stricter than the
behaviour they intend to protect, in two ways:

* they encode the line-ending convention of the CI platform, and
* they encode **comment text** (`// 5.8`, `// 5.10`, `// 6. Survival`, `// 292`)
  that carries no semantics.

## Target state

Three properties hold simultaneously:

1. **Platform independence.** A checkout's line endings are declared by
   `.gitattributes`, so every contributor, CI, and the committed goldens see the
   same bytes.
2. **One normalisation seam.** A single `readSource()` helper owns CRLF→LF, and
   every source-reading test uses it.
3. **Structural anchors.** Wiring assertions name the enclosing method by
   signature and then compare identifier positions, so they are unaffected by
   whitespace, line endings and comment edits — but still fail on a genuine
   reordering.

## Invariants

- `npm test` count and result set are identical on LF and CRLF checkouts.
- Comment-only edits to any `src/` file leave every test result unchanged.
- `*.png` blobs are byte-identical before and after the change.
- No file under `src/` is modified.
- The shared helper throws on unreadable files; it never returns `''`.

## API and data model

New test-only module:

```ts
// tests/support/sourceText.ts
export function readSource(absolutePath: string): string;   // CRLF -> LF
export function methodBody(src: string, signature: string): string;
export function countOccurrences(haystack: string, needle: string): number;
```

`methodBody` extracts a class-method body by locating the signature and
brace-matching to its closing brace, so callers stop needing to hand-write
`// section` anchors. `countOccurrences` supports the "exactly once" half of an
ordering assertion.

`methodBody` MUST be brace-aware rather than regex-based: `Game.ts` contains
object literals, template strings and nested braces inside the methods these
suites inspect, so a naive `{[^}]*}` extraction truncates. The implementation
MUST skip over string literals, template literals and comments while counting
brace depth, and MUST throw a named error when the signature is absent or the
braces do not balance.

## Control/data flow

```
test file ──▶ readSource(path) ──▶ raw text
                                  │
                                  ├─ .replace(/\r\n/g,'\n')
                                  │
                                  └─▶ methodBody(src, signature)
                                        │
                                        ├─ locate signature index
                                        ├─ scan forward, tracking brace depth,
                                        │  skipping string/template/comment spans
                                        └─ return balanced body substring
                                             │
                                             ├─ countOccurrences(body, id)
                                             └─ indexOf ordering comparisons
```

## Detailed behavior

### `.gitattributes`

```
* text=auto eol=lf
*.png binary
*.jpg binary
*.webp binary
*.ico binary
*.woff binary
*.woff2 binary
```

Rationale for `eol=lf` over `eol=crlf` on Windows: CI, the committed golden
pipeline, the source-text assertions and `git diff` review all assume LF.
Normalising once in-repository is strictly more reproducible than depending on
per-machine `core.autocrlf`.

### Renormalisation

```
git add .gitattributes
git add --renormalize .
```

The resulting commit is content-neutral. Two independent proofs are required
before pushing:

```
git diff -w --stat HEAD~1..HEAD
git diff --ignore-all-space --numstat HEAD~1..HEAD
```

Both MUST show no changed file other than `.gitattributes` and the named test
files.

### Assertion rewrite — splash potion tick ordering

Before (fails on CRLF, coupled to comments):

```ts
const raid    = game.indexOf('    this.tickRaidFeedback();\n    // 5.8');
const patrol  = game.indexOf('    this.tickPillagerPatrol();\n    // 5.10');
const potions = game.indexOf('    this.tickSplashPotions();\n\n    // 6. Survival');
```

After:

```ts
const body = methodBody(game, 'private runFixedTick(');   // signature chosen from Game.ts
expect(countOccurrences(body, 'this.tickRaidFeedback();')).toBe(1);
expect(countOccurrences(body, 'this.tickPillagerPatrol();')).toBe(1);
expect(countOccurrences(body, 'this.tickSplashPotions();')).toBe(1);

const raid    = body.indexOf('this.tickRaidFeedback();');
const patrol  = body.indexOf('this.tickPillagerPatrol();');
const potions = body.indexOf('this.tickSplashPotions();');
expect(raid).toBeGreaterThanOrEqual(0);
expect(patrol).toBeGreaterThan(raid);
expect(potions).toBeGreaterThan(patrol);
```

The implementing agent MUST read the actual fixed-tick method signature from
`src/engine/Game.ts` rather than assuming the one shown here.

### Assertion rewrite — omen countdown ordering

Before:

```ts
expect(src).toMatch(/this\.playerEffects\.tick\(dt\);\n\s*\/\/ 292[^\n]*\n\s*this\.tickBadOmenDuration\(dt\);/);
```

After:

```ts
const body = methodBody(src, /* fixed-tick signature */);
expect(body.indexOf('this.playerEffects.tick(dt);'))
  .toBeLessThan(body.indexOf('this.tickBadOmenDuration(dt);'));
expect(body.indexOf('this.tickBadOmenDuration(dt);')).toBeGreaterThanOrEqual(0);
```

### Remaining six suites

`LivePeriodicStatusEffects`, `LivePillagerPatrol`, `LiveRaidEscalation`,
`LiveWitchGunpowderDrops`, `RaiderRenderer` and `SplashPotionRenderer` route
their reads through `readSource` (making them line-ending safe immediately)
and convert any multi-line or comment-bearing anchor into a single-line
identifier anchor. Behavioural assertions in those files are untouched.

## Failure modes

| Failure | Behaviour |
|---|---|
| `methodBody` signature not found | Throw `Error("methodBody: signature not found: <sig>")`; the test fails loudly rather than passing vacuously. |
| Brace depth never returns to zero | Throw `Error("methodBody: unbalanced braces for <sig>")`. |
| `readSource` cannot read the file | Propagate the `fs` error. Never return `''`. |
| A helper returns `''` | Explicitly forbidden — an empty body would make `indexOf(...) > -1` fail with a confusing message, and `not.toContain` assertions pass vacuously. |

## Compatibility/migration

None for product code or product data. See the proposal for the Git-side
migration and its review requirements.

## Performance/resource constraints

`readSource` adds one `String.prototype.replace` over each read file. The eight
suites read 11 files totalling roughly 0.5 MiB, so the added cost is a single
sub-millisecond pass per file. No product runtime path imports the helper.

## Testing seams

- `tests/unit/SourceTextPortability.test.ts` (new) — helper normalisation,
  no-`\r` guarantee, no-direct-source-read sweep, `methodBody` positive and
  negative cases (absent signature, unbalanced braces, braces inside strings).
- The eight existing suites keep their behavioural harnesses unchanged and gain
  platform independence.

## Observability/debugging

A portability failure reports the test file, the anchor and the offending
character. `methodBody` errors name the exact signature, so a renamed method
produces an actionable message rather than an opaque `expected -1 to be
greater than -1`.

## Affected files/symbols

**New**
- `.gitattributes`
- `tests/support/sourceText.ts`
- `tests/unit/SourceTextPortability.test.ts`

**Modified (tests only)**
- `tests/unit/LiveSplashPotion.test.ts`
- `tests/unit/LiveStatusEffectPersistence.test.ts`
- `tests/unit/LivePeriodicStatusEffects.test.ts`
- `tests/unit/LivePillagerPatrol.test.ts`
- `tests/unit/LiveRaidEscalation.test.ts`
- `tests/unit/LiveWitchGunpowderDrops.test.ts`
- `tests/unit/RaiderRenderer.test.ts`
- `tests/unit/SplashPotionRenderer.test.ts`

**Modified (documentation)**
- `openspec/changes/298-.../verification.md`
- `openspec/changes/298-.../tasks.md`
- `CHANGE_SEQUENCE.md` (post-terminal table row)

**Explicitly not modified**
- every file under `src/`
- every committed `*.png`

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Rewrite the working tree to CRLF and hard-code `\r\n` in the tests | Would pass on the maintainer's host and fail in CI and on every Linux/macOS contributor. It institutionalises the platform dependency instead of removing it. |
| Delete the eight source-guard suites | They carry real wiring coverage that no other layer provides, because `Game.ts` has no headless harness. Deleting them would reduce coverage while the suite would still be red. |
| Extract a headless `Game` composition seam and test behaviourally | This is the architecturally correct end state and is worth doing, but it is a large refactor of a 7381-line aggregate that belongs to a dedicated, separately gated change (and overlaps the god-object concern). 298 deliberately ships the portable, behaviour-preserving fix so the gate is green now; the seam extraction is recorded as follow-on work in the proposal's non-goals. |
| Add `.gitattributes` only, with no test change | Does not help: an already-checked-out tree and any contributor with `core.autocrlf=false` still produces LF, and the assertions are still comment-coupled. The helper and the assertion rewrite are both required. |
| Raise the Vitest timeout or exclude the two tests | Hides the failure rather than fixing the platform dependency, and would silently drop real wiring coverage. |

## Downstream dependencies

- 299 (toolchain reproducibility), 300 (visual gate reliability), 301 (gate
  wiring) and 302 (performance gate) all record a local green gate as
  precondition evidence. 298 is the prerequisite that makes such evidence
  truthful on Windows.
