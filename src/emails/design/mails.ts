/**
 * Every ROUT mail type, built on the one design in `layout.ts`.
 *
 * - `brevoTemplate(kind, lang)` → HTML + subject with Brevo `{{ params.X }}`
 *   placeholders; synced to Brevo by `scripts/sync-brevo-templates.ts`.
 * - `renderAuthMail(intent, lang, values)` → final HTML with real, escaped
 *   values for the auth mails the app renders itself (login, reset, …).
 */
import { box, button, codeBox, esc, greeting, h1, notice, p, quote, shell, urlBox, type Accent } from "./layout";
import { copyFor, type CopyPack } from "./copy";
import { workspaceCopyFor } from "./workspace-copy";

/** Brevo placeholder with UPPER → lower → literal fallback. */
export const P = (key: string, fallback: string) =>
  `{{ params.${key} | default: params.${key.toLowerCase()} | default: "${fallback.replace(/"/g, "&quot;")}" }}`;

/** Same, single-quoted, for use inside an href="…" attribute (URL fallbacks only). */
export const PA = (key: string, fallback: string) =>
  `{{ params.${key} | default: params.${key.toLowerCase()} | default: '${fallback}' }}`;

const DASHBOARD = "https://rout.be/dashboard";

function greetPlain(c: CopyPack, name: string): string {
  if (name) return c.greet.replace("{name}", name);
  if (c.nameFallback) return c.greet.replace("{name}", c.nameFallback);
  return c.greet.replace(/\s*\{name\}\s*/, "").replace(/^([,，])/, "").replace(/\s+([,:：，])/, "$1");
}

/** Greeting that works with or without a NAME param in Brevo. */
function greetLiquid(c: CopyPack): string {
  const withName = c.greet.replace("{name}", "{{ params.NAME | default: params.name }}");
  const without = greetPlain(c, "");
  return `{% if params.NAME or params.name %}${withName}{% else %}${without}{% endif %}`;
}

export const BREVO_KINDS = ["auth", "login", "form", "payConfirm", "payment", "payIssue", "renewal", "cancel", "refund"] as const;
export type BrevoKind = (typeof BREVO_KINDS)[number];

export interface BuiltMail {
  subject: string;
  html: string;
}

export function brevoTemplate(kind: BrevoKind, lang: string): BuiltMail {
  const c = copyFor(lang);
  const g = greeting(greetLiquid(c));
  const D = c.desks;
  const mk = (subject: string, pre: string, badge: string, accent: Accent, desk: { name: string; role: string }, title: string, body: string[]): BuiltMail => ({
    subject,
    html: shell({ lang, title, preheader: pre, badge, accent, desk, body: [h1(title), ...body] }),
  });
  switch (kind) {
    case "auth": {
      // Shared localized auth block (login, verify, reset, e-mail change, invite,
      // re-auth, deletion): the sender supplies TITLE/BODY/CTA/LINK/CODE.
      const t = c.login;
      const link = PA("LINK", "https://rout.be/auth").replace("params.link |", "params.link | default: params.MAGIC_LINK | default: params.magic_link |");
      return {
        subject: `${P("TITLE", t.title)} // ROUT`,
        html: shell({
          lang,
          title: t.title,
          preheader: P("PREHEADER", t.pre),
          badge: P("BADGE", t.badge),
          accent: "auth",
          desk: D.auth,
          body: [
            h1(P("TITLE", t.title)),
            "{% if params.NAME or params.name %}" + g + "{% endif %}",
            p(P("BODY", t.intro)),
            "{% if params.CODE or params.code %}" + codeBox(P("CODE_LABEL", t.codeLabel), "{{ params.CODE | default: params.code }}") + "{% endif %}",
            "{% if params.LINK or params.link or params.MAGIC_LINK or params.magic_link %}" +
              button(P("CTA", t.button), link) + urlBox(t.urlLabel, link) + "{% endif %}",
            notice(P("FOOTER", t.notice)),
          ],
        }),
      };
    }
    case "login": {
      const t = c.login;
      const link = PA("MAGIC_LINK", "https://rout.be/auth").replace("params.magic_link", "params.url | default: params.link");
      return mk(t.subject.replace("{code}", "{{ params.CODE | default: params.code }}"), t.pre, t.badge, "auth", D.auth, t.title, [
        p(t.intro),
        codeBox(t.codeLabel, P("CODE", "______").replace("params.code |", "params.code | default: params.token |")),
        button(t.button, link),
        urlBox(t.urlLabel, link),
        notice(t.notice),
      ]);
    }
    case "form": {
      const t = c.form;
      return mk(t.subject, t.pre, t.badge, "success", D.desk, t.title, [g, p(t.intro), quote(t.boxTitle, P("MESSAGE", "—")), p(t.outro)]);
    }
    case "payConfirm": {
      const t = c.payConfirm;
      return mk(t.subject, t.pre, t.badge, "paid", D.billing, t.title, [
        g,
        p(t.intro),
        box(t.boxTitle, [[t.amount, P("AMOUNT", "—")], [t.invoice, P("INVOICE_ID", "—")], [t.date, P("DATE", c.today)]]),
        p(t.outro),
      ]);
    }
    case "payment": {
      const t = c.payment;
      return mk(t.subject, t.pre, t.badge, "success", D.billing, t.title, [
        g,
        p(t.intro),
        box(t.boxTitle, [[t.amount, P("AMOUNT", "—")], [t.invoice, P("INVOICE_ID", "—")], [t.method, P("METHOD", t.methodFallback)]]),
        p(t.outro),
      ]);
    }
    case "payIssue": {
      const t = c.payIssue;
      return mk(t.subject, t.pre, t.badge, "danger", D.billing, t.title, [
        g,
        p(t.intro),
        box(t.boxTitle, [[t.amount, P("AMOUNT", "—")], [t.invoice, P("INVOICE_ID", "—")], [t.reason, P("REASON", t.reasonFallback)]]),
        button(t.button, PA("URL", DASHBOARD)),
        p(t.outro),
      ]);
    }
    case "renewal": {
      const t = c.renewal;
      return mk(t.subject, t.pre, t.badge, "warning", D.billing, t.title, [
        g,
        p(t.intro),
        box(t.boxTitle, [[t.plan, P("PLAN", "ROUT Node")], [t.amount, P("AMOUNT", "—")], [t.date, P("DATE", t.dateFallback)]]),
        button(t.button, PA("URL", DASHBOARD)),
        p(t.outro),
      ]);
    }
    case "cancel": {
      const t = c.cancel;
      return mk(t.subject, t.pre, t.badge, "neutral", D.billing, t.title, [
        g,
        p(t.intro),
        box(t.boxTitle, [[t.plan, P("PLAN", "ROUT Node")], [t.end, P("END_DATE", t.endFallback)]]),
        button(t.button, PA("URL", DASHBOARD), "ghost"),
        p(t.outro),
      ]);
    }
    case "refund": {
      const t = c.refund;
      return mk(t.subject, t.pre, t.badge, "info", D.billing, t.title, [
        g,
        p(t.intro),
        box(t.boxTitle, [[t.amount, P("AMOUNT", "—")], [t.credit, P("CREDIT_ID", "—")], [t.reason, P("REASON", t.reasonFallback)]]),
        p(t.outro),
      ]);
    }
  }
}

// ---------- internal / admin Brevo templates (NL + EN) ----------

export function adminContactTemplate(): BuiltMail {
  const c = copyFor("nl");
  return {
    subject: "[{{ params.SUBJECT | default: params.subject | default: 'Contact' }}] Inkomend van {{ params.NAME | default: params.name | default: 'Bezoeker' }}",
    html: shell({
      lang: "nl",
      title: "Inkomend bericht",
      preheader: `Inkomend bericht van ${P("NAME", "Bezoeker")} via rout.be`,
      badge: "ADMIN NODE",
      accent: "info",
      desk: c.desks.ops,
      body: [
        h1("Inkomend bericht"),
        box("Afzender:", [["Van:", P("NAME", "Onbekend")], ["E-mail:", P("EMAIL", "Geen e-mail")], ["Onderwerp:", P("SUBJECT", "Geen onderwerp")], ["Tijdstip:", P("DATE", "Zojuist")]]),
        quote("Bericht:", P("MESSAGE", "—")),
        notice("Antwoord rechtstreeks op deze e-mail om de afzender te bereiken."),
      ],
    }),
  };
}

export function subdomainClaimTemplate(): BuiltMail {
  const c = copyFor("nl");
  const sub = "{{ params.requested_subdomain | default: 'naam.rout.be' }}";
  return {
    subject: `⚡ [ACTIE VEREIST] Root-subdomein claim: ${sub}`,
    html: shell({
      lang: "nl",
      title: "Root-subdomein aanvraag",
      preheader: `Nieuwe root-subdomein claim voor ${sub}. Voeg het CNAME-record toe in Infomaniak.`,
      badge: "DNS NODE",
      accent: "warning",
      desk: c.desks.ops,
      body: [
        h1("Root-subdomein aanvraag"),
        p("Een gebruiker heeft een direct root-subdomein geclaimd. Voeg het onderstaande CNAME-record toe in Infomaniak om de routering te voltooien."),
        codeBox("Aangevraagd subdomein", `<span style="font-size: 18px; letter-spacing: 0.02em;">${sub}</span>`),
        box("Gegevens:", [
          ["Gebruiker:", "{{ params.user_name | default: 'Onbekend' }}"],
          ["E-mailadres:", "{{ params.user_email | default: '—' }}"],
          ["CNAME-bron:", "{{ params.cname_source | default: '—' }}"],
        ]),
        button("Naar subdomeinen &rarr;", "https://rout.be/admin/subdomains"),
      ],
    }),
  };
}

export function systemNoticeTemplate(lang: "nl" | "en" = "en"): BuiltMail {
  const c = copyFor(lang);
  const title = P("TITLE", lang === "nl" ? "Systeemmelding" : "System notice");
  return {
    subject: `${title} // ROUT`,
    html: shell({
      lang,
      title: lang === "nl" ? "Systeemmelding" : "System notice",
      preheader: P("PREHEADER", lang === "nl" ? "Systeemmelding van ROUT." : "System notification from ROUT."),
      badge: "SYSTEM NODE",
      accent: "neutral",
      desk: c.desks.ops,
      body: [
        h1(title),
        greeting(greetLiquid(c)),
        p(P("MESSAGE", lang === "nl" ? "Dit is een automatische melding van ROUT." : "This is an automated notification from ROUT.")),
        "{% if params.DETAILS or params.details %}" + quote("Details:", "{{ params.DETAILS | default: params.details }}") + "{% endif %}",
        "{% if params.ACTION_URL %}" + button("{{ params.BUTTON_TEXT | default: 'Open' }} &rarr;", "{{ params.ACTION_URL }}") + "{% endif %}",
      ],
    }),
  };
}

// ---------- auth mails rendered by the app ----------

export type AuthIntent =
  | "magic-link" | "verification" | "password-reset" | "email-change" | "welcome"
  | "workspace-owner-invite" | "workspace-member-onboarding";

export function renderAuthMail(intent: AuthIntent, lang: string, v: { link?: string; code?: string; name?: string; to?: string }): BuiltMail {
  const c = copyFor(lang);
  const link = v.link && /^https?:\/\//i.test(v.link) ? esc(v.link) : "";
  const code = v.code ? esc(v.code) : "";
  const name = v.name ? esc(v.name) : "";
  const desk = c.desks.auth;
  const wrap = (subject: string, pre: string, badge: string, accent: Accent, title: string, body: string[]): BuiltMail => ({
    subject,
    html: shell({
      lang, title, preheader: pre, badge, accent, desk, body: [h1(title), ...body],
      ...(link && v.link ? { actionUrl: v.link } : {}),
      recipient: v.to ? esc(v.to) : "je e-mailadres",
    }),
  });
  const linkBlocks = (btn: string, urlLabel: string) => (link ? [button(btn, link), urlBox(urlLabel, link)] : []);

  if (intent === "workspace-owner-invite" || intent === "workspace-member-onboarding") {
    const pack = workspaceCopyFor(lang);
    const t = intent === "workspace-owner-invite" ? pack.ownerInvite : pack.memberOnboarding;
    const wsName = name || "ROUT Workspace";
    const fill = (s: string) => s.replace(/\{name\}/g, wsName);
    const plainName = v.name ?? "ROUT Workspace";
    return wrap(t.subject.replace(/\{name\}/g, plainName), t.pre, t.badge, intent === "workspace-owner-invite" ? "auth" : "success", fill(t.title), [
      p(fill(t.intro)),
      p(t.steps),
      ...(link ? linkBlocks(t.button, t.urlLabel) : [button(t.button, DASHBOARD)]),
      notice(t.notice),
    ]);
  }
  if (intent === "magic-link") {
    const t = c.login;
    const subject = code ? t.subject.replace("{code}", v.code ?? "") : t.title + " // ROUT";
    return wrap(subject, t.pre, t.badge, "auth", t.title, [
      p(t.intro),
      ...(code ? [codeBox(t.codeLabel, code)] : []),
      ...linkBlocks(t.button, t.urlLabel),
      notice(t.notice),
    ]);
  }
  if (intent === "welcome") {
    const t = c.welcome;
    return wrap(t.subject, t.pre, t.badge, "success", t.title, [
      greeting(greetPlain(c, name)),
      p(t.intro),
      button(t.button, link || DASHBOARD),
      notice(t.notice),
    ]);
  }
  const t = intent === "password-reset" ? c.recovery : intent === "email-change" ? c.emailChange : c.confirmation;
  const accent: Accent = intent === "verification" ? "auth" : "warning";
  return wrap(t.subject, t.pre, t.badge, accent, t.title, [
    greeting(greetPlain(c, name)),
    p(t.intro),
    ...(code ? [codeBox(c.login.codeLabel, code)] : []),
    ...linkBlocks(t.button, t.urlLabel),
    notice(t.notice),
  ]);
}
