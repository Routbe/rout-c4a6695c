/**
 * Google Wallet Loyalty shapes (walletobjects v1). The tile colour, logo and title
 * live on the class only: LoyaltyObject has no hexBackgroundColor or logo field and
 * Google rejects unknown fields, so a member's colour is carried by a class per colour.
 */
type LocalizedString = { defaultValue: { language: string; value: string }; translatedValues: { language: string; value: string }[] };
export type GoogleImage = { sourceUri: { uri: string }; contentDescription: LocalizedString };
export type GoogleTextModule = { id: string; body?: string; localizedHeader: LocalizedString; localizedBody?: LocalizedString };
type FieldSelector = { fields: { fieldPath: string }[] };
export type GoogleCardRow =
  | { oneItem: { item: { firstValue: FieldSelector } } }
  | { twoItems: { startItem: { firstValue: FieldSelector }; endItem: { firstValue: FieldSelector } } };
export type GoogleLoyaltyClass = {
  id: string;
  issuerName: string;
  programName: string;
  programLogo: GoogleImage;
  hexBackgroundColor: string;
  reviewStatus: "UNDER_REVIEW";
  localizedAccountNameLabel?: LocalizedString;
  localizedAccountIdLabel?: LocalizedString;
  classTemplateInfo?: { cardTemplateOverride: { cardRowTemplateInfos: GoogleCardRow[] } };
  /** Smart Tap (Sovereign Key only): NFC transmission to the listed redemption issuers' readers. */
  enableSmartTap?: boolean;
  redemptionIssuers?: string[];
};
export type GoogleLoyaltyObject = {
  id: string; classId: string; state: "ACTIVE";
  /** Primary text on the card face (the member's @handle). */
  accountName: string;
  accountId?: string;
  heroImage?: GoogleImage;
  textModulesData: GoogleTextModule[];
  barcode?: { type: "QR_CODE"; value: string; alternateText: string };
  imageModulesData?: { id: string; mainImage: GoogleImage }[];
  linksModuleData?: { uris: { uri: string; localizedDescription: LocalizedString; id: string }[] };
  /** Smart Tap payload sent over NFC (Sovereign Key only); never shown on screen. */
  smartTapRedemptionValue?: string;
  /** Sovereign Key only: QR that Google Wallet regenerates itself from a TOTP secret. */
  rotatingBarcode?: {
    type: "QR_CODE";
    valuePattern: string;
    totpDetails: { periodMillis: string; algorithm: "TOTP_SHA1"; parameters: { key: string; valueLength: number }[] };
  };
};
export type GoogleCardClaims = { iss: string; aud: "google"; typ: "savetowallet"; origins: string[]; payload: { loyaltyClasses: GoogleLoyaltyClass[]; loyaltyObjects: GoogleLoyaltyObject[] } };
