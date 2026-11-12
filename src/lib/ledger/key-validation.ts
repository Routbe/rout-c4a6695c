import { z } from "zod";
const base64 = (length: number) => z.string().refine((value) => {
  try { return /^[A-Za-z0-9+/]+={0,2}$/.test(value) && atob(value).length === length; } catch { return false; }
}, "Ongeldige versleutelingsenvelop");
export const ledgerEnvelopeSchema = z.object({ v: z.literal(1), source: z.enum(["recovery", "prf"]), salt: base64(32), iv: base64(12),
  ciphertext: z.string().min(100).max(12000).refine((v) => { try { return atob(v).length >= 100; } catch { return false; } }), credentialId: z.string().max(2048).optional() }).strict();
export const ledgerPublicKeySchema = z.object({ kty: z.literal("RSA"), n: z.string().regex(/^[A-Za-z0-9_-]{512}$/), e: z.literal("AQAB"),
  alg: z.literal("RSA-OAEP-256").optional(), ext: z.boolean().optional(), key_ops: z.array(z.literal("encrypt")).optional() }).strict();
export type LedgerPublicKey = z.infer<typeof ledgerPublicKeySchema>;
export const ledgerKeyInputSchema = z.object({ publicKey: ledgerPublicKeySchema, envelopes: z.array(ledgerEnvelopeSchema).min(1).max(2), expectedKeyId: z.string().nullable() }).strict()
  .superRefine((d, ctx) => {
    if (d.envelopes.filter((e) => e.source === "recovery").length !== 1 || d.envelopes.filter((e) => e.source === "prf").length > 1)
      ctx.addIssue({ code: "custom", message: "Precies één herstelcode-envelop is verplicht." });
    if (d.envelopes.some((e) => e.source === "prf" && !e.credentialId)) ctx.addIssue({ code: "custom", message: "PRF vereist een passkeykoppeling." });
  });