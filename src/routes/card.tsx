import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { RoutLogo } from "@/components/RoutLogo";
import {
  Building2,
  Download,
  Globe,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  Smartphone,
} from "lucide-react";
import { decodeCardPayload } from "@/lib/card-link";
import { downloadVCard } from "@/lib/rich-qr";
import { toast } from "sonner";
import { i18n as trI18n } from "@/lib/i18n";

const linkify = (v: string) => (/^[a-z]+:\/\//i.test(v) ? v : `https://${v}`);

function CardPage() {
  const { d } = useSearch({ from: "/card" });
  const values = useMemo(() => (d ? decodeCardPayload(d) : null), [d]);

  if (!values) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
        <RoutLogo size={26} />
        <h1 className="font-display text-2xl text-foreground">This card link is invalid</h1>
        <p className="text-sm text-muted-foreground">
          Ask the sender for a fresh link, or scan their QR code again.
        </p>
      </div>
    );
  }

  const fullName =
    [values.firstName, values.lastName].filter(Boolean).join(" ").trim() || "Contact";
  const rows: { icon: typeof Mail; label: string; value: string; href?: string }[] = [];
  if (values.phoneMobile)
    rows.push({
      icon: Smartphone,
      label: "Mobile",
      value: values.phoneMobile,
      href: `tel:${values.phoneMobile.replace(/\s+/g, "")}`,
    });
  if (values.phoneWork)
    rows.push({
      icon: Phone,
      label: "Work",
      value: values.phoneWork,
      href: `tel:${values.phoneWork.replace(/\s+/g, "")}`,
    });
  if (values.email)
    rows.push({ icon: Mail, label: "E-mail", value: values.email, href: `mailto:${values.email}` });
  if (values.website)
    rows.push({
      icon: Globe,
      label: "Website",
      value: values.website,
      href: linkify(values.website),
    });
  if (values.linkedin)
    rows.push({
      icon: Linkedin,
      label: "LinkedIn",
      value: values.linkedin,
      href: linkify(values.linkedin),
    });
  if (values.company) rows.push({ icon: Building2, label: "Company", value: values.company });
  if (values.address) rows.push({ icon: MapPin, label: "Address", value: values.address });

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-10">
      <RoutLogo size={24} />
      <main className="mt-8 w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-4">
          {values.photo ? (
            <img
              src={values.photo}
              alt=""
              className="h-16 w-16 rounded-2xl border border-border object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-foreground text-lg font-medium text-background">
              {fullName
                .split(" ")
                .map((s) => s[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-medium text-foreground">{fullName}</h1>
            {values.title || values.company ? (
              <p className="truncate text-sm text-muted-foreground">
                {[values.title, values.company].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
        </div>

        <Button
          className="mt-6 h-12 w-full gap-2 rounded-full text-base"
          onClick={() => {
            if (downloadVCard(values)) toast.success(trI18n.t("ui.29db8fc1ab"));
            else toast.error(trI18n.t("ui.a3ef817e9a"));
          }}
        >
          <Download className="h-4 w-4" /> Add to contacts
        </Button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Downloads a standard .vcf file — open it to save {fullName} to your phone.
        </p>

        {rows.length > 0 && (
          <ul className="mt-6 space-y-2 border-t border-border pt-5">
            {rows.map((row) => (
              <li key={row.label} className="flex items-start gap-3">
                <row.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {row.label}
                  </p>
                  {row.href ? (
                    <a
                      href={row.href}
                      className="break-words text-sm text-foreground underline underline-offset-4"
                    >
                      {row.value}
                    </a>
                  ) : (
                    <p className="break-words text-sm text-foreground">{row.value}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

export const Route = createFileRoute("/card")({
  validateSearch: (search: Record<string, unknown>) => ({
    d: typeof search.d === "string" ? search.d : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Digitaal visitekaartje | ROUT" },
      {
        name: "description",
        content: "Bekijk en bewaar dit digitale visitekaartje direct als contact op je telefoon.",
      },
      { property: "og:title", content: "Digitaal visitekaartje | ROUT" },
      {
        property: "og:description",
        content: "Bekijk en bewaar dit digitale visitekaartje direct als contact op je telefoon.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CardPage,
});
