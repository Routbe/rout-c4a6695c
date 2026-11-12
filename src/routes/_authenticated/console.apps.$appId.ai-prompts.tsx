import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { ConsoleCard, ConsolePage } from "@/components/console/ConsolePage";
import { CodeBlock } from "@/components/console/CodeBlock";
import { useAppPage } from "@/components/console/useAppPage";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { buildAiPrompt, buildBadgePrompt, buildChangePrompt, buildHandleSyncPrompt, promptSnapshot, type AiTool, type PromptSnapshot, type Stack } from "@/lib/oauth/integration-templates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/console/apps/$appId/ai-prompts")({
  head: () => ({ meta: [{ title: "AI Integration Prompts — ROUT Developer Console" }, { name: "description", content: "Integratieprompts voor ROUT OIDC, pairwise identiteit en geverifieerde claims." }, { property: "og:title", content: "AI Integration Prompts — ROUT Developer Console" }, { property: "og:description", content: "Integratieprompts voor ROUT OIDC, pairwise identiteit en geverifieerde claims." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AiPromptsPage,
});

const TOOLS: { id: AiTool; label: string }[] = [
  { id: "cursor", label: "Cursor" }, { id: "copilot", label: "Copilot" }, { id: "lovable", label: "Lovable" }, { id: "generic", label: "Other AI" },
];
const STACKS: { id: Stack; label: string }[] = [
  { id: "nextjs", label: "Next.js" }, { id: "tanstack", label: "TanStack Start" }, { id: "express", label: "Express" }, { id: "other", label: "Other" },
];

function Pills<T extends string>({ items, value, onChange }: { items: readonly { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <button key={i.id} type="button" onClick={() => onChange(i.id)}
          className={cn("rounded-full border px-3 py-1 text-sm", value === i.id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

function AiPromptsPage() {
  const { appId } = Route.useParams();
  const { app } = useAppPage(appId);
  const { t } = useTranslation();
  const [tool, setTool] = useState<AiTool>("cursor");
  const [stack, setStack] = useState<Stack>("nextjs");
  // Snapshot of the settings the developer's AI last built; per browser, per app.
  const snapKey = `rout.console.prompt-snapshot.${appId}`;
  const [snapshot, setSnapshot] = useState<PromptSnapshot | null>(null);
  const [snapLoaded, setSnapLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(snapKey);
      setSnapshot(raw ? (JSON.parse(raw) as PromptSnapshot) : null);
    } catch { setSnapshot(null); }
    setSnapLoaded(true);
  }, [snapKey]);
  if (!app) return null;
  const markDone = () => {
    const s = promptSnapshot(app);
    localStorage.setItem(snapKey, JSON.stringify(s));
    setSnapshot(s);
  };
  const changePrompt = snapshot ? buildChangePrompt(snapshot, app, tool, stack) : null;
  return (
    <ConsolePage title={t("console.aiPrompts.title")} description={t("console.aiPrompts.desc")}>
      <ConsoleCard>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="mb-2 text-sm font-medium">{t("console.aiPrompts.assistant")}</p><Pills<AiTool> items={TOOLS} value={tool} onChange={setTool} /></div>
          <div><p className="mb-2 text-sm font-medium">{t("console.aiPrompts.stack")}</p><Pills<Stack> items={STACKS} value={stack} onChange={setStack} /></div>
        </div>
      </ConsoleCard>
      {snapLoaded && (
        <ConsoleCard title={t("console.aiPrompts.changes.title")}>
          {!snapshot ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>{t("console.aiPrompts.changes.first")}</p>
              <Button variant="outline" size="sm" onClick={markDone}>{t("console.aiPrompts.changes.markFull")}</Button>
            </div>
          ) : changePrompt ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("console.aiPrompts.changes.body")}</p>
              <CodeBlock label={`prompt · wijziging · ${tool} · ${stack}`} code={changePrompt} />
              <Button variant="outline" size="sm" onClick={markDone}>{t("console.aiPrompts.changes.markDone")}</Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("console.aiPrompts.changes.none")}</p>
          )}
        </ConsoleCard>
      )}
      <Accordion type="multiple" defaultValue={["full"]} className="mt-4 space-y-3">
        <AccordionItem value="full" className="rounded-xl border border-border px-4">
          <AccordionTrigger>{t("console.aiPrompts.full")}</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <CodeBlock label={`prompt · ${tool} · ${stack}`} code={buildAiPrompt(app, tool, stack)} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="auth" className="rounded-xl border border-border px-4">
          <AccordionTrigger>{t("console.aiPrompts.auth")}</AccordionTrigger>
          <AccordionContent className="space-y-2">
            {!app.handleSyncEnabled && <p className="text-xs text-muted-foreground">{t("console.aiPrompts.syncOff")}</p>}
            <CodeBlock label={`prompt · auth · ${tool} · ${stack}`} code={buildHandleSyncPrompt(app, tool, stack)} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="badges" className="rounded-xl border border-border px-4">
          <AccordionTrigger>{t("console.aiPrompts.badges")}</AccordionTrigger>
          <AccordionContent className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("console.aiPrompts.badgePreview")}</p>
            <CodeBlock label={`prompt · badges · ${tool} · ${stack}`} code={buildBadgePrompt(app, tool, stack)} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </ConsolePage>
  );
}
