import { Button, Section, Text } from "@react-email/components";
import { emailT } from "@/locales/emails";
import { MAIL, TemplateWrapper } from "./TemplateWrapper";

export interface MagicLinkEmailProps {
  locale: string;
  magic_link: string;
  otp_code?: string;
  user_handle?: string;
}

export function MagicLinkEmail({ locale, magic_link, otp_code, user_handle }: MagicLinkEmailProps) {
  const vars = { magic_link, otp_code, user_handle };
  return (
    <TemplateWrapper lang={locale} preview={emailT(locale, "login.preview", vars)} footer={emailT(locale, "footer")}>
      <Text style={{ fontSize: 16, margin: "0 0 12px" }}>
        {user_handle ? emailT(locale, "login.greeting", vars) : emailT(locale, "login.greetingAnon")}
      </Text>
      <Text style={{ fontSize: 15, lineHeight: "22px", color: MAIL.muted, margin: "0 0 24px" }}>
        {emailT(locale, "login.body")}
      </Text>
      <Section style={{ textAlign: "center", marginBottom: 24 }}>
        <Button
          href={magic_link}
          style={{ backgroundColor: MAIL.mint, color: "#0b0b0c", fontWeight: 700, fontSize: 16, padding: "14px 28px", borderRadius: 12, textDecoration: "none" }}
        >
          {emailT(locale, "login.cta")}
        </Button>
      </Section>
      {otp_code ? (
        <Section style={{ textAlign: "center", border: `1px solid ${MAIL.border}`, borderRadius: 12, padding: "16px 8px", marginBottom: 20 }}>
          <Text style={{ color: MAIL.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 6px" }}>
            {emailT(locale, "login.codeLabel")}
          </Text>
          <Text style={{ fontFamily: "'SFMono-Regular', Menlo, Consolas, monospace", fontSize: 34, letterSpacing: 10, fontWeight: 700, color: MAIL.text, margin: 0 }}>
            {otp_code}
          </Text>
        </Section>
      ) : null}
      <Text style={{ fontSize: 13, color: MAIL.muted, margin: "0 0 6px" }}>{emailT(locale, "login.expiry")}</Text>
      <Text style={{ fontSize: 13, color: MAIL.muted, margin: 0 }}>{emailT(locale, "login.ignore")}</Text>
    </TemplateWrapper>
  );
}
