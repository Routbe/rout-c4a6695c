import { useId, useRef, useState } from "react";
import { AlignLeft, Bold, Check, ChevronDown, Italic, List, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BIO_TEMPLATE_STYLES, bioCharacterCount, buildBioTemplate, formatBioText, type BioFormat, type BioTemplateStyle } from "@/lib/bio-assistance";
import { BIO_LINK_MESSAGE, BIO_MEMBER_SINCE_MESSAGE, bioClaimsMemberSince, bioContainsLink } from "@/lib/bio-rules";
import { useI18n } from "@/lib/i18n";

const LABELS = {
  nl: { title: "Bio samenstellen", professional: "Professioneel", minimal: "Minimalistisch", creative: "Creatief", role: "Rol of beroep", focus: "Expertise of interesses", location: "Locatie", compose: "Sjabloon invullen", draft: "Voorstel", apply: "Bio toepassen", bold: "Vet", italic: "Cursief", list: "Opsomming", clean: "Tekst opschonen", limit: "Het voorstel is langer dan de toegestane bio.", empty: "Vul minstens één veld in." },
  en: { title: "Compose bio", professional: "Professional", minimal: "Minimal", creative: "Creative", role: "Role or profession", focus: "Expertise or interests", location: "Location", compose: "Use template", draft: "Draft", apply: "Apply bio", bold: "Bold", italic: "Italic", list: "List", clean: "Clean spacing", limit: "The draft exceeds the bio limit.", empty: "Enter at least one field." },
  fr: { title: "Composer la bio", professional: "Professionnel", minimal: "Minimaliste", creative: "Créatif", role: "Rôle ou métier", focus: "Expertise ou intérêts", location: "Lieu", compose: "Utiliser le modèle", draft: "Proposition", apply: "Appliquer la bio", bold: "Gras", italic: "Italique", list: "Liste", clean: "Nettoyer les espaces", limit: "La proposition dépasse la limite.", empty: "Remplissez au moins un champ." },
  de: { title: "Bio erstellen", professional: "Professionell", minimal: "Minimalistisch", creative: "Kreativ", role: "Rolle oder Beruf", focus: "Expertise oder Interessen", location: "Ort", compose: "Vorlage verwenden", draft: "Entwurf", apply: "Bio übernehmen", bold: "Fett", italic: "Kursiv", list: "Liste", clean: "Abstände bereinigen", limit: "Der Entwurf überschreitet das Bio-Limit.", empty: "Fülle mindestens ein Feld aus." },
};

export function BioAssistant({ text, onApply, maxLength }: { text: string; onApply: (text: string) => void; maxLength: number }) {
  const { locale } = useI18n();
  const c = LABELS[locale];
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<BioTemplateStyle>("professional");
  const [fields, setFields] = useState({ role: "", focus: "", location: "" });
  const [draft, setDraft] = useState(text);
  const [error, setError] = useState("");
  const count = bioCharacterCount(draft, maxLength);
  const validation = count.overLimit ? c.limit : bioContainsLink(draft) ? BIO_LINK_MESSAGE : bioClaimsMemberSince(draft) ? BIO_MEMBER_SINCE_MESSAGE : "";
  const format = (kind: BioFormat) => {
    const result = formatBioText(draft, kind, textarea.current?.selectionStart, textarea.current?.selectionEnd);
    setDraft(result.text);
    setError("");
    requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(result.start, result.end); });
  };
  return <div className="space-y-3">
    <Button variant="ghost" size="sm" type="button" aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => { if (!open) { setDraft(text); setError(""); } setOpen(!open); }}>
      <Type aria-hidden />{c.title}<ChevronDown aria-hidden className={open ? "rotate-180" : ""} />
    </Button>
    {open && <section id={`${id}-panel`} aria-label={c.title} className="space-y-3 border-y border-border py-3">
      <ToggleGroup type="single" value={style} variant="outline" size="sm" className="flex-wrap justify-start" aria-label={c.title} onValueChange={value => { if (BIO_TEMPLATE_STYLES.some(item => item === value)) setStyle(value as BioTemplateStyle); }}>
        {BIO_TEMPLATE_STYLES.map(value => <ToggleGroupItem key={value} value={value} className="text-xs">{c[value]}</ToggleGroupItem>)}
      </ToggleGroup>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["role", "focus", "location"] as const).map(key => <div key={key} className="space-y-1">
          <Label htmlFor={`${id}-${key}`} className="text-xs">{c[key]}</Label>
          <Input id={`${id}-${key}`} value={fields[key]} maxLength={key === "role" ? 80 : key === "focus" ? 120 : 60} onChange={event => setFields({ ...fields, [key]: event.target.value })} />
        </div>)}
      </div>
      <Button variant="secondary" size="sm" type="button" onClick={() => { const result = buildBioTemplate(fields, style); if (!result) { setError(c.empty); return; } setDraft(result); setError(""); }}>{c.compose}</Button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={`${id}-draft`}>{c.draft}</Label>
        <span aria-live="polite" className={count.overLimit ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{count.count}/{maxLength}</span>
      </div>
      <div className="flex gap-1" role="toolbar" aria-label="Markdown">
        {([{ kind: "bold", Icon: Bold }, { kind: "italic", Icon: Italic }, { kind: "list", Icon: List }, { kind: "clean", Icon: AlignLeft }] as const).map(({ kind, Icon }) => <Tooltip key={kind}><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={c[kind]} onMouseDown={event => event.preventDefault()} onClick={() => format(kind)}><Icon aria-hidden /></Button></TooltipTrigger><TooltipContent>{c[kind]}</TooltipContent></Tooltip>)}
      </div>
      <Textarea ref={textarea} id={`${id}-draft`} rows={4} value={draft} aria-invalid={Boolean(validation)} aria-describedby={validation || error ? `${id}-error` : undefined} onChange={event => { setDraft(event.target.value); setError(""); }} />
      {(error || validation) && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{validation || error}</p>}
      <Button type="button" size="sm" disabled={!draft.trim() || Boolean(validation)} onClick={() => { onApply(draft); setOpen(false); }}><Check aria-hidden />{c.apply}</Button>
    </section>}
  </div>;
}