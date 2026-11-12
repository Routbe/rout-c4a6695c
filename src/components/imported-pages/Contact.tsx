import { readProblemReport } from "@/lib/problem-report";
import { useEffect, useRef, useState } from "react";
import { Link } from "@/lib/router-compat";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Github,
  Image as ImageIcon,
  Loader2,
  Mail,
  UploadCloud,
  X,
} from "lucide-react";
import { BlueskyIcon, MastodonIcon } from "@/components/SocialIcons";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { submitContactMessage } from "@/lib/contact.functions";
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENT_BYTES,
  validateAttachmentFile,
} from "@/lib/contact-attachments";

export const CONTACT_EMAIL = "hallo@rout.be";
import { SOCIAL_LINKS, EXTERNAL_LINK_PROPS } from "@/lib/social-links";

const GITHUB_ISSUES = SOCIAL_LINKS.github;

const TOPICS = [
  { id: "general" },
  { id: "business" },
  { id: "partner" },
  { id: "bug" },
] as const;

type TopicId = (typeof TOPICS)[number]["id"];

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  subject: z.string().trim().min(1).max(150),
  message: z.string().trim().min(1).max(2000),
});

const inputClass =
  "w-full bg-background border border-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all";
const labelClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block";
const rowClass =
  "flex items-center justify-between gap-3 p-4 bg-muted/40 rounded-xl border border-border/50";

interface UploadedAttachment {
  key: string;
  name: string;
  size: number;
  mime: string;
}

const TEAM_SIZES = ["1-10", "11-50", "51-200", "200+"] as const;
const BUG_COMPONENTS = ["studio", "qr", "auth", "api", "other"] as const;
const BUG_SEVERITIES = ["low", "medium", "high", "critical"] as const;
const PARTNERSHIP_TYPES = ["media", "integration", "community"] as const;

export default function Contact() {
  const { t, locale } = useI18n();
  const sendMessage = useServerFn(submitContactMessage);
  const [topic, setTopic] = useState<TopicId>("general");
  const [form, setForm] = useState<{ name: string; email: string; message: string }>({
    name: "",
    email: "",
    message: "",
  });
  const [routHandle, setRoutHandle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [teamSize, setTeamSize] = useState<string>("");
  const [bugComponent, setBugComponent] = useState<string>("");
  const [bugSeverity, setBugSeverity] = useState<string>("");
  const [partnershipType, setPartnershipType] = useState<string>("");
  const [attachment, setAttachment] = useState<UploadedAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [honeypot, setHoneypot] = useState("");
  // Proof-of-time: stamped on mount, checked server-side against a 2s floor.
  const loadedAtRef = useRef<number | null>(null);
  useEffect(() => {
    loadedAtRef.current = Date.now();
    const report = readProblemReport(window.location.search);
    if (report !== null) {
      setTopic("bug");
      if (report) setForm((prev) => (prev.message ? prev : { ...prev, message: report }));
    }
  }, []);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);

  const field = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const currentSubject = t(`contact.subject.${topic}`);

  const copyEmail = async () => {
    await navigator.clipboard.writeText(CONTACT_EMAIL);
    setCopied(true);
    toast.success(t("contact.copy.done"));
    window.setTimeout(() => setCopied(false), 1600);
  };

  const pickTopic = (next: TopicId) => {
    setTopic(next);
    if (next !== "bug") setAttachment(null);
  };

  const uploadAttachment = async (file: File) => {
    const check = validateAttachmentFile(file.name, file.size);
    if (!check.ok) {
      toast.error(
        check.reason === "size"
          ? t("contact.attachment.err.size")
          : t("contact.attachment.err.type"),
      );
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/public/contact/attachment", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as Partial<UploadedAttachment> & {
        error?: string;
      };
      if (!res.ok || !json.key || !json.name || !json.mime || typeof json.size !== "number") {
        toast.error(t("contact.attachment.err.upload"));
        return;
      }
      setAttachment({ key: json.key, name: json.name, size: json.size, mime: json.mime });
      toast.success(t("contact.attachment.added"));
    } catch {
      toast.error(t("contact.attachment.err.upload"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || uploading) return;
    const parsed = schema.safeParse({ ...form, subject: currentSubject });
    if (!parsed.success) {
      console.warn("[contact] client validation failed:", parsed.error.flatten().fieldErrors);
      toast.error(t("contact.form.err.invalid"));
      return;
    }
    setSending(true);
    const requestPayload = {
      ...parsed.data,
      locale,
      category: topic,
      routHandle: routHandle.trim(),
      companyName: topic === "business" ? companyName.trim() : "",
      teamSize:
        topic === "business" && teamSize
          ? (teamSize as (typeof TEAM_SIZES)[number])
          : undefined,
      bugComponent:
        topic === "bug" && bugComponent
          ? (bugComponent as (typeof BUG_COMPONENTS)[number])
          : undefined,
      bugSeverity:
        topic === "bug" && bugSeverity
          ? (bugSeverity as (typeof BUG_SEVERITIES)[number])
          : undefined,
      partnershipType:
        topic === "partner" && partnershipType
          ? (partnershipType as (typeof PARTNERSHIP_TYPES)[number])
          : undefined,
      attachment: topic === "bug" && attachment ? attachment : undefined,
      company: honeypot,
      formLoadedAt: loadedAtRef.current ?? Date.now(),
    };
    console.info("[contact] submitting payload:", {
      ...requestPayload,
      message: `${requestPayload.message.length} chars`,
    });
    try {
      const result = await sendMessage({ data: requestPayload });
      console.info("[contact] server result:", result);
      if (!result.ok) {
        const base =
          result.reason === "rate_limited"
            ? t("contact.form.err.rate")
            : result.stored
              ? t("contact.form.err.stored_not_sent")
              : t("contact.form.err.network");
        toast.error(base, {
          description: result.detail,
          duration: 10000,
        });
        return;
      }
      setForm({ name: "", email: "", message: "" });
      setRoutHandle("");
      setCompanyName("");
      setTeamSize("");
      setBugComponent("");
      setBugSeverity("");
      setPartnershipType("");
      setAttachment(null);
      setSent(true);
      if (result.detail) {
        console.warn("[contact] partial delivery:", result.detail);
        toast.warning(t("contact.form.partial"), { description: result.detail, duration: 8000 });
      } else {
        toast.success(t("contact.form.success"));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[contact] submit failed:", error);
      toast.error(t("contact.form.err.network"), { description: message, duration: 10000 });
    } finally {
      setSending(false);
    }
  };

  return (
    <AppLayout crumbs={[{ label: t("contact.crumb") }]}>
      <div className="px-4 py-8 sm:py-14">
        <header className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">{t("contact.eyebrow")}</span>
          <h1 className="mt-2 font-serif text-4xl font-medium sm:text-5xl">
            {t("contact.heading")}
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">{t("contact.intro")}</p>
        </header>

        <div
          data-testid="contact-topics"
          role="tablist"
          aria-label={t("contact.topics.aria")}
          className="mx-auto mt-8 grid w-full max-w-2xl grid-cols-2 gap-1 rounded-xl bg-muted p-1 md:grid-cols-4"
        >
          {TOPICS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={topic === item.id}
              onClick={() => pickTopic(item.id)}
              className={cn(
                "rounded-lg px-2 py-2 text-xs font-medium transition-all md:text-sm",
                topic === item.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`contact.topic.${item.id}`)}
            </button>
          ))}
        </div>

        {topic === "bug" && (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            {t("contact.bugHint.before")}{" "}
            <a
              href={GITHUB_ISSUES}
              {...EXTERNAL_LINK_PROPS}
              className="text-foreground underline underline-offset-4"
            >
              {t("contact.bugHint.link")}
            </a>{" "}
            {t("contact.bugHint.after")}
          </p>
        )}

        <div className="mx-auto mt-8 max-w-xl space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
          {sent ? (
            <div
              data-testid="contact-success"
              role="status"
              className="flex flex-col items-center gap-3 py-6 text-center"
            >
              <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden />
              <h2 className="font-serif text-2xl font-medium">{t("contact.form.sentTitle")}</h2>
              <p className="max-w-sm text-sm text-muted-foreground">{t("contact.form.sentBody")}</p>
              <Button variant="outline" className="mt-2" onClick={() => setSent(false)}>
                {t("contact.form.again")}
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5" noValidate>
              <div>
                <label htmlFor="c-name" className={labelClass}>
                  {t("contact.field.name")}
                </label>
                <input
                  id="c-name"
                  name="name"
                  autoComplete="name"
                  placeholder={t("contact.field.namePlaceholder")}
                  className={inputClass}
                  maxLength={100}
                  disabled={sending}
                  value={form.name}
                  onChange={(e) => field("name", e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="c-email" className={labelClass}>
                  {t("contact.field.email")}
                </label>
                <input
                  id="c-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder={t("contact.field.emailPlaceholder")}
                  className={inputClass}
                  maxLength={255}
                  disabled={sending}
                  value={form.email}
                  onChange={(e) => field("email", e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="c-handle" className={labelClass}>
                  {t("contact.field.handle")}
                </label>
                <input
                  id="c-handle"
                  name="routHandle"
                  placeholder={t("contact.field.handlePlaceholder")}
                  className={inputClass}
                  maxLength={60}
                  disabled={sending}
                  value={routHandle}
                  onChange={(e) => setRoutHandle(e.target.value)}
                />
              </div>

              {topic === "business" && (
                <>
                  <div>
                    <label htmlFor="c-company-name" className={labelClass}>
                      {t("contact.field.companyName")}
                    </label>
                    <input
                      id="c-company-name"
                      name="companyName"
                      autoComplete="organization"
                      placeholder={t("contact.field.companyNamePlaceholder")}
                      className={inputClass}
                      maxLength={120}
                      disabled={sending}
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="c-team-size" className={labelClass}>
                      {t("contact.field.teamSize")}
                    </label>
                    <select
                      id="c-team-size"
                      className={inputClass}
                      disabled={sending}
                      value={teamSize}
                      onChange={(e) => setTeamSize(e.target.value)}
                    >
                      <option value="">{t("contact.field.choose")}</option>
                      {TEAM_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {topic === "partner" && (
                <div>
                  <label htmlFor="c-partnership" className={labelClass}>
                    {t("contact.field.partnershipType")}
                  </label>
                  <select
                    id="c-partnership"
                    className={inputClass}
                    disabled={sending}
                    value={partnershipType}
                    onChange={(e) => setPartnershipType(e.target.value)}
                  >
                    <option value="">{t("contact.field.choose")}</option>
                    {PARTNERSHIP_TYPES.map((kind) => (
                      <option key={kind} value={kind}>
                        {t(`contact.partnership.${kind}`)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {topic === "bug" && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="c-bug-component" className={labelClass}>
                        {t("contact.field.bugComponent")}
                      </label>
                      <select
                        id="c-bug-component"
                        className={inputClass}
                        disabled={sending}
                        value={bugComponent}
                        onChange={(e) => setBugComponent(e.target.value)}
                      >
                        <option value="">{t("contact.field.choose")}</option>
                        {BUG_COMPONENTS.map((component) => (
                          <option key={component} value={component}>
                            {t(`contact.component.${component}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="c-bug-severity" className={labelClass}>
                        {t("contact.field.bugSeverity")}
                      </label>
                      <select
                        id="c-bug-severity"
                        className={inputClass}
                        disabled={sending}
                        value={bugSeverity}
                        onChange={(e) => setBugSeverity(e.target.value)}
                      >
                        <option value="">{t("contact.field.choose")}</option>
                        {BUG_SEVERITIES.map((severity) => (
                          <option key={severity} value={severity}>
                            {t(`contact.severity.${severity}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <span className={labelClass}>{t("contact.attachment.title")}</span>
                    {attachment ? (
                      <div
                        data-testid="attachment-chip"
                        className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/40 px-4 py-3"
                      >
                        <span className="flex min-w-0 items-center gap-2 text-sm">
                          {attachment.mime.startsWith("image/") ? (
                            <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                          ) : (
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                          )}
                          <span className="truncate">{attachment.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {Math.max(1, Math.round(attachment.size / 1024))} KB
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setAttachment(null)}
                          aria-label={t("contact.attachment.remove")}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        data-testid="attachment-dropzone"
                        disabled={sending || uploading}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOver(false);
                          const file = e.dataTransfer.files?.[0];
                          if (file) void uploadAttachment(file);
                        }}
                        className={cn(
                          "flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
                          dragOver
                            ? "border-primary bg-primary/5"
                            : "border-border/70 hover:border-foreground/40",
                        )}
                      >
                        {uploading ? (
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
                        ) : (
                          <UploadCloud className="h-5 w-5 text-muted-foreground" aria-hidden />
                        )}
                        <span className="text-sm text-foreground">
                          {uploading
                            ? t("contact.attachment.uploading")
                            : t("contact.attachment.drop")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t("contact.attachment.hint", {
                            mb: String(Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))),
                          })}
                        </span>
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ATTACHMENT_ACCEPT}
                      className="hidden"
                      aria-hidden
                      tabIndex={-1}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadAttachment(file);
                      }}
                    />
                  </div>
                </>
              )}

              <div>
                <label htmlFor="c-message" className={labelClass}>
                  {t("contact.field.message")}
                </label>
                <textarea
                  id="c-message"
                  name="message"
                  placeholder={t("contact.field.messagePlaceholder")}
                  className={cn(inputClass, "min-h-36 resize-y")}
                  maxLength={2000}
                  disabled={sending}
                  value={form.message}
                  onChange={(e) => field("message", e.target.value)}
                />
              </div>

              {/* Honeypot — hidden from humans, irresistible to bots. */}
              <div aria-hidden className="absolute h-0 w-0 overflow-hidden opacity-0">
                <label htmlFor="c-company">Company</label>
                <input
                  id="c-company"
                  name="company"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={sending || uploading}
                aria-busy={sending}
                className="flex w-full select-none items-center justify-center rounded-xl bg-primary py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("contact.form.sending")}
                  </>
                ) : (
                  t("contact.form.send")
                )}
              </button>
            </form>
          )}
        </div>

        <section
          data-testid="direct-channels"
          className="mx-auto mt-6 max-w-xl space-y-2"
          aria-labelledby="direct-channels-heading"
        >
          <h2
            id="direct-channels-heading"
            className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {t("contact.channels.title")}
          </h2>

          <div className={rowClass}>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="flex min-w-0 items-center gap-2 text-sm text-foreground"
            >
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{CONTACT_EMAIL}</span>
            </a>
            <button
              type="button"
              onClick={copyEmail}
              aria-label={t("contact.copy.aria")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>

          <a href={GITHUB_ISSUES} {...EXTERNAL_LINK_PROPS} className={rowClass}>
            <span className="flex items-center gap-2 text-sm text-foreground">
              <Github className="h-4 w-4 text-muted-foreground" aria-hidden /> github.com/routbe
            </span>
            <span className="text-xs text-muted-foreground">{t("contact.channels.issues")}</span>
          </a>

          <a href={SOCIAL_LINKS.bluesky} {...EXTERNAL_LINK_PROPS} className={rowClass}>
            <span className="flex items-center gap-2 text-sm text-foreground">
              <BlueskyIcon className="h-4 w-4" /> bsky.app/profile/rout.be
            </span>
            <span className="text-xs text-muted-foreground">{t("contact.channels.bluesky")}</span>
          </a>

          <a href={SOCIAL_LINKS.mastodon} {...EXTERNAL_LINK_PROPS} className={rowClass}>
            <span className="flex items-center gap-2 text-sm text-foreground">
              <MastodonIcon className="h-4 w-4" /> mastodon.social/@routbe
            </span>
            <span className="text-xs text-muted-foreground">{t("contact.channels.fediverse")}</span>
          </a>

          <div className={rowClass}>
            <p className="text-xs text-muted-foreground">
              {t("contact.privacy.before")}{" "}
              <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">
                {t("contact.privacy.link")}
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
