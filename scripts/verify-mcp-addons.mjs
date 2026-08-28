/* global console, process */
// Repository-owned preflight for the repository-local MCP add-ons (.mcp.json).
// Fail-closed, read-only, no network, no mutation of production data.
// Detects: missing config, duplicate IDs, non-ephemeral (global) command
// resolution, unpinned/latest versions, embedded secrets, unsafe permissions.
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = path.resolve('.');
const configPath = path.join(root, '.mcp.json');

const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

if (!fs.existsSync(configPath)) {
  fail(`Missing expected repository-local MCP config: ${configPath}`);
} else {
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    fail(`Invalid JSON in .mcp.json: ${e.message}`);
  }

  if (cfg) {
    if (!cfg.mcpServers || typeof cfg.mcpServers !== 'object') {
      fail('Top-level "mcpServers" object is required.');
    } else {
      const ids = Object.keys(cfg.mcpServers);
      if (ids.length === 0) {
        fail('No MCP servers declared.');
      }
      const seen = new Set();
      for (const id of ids) {
        if (seen.has(id)) {
          fail(`Duplicate server id: ${id}`);
        }
        seen.add(id);

        const srv = cfg.mcpServers[id];
        if (!srv || typeof srv !== 'object') {
          fail(`Server "${id}" is not an object.`);
          continue;
        }

        // Only pinned-ephemeral launchers (npx/uvx) are permitted, to avoid
        // accidental global executable resolution when local resolution is required.
        const cmd = srv.command;
        if (cmd !== 'npx' && cmd !== 'uvx') {
          fail(
            `Server "${id}" uses command "${cmd}". ` +
              'Only npx/uvx (pinned-ephemeral, repository-scoped) is permitted.',
          );
        }

        const args = Array.isArray(srv.args) ? srv.args : [];
        const joined = args.join(' ');

        // Require an exact-version pin (pkg@x.y.z); reject unpinned or @latest.
        const pinRe = /(?:^|\s)([@\w/-]+@\d+\.\d+\.\d+)(?=\s|$)/;
        if (!pinRe.test(joined)) {
          fail(
            `Server "${id}" must pin an exact package version (e.g. pkg@1.2.3) in args; found: "${joined || '(none)'}".`,
          );
        }
        if (/(^|\s)@latest(\s|$)/.test(joined)) {
          fail(`Server "${id}" must not use @latest.`);
        }

        // Fail-closed secret scan: no credentials may be embedded.
        const scan = JSON.stringify(srv);
        const secretLike =
          /(?:api[_-]?key|secret|token|password|passwd|authorization)\s*[:=]\s*["']?[A-Za-z0-9_-]{8,}/i.test(
            scan,
          ) || /["'][A-Za-z0-9+/]{32,}={0,2}["']/.test(scan);
        if (secretLike) {
          fail(
            `Server "${id}" appears to embed a secret-like value. ` +
              'Credentials must come from the environment only.',
          );
        }

        // Permissive/unsafe permission configuration.
        if (
          srv.alwaysAllow &&
          Array.isArray(srv.alwaysAllow) &&
          srv.alwaysAllow.length > 0
        ) {
          warn(
            `Server "${id}" declares alwaysAllow: ${srv.alwaysAllow.join(', ')}. ` +
              'Confirm this is intended and minimal.',
          );
        }
      }
    }
  }
}

if (warnings.length) {
  console.log('Warnings:');
  for (const w of warnings) console.log(`  - ${w}`);
}

if (errors.length) {
  console.error('PREFLIGHT FAILED:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  'PREFLIGHT OK: repository-local MCP config validated (pinned, secret-free, no global resolution).',
);
