import type { ReactNode } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router-compat";
import { ArrowRight } from "lucide-react";
import { FAQ, OnboardingSteps, QRPreview, ContentGrid } from "@/components/mdx/GrowthComponents";
import { DOC_LABELS, type DocEntry } from "@/lib/docs-catalog";
import { useI18n } from "@/lib/i18n";
import { discoverCopy } from "@/lib/discover/copy";
import { topicForPath } from "@/lib/discover/topics";
export function SEOLayout({ doc, children }: { doc: DocEntry; children: ReactNode }) {
 const qr = doc.category === "qr-code-generator";
 const { locale, t } = useI18n();
 const discover = discoverCopy(locale);
 // Signed-out readers land on the product's own page instead of the Studio sign-in wall.
 const topic = topicForPath(doc.path);
 const ctaTo = qr ? `/qr${doc.qr_type ? `?type=${doc.qr_type}` : ""}` : topic ? `/discover/${topic}` : "/discover";
 const ctaLabel = qr ? t("seo.generateFree") : topic ? discover.topics[topic].brand : discover.ui.allTopics;
 return <AppLayout width="full"><main className="docs-theme text-foreground"><header className="mx-auto max-w-6xl px-5 pb-8 pt-12 sm:px-8 sm:pt-16"><nav aria-label={t("seo.breadcrumbs")} className="mb-8 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Link to="/">ROUT</Link><span>/</span><Link to={`/${doc.category}`}>{DOC_LABELS[doc.category]}</Link></nav><p className="mb-4 font-mono text-xs text-docs-link">ROUT / {DOC_LABELS[doc.category]}</p><h1 className="max-w-3xl font-display text-4xl leading-tight sm:text-5xl">{doc.title}</h1><p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">{doc.description}</p><Button asChild size="lg" className="mt-7"><Link to={ctaTo}>{ctaLabel}<ArrowRight className="size-4" /></Link></Button></header><div className="mx-auto max-w-6xl px-5 sm:px-8">{doc.qr_type && <QRPreview type={doc.qr_type} />}<article className="docs-prose prose dark:prose-invert mx-auto max-w-3xl pb-8">{children}{doc.steps?.length ? <><h2>{t("seo.howItWorks")}</h2><OnboardingSteps steps={doc.steps} /></> : null}{doc.faqs?.length ? <><h2 id="faq">{t("seo.faq")}</h2><FAQ items={doc.faqs} /></> : null}<p className="mt-8 text-xs text-muted-foreground">{t("seo.updated")} {doc.last_updated}</p></article><section className="border-t border-border py-10"><h2 className="font-display text-2xl">{t("seo.continue")}</h2><ContentGrid category={doc.category} /></section></div></main></AppLayout>;
}
