import { Asset, useRouter, useTags } from "@tanstack/react-router";
import { createElement, useMemo } from "react";
import { brandHeadTags } from "@/lib/page-title";

/**
 * Drop-in for TanStack's <HeadContent />: same tags, but every title follows
 * the `PageName | ROUT - Sovereign Digital Identity OS` convention.
 */
export function BrandedHeadContent() {
  const tags = useTags();
  const nonce = useRouter().options.ssr?.nonce;
  const branded = useMemo(() => brandHeadTags(tags), [tags]);
  return (
    <>
      {branded.map((tag) => createElement(Asset, { ...tag, key: `tsr-meta-${JSON.stringify(tag)}`, nonce }))}
    </>
  );
}
