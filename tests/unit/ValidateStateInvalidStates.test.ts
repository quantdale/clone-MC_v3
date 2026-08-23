// ─── validate-state.mjs invalid-state regression coverage (hardening 2026-08-23) ───
//
// The 2024-era ValidateStateScript.test.ts proves the script exits 0 on the
// real repository. These tests prove it EXITS 1 on the invalid synthetic states
// the strengthened validator must catch: terminal-program contradictions and a
// stale lowercase alias carrying per-change state.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "scripts",
  "validate-state.mjs",
);

let root = "";

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "validate-state-"));
  fs.mkdirSync(path.join(root, "openspec"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeState(json: object, mdBullets: string[]) {
  const md = [
    "# State",
    ...mdBullets,
  ].join("\n");
  fs.writeFileSync(path.join(root, "openspec/PROGRAM_STATE.json"), JSON.stringify(json));
  fs.writeFileSync(path.join(root, "openspec/PROGRAM_STATE.md"), `${md}\n`);
}

/** Canonical coherent terminal state (mirrors the real repository's shape). */
function terminalState() {
  return {
    schemaVersion: 1,
    program: "minecraft-parity",
    status: "COMPLETE",
    currentChange: "250-final-program-verification",
    currentChangeStatus: "VERIFIED",
    lastCompletedChange: "250-final-program-verification",
    nextChange: null,
    completionPercentage: 100,
    mandatoryRequirementsPass: true,
    requiredTestsPass: true,
    advancementAllowed: true,
  };
}

function terminalMd() {
  return [
    "- Active implementation change: **None (hardening interlock VERIFIED; program terminal)**",
    "- Next change: **null**",
    "- Last completed change: **250-final-program-verification — VERIFIED**",
    "- 240 advancement allowed: **yes**",
  ];
}

function runValidator() {
  let stdout = "";
  try {
    stdout = execFileSync(process.execPath, [scriptPath, "--root", root], {
      encoding: "utf8",
    });
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
  return { code: 0, output: stdout };
}

describe("scripts/validate-state.mjs rejects incoherent synthetic states", () => {
  it("passes on a clean synthetic terminal state", () => {
    writeState(terminalState(), terminalMd());
    const result = runValidator();
    expect(result.output).toContain("PASSED");
    expect(result.code).toBe(0);
  });

  it("rejects terminal status with a non-null nextChange", () => {
    const json = { ...terminalState(), nextChange: "251-something" };
    writeState(json, terminalMd().map((l) => l.replace("**null**", "**251-something**")));
    const result = runValidator();
    expect(result.code).toBe(1);
    expect(result.output).toContain("terminal but nextChange");
  });

  it("rejects terminal status with an unverified current change", () => {
    const json = { ...terminalState(), currentChangeStatus: "ACTIVE" };
    writeState(json, terminalMd());
    const result = runValidator();
    expect(result.code).toBe(1);
    expect(result.output).toContain("currentChangeStatus");
  });

  it("rejects terminal status below 100% completion", () => {
    const json = { ...terminalState(), completionPercentage: 92 };
    writeState(json, terminalMd());
    const result = runValidator();
    expect(result.code).toBe(1);
    expect(result.output).toContain("completionPercentage");
  });

  it("rejects VERIFIED-with-null-successor states that are neither terminal nor advancing", () => {
    const json = { ...terminalState(), status: "IN_PROGRESS" };
    writeState(json, terminalMd().map((l) => l.replace("program terminal", "in progress")));
    const result = runValidator();
    expect(result.code).toBe(1);
    expect(result.output).toContain("neither terminal nor advancing");
  });

  it("rejects a stale alias that carries per-change state fields", () => {
    writeState(terminalState(), terminalMd());
    fs.writeFileSync(
      path.join(root, "openspec/program-state.json"),
      JSON.stringify({
        canonicalFile: "openspec/PROGRAM_STATE.json",
        current_change: "002-resource-id-foundation",
        current_change_status: "ACTIVE",
        last_completed_change: "001-autonomous-program-control",
        advancement_allowed: false,
      }),
    );
    const result = runValidator();
    expect(result.code).toBe(1);
    expect(result.output).toContain("redirect-only");
    expect(result.output).toContain("current_change");
  });

  it("accepts the redirect-only alias form", () => {
    writeState(terminalState(), terminalMd());
    fs.writeFileSync(
      path.join(root, "openspec/program-state.json"),
      JSON.stringify({
        canonicalFile: "openspec/PROGRAM_STATE.json",
        fileKind: "redirect-only",
      }),
    );
    const result = runValidator();
    expect(result.code).toBe(0);
  });
});
