import type { ConsoleApp } from "./console-data";

export function AppLogo({ app, size = "md" }: { app: Pick<ConsoleApp, "name" | "logoUrl">; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "h-7 w-7 text-xs" : "h-10 w-10 text-sm";
  if (app.logoUrl) {
    return <img src={app.logoUrl} alt="" className={`${cls} shrink-0 rounded-lg border border-border object-cover`} />;
  }
  return (
    <div className={`${cls} flex shrink-0 items-center justify-center rounded-lg border border-border bg-muted font-medium`}>
      {app.name.slice(0, 1).toUpperCase()}
    </div>
  );
}
