import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { listShowcaseHandles, saveShowcaseHandles } from "@/lib/showcase.functions";
import { PhoneShowcase } from "@/components/home/PhoneShowcase";
import { i18n as trI18n } from "@/lib/i18n";

/** Admin: pick which real profiles appear as live examples. */
export function ShowcaseAdminPanel() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);
  const save = useServerFn(saveShowcaseHandles);
  useEffect(() => {
    listShowcaseHandles().then((h) => setText(h.map((x) => "@" + x).join("\n"))).catch(() => {});
  }, []);
  const onSave = async () => {
    setBusy(true);
    try {
      const handles = text.split(/[\s,]+/).filter(Boolean);
      const saved = await save({ data: { handles } });
      setText(saved.map((x) => "@" + x).join("\n"));
      setKey((k) => k + 1);
      toast.success(trI18n.t("ui.d96b9b63fe"));
    } catch {
      toast.error(trI18n.t("ui.218653776b"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-3">
        <h2 className="text-lg font-medium">Live voorbeelden</h2>
        <p className="text-sm text-muted-foreground">Eén @naam per regel, in de volgorde waarin bezoekers erdoor swipen.</p>
        <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="@maximilien.brussels" />
        <Button onClick={onSave} disabled={busy}>{busy ? "Opslaan…" : "Opslaan"}</Button>
      </div>
      <PhoneShowcase key={key} />
    </div>
  );
}
