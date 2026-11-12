/**
 * ROUT Card security shader (both faces). Bounded analytic GLSL:
 * - thin-film interference foil (gold -> emerald -> deep blue) on the mask's R channel
 * - procedural guilloche rosette + wave lines, anti-aliased with fwidth
 * - latent kinegram watermark (mask G) visible only near a 45 degree view
 * - emboss: mask B is a height map that bends the normal, so light catches the print
 * - temporal noise keyed to the live server seed and the real clock
 */
import * as THREE from "three";
import { FACE_H, FACE_W, FRONT_AVATAR } from "./card-faces";

/** Reserved portrait disc in UV space (follows the printed avatar in card-faces). */
const AVATAR_UV = {
  y: (1 - FRONT_AVATAR.cy / FACE_H).toFixed(4),
  r0: (FRONT_AVATAR.r / FACE_W).toFixed(4),
  r1: ((FRONT_AVATAR.r + 10) / FACE_W).toFixed(4),
};

export const LATENT_COS = 0.7071; // cos(45 deg)
export const LATENT_WIDTH = 0.035;

const vertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vN;
varying vec3 vT;
varying vec3 vB;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  mat3 m = mat3(modelMatrix);
  vN = normalize(m * vec3(0.0, 0.0, 1.0));
  vT = normalize(m * vec3(1.0, 0.0, 0.0));
  vB = normalize(m * vec3(0.0, 1.0, 0.0));
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragment = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uMask;
uniform sampler2D uPortrait;
uniform float uTime;
uniform float uFinish;   // 0 metal, 1 glass, 2 holo
uniform vec4 uSeed;      // live server seed for this 30 s window
uniform vec3 uLightPos;
uniform vec2 uTexel;
uniform float uLatentCos;
uniform float uLatentWidth;
uniform float uRough;     // < 0 = finish default, else PBR roughness
uniform float uMetal;     // < 0 = finish default, else PBR metalness
uniform float uClearcoat; // 0..1 lacquer lobe (ceramic)
uniform float uAniso;     // 0..1 brushed highlight along the card's long axis
uniform float uMotion;    // 0 disables temporal effects for reduced motion
uniform float uBack;
/** Exact printed QR panel in UV (min.xy, max.xy): no optical layer, almost no gloss. */
uniform vec4 uQrBox;
uniform vec2 uGyro;       // tilt / gyroscope offset, roughly -1..1
uniform vec3 uInkGreen;
uniform vec3 uInkSteel;
uniform vec3 uInkPlatinum;
uniform vec3 uChipMetal;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vN;
varying vec3 vT;
varying vec3 vB;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Thin-film interference, Belcour-Barla style approximation: air / film (n = 1.6) /
// polycarbonate (n = 1.5). Airy two-beam sum with Fresnel amplitudes, evaluated
// at three wavelengths, so the reflection follows the real optical path difference.
vec3 thinFilm(float cosI, float d) {
  float n1 = 1.0;
  float n2 = 1.6;
  float n3 = 1.5;
  float sinT2 = (1.0 - cosI * cosI) / (n2 * n2);
  float cosT = sqrt(max(1.0 - sinT2, 0.0));
  float cos3 = sqrt(max(1.0 - (1.0 - cosI * cosI) / (n3 * n3), 0.0));
  // Unpolarized average of s/p amplitude reflectances at both interfaces.
  float r12 = 0.5 * ((n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT) + (n2 * cosI - n1 * cosT) / (n2 * cosI + n1 * cosT));
  float r23 = 0.5 * ((n2 * cosT - n3 * cos3) / (n2 * cosT + n3 * cos3) + (n3 * cosT - n2 * cos3) / (n3 * cosT + n2 * cos3));
  vec3 lambda = vec3(650.0, 532.0, 450.0);
  vec3 phase = 12.566371 * n2 * d * cosT / lambda + 3.14159 * step(n2, n1); // half-wave shift handled by r signs
  vec3 num = r12 * r12 + r23 * r23 + 2.0 * r12 * r23 * cos(phase);
  vec3 den = 1.0 + r12 * r12 * r23 * r23 + 2.0 * r12 * r23 * cos(phase);
  vec3 R = num / den;
  // Normalize to a displayable tint while keeping the spectral ratios.
  return clamp(R / max(max(R.r, max(R.g, R.b)), 1e-3), 0.0, 1.0);
}

float aaLine(float v, float width) {
  float distanceToLine = abs(fract(v + 0.5) - 0.5);
  float footprint = max(fwidth(v), 0.0001);
  // Fade unresolved frequencies instead of generating moire at a distance.
  return (1.0 - smoothstep(width, width + footprint, distanceToLine))
    * (1.0 - smoothstep(0.35, 1.0, footprint));
}

float boxMask(vec2 uv, vec2 lo, vec2 hi) {
  vec2 aa = max(fwidth(uv), vec2(0.0001));
  vec2 inside = smoothstep(lo - aa, lo + aa, uv) * (1.0 - smoothstep(hi - aa, hi + aa, uv));
  return inside.x * inside.y;
}

float contour(float distanceToEdge, float width) {
  float aa = max(fwidth(distanceToEdge), 0.0001);
  return 1.0 - smoothstep(width, width + aa, abs(distanceToEdge));
}

// ---- Base layer: polycarbonate micro-relief + banknote guilloche (branch-free) ----
float cayenneGuilloche(vec2 uv, float time) {
  float l1 = sin(uv.x * 150.0 + sin(uv.y * 30.0 + time) * 5.0);
  float l2 = cos(uv.y * 150.0 + cos(uv.x * 40.0 - time) * 4.0);
  float v = abs(l1 + l2) * 0.2;
  float aa = max(fwidth(v), 0.0001);
  // Fade the line where it is smaller than a pixel instead of aliasing.
  return (1.0 - smoothstep(0.0, 0.01 + aa, v)) * (1.0 - smoothstep(0.08, 0.3, aa));
}

// ---- Lenticular hologram layer: rotated micro-dot lens grid ----
// Returns x = lens coverage, y = bevel edge highlight, z = moire phase.
vec3 lensGrid(vec2 uv, vec2 Lscreen) {
  mat2 rot = mat2(0.9659, -0.2588, 0.2588, 0.9659); // 15 deg, beats against the guilloche
  vec2 g = rot * uv * 54.0;
  vec2 cell = fract(g) - 0.5;
  float d = length(cell);
  float aa = max(fwidth(d), 0.0001);
  float resolved = 1.0 - smoothstep(0.12, 0.4, fwidth(g.x));
  float lens = (1.0 - smoothstep(0.32 - aa, 0.32 + aa, d)) * resolved;
  // Dome height; its screen-space derivative gives a faux bevel normal.
  float h = clamp(1.0 - d / 0.32, 0.0, 1.0);
  h = sqrt(h);
  vec2 grad = vec2(dFdx(h), dFdy(h)) / max(aa, 0.0001);
  float slope = clamp(length(grad) * 0.35, 0.0, 1.0);
  float facing = clamp(dot(normalize(grad + 1e-5), normalize(Lscreen + 1e-5)) * 0.5 + 0.5, 0.0, 1.0);
  float edge = slope * facing * lens;
  float phase = fract(dot(floor(g), vec2(0.127, 0.311)));
  return vec3(lens, edge, phase);
}

void main() {
  vec4 base = texture2D(uMap, vUv);
  vec3 mask = texture2D(uMask, vUv).rgb * (1.0 - uBack);
  // Never print optical layers over QR quiet zones, portraits or MRZ.
  // Only the avatar's own opaque pixels are reserved (from its edge inward):
  // transparent or open areas of a non-round avatar keep the card effects.
  float disc = 1.0 - smoothstep(${AVATAR_UV.r0}, ${AVATAR_UV.r1}, length((vUv - vec2(0.5, ${AVATAR_UV.y})) * vec2(1.0, 1.588)));
  float avatarAlpha = smoothstep(0.02, 0.5, texture2D(uPortrait, vUv).r) * disc;
  float frontReserved = max(boxMask(vUv, uQrBox.xy, uQrBox.zw), avatarAlpha);
  float backReserved = max(boxMask(vUv, uQrBox.xy, uQrBox.zw),
    1.0 - smoothstep(0.148, 0.16, vUv.y));
  float printable = 1.0 - mix(frontReserved, backReserved, uBack);

  // Emboss: height gradient from the mask's blue channel bends the normal.
  float hL = texture2D(uMask, vUv - vec2(uTexel.x, 0.0)).b;
  float hR = texture2D(uMask, vUv + vec2(uTexel.x, 0.0)).b;
  float hD = texture2D(uMask, vUv - vec2(0.0, uTexel.y)).b;
  float hU = texture2D(uMask, vUv + vec2(0.0, uTexel.y)).b;
  vec3 N = normalize(vN - vT * (hR - hL) * 1.4 - vB * (hU - hD) * 1.4);
  N *= float(gl_FrontFacing) * 2.0 - 1.0;

  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uLightPos - vWorldPos);
  vec3 H = normalize(L + V);
  float cosV = clamp(dot(N, V), 0.0, 1.0);

  // Guilloche: a rosette and a wave field, both resolution independent.
  vec2 p = (vUv - 0.5) * vec2(1.0, 1.588);
  float r = length(p);
  float a = atan(p.y, p.x);
  float rose = aaLine(r * 46.0 + 0.85 * sin(a * 12.0) + 0.35 * sin(a * 7.0 + r * 38.0), 0.022);
  float rose2 = aaLine(r * 43.0 - 0.85 * sin(a * 12.0 + 1.3), 0.022);
  float waves = aaLine(p.y * 52.0 + 1.6 * sin(p.x * 26.0 + p.y * 8.0), 0.02);
  float crossWaves = aaLine(p.x * 48.0 + 1.1 * sin(p.y * 19.0 - p.x * 5.0), 0.02);
  float guilloche = max(max(rose, rose2) * (1.0 - smoothstep(0.15, 0.72, r)), max(waves, crossWaves) * 0.65) * printable;

  // Finish weights without branches.
  float isGlass = step(0.5, uFinish) * step(uFinish, 1.5);
  float isHolo = step(1.5, uFinish);
  float isMetal = 1.0 - isGlass - isHolo;
  float rough = mix(mix(0.38, 0.06, isGlass), 0.2, isHolo);
  rough = mix(rough, clamp(uRough, 0.03, 1.0), step(0.0, uRough));
  float shininess = 2.0 / (rough * rough * rough * rough + 1e-3);

  // Foil: thin film whose thickness flows over the card, so colours sweep with tilt.
  float foil = max(mask.r, isHolo * 0.45 + guilloche * 0.25 * isHolo);
  float thickness = 450.0 + 180.0 * sin(p.x * 3.1 + p.y * 2.3 + uSeed.w * 6.2831) + 120.0 * guilloche;
  vec3 film = thinFilm(cosV, thickness);
  // Bias toward ROUT gold / emerald / deep blue.
  film = mix(film, film * vec3(1.05, 0.98, 1.1) + vec3(0.04, 0.02, 0.0), 0.5);

  float diff = clamp(dot(N, L), 0.0, 1.0);
  float NdotH = clamp(dot(N, H), 0.0, 1.0);
  float spec = pow(NdotH, shininess) * (shininess + 8.0) / 25.0;
  // Brushed metal: stretch the highlight along the tangent (Ward-like, no branches).
  float hT = dot(H, vT);
  float hB = dot(H, vB);
  float aniso = exp(-(hT * hT * 900.0 + hB * hB * 18.0) / max(NdotH, 0.05)) * (shininess + 8.0) / 40.0;
  spec = mix(spec, aniso, clamp(uAniso, 0.0, 1.0));
  float F0 = mix(mix(0.6, 0.04, isGlass), 0.3, isHolo);
  F0 = mix(F0, mix(0.04, 0.9, clamp(uMetal, 0.0, 1.0)), step(0.0, uMetal));
  float fres = F0 + (1.0 - F0) * pow(1.0 - cosV, 5.0);

  // Cheap studio environment for reflections.
  vec3 R = reflect(-V, N);
  vec3 env = mix(vec3(0.05, 0.05, 0.07), vec3(1.0), smoothstep(-0.1, 0.9, R.y));
  env += vec3(0.55, 0.65, 1.0) * smoothstep(0.55, 1.0, -R.x) + vec3(1.0, 0.8, 0.9) * smoothstep(0.6, 1.0, R.x) * 0.6;

  vec3 col = base.rgb * (0.38 + 0.72 * diff);
  col *= 1.0 - guilloche * 0.08 * (isMetal + isHolo);
  vec3 metalTint = mix(vec3(1.0), base.rgb + 0.08, 0.8 * isMetal);
  col += min(spec, 1.6) * metalTint * (1.0 - rough) * 0.28;
  // Clearcoat lacquer: a tight white lobe on top, weighted by Fresnel.
  col += pow(NdotH, 900.0) * 6.0 * uClearcoat * (0.04 + 0.96 * pow(1.0 - cosV, 5.0)) + pow(NdotH, 900.0) * 1.2 * uClearcoat;
  col += env * fres * mix(0.09, 0.2, isGlass);
  col = mix(col, film * (0.55 + env * 0.5 + spec * 0.8), foil * (0.55 + 0.4 * (1.0 - cosV)));
  // Base layer: polycarbonate micro-scratches + cayenne guilloche as UV/intaglio ink.
  float scratches = hash12(floor(vUv * 800.0)) * 0.025;
  float cayenne = cayenneGuilloche(vUv, uTime * 0.05 * uMotion);
  col += (scratches - 0.02) * (0.4 + 0.6 * fres);
  col = mix(col, col + vec3(0.06, 0.11, 0.16) * (0.6 + 0.4 * diff), cayenne * 0.4);

  // Anisotropic GGX (brushed white-gold / titanium), brush direction = card X.
  // The brush lines are faded out once they fall below one pixel: an unresolved
  // frequency aliases into horizontal bands across the whole face.
  float brushPhase = vUv.y * 180.0;
  float brushResolved = 1.0 - smoothstep(1.1, 3.14159, fwidth(brushPhase));
  float brush = sin(brushPhase) * 0.025 * printable * brushResolved;
  vec3 Nb = normalize(N + vB * brush);
  float ax = 0.5;  // stretched along the brush
  float ay = 0.13;
  float tH = dot(H, vT);
  float bH = dot(H, vB);
  float nH = max(dot(Nb, H), 0.0);
  float dAniso = tH * tH / (ax * ax) + bH * bH / (ay * ay) + nH * nH;
  float ggxAniso = 1.0 / (3.14159 * ax * ay * dAniso * dAniso + 1e-4);
  float nL = clamp(dot(Nb, L), 0.0, 1.0);
  vec3 titanium = mix(vec3(0.78, 0.8, 0.83), vec3(0.95, 0.88, 0.74), 0.35);
  float metalZone = printable * clamp(isMetal + uAniso + mask.r * 0.5, 0.0, 1.0);

  // Brushed streak: the brush lines are tiny cylinders, so the facets whose tilt
  // mirrors the light catch more of it. That tilt swings with the line phase, so
  // the highlight breaks into fine parallel lines; the band term keeps the
  // structure where the light actually mirrors instead of washing the whole face.
  vec3 Ng = normalize(N + vB * (brush * 9.0));
  float groove = pow(clamp(dot(Ng, H), 0.0, 1.0), 24.0) * brushResolved;
  float devY = R.y - L.y;
  float band = exp(-devY * devY * 9.0);
  float brushed = groove * (0.25 + 0.75 * band);
  vec3 anisoSpec = titanium * (brushed * 1.4 + min(ggxAniso * nL * 0.1, 0.3)) * nL * (0.6 + 0.4 * fres);
  float streakGlow = clamp(band * 1.6, 0.0, 1.0);
  col += (anisoSpec + titanium * brush * 1.5 * streakGlow) * metalZone;

  // Hologram layer floats 1 mm below the polycarbonate: parallax from the
  // tangent-space view vector plus the gyro / tilt offset.
  vec3 Vt = vec3(dot(V, vT), dot(V, vB), max(dot(V, vN), 0.2));
  vec2 holoUv = p + (Vt.xy / Vt.z) * 0.0117 + uGyro * 0.012 * uMotion;
  vec2 Ls = vec2(dot(L, vT), dot(L, vB));
  vec3 lensInfo = lensGrid(holoUv, Ls);
  float viewShift = dot(Vt.xy, vec2(0.7, 0.45)) + uGyro.x * 0.5;
  vec3 holoFilm = thinFilm(cosV, 450.0 + 160.0 * sin(lensInfo.z * 6.2831 + viewShift * 9.0));
  vec3 gold = vec3(1.0, 0.78, 0.36);
  vec3 silver = vec3(0.86, 0.9, 0.96);
  vec3 foilMetal = mix(gold, silver, 0.5 + 0.5 * sin(viewShift * 7.0 + lensInfo.z * 3.0));
  vec3 holoCol = foilMetal * holoFilm * (0.45 + env * 0.4) + lensInfo.y * vec3(1.4, 1.3, 1.15);
  float holoWeight = printable * (0.34 + 0.7 * mask.r) * (0.75 + 0.35 * (1.0 - cosV));
  col = mix(col, holoCol, lensInfo.x * holoWeight) + lensInfo.y * holoWeight * 0.35;

  // Polycarbonate + hologram: razor-sharp GGX lobe, roughness 0.02 (printable only).
  float a02 = 0.02 * 0.02;
  float dP = NdotH * NdotH * (a02 - 1.0) + 1.0;
  float ggxP = a02 / (3.14159 * dP * dP + 1e-7);
  col += min(ggxP * diff, 30.0) * 0.012 * fres * printable;

  float inkAngle = clamp((1.0 - cosV) * 2.0 + dot(L, vT) * 0.35 + 0.25, 0.0, 1.0);
  vec3 securityInk = mix(uInkGreen, uInkSteel, smoothstep(0.0, 0.65, inkAngle));
  securityInk = mix(securityInk, uInkPlatinum, smoothstep(0.6, 1.0, inkAngle));
  col = mix(col, securityInk * (0.7 + 0.3 * diff), guilloche * 0.55);

  // Printed dual-interface module: rounded perimeter, segmented contacts, NFC arc.
  vec2 chip = (vUv - vec2(0.78, 0.19)) * vec2(1.0, 1.588);
  vec2 q = abs(chip) - vec2(0.063, 0.047);
  float chipSdf = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.012;
  float chipInside = 1.0 - smoothstep(-0.001, 0.001, chipSdf);
  float contacts = max(contour(chip.x, 0.0015), max(contour(abs(chip.y) - 0.022, 0.0015), contour(abs(chip.x) - 0.032, 0.0015))) * chipInside;
  float chipLines = max(contour(chipSdf, 0.0015), contacts);
  vec2 antenna = (vUv - vec2(0.5, 0.49)) * vec2(1.0, 1.588);
  float arc = max(contour(length(antenna) - 0.42, 0.001), contour(length(antenna) - 0.435, 0.001));
  arc *= smoothstep(-0.02, 0.02, antenna.x) * printable;
  float hardware = max(chipLines, arc * 0.6) * mix(0.16, 0.8, uBack);
  col = mix(col, uChipMetal * (0.65 + diff * 0.35) + film * fres * 0.15, hardware);

  // Latent image: Gaussian window around 45 deg, effectively zero at 0 deg.
  float latent = exp(-pow((cosV - uLatentCos) / uLatentWidth, 2.0)) * mask.g;
  col += latent * vec3(0.85, 1.0, 0.92) * 0.85;

  // Temporal security noise: changes 60x/s and per 30 s server window.
  float tick = floor(uTime * 60.0);
  float n = hash12(gl_FragCoord.xy + uSeed.xy * 4096.0 + tick * vec2(1.618, 2.718));
  float strobe = step(0.5, fract((vUv.x + vUv.y) * 180.0 + uTime * (3.0 + uSeed.z * 4.0)));
  // Visual texture, not protection against screenshots or recording.
  col += ((n - 0.5) * 0.012 + (strobe - 0.5) * 0.003) * uMotion * printable;
  // Preserve exact printed QR, portrait, identity and MRZ pixels on both sides.
  col = mix(base.rgb, col, printable);

  // Glass / clearcoat over the whole face, photo and QR included. Uses the
  // flat geometric normal (no emboss, no brush) so the reflection stays razor sharp
  // without blurring the layers underneath. Roughness 0.008, pure Schlick (F0 = 0.04).
  vec3 Nc = vN * (float(gl_FrontFacing) * 2.0 - 1.0);
  float cosC = clamp(dot(Nc, V), 0.0, 1.0);
  float schlick = 0.04 + 0.96 * pow(1.0 - cosC, 5.0);
  float ccA = 0.008 * 0.008;
  float nHc = clamp(dot(Nc, H), 0.0, 1.0);
  float dC = nHc * nHc * (ccA - 1.0) + 1.0;
  float ggxC = ccA / (3.14159 * dC * dC + 1e-7);
  vec3 Rc = reflect(-V, Nc);
  vec3 envC = mix(vec3(0.02), vec3(1.0), smoothstep(0.35, 0.95, Rc.y))
    + vec3(0.9, 0.95, 1.0) * smoothstep(0.82, 0.98, abs(Rc.x));
  vec3 clearcoatSpecular = (min(ggxC * clamp(dot(Nc, L), 0.0, 1.0), 40.0) * 0.02 + envC * 0.6) * schlick;
  // The QR panel keeps only a faint gloss so reflections never wash out its contrast.
  float qrPanel = boxMask(vUv, uQrBox.xy, uQrBox.zw);
  col += clearcoatSpecular * mix(1.0, 0.08, qrPanel);

  // Functional fields (QR, portrait, name, MRZ): no metal, a broad matte sheen
  // (GGX, roughness 0.85) so they read as printed diffuse ink, not foil.
  float a85 = 0.85 * 0.85;
  float dM = nHc * nHc * (a85 - 1.0) + 1.0;
  float ggxM = a85 / (3.14159 * dM * dM);
  col += vec3(ggxM * clamp(dot(Nc, L), 0.0, 1.0) * 0.03) * (1.0 - printable);

  // Prismatic rim: a hairline band at the mesh boundary splits light into a
  // narrow spectral streak only at grazing angles.
  vec2 edgeUv = min(vUv, 1.0 - vUv) * vec2(1.0, 1.588);
  float edgeDist = min(edgeUv.x, edgeUv.y);
  float rimAa = max(fwidth(edgeDist), 0.0001);
  float rimBand = 1.0 - smoothstep(0.004, 0.004 + rimAa * 1.5, edgeDist);
  float grazing = pow(1.0 - cosC, 4.0);
  float disp = dot(Rc, vT) * 2.0 + dot(Rc, vB) + edgeDist * 140.0;
  vec3 prism = 0.5 + 0.5 * cos(6.2831 * (disp + vec3(0.0, 0.33, 0.67)));
  float laser = pow(clamp(dot(Rc, L), 0.0, 1.0), 24.0);
  col += prism * rimBand * grazing * (0.6 + 3.0 * laser);

  // Ordered dither: the printed canvas gradient is only 8-bit, so without this
  // the dark background quantises into visible bands.
  // Ordered dither: the printed canvas gradient is only 8-bit, so without this
  // the dark background quantises into visible bands.
  float dither = hash12(gl_FragCoord.xy + uSeed.xy * 256.0) - 0.5;
  gl_FragColor = vec4(max(col + dither * (1.0 / 255.0), 0.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createSecurityMaterial(map: THREE.Texture, mask: THREE.Texture, texel: [number, number], back = false, portrait: THREE.Texture | null = null): THREE.ShaderMaterial {
  const tokens = getComputedStyle(document.documentElement);
  const ink = (name: string) => new THREE.Color(tokens.getPropertyValue(name).trim());
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    toneMapped: true,
    uniforms: {
      uMap: { value: map },
      uMask: { value: mask },
      uPortrait: { value: portrait ?? mask },
      uTime: { value: 0 },
      uFinish: { value: 0 },
      uSeed: { value: new THREE.Vector4(0.5, 0.5, 0.5, 0.5) },
      uLightPos: { value: new THREE.Vector3(0, 1, 2.4) },
      uTexel: { value: new THREE.Vector2(texel[0], texel[1]) },
      uLatentCos: { value: LATENT_COS },
      uLatentWidth: { value: LATENT_WIDTH },
      uRough: { value: -1 },
      uMetal: { value: -1 },
      uClearcoat: { value: 0 },
      uAniso: { value: 0 },
      uMotion: { value: 1 },
      uBack: { value: back ? 1 : 0 },
      uQrBox: { value: new THREE.Vector4(back ? 0.108 : 0.047, back ? 0.392 : 0.033, back ? 0.892 : 0.242, back ? 0.889 : 0.158) },
      uGyro: { value: new THREE.Vector2(0, 0) },
      uInkGreen: { value: ink("--card-security-ink-green") },
      uInkSteel: { value: ink("--card-security-ink-steel") },
      uInkPlatinum: { value: ink("--card-security-ink-platinum") },
      uChipMetal: { value: ink("--card-security-chip-metal") },
    },
  });
}
