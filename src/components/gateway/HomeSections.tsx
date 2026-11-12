import { ArrowUpRight, AtSign, Check, EyeOff, Globe, KeyRound, Layers, Lock, Mail, Nfc, ShieldCheck, UserRound, VenetianMask, Wallet } from "lucide-react";
import { useRef, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router-compat";
import { useI18n } from "@/lib/i18n";

const STEPS = [AtSign, Layers, Wallet] as const;
const PUBLIC = [UserRound, ShieldCheck, Globe] as const;
const PRIVATE = [Mail, KeyRound, Lock, VenetianMask] as const;
const CARDS = [
  { key: "public", Icon: Globe },
  { key: "stealth", Icon: EyeOff },
  { key: "key", Icon: Nfc },
] as const;
const FAQ = ["scan", "security", "lost", "compare", "metal", "free"] as const;

/** Homepage blocks: three steps, public vs. private, the three cards, pricing and FAQ. */
export function HomeSections() {
  const { t } = useI18n();
  const rail = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const onRail = () => { const el = rail.current; if (!el) return; const w = el.firstElementChild?.clientWidth ?? 1; setActive(Math.min(CARDS.length - 1, Math.round(el.scrollLeft / (w + 12)))); };
  const go = (i: number) => { const el = rail.current?.children[i] as HTMLElement | undefined; el?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" }); };
  return (
    <>
      <section className="story-section home-block" aria-labelledby="home-steps">
        <div className="story-inner">
          <p className="story-small-label">{t("home.steps.kicker")}</p>
          <h2 id="home-steps" className="story-heading mt-5">{t("home.steps.title")}</h2>
          <ol className="home-grid-3 mt-12">
            {STEPS.map((Icon, i) => (
              <li key={i} className="home-ledge p-7">
                <div className="flex items-center justify-between"><span className="font-mono text-xs text-primary">0{i + 1}</span><Icon className="h-5 w-5 text-primary" aria-hidden /></div>
                <h3 className="mt-8 font-display text-2xl">{t(`home.steps.${i + 1}.title`)}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t(`home.steps.${i + 1}.text`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="story-section home-block" aria-labelledby="home-zk">
        <div className="story-inner">
          <p className="story-small-label">{t("home.zk.kicker")}</p>
          <h2 id="home-zk" className="story-heading mt-5">{t("home.zk.title")}</h2>
          <p className="story-prose mt-6">{t("home.zk.text")}</p>
          <div className="home-split mt-12">
            <div className="home-ledge p-7">
              <p className="font-mono text-xs text-primary">rout.be/@jouwnaam</p>
              <h3 className="mt-4 font-display text-2xl">{t("home.zk.public")}</h3>
              <ul className="mt-6 space-y-3">{PUBLIC.map((Icon, i) => <li key={i} className="flex items-center gap-3 text-sm"><Icon className="h-4 w-4 text-primary" aria-hidden />{t(`home.zk.public.${i + 1}`)}</li>)}</ul>
            </div>
            <div className="home-ledge home-vault p-7">
              <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" aria-hidden />{t("home.zk.sealed")}</p>
              <h3 className="mt-4 font-display text-2xl">{t("home.zk.private")}</h3>
              <ul className="mt-6 space-y-3">{PRIVATE.map((Icon, i) => <li key={i} className="flex items-center gap-3 text-sm text-muted-foreground"><Icon className="h-4 w-4" aria-hidden /><span className="home-redact">{t(`home.zk.private.${i + 1}`)}</span></li>)}</ul>
            </div>
          </div>
        </div>
      </section>

      <section className="story-section home-block" aria-labelledby="home-cards">
        <div className="story-inner">
          <p className="story-small-label">{t("home.cards.kicker")}</p>
          <h2 id="home-cards" className="story-heading mt-5">{t("home.cards.title")}</h2>
          <div ref={rail} onScroll={onRail} className="home-grid-3 home-swipe mt-12">
            {CARDS.map(({ key, Icon }) => key === "key" ? (
              <article key={key} className="flex flex-col gap-5">
                <div className={`home-card home-card-${key} ring-2 ring-primary/60`} aria-hidden>
                  <div className="flex items-start justify-between"><span className="font-display text-lg tracking-[0.2em]">ROUT</span><Icon className="h-5 w-5" /></div>
                  <div className="home-chip" />
                  <div className="flex items-end justify-between font-mono text-[10px] uppercase tracking-widest"><span>{t("home.cards.private")}</span><span>•••• 60s</span></div>
                </div>
                <div>
                  <h3 className="flex items-center gap-2 font-display text-2xl">{t("home.cards.key.name")}<Lock className="h-4 w-4 text-primary" aria-hidden /></h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("home.cards.key.text")}</p>
                  <ul className="mt-3 space-y-1.5">{[1, 2, 3].map((n) => <li key={n} className="flex gap-2 text-xs"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />{t(`home.cards.key.f${n}`)}</li>)}</ul>
                </div>
              </article>
            ) : (
              <Link key={key} to="/explore" className="group flex flex-col gap-5">
                <div className={`home-card home-card-${key}`} aria-hidden>
                  <div className="flex items-start justify-between"><span className="font-display text-lg tracking-[0.2em]">ROUT</span><Icon className="h-5 w-5" /></div>
                  <div className="home-chip" />
                  <div className="flex items-end justify-between font-mono text-[10px] uppercase tracking-widest"><span>{t(`home.cards.${key}.name`)}</span><span>{key === "stealth" ? "/u/••••" : "@handle"}</span></div>
                </div>
                <div>
                  <h3 className="font-display text-2xl">{t(`home.cards.${key}.name`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`home.cards.${key}.text`)}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs text-primary group-hover:underline">{t("home.cards.profileLink")}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></span>
                </div>
              </Link>
            ))}
          </div>
          <div className="home-dots">{CARDS.map(({ key }, i) => <button key={key} type="button" aria-label={t(`home.cards.${key}.name`)} aria-current={active === i} onClick={() => go(i)} />)}</div>
          <Button asChild variant="outline" className="infra-action mt-10 gap-2"><Link to="/info/wallet">{t("home.cards.cta")}<ArrowUpRight className="h-4 w-4" /></Link></Button>
        </div>
      </section>

      <section className="story-section home-block" aria-labelledby="home-pricing">
        <div className="story-inner">
          <p className="story-small-label">{t("home.pricing.kicker")}</p>
          <h2 id="home-pricing" className="story-heading mt-5">{t("home.pricing.title")}</h2>
          <div className="home-split mt-12">
            {(["personal", "teams"] as const).map((plan) => (
              <div key={plan} className="home-ledge flex flex-col p-7">
                <p className="story-small-label">{t(`home.pricing.${plan}.name`)}</p>
                <p className="mt-4 font-display text-4xl">{t(`home.pricing.${plan}.price`)}</p>
                <ul className="mt-6 flex-1 space-y-3">{[1, 2, 3].map((n) => <li key={n} className="flex gap-3 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{t(`home.pricing.${plan}.${n}`)}</li>)}</ul>
                <Button asChild variant={plan === "personal" ? "default" : "outline"} className="infra-action mt-8"><Link to={plan === "personal" ? "/auth" : "/solutions/agencies"}>{t(`home.pricing.${plan}.cta`)}</Link></Button>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-muted-foreground">{t("home.pricing.pilot")}</p>
        </div>
      </section>

      <section className="story-section home-block" aria-labelledby="home-faq">
        <div className="story-inner">
          <p className="story-small-label">FAQ</p>
          <h2 id="home-faq" className="story-heading mt-5">{t("home.faq.title")}</h2>
          <Accordion type="single" collapsible className="mt-10 max-w-3xl">
            {FAQ.map((k) => (
              <AccordionItem key={k} value={k}>
                <AccordionTrigger className="text-left font-display text-lg">{t(`home.faq.${k}.q`)}</AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{t(`home.faq.${k}.a`)}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </>
  );
}
