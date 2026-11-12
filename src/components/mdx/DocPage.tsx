import { lazy, Suspense, type ComponentType } from "react";
import { MDXProvider } from "@mdx-js/react";
import { DocsLayout } from "@/layouts/DocsLayout";
import { SEOLayout } from "@/layouts/SEOLayout";
import { getDoc } from "@/lib/docs-catalog";
import { mdxComponents } from "./components";
import { useI18n } from "@/lib/i18n";
const modules = import.meta.glob<{ default: ComponentType }>("/src/content/**/*.mdx");
const pages = new Map(Object.entries(modules).map(([file, load]) => {
  const locale = /\.(en|fr|de)\.mdx$/.exec(file)?.[1] ?? "nl";
  const path = file.replace("/src/content", "").replace(/\.(en|fr|de)\.mdx$/, ".mdx").replace(/\.mdx$/, "").replace(/\/index$/, "");
  return [`${path}:${locale}`, lazy(load)];
}));
export function DocPage({ path }: { path: string }) {
  const { locale, t } = useI18n();
  const doc = getDoc(path, locale); const Content = pages.get(`${path}:${locale}`) ?? pages.get(`${path}:nl`);
  if (!doc || !Content) return <p>Artikel niet beschikbaar.</p>;
  const Layout = ["about", "info", "dev", "safety"].includes(doc.category) ? DocsLayout : SEOLayout;
  return <Layout doc={doc}><MDXProvider components={mdxComponents}><Suspense fallback={<p className="text-muted-foreground">{t("docs.loading")}</p>}><Content /></Suspense></MDXProvider></Layout>;
}