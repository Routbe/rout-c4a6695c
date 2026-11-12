import { sql } from "./neon";
import { bankIdentityStatus } from "./admin-control-rules";

type Row = Record<string, unknown>;
const text = (v: unknown) => v == null ? null : String(v);
const number = (r: Row | undefined, key: string) => Number(r?.[key] ?? 0);

export async function commandOverview() {
  const [members, badges, actions, events, visits] = await sql.transaction([
    sql`select count(*) as total, count(*) filter (where coalesce(status, 'active') = 'active'
      and not coalesce(is_banned, false) and not coalesce(is_suspended, false)
      and not coalesce(is_shadowbanned, false)) as active from public.profiles`,
    sql`select (select count(*) from public.user_badges) as standard,
      (select count(*) from public.user_custom_badges) as custom`,
    sql`select (select count(distinct (user_id, tier)) from public.verification_payments where status in ('pending','incomplete')) as payments,
      (select count(*) from public.business_verifications where status = 'pending') as business,
      (select count(*) from public.influencer_requests where status = 'pending') as influencer,
      (select count(*) from public.sepa_review_queue where status = 'open') as sepa,
      (select count(*) from public.webhook_events where status in ('failed','error')) as failed`,
    sql`select id, source, kind, status, to_json(created_at) as created_at_iso from public.webhook_events
      order by created_at desc, id desc limit 8`,
    sql`select count(*) filter (where created_at >= now() - interval '1 day') as day,
      count(*) filter (where created_at >= now() - interval '7 days') as week,
      count(*) as month,
      (select count(*) from public.profiles where created_at >= now() - interval '7 days') as new_members
      from public.profile_visits where created_at >= now() - interval '30 days'`,
  ]);
  return { updatedAt: new Date().toISOString(), totalMembers: number(members[0], "total"),
    activeMembers: number(members[0], "active"), standardBadges: number(badges[0], "standard"), customBadges: number(badges[0], "custom"),
    verificationRequests: number(actions[0], "payments") + number(actions[0], "business") + number(actions[0], "influencer"),
    sepaReviews: number(actions[0], "sepa"),
    visitsDay: number(visits[0], "day"), visitsWeek: number(visits[0], "week"), visitsMonth: number(visits[0], "month"), newMembersWeek: number(visits[0], "new_members"), failedWebhooks: number(actions[0], "failed"),
    events: events.map((r) => ({ id: String(r["id"]), source: String(r["source"]), kind: text(r["kind"]),
      status: String(r["status"]), createdAt: String(r["created_at_iso"]) })) };
}

export async function financeOverview(input: { search: string; cursor: string | null }) {
  const search = input.search ? `%${input.search}%` : null;
  const rows = await sql`select t.user_id, t.iban, t.account_name, t.enabled, to_json(t.updated_at) as updated_at_iso,
    p.username, p.display_name, p.verified, p.verified_legal_name,
    i.is_verified, i.verified_real_name
    from public.tip_settings t left join public.profiles p on p.id = t.user_id
    left join public.identity_verifications i on i.user_id = t.user_id
    where nullif(trim(t.iban), '') is not null and (${input.cursor}::uuid is null or t.user_id > ${input.cursor}::uuid)
      and (${search}::text is null or p.username ilike ${search} or p.display_name ilike ${search} or t.iban ilike ${search} or t.account_name ilike ${search})
    order by t.user_id limit 51` as Row[];
  const [counts] = await sql`select count(*) as total,
    count(*) filter (where enabled) as enabled from public.tip_settings where nullif(trim(iban), '') is not null` as Row[];
  const { listSepaReviews, countSepaReviews } = await import("./sepa-review.server");
  const [reviews, reviewCounts] = await Promise.all([listSepaReviews({ status: "open", limit: 20 }), countSepaReviews()]);
  const accounts = rows.slice(0, 50).map((r) => {
    const identityVerified = r["is_verified"] === true;
    const verified = identityVerified || r["verified"] === true;
    const verifiedName = identityVerified ? text(r["verified_real_name"]) : text(r["verified_legal_name"]);
    return { userId: String(r["user_id"]), username: text(r["username"]), name: text(r["display_name"]),
      iban: String(r["iban"]), holder: text(r["account_name"]), verifiedName, enabled: r["enabled"] === true,
      identityStatus: bankIdentityStatus(text(r["account_name"]), verifiedName, verified), updatedAt: String(r["updated_at_iso"]) };
  });
  return { accounts, total: number(counts, "total"), enabled: number(counts, "enabled"),
    nextCursor: rows.length > 50 ? accounts.at(-1)?.userId ?? null : null,
    reviews: reviews.map((r) => ({ id: r.id, name: r.member_name, reference: r.reference,
      payer: r.payer_name, holder: r.holder_name, reason: r.reason })), openReviews: reviewCounts.open };
}

export async function infrastructureOverview(input: { kind: "webhooks" | "subdomains" | "aliases"; search: string; status: string; cursor: string | null }) {
  const like = input.search ? `%${input.search}%` : null;
  let rows: Row[];
  if (input.kind === "webhooks") {
    const cursor = input.cursor ? JSON.parse(input.cursor) as { date: string; id: string } : null;
    rows = await sql`select id, source, kind, status, attempts, result, error,
      to_json(created_at) as created_at_iso, to_json(completed_at) as completed_at_iso,
      to_jsonb(w)->>'http_status' as http_status, to_jsonb(w)->>'direction' as direction
      from public.webhook_events w where (${like}::text is null or id ilike ${like} or source ilike ${like} or kind ilike ${like})
      and (${input.status} = 'all' or status = ${input.status})
      and (${cursor?.date ?? null}::timestamptz is null or (created_at, id) < (${cursor?.date ?? null}::timestamptz, ${cursor?.id ?? null}::text))
      order by created_at desc, id desc limit 51` as Row[];
  } else if (input.kind === "subdomains") {
    rows = await sql`select id, username, display_name, subdomain_alias, subdomain_tier, root_subdomain_status,
      subdomain_enabled, to_json(updated_at) as updated_at_iso from public.profiles
      where nullif(subdomain_alias, '') is not null
      and (${like}::text is null or subdomain_alias ilike ${like} or username ilike ${like})
      and (${input.cursor}::uuid is null or id > ${input.cursor}::uuid) order by id limit 51` as Row[];
  } else {
    rows = await sql`with aliases as (
      select 'alias:' || a.id::text as id, a.alias, a.target_email, a.status, p.username,
        to_json(a.updated_at) as updated_at_iso from public.email_aliases a left join public.profiles p on p.id = a.user_id
      union all
      select 'profile:' || p.id::text, p.username || '@rout.be', p.forwarding_email,
        coalesce(p.alias_status, 'pending'), p.username, to_json(p.updated_at)
        from public.profiles p where p.username is not null and p.forwarding_email is not null
          and coalesce(p.alias_status, 'none') <> 'none'
          and not exists (select 1 from public.email_aliases a where a.alias = p.username || '@rout.be')
    ) select * from aliases
      where (${like}::text is null or alias ilike ${like} or target_email ilike ${like} or username ilike ${like})
      and (${input.status} = 'all' or status = ${input.status})
      and (${input.cursor}::text is null or id > ${input.cursor}) order by id limit 51` as Row[];
  }
  const items = rows.slice(0, 50).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, text(v)])));
  const last = items.at(-1);
  return { items, nextCursor: rows.length > 50 && last ? input.kind === "webhooks"
    ? JSON.stringify({ date: last["created_at_iso"], id: last["id"] }) : last["id"] : null, updatedAt: new Date().toISOString() };
}