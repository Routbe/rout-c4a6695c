import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Lock } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { QrTool, ToolField, ToolValues } from "@/lib/qr-tools";

/**
 * Shared shell for every flat QR tool URL (`/iban-qr`, `/wifi-qr`, …):
 *
 * - Above the fold: nothing but the generator. No SEO prose, no banners.
 * - Below the fold: the brochure — the standard, the privacy reasoning and
 *   the ROUT point of view — in quiet typography.
 *
 * Rendering is fully client-side; `qr-code-styling` is imported lazily so it
 * never runs during SSR.
 */
export function QrToolPage({ tool }: { tool: QrTool }) {
  const initial = useMemo<ToolValues>(() => {
    const values: ToolValues = {};
    for (const field of tool.fields) {
      values[field.name] = field.type === "select" ? (field.options?.[0]?.value ?? "") : "";
    }
    return values;
  }, [tool]);

  const [values, setValues] = useState<ToolValues>(initial);
  const [copied, setCopied] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<{ append: (el: HTMLElement) => void; update: (o: unknown) => void } | null>(
    null,
  );

  const payload = useMemo(() => tool.buildPayload(values), [tool, values]);

  useEffect(() => {
    setValues(initial);
  }, [initial]);

  useEffect(() => {
    let cancelled = false;
    const host = previewRef.current;
    if (!host || !payload) return;

    (async () => {
      const { buildQRCode } = await import("@/lib/qrGenerator");
      if (cancelled) return;
      const qr = buildQRCode({
        data: payload,
        size: 320,
        margin: 8,
        format: "png",
        fgColor: "#111111",
        bgColor: "#FFFFFF",
        bodyShape: "rounded",
      }) as unknown as {
        append: (el: HTMLElement) => void;
        update: (o: unknown) => void;
      };
      host.innerHTML = "";
      qr.append(host);
      qrRef.current = qr;
    })();

    return () => {
      cancelled = true;
    };
  }, [payload]);

  const download = async (format: "png" | "svg") => {
    if (!payload) return;
    const { getQRBlob } = await import("@/lib/qrGenerator");
    const blob = await getQRBlob({
      data: payload,
      size: 1024,
      margin: 16,
      format,
      fgColor: "#111111",
      bgColor: "#FFFFFF",
      bodyShape: "rounded",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tool.filename(values)}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyPayload = async () => {
    if (!payload) return;
    await navigator.clipboard.writeText(payload);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const set = (name: string, value: string) => setValues((prev) => ({ ...prev, [name]: value }));

  return (
    <AppLayout crumbs={[{ label: "Tools" }, { label: tool.name }]}>
      {/* ---------------------------------------------- above the fold: tool */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-10 pt-8 sm:pt-12">
        <h1 className="font-serif text-2xl font-medium tracking-tight sm:text-3xl">{tool.name}</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">{tool.tagline}</p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px] lg:gap-10">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {tool.fields.map((field) => (
              <ToolFieldInput
                key={field.name}
                field={field}
                value={values[field.name] ?? ""}
                onChange={(v) => set(field.name, v)}
              />
            ))}
          </div>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border-2 border-dashed border-border-ink/25 bg-card p-4">
              <div
                className={cn(
                  "flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-white",
                  "[&>canvas]:h-full [&>canvas]:w-full [&>svg]:h-full [&>svg]:w-full",
                )}
              >
                {payload ? (
                  <div ref={previewRef} className="h-full w-full" />
                ) : (
                  <p className="px-6 text-center text-xs text-neutral-500">{tool.emptyHint}</p>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  className="rounded-lg"
                  disabled={!payload}
                  onClick={() => download("png")}
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden /> PNG
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-lg"
                  disabled={!payload}
                  onClick={() => download("svg")}
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden /> SVG
                </Button>
              </div>
              <button
                type="button"
                onClick={copyPayload}
                disabled={!payload}
                className="mt-3 flex w-full items-center justify-center gap-1.5 text-[11px] text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:no-underline disabled:opacity-50"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3" aria-hidden /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" aria-hidden /> Copy raw payload
                  </>
                )}
              </button>
              <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <Lock className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
                Generated in your browser. Nothing you type is sent to ROUT.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------- below the fold: brochure */}
      <section className="border-t-2 border-dashed border-border-ink/20 bg-muted/20">
        <div className="mx-auto w-full max-w-2xl px-6 py-14 sm:py-20">
          <span className="eyebrow">{tool.standard}</span>
          <h2 className="mb-10 mt-2 font-serif text-2xl font-medium tracking-tight sm:text-3xl">
            About {tool.name} codes
          </h2>

          <div className="space-y-10">
            {tool.brochure.map((section) => (
              <article key={section.heading}>
                <h3 className="font-serif text-lg font-medium">{section.heading}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{section.body}</p>
                {section.points && (
                  <ul className="mt-3 space-y-1.5">
                    {section.points.map((point) => (
                      <li
                        key={point}
                        className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
                      >
                        <span
                          aria-hidden
                          className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/40"
                        />
                        {point}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>

          <h3 className="mb-6 mt-14 font-serif text-lg font-medium">Frequently asked</h3>
          <dl className="space-y-6">
            {tool.faq.map((item) => (
              <div key={item.q}>
                <dt className="text-sm font-medium">{item.q}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </AppLayout>
  );
}

function ToolFieldInput({
  field,
  value,
  onChange,
}: {
  field: ToolField;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `tool-${field.name}`;
  return (
    <div className={cn("space-y-1.5", field.half ? "sm:col-span-1" : "sm:col-span-2")}>
      <Label htmlFor={id} className="text-xs font-medium">
        {field.label}
        {field.required && <span className="ml-0.5 text-muted-foreground">*</span>}
      </Label>
      {field.type === "select" ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full rounded-lg border-2 border-border bg-background px-3 text-sm focus:border-foreground focus:outline-none"
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={id}
          type={field.type === "amount" ? "text" : field.type}
          inputMode={field.type === "amount" ? "decimal" : undefined}
          value={value}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 rounded-lg border-2"
        />
      )}
      {field.hint && <p className="text-[11px] text-muted-foreground">{field.hint}</p>}
    </div>
  );
}

export default QrToolPage;
