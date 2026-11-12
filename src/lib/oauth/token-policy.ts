export function validAccessClaims(payload: Record<string, unknown>, expectedIssuer: string, nowSeconds: number): boolean {
  return payload["iss"] === expectedIssuer && payload["token_use"] === "access"
    && typeof payload["sub"] === "string" && payload["sub"].length > 0
    && typeof payload["aud"] === "string" && payload["aud"].length > 0
    && typeof payload["scope"] === "string"
    && typeof payload["exp"] === "number" && Number.isFinite(payload["exp"]) && payload["exp"] > nowSeconds
    && typeof payload["iat"] === "number" && Number.isFinite(payload["iat"]) && payload["iat"] <= nowSeconds;
}

export function parseOidcPrompt(prompt: string | null | undefined): string[] {
  const values = (prompt ?? "").trim().split(/\s+/).filter(Boolean);
  if (values.some((v) => !["none", "login", "consent", "select_account"].includes(v))
    || (values.includes("none") && values.length !== 1) || new Set(values).size !== values.length) throw new Error("invalid_prompt");
  return values;
}

export function parseMaxAge(value: string | null | undefined): number | null {
  if (value == null) return null;
  if (!/^\d+$/.test(value)) throw new Error("invalid_max_age");
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error("invalid_max_age");
  return number;
}