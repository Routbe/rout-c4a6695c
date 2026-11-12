import { describe, expect, it } from "vitest";
import { diagnose } from "@/lib/agent/diagnostics";
import { aiManifest } from "@/lib/agent/ai-manifest";
import { contrastRatio } from "@/lib/wcag";
import { vaultRequestSchema } from "./ephemeral-vault";
import { designDiagnostics, normalizeHexColor } from "./design-tokens";

type Op = { op: string; path: string; value?: unknown; from?: string };

/** Minimal RFC 6902 applier (replace/remove/move) to prove the suggestions are directly usable. */
function applyPatch(doc: unknown, op: Op): unknown {
  const clone = JSON.parse(JSON.stringify(doc));
  const parts = (p: string) => p.split("/").slice(1).map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  const parentOf = (segs: string[]) => segs.slice(0, -1).reduce((o: Record<string, unknown>, k) => o[k] as Record<string, unknown>, clone);
  if (op.op === "move" && op.from) {
    const from = parts(op.from);
    const v = parentOf(from)[from[from.length - 1]];
    delete parentOf(from)[from[from.length - 1]];
    const to = parts(op.path);
    parentOf(to)[to[to.length - 1]] = v;
  } else if (op.op === "remove") {
    const segs = parts(op.path);
    delete parentOf(segs)[segs[segs.length - 1]];
  } else {
    const segs = parts(op.path);
    parentOf(segs)[segs[segs.length - 1]] = op.value;
  }
  return clone;
}

/** Simulates an agent's reflection loop: validate, apply every suggestion, resend. */
function selfHeal(body: unknown, maxRounds = 5): { body: unknown; rounds: number; ok: boolean } {
  let cur = body;
  for (let round = 0; round < maxRounds; round++) {
    const parsed = vaultRequestSchema.safeParse(cur);
    const diags = parsed.success ? designDiagnostics(parsed.data.config.canvas, ["config", "canvas"]) : diagnose(parsed.error, cur);
    if (!diags.length) return { body: cur, rounds: round, ok: true };
    for (const d of diags) {
      if (!d.suggested_mutation) return { body: cur, rounds: round, ok: false };
      cur = applyPatch(cur, d.suggested_mutation as Op);
    }
  }
  return { body: cur, rounds: maxRounds, ok: false };
}

describe("compiler-grade diagnostics for vault designs", () => {
  it("a low-contrast text colour gets path, rejected value and an AA-compliant replacement", () => {
    const body = { config: { name: "Shop", canvas: { theme: { background: "#FFFFFF", text: "#CCCCCC" } } } };
    const parsed = vaultRequestSchema.parse(body);
    const [d] = designDiagnostics(parsed.config.canvas, ["config", "canvas"]);
    expect(d.error_code).toBe("insufficient_contrast");
    expect(d.path).toBe("config.canvas.theme.text");
    expect(d.rejected_value).toBe("#CCCCCC");
    expect(d.suggested_mutation?.path).toBe("/config/canvas/theme/text");
    expect(contrastRatio(String(d.suggested_mutation?.value), "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("a malformed hex colour becomes invalid_design_token with a normalised value", () => {
    const body = { config: { name: "Shop", canvas: { theme: { background: "fff", text: "#111111" } } } };
    const r = vaultRequestSchema.safeParse(body);
    expect(r.success).toBe(false);
    const [d] = diagnose(r.error!, body);
    expect(d).toMatchObject({ error_code: "invalid_design_token", path: "config.canvas.theme.background", rejected_value: "fff" });
    expect(d.suggested_mutation).toEqual({ op: "replace", path: "/config/canvas/theme/background", value: "#FFFFFF" });
  });

  it("an unknown theme field is moved to the closest known token", () => {
    const body = { config: { name: "Shop", canvas: { theme: { bg: "#000000", text: "#FFFFFF" } } } };
    const r = vaultRequestSchema.safeParse(body);
    const unknown = diagnose(r.error!, body).find((d) => d.error_code === "unknown_design_token");
    expect(unknown?.path).toBe("config.canvas.theme.bg");
    expect(unknown?.suggested_mutation).toEqual({ op: "move", from: "/config/canvas/theme/bg", path: "/config/canvas/theme/background" });
  });

  it("an agent applying the suggestions in a loop ends with a valid request", () => {
    const broken = { config: { name: "Shop", canvas: { theme: { bg: "abc", text: "#BBBBBB", accent: "white" }, radius: "huge" } } };
    const healed = selfHeal(broken);
    expect(healed.ok).toBe(true);
    expect(healed.rounds).toBeLessThanOrEqual(3);
  });

  it("normalises common colour spellings", () => {
    expect(normalizeHexColor("#abc")).toBe("#AABBCC");
    expect(normalizeHexColor("rgb(255, 0, 16)")).toBe("#FF0010");
    expect(normalizeHexColor("not a colour")).toBeNull();
  });
});

describe("ai-manifest", () => {
  it("declares a stateless REST API without WebSocket or MCP and documents the vault endpoint", () => {
    const m = aiManifest("https://rout.be");
    expect(m.transport).toMatchObject({ stateful_session_required: false, websocket_required: false, mcp_required: false });
    expect(m.openapi.paths["/api/v1/agent/vault"].post.security).toEqual([{ sandbox_key: [] }]);
    expect(m.design_token_ast.rules.find((r) => r.id === "text_on_background")?.min_ratio).toBe(4.5);
    expect(m.zero_knowledge.never_stored).toContain("ephemeral_secret");
  });
});
