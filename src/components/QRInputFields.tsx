import { useState, useEffect, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SketchArrow } from "@/components/SketchArrow";
import { QRType } from "./QRTypeSelector";
import { FileUploadInput } from "./FileUploadInput";
import { PaymentFields } from "./PaymentFields";
import { isPaymentType } from "@/lib/payments";
import { getRichDefinition, isRichType, validateRich } from "@/lib/rich-qr";
import { checkUrl, normalizeUrlInput } from "@/lib/url-validation";
import { ProfileHubPicker } from "./ProfileHubPicker";
import { AddressSearch } from "./AddressSearch";
import { useI18n } from "@/lib/i18n";
import { FeedbackQRInput } from "./FeedbackQRInput";

interface QRInputFieldsProps {
  paymentValues?: Record<string, string>;
  onPaymentFieldChange?: (key: string, value: string) => void;
  qrType: QRType;
  value: string;
  onValueChange: (value: string) => void;
  wifiSSID: string;
  onWifiSSIDChange: (ssid: string) => void;
  wifiPassword: string;
  onWifiPasswordChange: (password: string) => void;
  wifiEncryption: "WPA" | "WEP" | "nopass";
  onWifiEncryptionChange: (encryption: "WPA" | "WEP" | "nopass") => void;
  emailAddress: string;
  onEmailAddressChange: (email: string) => void;
  emailSubject: string;
  onEmailSubjectChange: (subject: string) => void;
  emailBody: string;
  onEmailBodyChange: (body: string) => void;
  smsPhone: string;
  onSmsPhoneChange: (phone: string) => void;
  smsMessage: string;
  onSmsMessageChange: (message: string) => void;
  whatsappPhone?: string;
  onWhatsappPhoneChange?: (phone: string) => void;
  whatsappMessage?: string;
  onWhatsappMessageChange?: (message: string) => void;
  richValues?: Record<string, string>;
  onRichFieldChange?: (key: string, value: string) => void;
}

const inputClassName = "h-12 rounded-xl bg-background border-border input-field";
const textareaClassName =
  "w-full p-3 rounded-xl bg-background border border-border resize-none focus:outline-none focus:ring-2 focus:ring-ring input-field";
const labelClassName = "input-label";
const helperText = "Your QR code will generate automatically";

/** Hand-drawn hint shown under an empty input to point back at the preview. */
export function HelperHint({ text = helperText }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <SketchArrow className="h-6 w-9 -scale-y-100" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

const isValidUrl = (urlString: string): boolean => checkUrl(urlString).status !== "invalid";

const normalizeUrl = (input: string): string => normalizeUrlInput(input);

/** URL input with live, client-side-only syntax checking (never blocks export). */
function UrlInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  const id = useId();
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    const normalized = normalizeUrl(inputValue);
    if (value !== normalized && value !== inputValue) setInputValue(value);
  }, [value]);

  const check = checkUrl(inputValue);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setInputValue(next);
    const result = checkUrl(next);
    onChange(result.normalized);
  };

  // Auto-correct typos (missing or doubled protocol) once the user leaves.
  const handleBlur = () => {
    if (!inputValue.trim()) return;
    const result = checkUrl(inputValue);
    if (result.normalized) setInputValue(result.normalized);
  };

  const pill =
    check.status === "valid"
      ? { dot: "bg-emerald-500", text: "text-muted-foreground" }
      : check.status === "notice"
        ? { dot: "bg-amber-500", text: "text-muted-foreground" }
        : { dot: "bg-destructive", text: "text-destructive" };

  return (
    <div className="space-y-2">
      <label htmlFor={id} className={labelClassName}>{label}</label>
      <Input
        id={id}
        aria-invalid={check.status === "invalid"}
        aria-describedby={check.status === "empty" ? undefined : `${id}-feedback`}
        type="text"
        placeholder={placeholder}
        value={inputValue}
        onChange={handleChange}
        onBlur={handleBlur}
        className={cn(inputClassName, check.status === "invalid" && "border-destructive")}
      />
      {check.status === "empty" ? (
        <HelperHint />
      ) : (
        <p id={`${id}-feedback`} aria-live="polite" className={cn("flex items-center gap-2 text-xs", pill.text)}>
          <span className={cn("h-2 w-2 shrink-0 rounded-full", pill.dot)} aria-hidden />
          {check.message}
        </p>
      )}
    </div>
  );
}

/** Metadata-driven form for multi-field types (vCard, calendar event). */
function RichFields({
  typeId,
  values,
  onChange,
}: {
  typeId: string;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const { locale } = useI18n();
  const instanceId = useId();
  const def = getRichDefinition(typeId);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  if (!def) return null;
  const errors = validateRich(typeId, values);

  // De social hub is volledig ontkoppeld: geen bewerkingsvelden in de
  // generator, enkel een handle-keuze plus een doorsteek naar de Studio.
  if (typeId === "social") {
    return <ProfileHubPicker values={values} onChange={onChange} />;
  }
  const fields = def.fields;

  return (
    <div className="space-y-3">
      {typeId === "maps" && (
        <AddressSearch
          onPick={({ label, street, postcode, city, country, lat, lng }) => {
            // Structured fields win; the free-text query only keeps the full label
            // when we could not split the address into parts.
            onChange("street", street);
            onChange("postcode", postcode);
            onChange("city", city);
            onChange("country", country);
            onChange("query", street || city ? "" : label);
            onChange("lat", lat);
            onChange("lng", lng);
          }}
        />
      )}
      {fields.map((f) => {
        const id = `${instanceId}-rich-${typeId}-${f.key}`;
        const err = touched[f.key] ? errors[f.key] : undefined;
        const label = locale === "nl" ? f.labelNl : f.label;
        return (
          <div key={f.key} className="space-y-2">
            <label htmlFor={id} className={labelClassName}>
              {label}
              {f.optional && <span className="text-muted-foreground font-normal"> (optional)</span>}
            </label>
            {f.type === "textarea" ? (
              <textarea
                id={id}
                rows={3}
                maxLength={500}
                aria-invalid={Boolean(err)}
                aria-describedby={err ? `${id}-error` : undefined}
                className={textareaClassName}
                placeholder={f.placeholder}
                value={values[f.key] ?? ""}
                onChange={(e) => onChange(f.key, e.target.value)}
                onBlur={() => setTouched((prev) => ({ ...prev, [f.key]: true }))}
              />
            ) : f.type === "image" ? (
              <FileUploadInput
                type="image"
                value={values[f.key] ?? ""}
                onValueChange={(url) => onChange(f.key, url)}
              />
            ) : (
              <Input
                id={id}
                type={f.type ?? "text"}
                maxLength={200}
                className={cn(inputClassName, err && "border-destructive")}
                placeholder={f.placeholder}
                value={values[f.key] ?? ""}
                aria-invalid={Boolean(err)}
                aria-describedby={err ? `${id}-error` : undefined}
                onChange={(e) => onChange(f.key, e.target.value)}
                onBlur={() => setTouched((prev) => ({ ...prev, [f.key]: true }))}
              />
            )}

            {err && (
              <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
                {err}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function QRInputFields({
  qrType,
  value,
  onValueChange,
  wifiSSID,
  onWifiSSIDChange,
  wifiPassword,
  onWifiPasswordChange,
  wifiEncryption,
  onWifiEncryptionChange,
  emailAddress,
  onEmailAddressChange,
  emailSubject,
  onEmailSubjectChange,
  emailBody,
  onEmailBodyChange,
  smsPhone,
  onSmsPhoneChange,
  smsMessage,
  onSmsMessageChange,
  whatsappPhone = "",
  onWhatsappPhoneChange,
  whatsappMessage = "",
  onWhatsappMessageChange,
  paymentValues,
  onPaymentFieldChange,
  richValues,
  onRichFieldChange,
}: QRInputFieldsProps) {
  const instanceId = useId();
  if (isRichType(qrType)) {
    return (
      <RichFields
        typeId={qrType}
        values={richValues ?? {}}
        onChange={(key, val) => onRichFieldChange?.(key, val)}
      />
    );
  }

  if (isPaymentType(qrType)) {
    return (
      <PaymentFields
        methodId={qrType}
        values={paymentValues ?? {}}
        onChange={(key, val) => onPaymentFieldChange?.(key, val)}
      />
    );
  }

  switch (qrType) {
    case "feedback":
      return <FeedbackQRInput value={value} onChange={onValueChange} />;
    case "url":
      return (
        <UrlInput
          value={value}
          onChange={onValueChange}
          placeholder="https://delplanche.com"
          label="Website URL"
        />
      );
    case "text":
      return (
        <div className="space-y-2">
          <label htmlFor={`${instanceId}-text`} className={labelClassName}>Text Content</label>
          <textarea
            id={`${instanceId}-text`}
            placeholder="Enter any text content..."
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            className={cn(textareaClassName, "h-24")}
          />
          <HelperHint />
        </div>
      );
    case "wifi":
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <label htmlFor={`${instanceId}-ssid`} className={labelClassName}>Network Name</label>
            <Input
              id={`${instanceId}-ssid`}
              type="text"
              placeholder="My WiFi Network"
              value={wifiSSID}
              onChange={(e) => onWifiSSIDChange(e.target.value)}
              className={inputClassName}
            />
          </div>
          <div className="space-y-2">
            <p id={`${instanceId}-encryption`} className={labelClassName}>Encryption</p>
            <div role="group" aria-labelledby={`${instanceId}-encryption`} className="flex gap-2">
              {(["WPA", "WEP", "nopass"] as const).map((enc) => (
                <Button
                  type="button"
                  variant="ghost"
                  aria-pressed={wifiEncryption === enc}
                  key={enc}
                  onClick={() => {
                    onWifiEncryptionChange(enc);
                    // Clear password when switching to no encryption
                    if (enc === "nopass") {
                      onWifiPasswordChange("");
                    }
                  }}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    wifiEncryption === enc
                      ? "gradient-border-selected text-foreground"
                      : "border border-transparent hover:bg-muted text-foreground",
                  )}
                >
                  {enc === "nopass" ? "None" : enc}
                </Button>
              ))}
            </div>
          </div>
          {wifiEncryption !== "nopass" && (
            <div className="space-y-2">
              <label htmlFor={`${instanceId}-password`} className={labelClassName}>Password</label>
              <Input
                id={`${instanceId}-password`}
                type="password"
                placeholder="Enter password"
                value={wifiPassword}
                onChange={(e) => onWifiPasswordChange(e.target.value)}
                className={inputClassName}
              />
            </div>
          )}
          <HelperHint />
        </div>
      );
    case "email":
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <label htmlFor={`${instanceId}-email`} className={labelClassName}>Email Address</label>
            <Input
              id={`${instanceId}-email`}
              type="email"
              placeholder="hello@delplanche.com"
              value={emailAddress}
              onChange={(e) => onEmailAddressChange(e.target.value)}
              className={inputClassName}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor={`${instanceId}-subject`} className={labelClassName}>
              Subject <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              id={`${instanceId}-subject`}
              type="text"
              placeholder="Email subject"
              value={emailSubject}
              onChange={(e) => onEmailSubjectChange(e.target.value)}
              className={inputClassName}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor={`${instanceId}-email-body`} className={labelClassName}>
              Message <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id={`${instanceId}-email-body`}
              placeholder="Email body..."
              value={emailBody}
              onChange={(e) => onEmailBodyChange(e.target.value)}
              className={cn(textareaClassName, "h-20")}
            />
          </div>
          <HelperHint />
        </div>
      );
    case "sms":
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <label htmlFor={`${instanceId}-sms-phone`} className={labelClassName}>Phone Number</label>
            <Input
              id={`${instanceId}-sms-phone`}
              type="tel"
              placeholder="+1234567890"
              value={smsPhone}
              onChange={(e) => onSmsPhoneChange(e.target.value)}
              className={inputClassName}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor={`${instanceId}-sms-message`} className={labelClassName}>
              Message <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id={`${instanceId}-sms-message`}
              placeholder="Your message..."
              value={smsMessage}
              onChange={(e) => onSmsMessageChange(e.target.value)}
              className={cn(textareaClassName, "h-20")}
            />
          </div>
          <HelperHint />
        </div>
      );
    case "whatsapp":
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <label htmlFor={`${instanceId}-whatsapp-phone`} className={labelClassName}>Phone Number</label>
            <Input
              id={`${instanceId}-whatsapp-phone`}
              type="tel"
              placeholder="+1234567890"
              value={whatsappPhone}
              onChange={(e) => onWhatsappPhoneChange?.(e.target.value)}
              className={inputClassName}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor={`${instanceId}-whatsapp-message`} className={labelClassName}>
              Message <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id={`${instanceId}-whatsapp-message`}
              placeholder="Hi! I found you via QR..."
              value={whatsappMessage}
              onChange={(e) => onWhatsappMessageChange?.(e.target.value)}
              className={cn(textareaClassName, "h-20")}
            />
          </div>
          <HelperHint />
        </div>
      );
    case "image":
      return (
        <div className="space-y-2">
          <FileUploadInput type="image" value={value} onValueChange={onValueChange} />
        </div>
      );
    case "pdf":
      return (
        <div className="space-y-2">
          <FileUploadInput type="pdf" value={value} onValueChange={onValueChange} />
        </div>
      );
    case "mp3":
      return (
        <div className="space-y-2">
          <FileUploadInput type="mp3" value={value} onValueChange={onValueChange} />
        </div>
      );
    case "app":
      return (
        <UrlInput
          value={value}
          onChange={onValueChange}
          placeholder="https://apps.apple.com/... or https://play.google.com/..."
          label="App Store Link"
        />
      );
    default:
      return (
        <div className="space-y-2">
          <label htmlFor={`${instanceId}-content`} className={labelClassName}>Content</label>
          <Input
            id={`${instanceId}-content`}
            type="text"
            placeholder="Enter content..."
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            className={inputClassName}
          />
          <HelperHint />
        </div>
      );
  }
}
