import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/** Realtime voorbeeld van een gedeelde profiellink per platform. */
export function SocialPreview({
  title,
  description,
  image,
  accent,
  domain = "rout.be",
}: {
  title: string;
  description: string;
  image: string | null;
  accent: string | null;
  domain?: string;
}) {
  const [tab, setTab] = useState("whatsapp");
  const thumb = image ? (
    <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
  ) : (
    <div className="h-full w-full bg-muted" />
  );
  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-3">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
        <TabsTrigger value="x">X</TabsTrigger>
        <TabsTrigger value="embed">LinkedIn / Discord</TabsTrigger>
      </TabsList>
      <TabsContent value="whatsapp">
        <div className="max-w-sm rounded-xl bg-muted p-2">
          <div className="flex gap-2 overflow-hidden rounded-lg bg-background">
            <div className="h-20 w-20 shrink-0">{thumb}</div>
            <div className="min-w-0 py-2 pr-2">
              <p className="truncate text-sm font-semibold text-foreground">{title}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{description}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{domain}</p>
            </div>
          </div>
        </div>
      </TabsContent>
      <TabsContent value="x">
        <div className="max-w-md overflow-hidden rounded-2xl border border-border bg-background">
          <div className="aspect-[1200/630] w-full">{thumb}</div>
          <div className="space-y-0.5 border-t border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">{domain}</p>
            <p className="truncate text-sm text-foreground">{title}</p>
          </div>
        </div>
      </TabsContent>
      <TabsContent value="embed">
        <div
          className="max-w-md rounded-md border-l-4 border-primary bg-muted p-3"
          style={accent ? { borderLeftColor: accent } : undefined}
        >
          <p className="text-xs text-muted-foreground">{domain}</p>
          <p className="text-sm font-semibold text-primary">{title}</p>
          <p className="mt-1 text-xs text-foreground">{description}</p>
          {image && <div className="mt-2 aspect-[1200/630] overflow-hidden rounded">{thumb}</div>}
        </div>
      </TabsContent>
    </Tabs>
  );
}
