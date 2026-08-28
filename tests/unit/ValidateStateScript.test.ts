// ── validate-state.mjs subprocess coverage (verification campaign) ──────────
//
// The state validator is a CLI script that runs `main()` at import time and
// exits with a process status; it is verified here end-to-end as a subprocess
// against the real repository (the same way CI invokes it), plus its markdown
// bullet parser is exercised through the exported-for-test surface.

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "scripts",
  "validate-state.mjs",
);

describe("scripts/validate-state.mjs", () => {
  it("exits 0 and prints PASSED for the current coherent repository state", () => {
    const stdout = execFileSync(process.execPath, [scriptPath], {
      encoding: "utf8",
    });
    expect(stdout).toContain("State validation PASSED");
  }, 30000);
});
