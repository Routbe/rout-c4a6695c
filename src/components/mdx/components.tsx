import { Children, isValidElement, type ReactNode, type HTMLAttributes } from "react";
import { Callout } from "./Callout";
import { CodeBlock } from "./CodeBlock";
import { BadgePreview } from "./BadgePreview";
import { StepByStep, Step } from "./StepByStep";
import { ApiEndpoint } from "./ApiEndpoint";
import { headingId } from "@/lib/docs-catalog";
import { FAQ, QRPreview, OnboardingSteps, CompareTable, RoleMatrix, WorkspaceVsPersonalTable, LimitBar, AnalyticsPreview, SecurityShield, WarningBox, PrintSizeCalculator, DynamicQRFlowchart, DesignPlayground, ContentGrid } from "./GrowthComponents";
function textOf(children: ReactNode): string { return Children.toArray(children).map(c => typeof c === "string" || typeof c === "number" ? String(c) : isValidElement<{ children?: ReactNode }>(c) ? textOf(c.props.children) : "").join(""); }
export const mdxComponents = {
  Callout, CodeBlock, BadgePreview, StepByStep, Step, ApiEndpoint,
  FAQ, QRPreview, OnboardingSteps, CompareTable, RoleMatrix, WorkspaceVsPersonalTable, LimitBar, AnalyticsPreview, SecurityShield, WarningBox, PrintSizeCalculator, DynamicQRFlowchart, DesignPlayground, ContentGrid,
  h2: ({ children, ...props }: HTMLAttributes<HTMLHeadingElement>) => <h2 {...props} id={headingId(textOf(children))}>{children}</h2>,
  h3: ({ children, ...props }: HTMLAttributes<HTMLHeadingElement>) => <h3 {...props} id={headingId(textOf(children))}>{children}</h3>,
  table: ({ children }: { children?: ReactNode }) => <div className="my-8 overflow-x-auto rounded-2xl border border-border"><table className="!my-0 w-full border-collapse text-left text-sm">{children}</table></div>,
  th: ({ children }: { children?: ReactNode }) => <th className="border-b border-border bg-muted px-4 py-3 font-medium text-foreground">{children}</th>,
  td: ({ children }: { children?: ReactNode }) => <td className="border-b border-border px-4 py-3 align-top text-muted-foreground">{children}</td>,
  pre: ({ children }: { children?: ReactNode }) => {
    const child = Children.toArray(children)[0];
    if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) return <pre>{children}</pre>;
    return <CodeBlock code={textOf(child.props.children).replace(/\n$/, "")} language={child.props.className?.replace("language-", "") ?? "text"} />;
  },
};