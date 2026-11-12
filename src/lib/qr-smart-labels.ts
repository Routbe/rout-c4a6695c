import { qrDestinationSchema, normalizeQrSuggestion } from "./qr-campaign-presets";
/** One accepted label feeds preview, save and optional dynamic-link creation. */
export function smartLabelSelection(input: { destination: string; label: string; callToAction: string }) {
  const destination = qrDestinationSchema.parse(input.destination);
  const { label, callToAction } = normalizeQrSuggestion(input);
  if (!label || !callToAction) throw new Error("Label en oproep tot actie zijn verplicht.");
  return { destination, label, callToAction };
}
