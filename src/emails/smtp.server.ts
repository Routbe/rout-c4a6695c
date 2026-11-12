/**
 * Minimal SMTP client for Infomaniak (mail.infomaniak.com).
 * 465 = implicit TLS, 587 = STARTTLS. AUTH PLAIN only after TLS.
 * Hard total timeout (default 4 s); never leaves a socket open.
 */
import { dotStuff } from "./mime";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  timeoutMs?: number;
}

export class SmtpError extends Error {
  constructor(message: string, readonly code: number, readonly transient: boolean) {
    super(message);
  }
}

type Sock = {
  write(data: string): void;
  on(ev: string, fn: (...a: never[]) => void): void;
  removeAllListeners(ev?: string): void;
  destroy(): void;
};

export async function sendViaSmtp(cfg: SmtpConfig, envelope: { from: string; to: string }, message: string): Promise<void> {
  const timeoutMs = cfg.timeoutMs ?? 4000;
  let socket: Sock | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;

  const run = async () => {
    const [tls, net] = await Promise.all([import("node:tls"), import("node:net")]);
    if (cancelled) return;
    let buffer = "";
    let waiter: ((r: { code: number; text: string }) => void) | null = null;
    let failer: ((e: Error) => void) | null = null;
    const queue: { code: number; text: string }[] = [];

    const attach = (s: Sock) => {
      buffer = "";
      s.on("data", ((chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        let idx: number;
        let block: string[] = [];
        while ((idx = buffer.indexOf("\r\n")) >= 0) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          block.push(line);
          if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
            const reply = { code: Number(line.slice(0, 3)), text: block.join("\n") };
            block = [];
            if (waiter) { const w = waiter; waiter = null; failer = null; w(reply); } else queue.push(reply);
          }
        }
        if (block.length) buffer = block.join("\r\n") + "\r\n" + buffer;
      }) as never);
      s.on("error", ((e: Error) => failer?.(e)) as never);
      s.on("close", (() => failer?.(new SmtpError("SMTP connection closed", 421, true))) as never);
    };
    const read = () =>
      new Promise<{ code: number; text: string }>((resolve, reject) => {
        const q = queue.shift();
        if (q) return resolve(q);
        waiter = resolve;
        failer = reject;
      });
    const expect = async (ok: number[], step: string) => {
      const r = await read();
      if (!ok.includes(r.code)) throw new SmtpError(`SMTP ${step} refused: ${r.text.slice(0, 200)}`, r.code, r.code >= 400 && r.code < 500);
      return r;
    };
    const cmd = async (line: string, ok: number[], step: string) => {
      if (!socket) throw new SmtpError("SMTP connection unavailable", 421, true);
      socket.write(line + "\r\n");
      return expect(ok, step);
    };

    if (cfg.port === 465) {
      socket = tls.connect({ host: cfg.host, port: 465, servername: cfg.host }) as unknown as Sock;
    } else {
      socket = net.connect({ host: cfg.host, port: cfg.port }) as unknown as Sock;
    }
    attach(socket);
    await expect([220], "greeting");
    let ehlo = await cmd("EHLO rout.be", [250], "EHLO");
    if (cfg.port !== 465) {
      if (!/STARTTLS/i.test(ehlo.text)) throw new SmtpError("Server offers no STARTTLS", 0, false);
      await cmd("STARTTLS", [220], "STARTTLS");
      const plain = socket;
      plain.removeAllListeners("data");
      plain.removeAllListeners("error");
      plain.removeAllListeners("close");
      socket = await new Promise<Sock>((resolve, reject) => {
        const s = tls.connect({ socket: plain as never, servername: cfg.host }, () => resolve(s as unknown as Sock));
        socket = s as unknown as Sock;
        s.once("error", reject);
      });
      if (cancelled) { socket.destroy(); return; }
      attach(socket);
      ehlo = await cmd("EHLO rout.be", [250], "EHLO");
    }
    const auth = btoa(String.fromCharCode(...new TextEncoder().encode(`\0${cfg.user}\0${cfg.pass}`)));
    await cmd(`AUTH PLAIN ${auth}`, [235], "AUTH");
    await cmd(`MAIL FROM:<${envelope.from}>`, [250], "MAIL FROM");
    await cmd(`RCPT TO:<${envelope.to}>`, [250, 251], "RCPT TO");
    await cmd("DATA", [354], "DATA");
    socket.write(dotStuff(message) + "\r\n.\r\n");
    await expect([250], "message");
    socket.write("QUIT\r\n");
  };

  try {
    await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new SmtpError(`SMTP timeout after ${timeoutMs} ms`, 0, true)), timeoutMs);
      }),
    ]);
  } finally {
    cancelled = true;
    if (timer) clearTimeout(timer);
    try { (socket as Sock | null)?.destroy(); } catch { /* already closed */ }
  }
}
