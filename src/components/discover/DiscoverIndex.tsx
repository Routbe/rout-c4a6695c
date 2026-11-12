import { ArrowUpRight } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Link } from "@/lib/router-compat";
import { useI18n } from "@/lib/i18n";
import { discoverCopy } from "@/lib/discover/copy";
import { TOPIC_SLUGS } from "@/lib/discover/topics";
import { TopicVisual } from "./TopicVisual";
import { LightBars } from "./LightBars";
import { Reveal, spotlight } from "./TopicLanding";

/** Tiles linking to every product line; also used on the home page. */
export function TopicTiles() {
  const { locale } = useI18n();
  const { ui, topics } = discoverCopy(locale);
  return (
    <ul className="dsc-tiles">
      {TOPIC_SLUGS.map((slug, i) => (
        <li key={slug}>
          <Link to={`/discover/${slug}`} className="dsc-topic" data-topic={slug} onPointerMove={spotlight}>
            <div className="dsc-topic-visual"><TopicVisual slug={slug} compact /></div>
            <div className="dsc-topic-copy">
              <span className="dsc-tile-num">{String(i + 1).padStart(2, "0")}</span>
              <span className="dsc-topic-brand">{topics[slug].brand}</span>
              <span className="dsc-topic-title">{topics[slug].title}</span>
              <span className="dsc-topic-more">{ui.readMore}<ArrowUpRight className="h-4 w-4" aria-hidden /></span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DiscoverIndex() {
  const { locale } = useI18n();
  const { ui } = discoverCopy(locale);
  return (
    <AppLayout width="full" revealFooter tone="infrastructure">
      <div className="dsc" data-topic="profiles">
        <section className="dsc-hero dsc-hero-index">
          <LightBars />
          <div className="dsc-glow" aria-hidden />
          <div className="dsc-inner">
            <p className="dsc-label">{ui.kicker}</p>
            <h1 className="dsc-title">{ui.indexTitle}</h1>
            <p className="dsc-lead">{ui.indexLead}</p>
          </div>
        </section>
        <section className="dsc-section">
          <Reveal className="dsc-inner"><TopicTiles /></Reveal>
        </section>
      </div>
    </AppLayout>
  );
}
