import { pageMeta } from "@/lib/page-cards";
import { getRequestLocale } from "@/lib/locale.functions";
import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/Press";

const TITLE = "Brand & press kit | ROUT";
const DESCRIPTION =
  "Officiële ROUT-logo's (SVG/PNG), kleurenpalet met HEX-codes, standaardtekst en perscontact.";

export const Route = createFileRoute("/press")({
  loader: () => getRequestLocale().catch(() => ({ locale: "en" as const })),
  head: ({ loaderData }) => ({
    meta: pageMeta("press", loaderData?.locale),
  }),
  component: Page,
});
