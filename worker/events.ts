import { verifyOmniTicket } from "../src/lib/omni-realtime";

export class EventHub {
  private clients = new Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>();
  reconcile() {
    for (const userId of this.clients.keys()) this.publish(userId, "reconnected");
  }
  publish(userId: string, id: string) {
    const data = new TextEncoder().encode(`event: job\ndata: ${JSON.stringify({ id })}\n\n`);
    for (const client of this.clients.get(userId) ?? []) {
      try { client.enqueue(data); } catch { this.clients.get(userId)?.delete(client); }
    }
  }
  async handle(request: Request, origin: string, audience: string, secret: string): Promise<Response> {
    const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization", Vary: "Origin", "Cache-Control": "no-store" };
    if (request.headers.get("origin") !== origin) return new Response(null, { status: 403 });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return new Response(null, { status: 405, headers });
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const ticket = await verifyOmniTicket(token, audience, secret);
    if (!ticket) return new Response(null, { status: 401, headers });
    let cleanup = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const clients = this.clients.get(ticket.sub) ?? new Set();
        clients.add(controller); this.clients.set(ticket.sub, clients);
        let closed = false;
        const close = () => { if (closed) return; closed = true; clearInterval(heartbeat); clearTimeout(expiry); clients.delete(controller); if (!clients.size) this.clients.delete(ticket.sub); request.signal.removeEventListener("abort", close); try { controller.close(); } catch {} };
        const heartbeat = setInterval(() => { try { controller.enqueue(new TextEncoder().encode(": heartbeat\n\n")); } catch { close(); } }, 20_000);
        const expiry = setTimeout(close, Math.max(1, ticket.exp * 1000 - Date.now()));
        cleanup = close; request.signal.addEventListener("abort", close, { once: true });
        if (request.signal.aborted) { close(); return; }
        controller.enqueue(new TextEncoder().encode("event: connected\ndata: {}\n\n"));
      }, cancel: () => cleanup(),
    });
    return new Response(stream, { headers: { ...headers, "Content-Type": "text/event-stream", "X-Accel-Buffering": "no" } });
  }
}