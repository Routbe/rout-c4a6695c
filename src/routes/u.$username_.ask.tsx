import { createFileRoute } from "@tanstack/react-router";
import { getQaPublic } from "@/lib/questions.functions";
import { sanitizeHandleInput } from "@/lib/validations/sanitizeHandle";
import { QaAskPage } from "@/components/qa/QaAskPage";
import { qaAskHead } from "@/components/qa/qa-head";

/** Privacy alias: full-screen anonymous message page. */
export const Route = createFileRoute("/u/$username_/ask")({
  loader: async ({ params }) => {
    const handle = sanitizeHandleInput(params.username);
    const { qa } = await getQaPublic({ data: { handle, space: "alias" } }).catch(() => ({ qa: null }));
    // Always its own page: questions on → the form; off → a short "closed" note. Never other widgets.
    return { handle, qa };
  },
  head: ({ loaderData }) => qaAskHead(loaderData?.handle ?? "", "alias"),
  component: AliasAsk,
});

function AliasAsk() {
  const { handle, qa } = Route.useLoaderData();
  return <QaAskPage handle={handle} space="alias" initial={qa} />;
}
