# Fresh-machine onboarding

This is the canonical bootstrap entry point for a new workstation or a fresh coding-agent environment. Complete this document before implementation work. The objective is a reproducible machine that can build, test, inspect, and operate this repository without rediscovering tooling mid-campaign.

## 1. Preflight rule

1. Clone the repository and enter its root.
2. Confirm the intended repository/branch and fetch current `origin/main`.
3. Read the repository control-plane documents before changing code: `AGENTS.md`, `README.md`, `.agent/`, `NEXT_CAMPAIGN.md`, `PARITY_MATRIX.md`, active OpenSpec state.
4. Install/verify the machine prerequisites below.
5. Enable the committed agent integrations and repository-local skills.
6. Restore dependencies from lockfiles/pins; do not casually upgrade them during bootstrap.
7. Run the baseline validation commands.
8. Only then begin a development campaign. If a prerequisite cannot be satisfied, record it as an environment blocker rather than weakening a gate.

Credentials, API keys, signing material, account logins, licensed models/assets, and other secrets are machine/user responsibilities. Never commit them.

## 2. Supported host and prerequisites

**Primary host:** Desktop Windows/Linux/macOS with a modern Chromium-class browser; Node.js >= 20.

**Required machine tools**
- Git
- Node.js >= 20 + npm
- Playwright Chromium
- modern browser/WebGL stack

**Task-dependent / optional tools**
- Chrome/Chromium DevTools profiling for renderer/performance campaigns


## 3. Agent setup

- Load repository instructions before acting. Prefer committed repository state over chat history.
- Repository-local skills: `goal`.
- Agent adapter/config directories present in this repository should be discovered and used in-place; do not duplicate them globally unless the harness cannot load repository-local configuration.
- Relevant committed agent surfaces: `.agent/`, `.agents/`, `.claude/`, `.gemini/`, `.kimi-code/`, `.opencode/`.
- MCP policy: Use the committed `.mcp.json`: `chrome-devtools` (diagnostic-only) and `context7` (documentation-only). They run through pinned `npx` packages; do not promote them to repository-write authority.
- Keep MCP/plugin authority narrow. Documentation/diagnostic MCPs are not permission to change architecture, bypass tests, or publish.
- Authentication for GitHub and coding-agent CLIs is configured separately on the machine. Never write tokens into tracked files.

## 4. Bootstrap

Run the repository's pinned bootstrap, not an improvised dependency upgrade:

```bash
npm ci
npx playwright install chromium
```

The committed MCP versions are part of the repo setup. Keep optional `CONTEXT7_API_KEY` in the environment only.

`npm ci` is the **only supported install command**: it deletes `node_modules` and
reconstructs it at exactly the versions `package-lock.json` records. Do not use
`npm install` — it can resolve a different tree than the lockfile, which makes
local gate results (especially coverage) incomparable with CI.

### Toolchain contract

| Item | Canonical value |
|---|---|
| Node.js | **20** (CI-canonical; every workflow pins `node-version: 20`). `engines.node` allows `>=20`, so a newer local Node also runs, but CI evidence is Node 20. |
| npm | **10.8.2** — declared exactly in `package.json` `packageManager` (the npm bundled with the Node 20 image). `engines.npm` requires `>=10`. |
| Install | `npm ci` |
| Version check | `npm run verify:deps` |

`npm run verify:deps` (`scripts/check-install.mjs`) compares every installed
package against its lockfile-resolved version and exits 1 with a drift table if
they differ. It is read-only. It is **not** wired to `preinstall` on purpose:
npm removes `node_modules` before running the root `preinstall` hook, so a
hook-hosted check observes an absent tree and always reports a match. Run it as
an explicit first step of the baseline gate instead.

### Coverage thresholds are provider-specific

The thresholds in `vitest.config.ts` (`statements 91 / branches 88 / functions
94 / lines 93`) are calibrated for the **locked** coverage provider version
(`@vitest/coverage-v8` **4.1.11**). Vitest 4 changed V8 branch remapping and
dropped Vitest 3's default test/config exclusions, so the **branch metric is not
comparable across provider major versions**. A coverage figure produced by a
different provider version is not evidence for this gate.

## 5. Editor/LSP baseline

Use the local TypeScript server and ESLint. Three.js types must match the repository dependency set. Browser profiling belongs in DevTools/Playwright, not speculative source edits.

The editor is optional; the language servers are not. Agents should have diagnostics/type information available before editing non-trivial code.

## 6. Baseline verification

```bash
npm run verify:deps
npm run validate-state
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`verify:deps` runs first: a gate result obtained under a dependency tree that does
not match `package-lock.json` is invalid and must not be recorded. If it reports
drift, run `npm ci` and start the sequence again.

A fresh machine is considered **development-ready** only when the applicable non-external gates above pass. Hardware/device/signing/account gates may remain explicitly blocked if the repository already classifies them that way.

## 7. Fresh-agent instruction

Use this exact operating rule when handing the repository to a new agent:

> Read `ONBOARDING.md` first. Set up every applicable prerequisite, repository-local skill, MCP/plugin, dependency, browser/device/runtime tool, and validation gate described there. Then read the repository's durable agent state and only start implementation after preflight is green or a genuine environment blocker is recorded. Do not replace pinned tooling, skip gates, or invent work to compensate for a missing machine capability.
