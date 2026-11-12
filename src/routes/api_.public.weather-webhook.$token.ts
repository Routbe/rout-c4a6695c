import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api_/public/weather-webhook/$token")({
  server: { handlers: { POST: async ({ request, params }) => {
    const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
    if (!/^[a-f0-9]{64}$/.test(params.token)) return new Response(null, { status: 401, headers });
    if (!request.headers.get("content-type")?.includes("application/json")) return new Response(null, { status: 415, headers });
    try {
      // Stream with a hard bound, including clients that omit Content-Length.
      const reader = request.body?.getReader();
      if (!reader) return new Response(null, { status: 400, headers });
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 1024) { await reader.cancel(); return new Response(null, { status: 413, headers }); }
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let input: unknown;
      try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { return new Response(null, { status: 400, headers }); }
      const s = await import("@/lib/ambient-weather.server");
      const status = await s.acceptWeatherCity(params.token, input);
      return new Response(null, { status, headers: { ...headers, ...(status === 429 ? { "retry-after": "60" } : {}) } });
    } catch {
      // Do not log the request URL: it contains the user's secret capability.
      return new Response(null, { status: 503, headers });
    }
  } } },
});