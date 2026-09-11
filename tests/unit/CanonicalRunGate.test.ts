import { describe, it, expect } from "vitest";
import {
  evaluateCanonicalRun,
  isSoftwareRenderer,
  type CanonicalRunIdentity,
} from "../../src/rendering/CanonicalRunGate";

const CANONICAL_IDENTITY: CanonicalRunIdentity = {
  headed: true,
  webglSupported: true,
  vendor: "Google Inc. (NVIDIA)",
  renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0)",
  devicePixelRatio: 2,
  renderDistance: 6,
  expectedRenderDistance: 6,
};

describe("CanonicalRunGate software detection", () => {
  it("flags known software rasterizers", () => {
    expect(
      isSoftwareRenderer("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)"),
    ).toBe(true);
    expect(isSoftwareRenderer("llvmpipe (LLVM 15)")).toBe(true);
    expect(isSoftwareRenderer("Software Adapter")).toBe(true);
    expect(isSoftwareRenderer("Basic Render Driver")).toBe(true);
  });

  it("accepts hardware renderer strings and fails closed on non-strings", () => {
    expect(isSoftwareRenderer(CANONICAL_IDENTITY.renderer)).toBe(false);
    expect(isSoftwareRenderer(null)).toBe(true);
    expect(isSoftwareRenderer(42)).toBe(true);
  });
});

describe("evaluateCanonicalRun", () => {
  it("passes a headed hardware default-quality identity", () => {
    expect(evaluateCanonicalRun(CANONICAL_IDENTITY)).toEqual({ canonical: true, reasons: [] });
  });

  it("rejects headless overrides from canonical results", () => {
    const verdict = evaluateCanonicalRun({ ...CANONICAL_IDENTITY, headed: false });
    expect(verdict.canonical).toBe(false);
    expect(verdict.reasons).toEqual(["headless run (canonical requires headed)"]);
  });

  it("rejects SwiftShader software rendering as canonical", () => {
    const verdict = evaluateCanonicalRun({
      ...CANONICAL_IDENTITY,
      vendor: "Google Inc. (Google)",
      renderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
    });
    expect(verdict.canonical).toBe(false);
    expect(verdict.reasons.length).toBe(1);
    expect(verdict.reasons[0]).toMatch(/software renderer/);
  });

  it("rejects reduced render distance and out-of-range DPR", () => {
    expect(evaluateCanonicalRun({ ...CANONICAL_IDENTITY, renderDistance: 1 }).reasons).toEqual([
      "reduced renderDistance 1 (canonical expects 6)",
    ]);
    expect(evaluateCanonicalRun({ ...CANONICAL_IDENTITY, devicePixelRatio: 3 }).reasons).toEqual([
      "non-canonical devicePixelRatio: 3",
    ]);
    expect(evaluateCanonicalRun({ ...CANONICAL_IDENTITY, webglSupported: false }).reasons).toContain(
      "WebGL unsupported",
    );
  });

  it("fails closed on malformed identities without throwing", () => {
    for (const bad of [null, 42, {}, { ...CANONICAL_IDENTITY, vendor: "" }, { ...CANONICAL_IDENTITY, renderer: 7 }]) {
      const verdict = evaluateCanonicalRun(bad);
      expect(verdict.canonical).toBe(false);
      expect(verdict.reasons.length).toBeGreaterThan(0);
    }
  });
});
