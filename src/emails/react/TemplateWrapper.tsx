import type { ReactNode } from "react";
import { Body, Container, Head, Html, Img, Preview, Section, Text } from "@react-email/components";

/** Obsidian-stijl; inline kleuren omdat mailprogramma's geen CSS-variabelen kennen. */
export const MAIL = {
  bg: "#0b0b0c",
  card: "#131211",
  border: "#2a2826",
  text: "#f4f2ef",
  muted: "#a29d97",
  mint: "#41DB97",
  purple: "#7026E1",
} as const;

/** PNG (geen SVG): Gmail en Outlook tonen geen SVG-afbeeldingen. */
const LOGO_URL = "https://rout.be/press/rout-icon-white.png";

export function TemplateWrapper({
  lang,
  preview,
  footer,
  children,
}: {
  lang: string;
  preview: string;
  footer: string;
  children: ReactNode;
}) {
  return (
    <Html lang={lang}>
      <Head>
        <meta name="color-scheme" content="dark only" />
        <meta name="supported-color-schemes" content="dark" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: MAIL.bg, color: MAIL.text, margin: 0, padding: "32px 12px", fontFamily: "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif" }}>
        <Container style={{ maxWidth: 480, margin: "0 auto" }}>
          <Section style={{ textAlign: "center", paddingBottom: 24 }}>
            <Img src={LOGO_URL} width="44" height="54" alt="ROUT" style={{ margin: "0 auto" }} />
          </Section>
          <Section style={{ backgroundColor: MAIL.card, border: `1px solid ${MAIL.border}`, borderRadius: 16, padding: "28px 24px" }}>
            {children}
          </Section>
          <Text style={{ color: MAIL.muted, fontSize: 12, textAlign: "center", marginTop: 24 }}>{footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
