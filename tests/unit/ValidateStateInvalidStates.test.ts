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

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);

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
    nextExactAction: "Close the certification condition.",
    releaseAuthority: {
      schemaVersion: 1,
      authorityPackage: "openspec/hardening/fake-certification",
      verdict: "READY WITH EXPLICIT NON-BLOCKING DEBT",
      condition: "Canonical exact-SHA GitHub Actions run (gate + e2e jobs SUCCESS) on the published candidate head.",
      candidateSha: null,
      canonicalCi: null,
    },
  };
}

/** Write the fake authority package referenced by {@link terminalState}. */
function writeAuthorityPackage(overallVerified: boolean) {
  const dir = path.join(root, "openspec/hardening/fake-certification");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "verification.md"),
    overallVerified
      ? "# Verification\n\nOverall status: **VERIFIED**\n"
      : "# Verification\n\nOverall status: **CONDITIONAL** — awaiting canonical exact-SHA CI.\n",
  );
}

function terminalMd() {
  return [
    "- Active implementation change: **None (hardening interlock VERIFIED; program terminal)**",
    "- Next change: **null**",
    "- Last completed change: **250-final-program-verification — VERIFIED**",
    "- 240 advancement allowed: **yes**",
    "- Next exact action: **Close the certification condition.**",
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

function writeParityFixture(options: {
  includeLast?: boolean;
  currentVerified?: boolean;
  includeCurrent?: boolean;
  historicalVerified?: boolean;
  lastStatus?: "VERIFIED" | "ACTIVE";
  omitBaseline?: boolean;
  duplicateRow?: boolean;
  summary?: "plain" | "bold" | "wrong-total" | "bad-total" | "missing-total" | "duplicate-total" | "missing-exact" | "bad-exact" | "wrong-exact" | "duplicate-exact";
} = {}) {
  const currentVerified = options.currentVerified ?? false;
  const state = {
    status: "ACTIVE",
    currentChange: "307-active",
    currentChangeStatus: currentVerified ? "VERIFIED" : "ACTIVE",
    lastCompletedChange: "305-completed",
    nextChange: "308",
    mandatoryRequirementsPass: currentVerified,
    requiredTestsPass: currentVerified,
    advancementAllowed: currentVerified,
    validationResults: options.historicalVerified ? [{ change: "304-history", status: "VERIFIED" }] : [],
  };
  writeState(state, [
    "- Active implementation change: **307-active**",
    "- Last completed change: **305-completed**",
    "- Next change: **308**",
    `- 240 advancement allowed: **${currentVerified ? "yes" : "no (active change not yet verified)"}**`,
  ]);
  const rows = Array.from({ length: 250 }, (_, i) =>
    `| C${String(i + 1).padStart(3, "0")} | entry | outcome | exact | evidence | - | VERIFIED |`);
  if (options.omitBaseline) rows.shift();
  if (options.duplicateRow) rows.push(rows[0]!);
  rows.push("| C258 | deferred | outcome | deferred | evidence | - | BLOCKED |");
  if (options.includeLast !== false) rows.push(`| C305 | completed | outcome | exact | evidence | - | ${options.lastStatus ?? "VERIFIED"} |`);
  if (options.includeCurrent) rows.push("| C307 | current | outcome | exact | evidence | - | VERIFIED |");
  rows.push("| MP-19.4-1 | boss | outcome | exact | evidence | - | VERIFIED |");
  rows.push("| MP-33-1 | services | outcome | out-of-scope | evidence | - | n/a |");
  const exact = 251 + (options.includeLast !== false ? 1 : 0) + (options.includeCurrent ? 1 : 0) - (options.omitBaseline ? 1 : 0);
  const total = rows.length - (options.duplicateRow ? 1 : 0);
  const style = options.summary ?? "bold";
  const exactValue = style === "bad-exact" ? "bad" : style === "wrong-exact" ? "1" : String(exact);
  const exactRow = style === "missing-exact" ? "" : style === "bold"
    ? `| **exact** | **${exactValue}** |\n` : `| exact | ${exactValue} |\n`;
  const totalRow = style === "missing-total" ? "" : style === "plain"
    ? `| Total rows | ${total} |\n`
    : `| **Total rows** | **${style === "wrong-total" ? 1 : style === "bad-total" ? "bad" : total}** |\n`;
  const summary = `${exactRow}${style === "duplicate-exact" ? exactRow : ""}| deferred | 1 |\n| out-of-scope | 1 |\n${totalRow}${style === "duplicate-total" ? totalRow : ""}`;
  fs.writeFileSync(path.join(root, "PARITY_MATRIX.md"), `${rows.join("\n")}\n\n## Summary\n\n| Category | Rows |\n|---|---|\n${summary}`);
}

describe("scripts/validate-state.mjs rejects incoherent synthetic states", () => {
  it("passes on a clean synthetic terminal state", () => {
    writeState(terminalState(), terminalMd());
    writeAuthorityPackage(false);
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
    writeAuthorityPackage(false);
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

  // ─── Release-authority coherence (2026-08-23 governance repair) ───

  it("rejects a terminal state without a releaseAuthority block", () => {
    const state = terminalState() as Partial<ReturnType<typeof terminalState>>;
    delete state.releaseAuthority;
    writeState(state as ReturnType<typeof terminalState>, terminalMd());
    const result = runValidator();
    expect(result.code).toBe(1);
    expect(result.output).toContain("releaseAuthority block is missing");
  });

  it("rejects an authority package whose verification.md is unreadable", () => {
    writeState(terminalState(), terminalMd());
    const result = runValidator();
    expect(result.code).toBe(1);
    expect(result.output).toContain("no readable verification.md");
  });

  it("rejects canonicalCi recorded while the artifact verdict is still conditional", () => {
    writeState(
      {
        ...terminalState(),
        releaseAuthority: {
          ...terminalState().releaseAuthority!,
          canonicalCi: {
            runId: 123,
            gateJobId: 456,
            e2eJobId: 789,
            gateConclusion: "success",
            e2eConclusion: "success",
            recordedAt: "2026-08-23T00:00:00Z",
          },
        },
      },
      terminalMd(),
    );
    writeAuthorityPackage(false);
    const result = runValidator();
    expect(result.code).toBe(1);
    expect(result.output).toContain("lacks the \"Overall status: **VERIFIED**\" marker");
  });

  it("accepts canonicalCi when the artifact carries the VERIFIED marker and both conclusions are success", () => {
    writeState(
      {
        ...terminalState(),
        releaseAuthority: {
          ...terminalState().releaseAuthority!,
          candidateSha: SHA_A,
          canonicalCi: {
            runId: 123,
            gateJobId: 456,
            e2eJobId: 789,
            gateConclusion: "success",
            e2eConclusion: "success",
            recordedAt: "2026-08-23T00:00:00Z",
          },
        },
      },
      terminalMd(),
    );
    writeAuthorityPackage(true);
    const result = runValidator();
    expect(result.output).toContain("PASSED");
    expect(result.code).toBe(0);
  });

  it("rejects canonicalCi with a non-success e2e conclusion", () => {
    writeState(
      {
        ...terminalState(),
        releaseAuthority: {
          ...terminalState().releaseAuthority!,
          canonicalCi: {
            runId: 123,
            gateJobId: 456,
            e2eJobId: 789,
            gateConclusion: "success",
            e2eConclusion: "failure",
            recordedAt: "2026-08-23T00:00:00Z",
          },
        },
      },
      terminalMd(),
    );
    writeAuthorityPackage(true);
    const result = runValidator();
    expect(result.code).toBe(1);
    expect(result.output).toContain("BOTH gate and e2e conclusions are success");
  });

  it("rejects a malformed candidateSha", () => {
    writeState(
      {
        ...terminalState(),
        releaseAuthority: { ...terminalState().releaseAuthority!, candidateSha: "deadbeef" },
      },
      terminalMd(),
    );
    writeAuthorityPackage(false);
    const result = runValidator();
    expect(result.code).toBe(1);
    expect(result.output).toContain("not a full 40-hex commit SHA");
  });

  it("accepts a well-formed publicationHistory in a non-git fixture root", () => {
    writeState(
      {
        ...terminalState(),
        publicationHistory: [
          { head: SHA_B, at: "2026-08-16T16:18:18.133Z", note: "historical session publication" },
        ],
      },
      terminalMd(),
    );
    writeAuthorityPackage(false);
    const result = runValidator();
    expect(result.output).toContain("PASSED");
    expect(result.code).toBe(0);
  });

  it("rejects a publicationHistory entry missing its note", () => {
    writeState(
      {
        ...terminalState(),
        publicationHistory: [{ head: SHA_C, at: "2026-08-16T16:18:18.133Z" }],
      },
      terminalMd(),
    );
    writeAuthorityPackage(false);
    const result = runValidator();
    expect(result.code).toBe(1);
    expect(result.output).toContain("publicationHistory[0].note");
  });

  it("rejects a Markdown file without a Next exact action bullet", () => {
    writeState(terminalState(), terminalMd().slice(0, 4));
    writeAuthorityPackage(false);
    const result = runValidator();
    expect(result.code).toBe(1);
    expect(result.output).toContain("Next exact action");
  });

  it("rejects duplicate validationResults change identities", () => {
    writeState(
      {
        ...terminalState(),
        validationResults: [
          { change: "243-redstone-automation-e2e", status: "VERIFIED", unitTests: 3694, e2eTests: 35 },
          { change: "243-redstone-automation-e2e", status: "VERIFIED", unitTests: 3694, e2eTests: 35, note: "duplicate" },
        ],
      },
      terminalMd(),
    );
    writeAuthorityPackage(false);
    const result = runValidator();
    expect(result.code).toBe(1);
    expect(result.output).toContain('duplicate change identity "243-redstone-automation-e2e"');
  });

  it("allows legacy head-only validationResults rows without a change identity", () => {
    writeState(
      {
        ...terminalState(),
        validationResults: [
          { head: SHA_A, typecheck: "PASS" },
          { head: SHA_B, typecheck: "PASS" },
        ],
      },
      terminalMd(),
    );
    writeAuthorityPackage(false);
    const result = runValidator();
    expect(result.output).toContain("PASSED");
    expect(result.code).toBe(0);
  });
});

describe("parity state validation (307)", () => {
  it.each(["plain", "bold"] as const)("accepts coherent %s summary and deferred C258 with an active successor", (summary) => {
    writeParityFixture({ summary });
    expect(runValidator().code).toBe(0);
  });

  it("rejects a missing last-completed post-250 row even while the current change is active", () => {
    writeParityFixture({ includeLast: false });
    const result = runValidator();
    expect(result.code).toBe(1);
    expect(result.output).toContain("C305");
  });

  it("rejects a missing verified current row", () => {
    writeParityFixture({ currentVerified: true });
    const result = runValidator();
    expect(result.code).toBe(1);
    expect(result.output).toContain("C307");
  });

  it("rejects a missing historical verified row", () => {
    writeParityFixture({ historicalVerified: true });
    const result = runValidator();
    expect(result.code).toBe(1);
    expect(result.output).toContain("C304");
  });

  it("rejects a non-VERIFIED row for a last-completed change", () => {
    writeParityFixture({ lastStatus: "ACTIVE" });
    const result = runValidator();
    expect(result.code).toBe(1);
    expect(result.output).toContain("C305");
  });

  it.each(["omitBaseline", "duplicateRow"] as const)("keeps the existing %s check", (field) => {
    writeParityFixture({ [field]: true });
    expect(runValidator().code).toBe(1);
  });

  it.each(["wrong-total", "bad-total", "missing-total", "duplicate-total", "missing-exact", "bad-exact", "wrong-exact", "duplicate-exact"] as const)(
    "rejects the %s summary", (summary) => {
      writeParityFixture({ summary });
      const result = runValidator();
      expect(result.code).toBe(1);
      expect(result.output).toContain("PARITY_MATRIX");
    },
  );
});
