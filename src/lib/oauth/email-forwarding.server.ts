/** Server side of the private relay: rules, inbound delivery and transport logging. */
import { sql } from "@/lib/neon";
import { pairwiseSubject } from "./subject";
import {
  FORWARD_DOMAIN_DEFAULT,
  FORWARD_RATE,
  decideForward,
  forwardAliasLocal,
  messageIdHash,
  parseForwardAddress,
  type ForwardRule,
} from "./email-forwarding";

type Row = Record<string, unknown>;

export function forwardDomain(): string {
  return (process.env["ROUT_FORWARD_EMAIL_DOMAIN"] ?? "").trim().toLowerCase() || FORWARD_DOMAIN_DEFAULT;
}

async function relayLocal(userId: string, clientId: string): Promise<string> {
  const secret = process.env["ROUT_PROVIDER_PAIRWISE_SECRET"] ?? "";
  return forwardAliasLocal(await pairwiseSubject(secret, `relay:${clientId}`, userId));
}

/** The relay address for one user + app, without creating anything (null when the secret is missing). */
export async function relayAddressFor(userId: string, clientId: string): Promise<string | null> {
  try {
    return `${await relayLocal(userId, clientId)}@${forwardDomain()}`;
  } catch {
    return null;
  }
}

/** Creates (or returns) the relay address for one user + app. */
export async function ensureForwardingAddress(userId: string, clientId: string): Promise<string> {
  const local = await relayLocal(userId, clientId);
  const rows = (await sql`insert into public.oauth_email_forwarding_rules (user_id, client_id, alias_local)
    values (${userId}, ${clientId}, ${local})
    on conflict (user_id, client_id) do update set status = 'active', updated_at = now()
    returning alias_local`) as Row[];
  const address = `${String(rows[0]?.["alias_local"] ?? local)}@${forwardDomain()}`;
  // Keep the identity relay registry in lockstep with the delivery rule.
  const { recordRelay } = await import("./identity-relays.server");
  await recordRelay(userId, clientId, address);
  return address;
}

export type InboundMail = {
  messageId: string | null;
  from: string;
  fromName: string | null;
  to: string[];
  subject: string;
  html: string | null;
  text: string | null;
  sizeBytes: number;
};

export type InboundResult = { alias: string; status: "forwarded" | "rejected" | "failed"; reason: string | null };

async function logDelivery(ruleId: string | null, userId: string | null, status: InboundResult["status"], reason: string | null, size: number, hash: string | null) {
  try {
    await sql`insert into public.oauth_email_deliveries (rule_id, user_id, status, reason, size_bytes, message_id_hash)
      values (${ruleId}, ${userId}, ${status}, ${reason}, ${size}, ${status === "forwarded" ? hash : null})`;
  } catch (e) {
    console.warn("[email-forward] log failed", (e as Error)?.message);
  }
}

/** Forwards one inbound mail to every relay address it was sent to. Never throws. */
export async function deliverInbound(mail: InboundMail): Promise<InboundResult[]> {
  const domain = forwardDomain();
  const aliases = [...new Set(mail.to.map((a) => parseForwardAddress(a, domain)).filter((a): a is string => !!a))].slice(0, 5);
  const hash = await messageIdHash(mail.messageId);
  const out: InboundResult[] = [];
  for (const alias of aliases) {
    try {
      const r = ((await sql`select r.id, r.user_id, r.status, u.email, u.email_confirmed_at
          from public.oauth_email_forwarding_rules r
          left join public.users u on u.id = r.user_id
         where r.alias_local = ${alias} limit 1`) as Row[])[0];
      const ruleId = r ? String(r["id"]) : null;
      const userId = r ? String(r["user_id"]) : null;
      let duplicate = false;
      if (ruleId && hash) {
        duplicate = ((await sql`select 1 from public.oauth_email_deliveries
          where rule_id = ${ruleId} and message_id_hash = ${hash} and status = 'forwarded' limit 1`) as Row[]).length > 0;
      }
      let rateOk = true;
      if (ruleId && !duplicate) {
        const { hitRateLimit } = await import("@/lib/rate-limit-db.server");
        rateOk = (await hitRateLimit("email-forward", ruleId, FORWARD_RATE)).ok;
      }
      const target = (r?.["email"] as string | null) ?? null;
      const decision = decideForward({
        rule: r ? ({ status: r["status"] } as ForwardRule) : null,
        targetEmail: target,
        targetVerified: Boolean(r?.["email_confirmed_at"]),
        fromAddress: mail.from,
        sizeBytes: mail.sizeBytes,
        duplicate,
        rateOk,
        domain,
      });
      if (decision.action === "reject") {
        if (ruleId) await logDelivery(ruleId, userId, "rejected", decision.reason, mail.sizeBytes, null);
        out.push({ alias, status: "rejected", reason: decision.reason });
        continue;
      }
      const { sendMail } = await import("@/emails/send.server");
      const { sanitizeForwardedHtml } = await import("@/lib/security/sanitize-html");
      const note = `Dit bericht is verzonden via het contactformulier op ROUT.be (doorgestuurd via ${alias}@${domain})`;
      const sent = await sendMail({
        to: target!,
        subject: mail.subject.slice(0, 250) || "(geen onderwerp)",
        html: mail.html
          ? `<p style="font-size:12px;color:#666">${note}</p>${sanitizeForwardedHtml(mail.html)}`
          : undefined,
        text: `${note}\n\n${mail.text ?? ""}`,
        replyTo: { email: mail.from, name: mail.fromName ?? undefined },
        tags: ["relay"],
        skipAdminAlert: true,
      });
      const status = sent.sent ? "forwarded" : "failed";
      await logDelivery(ruleId, userId, status, sent.sent ? null : "send_failed", mail.sizeBytes, hash);
      out.push({ alias, status, reason: sent.sent ? null : "send_failed" });
    } catch (e) {
      console.error("[email-forward] delivery error", (e as Error)?.message);
      out.push({ alias, status: "failed", reason: "error" });
    }
  }
  return out;
}
