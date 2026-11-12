import type { DiscoverCopy } from "./topics";
import { copyNl } from "./copy.nl";
import { copyEn } from "./copy.en";
import { copyFr } from "./copy.fr";
import { copyDe } from "./copy.de";

const COPY: Record<string, DiscoverCopy> = { nl: copyNl, en: copyEn, fr: copyFr, de: copyDe };

export function discoverCopy(locale: string | undefined): DiscoverCopy {
  return COPY[(locale ?? "en").slice(0, 2)] ?? copyEn;
}
