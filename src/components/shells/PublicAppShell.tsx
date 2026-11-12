import type { ReactNode } from "react";

/**
 * Public shell (rout.be). Pages bring their own public header/footer via AppLayout;
 * this shell must never import admin code.
 */
export default function PublicAppShell({ children }: { children: ReactNode }) {
  return <div data-shell="public">{children}</div>;
}
