declare module "*.mdx" {
  import type { ComponentType } from "react";
  export const frontmatter: { title: string; description: string; category: string; last_updated: string; ai_ready: boolean };
  const MDXContent: ComponentType;
  export default MDXContent;
}
declare module "virtual:rout-docs" { const sources: Record<string, string>; export default sources; }