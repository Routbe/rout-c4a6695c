/**
 * Emergency Kit PDF, drawn 100% in the browser with jsPDF (+ qr-code-styling for
 * the phrase QR). Nothing is uploaded; the caller hands the Blob to a download.
 * Browser-only: import dynamically from an event handler.
 */
import { numberedWords } from "./vault-rules";

export type KitInput = {
  kind: "phrase" | "codes";
  /** The 24 words as one string (phrase) or the one-time codes (codes). */
  items: string[];
  account?: string | null;
  createdAt?: Date;
};

async function qrPng(data: string): Promise<string | null> {
  try {
    const { default: QRCodeStyling } = await import("qr-code-styling");
    const qr = new QRCodeStyling({ width: 360, height: 360, type: "canvas", data, margin: 8, qrOptions: { errorCorrectionLevel: "M" }, dotsOptions: { type: "square", color: "#111111" }, backgroundOptions: { color: "#ffffff" } });
    const blob = (await qr.getRawData("png")) as Blob | null;
    if (!blob) return null;
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function buildEmergencyKitPdf(input: KitInput): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const date = input.createdAt ?? new Date();
  const W = 210;
  const M = 18;
  // PDF artwork, not app UI: fixed print colours.
  const ink = [17, 17, 17] as const;
  const soft = [110, 110, 110] as const;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...ink);
  doc.text("ROUT Noodkit", M, 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...soft);
  doc.text(input.kind === "phrase" ? "Je 24 herstelwoorden voor ROUT ID" : "Je eenmalige herstelcodes voor tweestapsverificatie", M, 34);
  doc.text(`Gemaakt op ${date.toLocaleDateString("nl-BE")}${input.account ? `  -  ${input.account}` : ""}`, M, 40);

  // Warning box
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.4);
  doc.roundedRect(M, 46, W - 2 * M, 22, 2, 2);
  doc.setTextColor(...ink);
  doc.setFontSize(10);
  doc.text(doc.splitTextToSize(
    input.kind === "phrase"
      ? "Wie deze woorden heeft, kan je hoofdsleutel herstellen. ROUT vraagt er nooit naar, ook niet via mail of telefoon. Bewaar dit blad offline, op een droge en veilige plek, en maak er geen foto van."
      : "Elke code werkt één keer om in te loggen als je je toestel kwijt bent. ROUT vraagt er nooit naar. Bewaar dit blad offline op een veilige plek.",
    W - 2 * M - 8,
  ), M + 4, 53);

  let y = 80;
  if (input.kind === "phrase") {
    const words = numberedWords(input.items.join(" ")) ?? [];
    const cols = 3;
    const colW = (W - 2 * M - 52) / cols;
    doc.setFont("courier", "normal");
    doc.setFontSize(12);
    words.forEach(({ n, word }, i) => {
      const col = Math.floor(i / 8);
      const row = i % 8;
      const x = M + col * colW;
      const yy = y + row * 9;
      doc.setDrawColor(200, 200, 200);
      doc.roundedRect(x, yy - 5.5, colW - 4, 7.5, 1.2, 1.2);
      doc.setTextColor(...soft);
      doc.text(String(n).padStart(2, "0"), x + 2, yy);
      doc.setTextColor(...ink);
      doc.text(word, x + 11, yy);
    });
    const qr = await qrPng(input.items.join(" "));
    if (qr) {
      doc.addImage(qr, "PNG", W - M - 46, y - 6, 46, 46);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...soft);
      doc.text(doc.splitTextToSize("Scan alleen op je eigen toestel om de woorden snel in te voeren.", 46), W - M - 46, y + 45);
    }
    y += 8 * 9 + 10;
  } else {
    doc.setFont("courier", "normal");
    doc.setFontSize(13);
    input.items.forEach((code, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      doc.setTextColor(...soft);
      doc.text(`${String(i + 1).padStart(2, "0")}`, M + col * 80, y + row * 10);
      doc.setTextColor(...ink);
      doc.text(code, M + 10 + col * 80, y + row * 10);
      doc.text("[ ] gebruikt", M + 52 + col * 80, y + row * 10);
    });
    y += Math.ceil(input.items.length / 2) * 10 + 8;
  }

  // Fill-in fields
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...ink);
  doc.text("Zelf invullen", M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const fields = ["Bewaard op (plaats):", "Wie weet waar dit ligt:", "Datum laatste controle:"];
  fields.forEach((f, i) => {
    const yy = y + 9 + i * 10;
    doc.text(f, M, yy);
    doc.setDrawColor(160, 160, 160);
    doc.line(M + 48, yy + 1, W - M, yy + 1);
  });
  y += 9 + fields.length * 10 + 6;

  doc.setFont("helvetica", "bold");
  doc.text("Zo gebruik je dit", M, y);
  doc.setFont("helvetica", "normal");
  const steps = input.kind === "phrase"
    ? ["1. Open rout.be op je nieuwe toestel en log in.", "2. Ga naar Account > Herstelkluis en kies Hoofdsleutel herstellen.", "3. Typ de 24 woorden in de juiste volgorde. Ze verlaten je toestel nooit.", "4. Maak daarna nieuwe herstelwoorden en vernietig dit blad."]
    : ["1. Log in op rout.be met je e-mail en wachtwoord of passkey.", "2. Kies bij de tweede stap Herstelcode gebruiken.", "3. Vink de gebruikte code hierboven af.", "4. Maak nieuwe codes als je er nog maar een paar over hebt."];
  steps.forEach((s, i) => doc.text(s, M, y + 7 + i * 6));

  doc.setFontSize(8);
  doc.setTextColor(...soft);
  doc.text("Gemaakt in je browser. Dit bestand is nooit naar ROUT gestuurd.", M, 287);
  return doc.output("blob");
}

/** Triggers a local download of a Blob. */
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
