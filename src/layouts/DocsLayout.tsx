import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@/lib/router-compat";
import { ArrowLeft, ArrowRight, ChevronRight, Menu, Search, X, ArrowUpRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppLayout } from "@/components/layout/AppLayout";
import { useI18n } from "@/lib/i18n";
import { docs, getDoc, docsInCategory, DOC_CATEGORIES, DOC_LABELS, type DocEntry } from "@/lib/docs-catalog";
import { useEditorialMotion } from "@/hooks/useEditorialMotion";
import aboutImage from "@/assets/rout-infrastructure.jpg";

export function DocsLayout({ doc, children }: { doc: DocEntry; children: ReactNode }) {
  const { t, locale } = useI18n();
  const editorialRef = useEditorialMotion<HTMLDivElement>();
  const isAbout = doc.category === "about";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("");
  const articles = docsInCategory(doc.category, locale);
  const index = articles.findIndex(d => d.path === doc.path);
  const previous = articles[index - 1]; const next = articles[index + 1];
  const results = query.trim() ? docs.map(d => getDoc(d.path, locale) ?? d).filter(d => `${d.title} ${d.description}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8) : [];
  useEffect(() => {
    setOpen(false); setQuery(""); setActive("");
    const updateActive = () => {
      const nodes = doc.headings.map(h => document.getElementById(h.id)).filter((node): node is HTMLElement => node !== null);
      const passed = nodes.filter(node => node.getBoundingClientRect().top <= 145);
      const current = passed[passed.length - 1] ?? nodes[0];
      if (current) setActive(current.id);
    };
    const observer = new IntersectionObserver(updateActive, { rootMargin: "-80px 0px -65% 0px" });
    const observe = () => { for (const heading of doc.headings) { const el = document.getElementById(heading.id); if (el) observer.observe(el); } };
    observe();
    const mutations = new MutationObserver(observe);
    const article = document.getElementById("docs-content");
    if (article) mutations.observe(article, { childList: true, subtree: true });
    window.addEventListener("scroll", updateActive, { passive: true });
    return () => { observer.disconnect(); mutations.disconnect(); window.removeEventListener("scroll", updateActive); };
  }, [doc]);
  return <AppLayout width="full"><div ref={editorialRef} className={`docs-theme text-foreground ${doc.category === "dev" ? "docs-developer" : "docs-public"} ${isAbout ? "docs-about" : ""}`}>
    <a href="#docs-content" className="docs-skip">{t("docs.skip")}</a>
    <div className="sticky top-[4.75rem] z-40 mx-auto max-w-[1440px] px-4 sm:px-8 lg:px-12">
      <div className="docs-header mx-auto flex min-h-14 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 shadow-sm lg:px-6">
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="lg:hidden" aria-label={open ? t("docs.closeNav") : t("docs.openNav")} aria-expanded={open} aria-controls="docs-sidebar" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</Button><span className="hidden font-mono text-xs text-muted-foreground sm:block">{DOC_LABELS[doc.category]}</span></div>
        <div className="relative w-full max-w-80"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden /><Input value={query} onChange={e => setQuery(e.target.value)} aria-label={t("docs.search")} placeholder={t("docs.search")} className="bg-card pl-10" />{query && <div className="absolute left-0 right-0 top-13 rounded-lg border border-border bg-popover p-2 shadow-lg">{results.length ? results.map(d => <Link key={d.path} to={d.path} className="block rounded p-3 text-sm hover:bg-secondary">{d.title}<span className="mt-1 block text-xs text-muted-foreground">{DOC_LABELS[d.category]}</span></Link>) : <p className="p-3 text-sm text-muted-foreground">{t("docs.noResults")}</p>}</div>}</div>
        {doc.category === "dev" && <Button asChild variant="ghost" className="hidden sm:inline-flex"><Link to="/console">Console <ArrowUpRight /></Link></Button>}
      </div>
    </div>
    <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_210px]">
      <aside id="docs-sidebar" className={`${open ? "block" : "hidden"} docs-sidebar border-b border-border px-5 py-7 lg:sticky lg:top-32 lg:block lg:h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-7`}>
        <div className="mb-7 text-xs font-medium text-muted-foreground">{t("docs.title")}</div>
        <nav aria-label={t("docs.aria.pillars")} className="mb-8 space-y-1">{DOC_CATEGORIES.map(c => <Link key={c} to={`/${c}`} className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm ${c === doc.category ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}><BookOpen className="size-4" aria-hidden />{DOC_LABELS[c]}</Link>)}</nav>
        <p className="mb-3 px-3 text-xs font-semibold text-muted-foreground">{DOC_LABELS[doc.category]}</p>
        <nav aria-label={t("docs.aria.articles")} className="space-y-1">{articles.map(d => <Link key={d.path} to={d.path} aria-current={d.path === doc.path ? "page" : undefined} className={`docs-nav-link block border-l px-3 py-2 text-sm ${d.path === doc.path ? "border-docs-link text-docs-link" : "border-border text-muted-foreground hover:text-foreground"}`}>{d.path === `/${doc.category}` ? t("docs.overview") : d.title}</Link>)}</nav>
        <p className="mt-10 px-3 font-mono text-[10px] leading-5 text-muted-foreground">OPEN SOURCE · AGPLv3<br />{t("docs.tagline")}</p>
      </aside>
      <section id="docs-content" aria-label={doc.title} className="min-w-0 px-6 pb-16 pt-8 sm:px-10 lg:px-14 lg:pt-12" tabIndex={-1}>
        <div className="docs-reading-column mx-auto max-w-[760px]">
          <nav aria-label={t("seo.breadcrumbs")} className="mb-10 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Link to="/">ROUT</Link><ChevronRight className="size-3" aria-hidden /><Link to={`/${doc.category}`}>{DOC_LABELS[doc.category]}</Link>{doc.path !== `/${doc.category}` && <><ChevronRight className="size-3" aria-hidden /><span className="text-foreground">{doc.title}</span></>}</nav>
          <div className="mb-4 flex items-center gap-3 text-xs text-docs-link"><span className="h-px w-6 bg-docs-link" />{DOC_LABELS[doc.category]}</div>
          {isAbout && doc.path === "/about" && <figure data-editorial-reveal className="about-object-study"><img src={aboutImage} width={1920} height={1024} alt={t("infra.cardPreview")} /><figcaption className="font-mono text-xs text-muted-foreground">ROUT / IDENTITY, BY DESIGN</figcaption></figure>}
          <article className="docs-prose prose dark:prose-invert max-w-none">{children}</article>
          <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-xs text-muted-foreground"><span>{t("docs.updated")} {doc.last_updated}</span><span className="font-mono">ROUT / {doc.category.toUpperCase()}</span></div>
          <nav aria-label={t("docs.aria.prevNext")} className="mt-8 grid gap-4 sm:grid-cols-2">{previous ? <Link to={previous.path} className="docs-article-link rounded-lg border border-border p-5"><span className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><ArrowLeft className="size-3" />{t("docs.previous")}</span><span className="text-sm font-medium">{previous.title}</span></Link> : <span />}{next && <Link to={next.path} className="docs-article-link rounded-lg border border-border p-5 text-right"><span className="mb-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">{t("docs.next")}<ArrowRight className="size-3" /></span><span className="text-sm font-medium">{next.title}</span></Link>}</nav>
        </div>
      </section>
      <aside className="hidden px-5 pt-14 xl:block"><nav aria-label={t("docs.aria.onThisPage")} className="sticky top-40"><p className="mb-4 text-xs font-semibold">{t("docs.onThisPage")}</p><ul className="space-y-3">{doc.headings.map(h => <li key={h.id} className={h.level === 3 ? "pl-3" : ""}><a href={`#${h.id}`} onClick={() => setActive(h.id)} aria-current={active === h.id ? "location" : undefined} className={`text-xs leading-5 ${active === h.id ? "text-docs-link" : "text-muted-foreground hover:text-foreground"}`}>{h.text}</a></li>)}</ul></nav></aside>
    </div>
  </div></AppLayout>;
}