import type { PointerEvent, ReactNode } from "react";
import { ArrowRight, ArrowUpRight, ChevronDown, Fingerprint } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router-compat";
import { useI18n } from "@/lib/i18n";
import { useReveal } from "@/hooks/useReveal";
import { cn } from "@/lib/utils";
import { discoverCopy } from "@/lib/discover/copy";
import { TOPICS, TOPIC_SLUGS, type TopicSlug } from "@/lib/discover/topics";
import { TopicVisual } from "./TopicVisual";
import { LightBars } from "./LightBars";

export function Reveal({ children, className, as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "li" }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return <Tag ref={ref as never} data-visible={visible ? "true" : "false"} className={cn("dsc-reveal", className)}>{children}</Tag>;
}

/** Moves a soft spotlight with the pointer (CSS reads --mx / --my). */
export function spotlight(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

const num = (i: number) => String(i + 1).padStart(2, "0");

export function TopicLanding({ slug }: { slug: TopicSlug }) {
  const { locale } = useI18n();
  const { ui, topics } = discoverCopy(locale);
  const c = topics[slug];
  const meta = TOPICS[slug];
  const index = TOPIC_SLUGS.indexOf(slug);
  const next = TOPIC_SLUGS[(index + 1) % TOPIC_SLUGS.length]!;

  return (
    <AppLayout width="full" revealFooter tone="infrastructure">
      <div className="dsc" data-topic={slug}>
        <section className="dsc-hero">
          <LightBars />
          <div className="dsc-glow" aria-hidden />
          <div className="dsc-hero-grid">
            <div className="dsc-hero-copy">
              <nav aria-label="Breadcrumb" className="dsc-crumbs">
                <Link to="/">ROUT</Link><span>/</span><Link to="/discover">{ui.allTopics}</Link>
              </nav>
              <p className="dsc-brand"><span className="dsc-brand-num">{num(index)}</span>{c.brand}</p>
              <h1 className="dsc-title">{c.title}</h1>
              <p className="dsc-lead">{c.lead}</p>
              <div className="dsc-actions">
                <Button asChild size="lg" className="dsc-cta"><Link to={meta.primary}>{c.primary}<ArrowRight className="h-4 w-4" /></Link></Button>
                <Button asChild size="lg" variant="outline" className="dsc-cta-ghost"><a href="#details">{ui.docsLabel}<ChevronDown className="h-4 w-4" /></a></Button>
              </div>
            </div>
            <div className="dsc-hero-visual">
              <TopicVisual slug={slug} />
              {c.chips.map((chip, i) => <span key={chip} className="dsc-chip" data-pos={i}>{chip}</span>)}
            </div>
          </div>
        </section>

        <section className="dsc-marquee" aria-label={ui.worksWith}>
          <p className="dsc-label">{ui.worksWith}</p>
          <div className="dsc-marquee-track">
            <div className="dsc-marquee-row">{[...c.works, ...c.works].map((w, i) => <span key={i} aria-hidden={i >= c.works.length}>{w}</span>)}</div>
          </div>
        </section>

        <section className="dsc-section">
          <Reveal className="dsc-inner">
            <p className="dsc-label">{ui.featuresLabel}</p>
            <h2 className="dsc-h2">{c.brand}</h2>
            <div className="dsc-bento">
              {c.features.map((f, i) => (
                <article key={f.title} className="dsc-tile" data-i={i} onPointerMove={spotlight}>
                  <span className="dsc-tile-num">{num(i)}</span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                  {i === 0 && <div className="dsc-tile-visual"><TopicVisual slug={slug} compact /></div>}
                </article>
              ))}
            </div>
          </Reveal>
        </section>

        <section className="dsc-section">
          <Reveal className="dsc-inner">
            <p className="dsc-label">{ui.stepsLabel}</p>
            <h2 className="dsc-h2">{ui.stepsTitle}</h2>
            <ol className="dsc-steps">
              {c.steps.map((s, i) => (
                <li key={s.title} style={{ transitionDelay: `${i * 140}ms` }}>
                  <span className="dsc-step-dot">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </section>

        <section className="dsc-section">
          <Reveal className="dsc-inner dsc-faq-grid">
            <div>
              <p className="dsc-label">{ui.faqLabel}</p>
              <h2 className="dsc-h2">{c.brand}</h2>
            </div>
            <div className="dsc-faq">
              {c.faq.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}<ChevronDown className="h-4 w-4" aria-hidden /></summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </section>

        <section id="details" className="dsc-section scroll-mt-20">
          <Reveal className="dsc-inner">
            <p className="dsc-label">{ui.docsLabel}</p>
            <h2 className="dsc-h2">{ui.docsTitle}</h2>
            <ul className="dsc-docs">
              {meta.docs.map((path, i) => (
                <li key={path}>
                  <Link to={path} className="dsc-doc" onPointerMove={spotlight}>
                    <span className="dsc-tile-num">{num(i)}</span>
                    <span className="dsc-doc-title">{c.docs[i]}</span>
                    <span className="dsc-doc-path">rout.be{path}</span>
                    <ArrowUpRight className="h-4 w-4" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        <section className="dsc-final">
          <div className="dsc-final-ring" aria-hidden />
          <Reveal className="dsc-inner dsc-final-inner">
            <h2 className="dsc-h2">{c.final.title}</h2>
            <p className="dsc-lead">{c.final.text}</p>
            <div className="dsc-actions dsc-actions-center">
              <Button asChild size="lg" className="dsc-cta"><Link to="/auth"><Fingerprint className="h-4 w-4" />{ui.claim}</Link></Button>
              <Button asChild size="lg" variant="outline" className="dsc-cta-ghost"><Link to={meta.primary}>{c.primary}<ArrowUpRight className="h-4 w-4" /></Link></Button>
            </div>
          </Reveal>
        </section>

        <Link to={`/discover/${next}`} className="dsc-next" data-topic={next}>
          <span className="dsc-label">{ui.next}</span>
          <span className="dsc-next-name">{topics[next].brand}</span>
          <span className="dsc-next-title">{topics[next].title}</span>
          <ArrowRight className="dsc-next-arrow h-6 w-6" aria-hidden />
        </Link>
      </div>
    </AppLayout>
  );
}
