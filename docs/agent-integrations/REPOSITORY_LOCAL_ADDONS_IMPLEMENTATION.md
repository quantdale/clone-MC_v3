# Repository-Local Add-ons — Implementation Handoff

**Plan source:** `plan/repo-local-addons-2026-08-28` → `docs/agent-integrations/REPOSITORY_LOCAL_ADDONS_MASTER_PLAN.md`
**Implemented on branch:** `feat/repo-local-addons-2026-08-28` (off `main` @ `3cc55a5`)
**Status:** IMPLEMENTED — additive only, validated, preservation-audited.

## Decision

Implement the master plan's two `RECOMMEND` items as **repository-local MCP integrations** declared in a single new `.mcp.json` at the repo root. Both run via pinned-ephemeral `npx` (no global install, no `package.json`/lockfile churn, removable by deleting the config). A repository-owned preflight guards the config.

## Implemented integrations

| ID | Package | Pinned version | Upstream | License | Authority |
|----|---------|----------------|----------|---------|-----------|
| `chrome-devtools` | `chrome-devtools-mcp` | `1.8.0` | `ChromeDevTools/chrome-devtools-mcp` (Google) | Apache-2.0 | Diagnostic only — local Chrome profiling/IndexedDB/memory. No repo write. |
| `context7` | `@upstash/context7-mcp` | `4.0.3` | `upstash/context7` | MIT | Read-only docs — version-aware Three.js/TS/Vite. No repo write. |

Versions pinned from live `npm view` at implementation time.

## Activation commands

MCP clients that read `.mcp.json` (e.g. Claude Code, VS Code, Cursor) pick these up automatically. Manual equivalents:

```bash
# Context7 (docs)
npx -y @upstash/context7-mcp@4.0.3
# Chrome DevTools (diagnostic, local Chrome)
npx -y chrome-devtools-mcp@1.8.0
#   Connect to an already-running Chrome with remote debugging:
npx -y chrome-devtools-mcp@1.8.0 --browserUrl http://127.0.0.1:9222
```

## Scope mechanism

- **Repository-local config boundary:** the tracked `.mcp.json` is the only scope surface. No user/global MCP registry, editor setting, shell profile, or PATH is mutated.
- **Pinned-ephemeral execution:** servers resolve via `npx` from the repository cwd; no repository `dependency` is added. Removal = delete `.mcp.json` (+ optional `scripts/verify-mcp-addons.mjs`).
- **Environment variables (names only):** `CONTEXT7_API_KEY` is *optional* and supplied by the user's environment for higher Context7 rate limits. It is **not** committed; the config does not embed it. Chrome DevTools MCP requires no secret.

## Preflight

`scripts/verify-mcp-addons.mjs` — read-only, no network, no mutation. Detects: missing config, duplicate server IDs, non-ephemeral (`npx`/`uvx`-only) command, unpinned/`@latest` versions, embedded secrets, unsafe `alwaysAllow`. Run:

```bash
node scripts/verify-mcp-addons.mjs
```

## Validation results

| Check | Result |
|-------|--------|
| Preflight (`scripts/verify-mcp-addons.mjs`) | PASS (exit 0) |
| `npm run lint` (full repo, ESLint flat config) | PASS (exit 0) |
| Context7 MCP `initialize` handshake (stdio) | PASS — `serverInfo` returned `Context7 v4.0.3` |
| Chrome DevTools MCP launch (`--help`) | PASS — official Google server, Chrome 144+ interface exposed |
| TypeScript `typecheck` / `build` / `test` suites | Not affected — change is config/script-only (no `.ts`/build input touched) |

## Existing-integration preservation proof

`git status --porcelain` shows only two **new, untracked** files: `.mcp.json`, `scripts/verify-mcp-addons.mjs`. `git diff --name-only HEAD` is **empty** → zero existing tracked files modified. No global config or dependency changed. No secret committed (`.env` is gitignored; preflight secret-scan clean).

### PROTECTED existing integration surfaces (untouched)

`AGENTS.md`, `.agent/` (EXECUTION_PROMPT.md, PLANNER_HANDOFF.md, skills, workflows), `.kimi-code/AGENTS.md`, `.agents/skills/goal/SKILL.md`, `.github/` (ci.yml, seed-visual-goldens.yml, prompts, skills), `vitest.config.ts`, `playwright.config.ts`, OpenSpec harness (`openspec/`). Local-only agent dirs (`.claude/`, `.cursor/`, `.opencode/`, `.codex/`, `.kimi/`, `.kilocode/`, `.gemini/`, `.clinerules/`, `.cline/`) are gitignored and were not touched.

## Not implemented / explicitly not recommended (per plan)

- Another Playwright MCP path (duplicates existing `playwright.config.ts`/E2E harness).
- Broad mutation tooling before coverage economics are measured.
- Global browser state.
- No global-scope installation was performed; `GLOBAL_SCOPE_BLOCKED` applies to any item requiring user-wide mutation.

## Removal

Delete `.mcp.json` and `scripts/verify-mcp-addons.mjs`. Nothing else references them.
