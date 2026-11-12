/** Static catalogue of public REST endpoints, used by the interactive spec viewer. */
export interface ApiEndpointDef {
  method: "GET" | "POST";
  path: string;
  summary: string;
  description: string;
  auth?: string;
  requestExample?: string;
  responseExample: string;
}

export const API_ENDPOINTS: ApiEndpointDef[] = [
  {
    method: "POST",
    path: "/api/public/qr/create",
    summary: "Create a dynamic QR code and short link",
    description:
      "Creates a trackable short link. Optionally attaches a verified custom domain when a bearer token identifies the owning user.",
    auth: "Bearer token optional (required for custom_domain)",
    requestExample: JSON.stringify(
      {
        target_type: "url",
        target_url: "https://example.com/menu",
        label: "Front door table tent",
      },
      null,
      2,
    ),
    responseExample: JSON.stringify(
      {
        id: "b6e2b6b0-...",
        slug: "aZ3kQ1",
        dashboard_token: "5f2c9a1e8d7b4c6a3f0e9d1b",
        target_type: "url",
        target_url: "https://example.com/menu",
        label: "Front door table tent",
        custom_domain: null,
        created_at: "2024-05-01T12:00:00.000Z",
        redirect_url: "https://rout.app/api/public/r/aZ3kQ1",
      },
      null,
      2,
    ),
  },
  {
    method: "POST",
    path: "/api/public/qr/manage",
    summary: "Update, pause or repoint an existing dynamic QR code",
    description:
      "Applies one action per call — regenerate_slug, set_active, set_target or set_expiry — authenticated by the dashboard token issued at creation time.",
    requestExample: JSON.stringify(
      {
        dashboard_token: "5f2c9a1e8d7b4c6a3f0e9d1b",
        action: "set_target",
        target_url: "https://example.com/new-menu",
      },
      null,
      2,
    ),
    responseExample: JSON.stringify(
      {
        id: "b6e2b6b0-...",
        slug: "aZ3kQ1",
        dashboard_token: "5f2c9a1e8d7b4c6a3f0e9d1b",
        target_type: "url",
        target_url: "https://example.com/new-menu",
        label: "Front door table tent",
        created_at: "2024-05-01T12:00:00.000Z",
        is_active: true,
        expires_at: null,
        redirect_url: "https://rout.app/api/public/r/aZ3kQ1",
      },
      null,
      2,
    ),
  },
  {
    method: "GET",
    path: "/api/public/qr/stats",
    summary: "Scan analytics for a dynamic QR code",
    description:
      "Returns scan history and totals for a code. Pass ?format=csv to receive a CSV export instead of JSON.",
    requestExample: "GET /api/public/qr/stats?token=5f2c9a1e8d7b4c6a3f0e9d1b&format=json",
    responseExample: JSON.stringify(
      {
        tracked: {
          id: "b6e2b6b0-...",
          slug: "aZ3kQ1",
          target_type: "url",
          target_url: "https://example.com/menu",
          label: "Front door table tent",
          created_at: "2024-05-01T12:00:00.000Z",
          is_active: true,
          expires_at: null,
          redirect_url: "https://rout.app/api/public/r/aZ3kQ1",
        },
        scans: [
          {
            scanned_at: "2024-05-02T09:14:22.000Z",
            country: "US",
            device: "mobile",
            browser: "Safari",
            os: "iOS",
          },
        ],
        total: 1,
      },
      null,
      2,
    ),
  },
  {
    method: "GET",
    path: "/api/public/qr/check",
    summary: "Check whether a dynamic QR code is live",
    description:
      "A lightweight status probe for a short link — active state and expiry — without exposing scan history. Useful for uptime checks from an AI agent or monitor before sharing a link.",
    requestExample: "GET /api/public/qr/check?token=5f2c9a1e8d7b4c6a3f0e9d1b",
    responseExample: JSON.stringify(
      {
        slug: "aZ3kQ1",
        is_active: true,
        expires_at: null,
        redirect_url: "https://rout.app/api/public/r/aZ3kQ1",
      },
      null,
      2,
    ),
  },
  {
    method: "GET",
    path: "/api/public/domains",
    summary: "List custom domains connected to your account",
    description:
      "Returns the branded domains attached to the authenticated user, their DNS verification status and which one is the default used for new dynamic QRs.",
    auth: "Bearer token required",
    requestExample: "GET /api/public/domains",
    responseExample: JSON.stringify(
      {
        domains: [
          {
            id: "3a1e9c40-...",
            domain: "links.yourbrand.com",
            status: "verified",
            is_default: true,
            verified_at: "2024-04-20T08:00:00.000Z",
          },
        ],
      },
      null,
      2,
    ),
  },
  {
    method: "GET",
    path: "/api/public/health",
    summary: "Service health probe",
    description: "Reports overall API status, database connectivity and current latency.",
    responseExample: JSON.stringify(
      {
        status: "operational",
        database: "ok",
        latency_ms: 42,
        checked_at: "2024-05-02T09:15:00.000Z",
      },
      null,
      2,
    ),
  },
];
