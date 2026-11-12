/**
 * ROUT MCP Server tool specification (`@routbe/mcp-server`).
 *
 * These definitions are the single source of truth for both the developer
 * dashboard reference list and the in-dashboard test console.
 */

export type McpParamType = "string" | "number" | "boolean" | "enum" | "object";

export interface McpToolParam {
  name: string;
  type: McpParamType;
  required: boolean;
  description: string;
  values?: string[];
}

export interface McpToolDef {
  name: string;
  title: string;
  description: string;
  readOnly: boolean;
  params: McpToolParam[];
  sampleInput: Record<string, unknown>;
  sampleOutput: Record<string, unknown>;
}

export const MCP_TOOLS: McpToolDef[] = [
  {
    name: "generate_qr_code",
    title: "Generate QR code",
    description:
      "Generates a high-quality vector or raster QR code (SVG, PNG, PDF) from text, a URL, Wi-Fi credentials or vCard data.",
    readOnly: true,
    params: [
      {
        name: "payload",
        type: "object",
        required: true,
        description: "Content: URL, text, Wi-Fi credentials or a vCard object.",
      },
      {
        name: "qr_type",
        type: "enum",
        required: true,
        description:
          "Static codes encode the payload directly, dynamic codes route through a short link.",
        values: ["static", "dynamic"],
      },
      {
        name: "format",
        type: "enum",
        required: true,
        description: "Output file format.",
        values: ["svg", "png", "pdf"],
      },
      {
        name: "style",
        type: "object",
        required: false,
        description:
          "Theme, colours, frame and logo, e.g. { theme, foreground_color, frame_id, logo_url }.",
      },
      {
        name: "domain",
        type: "string",
        required: false,
        description: "Custom domain used for dynamic links.",
      },
    ],
    sampleInput: {
      payload: { url: "https://delplanche.com" },
      qr_type: "static",
      format: "svg",
      style: { theme: "midnight", foreground_color: "#0B1120", frame_id: "scan-me-border" },
    },
    sampleOutput: {
      id: "qr_9a8f7c",
      format: "svg",
      download_url: "https://api.rout.be/v1/qr/qr_9a8f7c.svg",
      scan_safe: true,
    },
  },
  {
    name: "create_dynamic_link",
    title: "Create dynamic link",
    description:
      "Creates an editable short link so the destination behind a printed QR code can be changed later.",
    readOnly: false,
    params: [
      {
        name: "destination_url",
        type: "string",
        required: true,
        description: "The landing page the short link resolves to.",
      },
      {
        name: "title",
        type: "string",
        required: false,
        description: 'Internal label, e.g. "Posters summer campaign 2026".',
      },
      {
        name: "custom_domain",
        type: "string",
        required: false,
        description: "Verified domain to serve the link from.",
      },
    ],
    sampleInput: {
      destination_url: "https://delplanche.com/summer",
      title: "Posters summer campaign 2026",
      custom_domain: "qr.delplanche.com",
    },
    sampleOutput: {
      qr_id: "dyn_4f21ab",
      short_url: "https://qr.delplanche.com/x/4f21ab",
      created_at: "2026-08-03T10:00:00.000Z",
    },
  },
  {
    name: "update_qr_destination",
    title: "Update QR destination",
    description: "Repoints an existing dynamic QR code at a new URL without reprinting anything.",
    readOnly: false,
    params: [
      {
        name: "qr_id",
        type: "string",
        required: true,
        description: "Unique id or short code of the dynamic QR.",
      },
      {
        name: "new_destination_url",
        type: "string",
        required: true,
        description: "The new destination.",
      },
    ],
    sampleInput: { qr_id: "dyn_4f21ab", new_destination_url: "https://delplanche.com/august" },
    sampleOutput: {
      qr_id: "dyn_4f21ab",
      destination_url: "https://delplanche.com/august",
      updated_at: "2026-08-03T10:05:00.000Z",
    },
  },
  {
    name: "get_qr_analytics",
    title: "Get QR analytics",
    description: "Returns detailed scan statistics so an agent can write reports.",
    readOnly: true,
    params: [
      { name: "qr_id", type: "string", required: true, description: "Unique id or short code." },
      {
        name: "timeframe",
        type: "enum",
        required: true,
        description: "Reporting window.",
        values: ["24h", "7d", "30d", "all"],
      },
    ],
    sampleInput: { qr_id: "dyn_4f21ab", timeframe: "7d" },
    sampleOutput: {
      qr_id: "dyn_4f21ab",
      timeframe: "7d",
      scans: 1284,
      unique_visitors: 977,
      devices: { mobile: 1104, desktop: 143, tablet: 37 },
      countries: { BE: 812, NL: 301, FR: 171 },
    },
  },
  {
    name: "check_qr_scannability",
    title: "Check QR scannability",
    description:
      "Checks up front whether a colour, contrast, logo and print-size combination is scannable according to the scan.safe standard.",
    readOnly: true,
    params: [
      {
        name: "foreground_color",
        type: "string",
        required: true,
        description: "Hex colour of the modules.",
      },
      {
        name: "background_color",
        type: "string",
        required: true,
        description: "Hex colour of the background.",
      },
      {
        name: "target_print_size_mm",
        type: "number",
        required: false,
        description: "Intended printed width in millimetres.",
      },
    ],
    sampleInput: {
      foreground_color: "#0B1120",
      background_color: "#FFFFFF",
      target_print_size_mm: 25,
    },
    sampleOutput: { safe: true, contrast_ratio: 18.4, warnings: [] },
  },
  {
    name: "list_custom_domains",
    title: "List custom domains",
    description: "Returns every verified domain available for dynamic routing.",
    readOnly: true,
    params: [],
    sampleInput: {},
    sampleOutput: { domains: ["rout.be", "qr.delplanche.com"] },
  },
];

export const findMcpTool = (name: string) => MCP_TOOLS.find((t) => t.name === name);

/** Config snippet for Claude Desktop / Cursor. */
export const mcpClientConfig = {
  mcpServers: {
    rout: {
      command: "npx",
      args: ["-y", "@routbe/mcp-server"],
    },
  },
};
