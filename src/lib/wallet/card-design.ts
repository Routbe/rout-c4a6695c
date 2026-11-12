/**
 * Applies a stored CMF design to the public card payload. The stored JSON is
 * re-validated (material, contrast, privacy bot) so a bad row never reaches
 * a visitor; anything invalid falls back to the plain card.
 */
import { CARD_MATERIALS } from "./card-cmf";
import { checkCardText } from "./card-privacy";
import { contrastRatio, MIN_TEXT_CONTRAST } from "./card-style";

type CardLike = { hexBackgroundColor: string; hexForegroundColor: string; displayName: string };

export function applyCardDesign<T extends CardLike>(card: T, design: Record<string, unknown> | null): { card: T & { regionDisplay?: string }; materialId: string | null } {
  const mat = design?.["material"] as { id?: unknown } | undefined;
  const m = CARD_MATERIALS.find((x) => x.id === mat?.id);
  const accent = design?.["accentHex"];
  if (!m || typeof accent !== "string" || !/^#[0-9a-f]{6}$/i.test(accent) || contrastRatio(accent, m.baseHex) < MIN_TEXT_CONTRAST) {
    return { card, materialId: null };
  }
  const text = design?.["text"] as { displayName?: { value?: unknown }; region?: { value?: unknown } } | undefined;
  const name = typeof text?.displayName?.value === "string" ? text.displayName.value.trim().slice(0, 40) : "";
  const region = typeof text?.region?.value === "string" ? text.region.value.trim().slice(0, 40) : "";
  return {
    card: {
      ...card,
      hexBackgroundColor: m.baseHex,
      hexForegroundColor: accent.toLowerCase(),
      displayName: name && !checkCardText(name) ? name : card.displayName,
      ...(region && !checkCardText(region) ? { regionDisplay: region } : {}),
    },
    materialId: m.id,
  };
}
