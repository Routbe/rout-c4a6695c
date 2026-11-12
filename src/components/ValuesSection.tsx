import { ShieldCheck, PenTool, GitBranch, Mail, Award } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Link } from "@/lib/router-compat";

export function ValuesSection() {
  const { t } = useI18n();

  const cards = [
    { key: "sovereign", Icon: ShieldCheck },
    { key: "vector", Icon: PenTool },
    { key: "open", Icon: GitBranch },
    { key: "identity", Icon: Mail },
    { key: "badge", Icon: Award },
  ] as const;

  return (
    <section id="why-rout" className="border-t border-border">
      <div className="container mx-auto px-4 py-14">
        <div className="my-12 rounded-3xl bg-neutral-900 p-4 text-neutral-100 sm:p-12">
          <div className="max-w-2xl">
            <p className="eyebrow text-neutral-400">{t("values.eyebrow")}</p>
            <h2 className="mt-2 font-display text-[32px] leading-tight text-neutral-50 sm:text-[40px]">
              {t("values.heading")}
            </h2>
            <p className="mt-3 text-sm text-neutral-400">{t("values.subheading")}</p>
          </div>

          <div className="mt-8 grid gap-4 space-y-3 sm:grid-cols-2 sm:space-y-0 lg:grid-cols-3">
            {cards.map(({ key, Icon }) => (
              <article
                key={key}
                className="flex flex-col gap-3 rounded-2xl border border-neutral-700/50 bg-neutral-800/60 p-5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-700/60">
                  <Icon className="h-4.5 w-4.5 text-neutral-100" strokeWidth={1.7} />
                </span>
                <h3 className="text-base font-semibold text-neutral-50">
                  {t(`values.${key}.title`)}
                </h3>
                <p className="text-sm leading-relaxed text-neutral-400">
                  {t(`values.${key}.body`)}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-8">
            <Link
              to="/manifesto"
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-neutral-200"
            >
              {t("values.manifesto")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
