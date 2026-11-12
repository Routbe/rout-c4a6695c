import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Camera, CreditCard, Loader2, Nfc, QrCode, RotateCw, ShieldCheck, Smartphone, Wallet, ZoomIn, ZoomOut } from "lucide-react";
import { frontCardUrl } from "@/lib/wallet/card-front-code";
import { Input } from "@/components/ui/input";
import { GYRO_CALIBRATION_SAMPLES, GYRO_REST_MS, filterGyro, orientationToDegrees, orientationToTilt, SPIN_PER_FRAME_WIDTH, zoomFromWheel, zoomFromPinch, clampPan, clampZoom } from "./card-physics";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { withStepUp } from "@/components/auth/StepUpDialog";
import { createWalletPass, getCardLiveness, getMyCardFront, getSecureCardToken, getWalletCard, getWalletStatus, saveMyCardDesign, setMyCardFront, setMyCardFrozen, verifyCardLiveCode } from "@/lib/wallet/wallet.functions";
import { pickCardView } from "@/lib/wallet/card-liveness";
import { contrastRatio } from "@/lib/wallet/card-style";
import { CARD_MATERIALS, defaultMaterial, materialsFor, nearestSafeAccent, type AgeTier, type CardMaterial } from "@/lib/wallet/card-cmf";
import { checkCardText, PRIVACY_MESSAGE } from "@/lib/wallet/card-privacy";
import { SECURE_ROTATE_MS } from "@/lib/wallet/card-token";
import { CardKeysPanel } from "./CardKeysPanel";
import { WalletVault } from "./WalletVault";
import { CardSecurityPanel } from "./CardSecurityPanel";
import type { WalletStatus } from "@/lib/wallet/wallet-pass";
import { drawCardFaces, hasWebGL, type CardFaces } from "./card-faces";
import type { CardFinish, LiveRef, SecureRef, TiltRef, ZoomRef, DragRef } from "./RoutCard3D";

const RoutCard3D = lazy(() => import("./RoutCard3D"));

type Card = NonNullable<Awaited<ReturnType<typeof getWalletCard>>>;

/** Any WebGL crash falls back to the CSS card instead of an empty dialog. */
class GlBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** CSS 3D fallback with the exact same face images. */
function FlatCard({ faces, flipped, tilt, onFlip }: { faces: { front: string; back: string }; flipped: boolean; tilt: { x: number; y: number }; onFlip: () => void }) {
  return (
    <button type="button" onClick={onFlip} className="mx-auto block h-full max-h-[420px] [perspective:1200px]" style={{ aspectRatio: "1 / 1.588" }} aria-label="Kaart omdraaien">
      <span
        className="relative block h-full w-full transition-transform duration-700 [transform-style:preserve-3d] motion-reduce:transition-none"
        style={{ transform: `rotateY(${(flipped ? 180 : 0) + tilt.x * 18}deg) rotateX(${-tilt.y * 12}deg)` }}
      >
        <img src={faces.front} alt="" className="absolute inset-0 h-full w-full rounded-2xl shadow-2xl [backface-visibility:hidden]" />
        <img src={faces.back} alt="" className="absolute inset-0 h-full w-full rounded-2xl shadow-2xl [backface-visibility:hidden] [transform:rotateY(180deg)]" />
      </span>
    </button>
  );
}

function defaultMaterialFor(fg: string): CardMaterial {
  return CARD_MATERIALS.find((m) => m.id === (fg === "#111111" ? "frosted-alpine-glass" : "obsidian-titanium"))!;
}

/**
 * "ROUT Card": a 3D digital twin of the member's card, plus Google Wallet,
 * Apple Wallet and vCard exports — all from the same server-built payload.
 */
export function RoutCardDialog({ open, onOpenChange, handle, space, inline = false, vault = "all" }: { open: boolean; onOpenChange: (v: boolean) => void; handle: string; space?: "root" | "alias"; /** Renders the same manager as a page section instead of a popup. */ inline?: boolean; /** "key": only the NFC key pass (profile cards live in their own tab). */ vault?: "all" | "key" }) {
  const { t } = useTranslation();
  const loadCard = useServerFn(getWalletCard);
  const loadStatus = useServerFn(getWalletStatus);
  const claimGoogle = useServerFn(createWalletPass);
  const [card, setCard] = useState<Card | null | undefined>(undefined);
  const [status, setStatus] = useState<WalletStatus | null>(null);
  const [faces, setFaces] = useState<CardFaces | null>(null);
  const [images, setImages] = useState<{ front: string; back: string } | null>(null);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [gyro, setGyro] = useState(false);
  // Motion sensor only on touch devices: desktops rotate the card by dragging.
  const [coarse, setCoarse] = useState(false);
  useEffect(() => { setCoarse(window.matchMedia("(pointer: coarse)").matches); }, []);
  const tilt: TiltRef = useRef({ x: 0, y: 0, at: 0 });
  const [flatTilt, setFlatTilt] = useState({ x: 0, y: 0 });
  const live: LiveRef = useRef({ seed: [0.5, 0.5, 0.5, 0.5], expiresAt: 0, windowMs: 30_000 });
  const zoom: ZoomRef = useRef(0);
  const stage = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<(() => string) | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; z: number; mx: number; my: number } | null>(null);
  const drag: DragRef = useRef({ down: false, dx: 0, dy: 0 });
  const grab = useRef<{ id: number; x: number; y: number } | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [secureUrl, setSecureUrl] = useState<string | null>(null);
  const [frontCode, setFrontCode] = useState<string | null>(null);
  // Owner's choice for the big front QR: public profile card or alias profile card.
  const [front, setFront] = useState<{ target: "root" | "alias"; alias: string | null } | null>(null);
  const loadFront = useServerFn(getMyCardFront);
  const saveFront = useServerFn(setMyCardFront);
  // The card is revealed in one go: only after its faces, 3D text and first codes are in.
  const [liveSettled, setLiveSettled] = useState(false);
  const [secureSettled, setSecureSettled] = useState(false);
  const [revealTimeout, setRevealTimeout] = useState(false);
  const [ownerState, setOwnerState] = useState<{ owner: boolean; frozen: boolean; available: boolean }>({ owner: false, frozen: false, available: false });
  const [tier, setTier] = useState<AgeTier>("sovereign");
  const secure: SecureRef = useRef({ iat: 0, exp: 0 });
  const loadSecure = useServerFn(getSecureCardToken);
  const saveDesign = useServerFn(saveMyCardDesign);
  // CMF studio (owner): material, accent, printed text. Visitors see the saved design.
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [accent, setAccent] = useState<string | null>(null);
  const [accentNote, setAccentNote] = useState<string | null>(null);
  const [nameText, setNameText] = useState<string | null>(null);
  const [regionText, setRegionText] = useState("");
  const [liveNonce, setLiveNonce] = useState(0);
  const freezeCard = useServerFn(setMyCardFrozen);
  const material: CardMaterial = (CARD_MATERIALS.find((m) => m.id === (materialId ?? card?.materialId)) ?? (card ? defaultMaterialFor(card.hexForegroundColor) : CARD_MATERIALS[0]))!;
  const finish: CardFinish = material.junior ? "junior" : material.finish;
  const accentHex = accent ?? card?.hexForegroundColor ?? "#ffffff";
  const nameHit = nameText !== null ? checkCardText(nameText) : null;
  const regionHit = regionText ? checkCardText(regionText) : null;
  const styledCard = card
    ? {
        ...card,
        hexBackgroundColor: materialId || card.materialId ? material.baseHex : card.hexBackgroundColor,
        hexForegroundColor: accentHex,
        displayName: nameText && !nameHit ? nameText : card.displayName,
        ...(regionText && !regionHit ? { regionDisplay: regionText } : {}),
      }
    : card;
  const [verifyInput, setVerifyInput] = useState("");
  const [verdict, setVerdict] = useState<"valid" | "invalid" | "limited" | null>(null);
  const loadLive = useServerFn(getCardLiveness);
  const verifyLive = useServerFn(verifyCardLiveCode);

  useEffect(() => {
    if (!open || card !== undefined) return;
    setWebgl(hasWebGL());
    // Privacy filter: only public card fields reach the 3D card.
    loadCard({ data: { handle, space } }).then((c) => setCard(c ? pickCardView(c) : null)).catch(() => setCard(null));
    loadStatus().then(setStatus).catch(() => setStatus({ apple: false, google: false }));
  }, [open, card, handle, space, loadCard, loadStatus]);

  useEffect(() => {
    const card = styledCard;
    const faceTier = finish === "junior" ? ("junior" as const) : ("adult" as const);
    if (!card || webgl === null) return;
    let alive = true;
    // WebGL draws names as SDF text; the CSS fallback keeps them printed.
    const origin = new URL(card.url).origin;
    const frontQr = card.space !== "alias" && front?.target === "alias" && front.alias
      ? `${origin}/u/${encodeURIComponent(front.alias)}`
      : frontCode && card.space !== "alias" ? frontCardUrl(origin, card.handle, frontCode) : null;
    void Promise.all([drawCardFaces(card, { sdfText: webgl, secureQr: secureUrl, frontQr, tier: faceTier }), drawCardFaces(card, { secureQr: secureUrl, frontQr, tier: faceTier })]).then(([gl, flat]) => {
      if (!alive) return;
      setFaces(gl);
      setImages({ front: flat.front.toDataURL("image/png"), back: flat.back.toDataURL("image/png") });
    });
    if (!webgl) console.warn("[rout-card] WebGL unavailable: showing the CSS card without optical security layers.");
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, webgl, secureUrl, frontCode, front?.target, front?.alias, styledCard?.hexBackgroundColor, styledCard?.hexForegroundColor, styledCard?.displayName, styledCard && "regionDisplay" in styledCard ? styledCard.regionDisplay : "", finish === "junior"]);

  // A minor whose saved/default material is outside their tier gets the first allowed one.
  useEffect(() => {
    if (ownerState.owner && !material.tiers.includes(tier)) setMaterialId(defaultMaterial(tier).id);
  }, [ownerState.owner, tier, material]);

  // Secure QR (owner): fresh 60 s single-use token every 45 s, off-thread from the render loop.
  useEffect(() => {
    if (!open || !ownerState.owner || ownerState.frozen) {
      secure.current = { iat: 0, exp: 0 };
      setSecureUrl(null);
      return;
    }
    let alive = true;
    const settle = () => { if (alive) setSecureSettled(true); };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const r = await loadSecure({ data: { space } });
        if (!alive) return;
        if (!r || r.frozen || r.locked || !r.url) {
          secure.current = { iat: 0, exp: 0 };
          setSecureUrl(null);
          settle();
          return;
        }
        const skew = Date.now() - (r.serverNow ?? Date.now());
        secure.current = { iat: (r.iat ?? 0) + skew, exp: (r.exp ?? 0) + skew };
        setSecureUrl(r.url);
        settle();
        timer = setTimeout(() => void tick(), SECURE_ROTATE_MS);
      } catch {
        settle();
        if (alive) timer = setTimeout(() => void tick(), 10_000);
      }
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, ownerState.owner, ownerState.frozen, space, loadSecure, liveNonce]);

  const pickAccent = (hex: string) => {
    const safe = nearestSafeAccent(hex, material.baseHex);
    setAccent(safe);
    setAccentNote(safe !== hex.toLowerCase() ? t("card.accentSnapped", { defaultValue: "Kleur genegeerd: Onvoldoende contrast voor fysieke leesbaarheid en toegankelijkheid." }) : null);
  };

  const pickMaterial = (m: CardMaterial) => {
    setMaterialId(m.id);
    const safe = nearestSafeAccent(accentHex, m.baseHex);
    if (safe !== accentHex.toLowerCase()) {
      setAccent(safe);
      setAccentNote(t("card.accentSnapped", { defaultValue: "Kleur genegeerd: Onvoldoende contrast voor fysieke leesbaarheid en toegankelijkheid." }));
    }
  };

  const saveStudio = async () => {
    if (!card || nameHit || regionHit) return;
    setBusy("design");
    try {
      const r = await saveDesign({ data: { space, materialId: material.id, accentHex, displayName: (nameText ?? card.displayName).trim() || card.displayName, region: regionText.trim() } });
      if (r.ok) toast.success(t("card.designSaved", { defaultValue: "Ontwerp opgeslagen als productiebestand." }));
      else if (r.error === "privacy") toast.error(PRIVACY_MESSAGE);
      else if (r.error === "unavailable") toast.error(t("card.designUnavailable", { defaultValue: "Ontwerpen opslaan is nog niet ingesteld in de database." }));
      else toast.error(t("card.designRejected", { defaultValue: "Dit ontwerp kan niet: kies een ander materiaal of een leesbaardere kleur." }));
    } catch {
      toast.error(t("card.designFailed", { defaultValue: "Opslaan lukt nu niet." }));
    } finally {
      setBusy(null);
    }
  };

  // Live proof-of-now: new seed (and the owner's code) every server window.
  useEffect(() => {
    if (!open || !card) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const r = await loadLive({ data: { handle, space } });
        if (!alive) return;
        if (!r) { setLiveSettled(true); return; }
        const skew = Date.now() - r.serverNow;
        live.current = { seed: r.seed, expiresAt: r.expiresAt + skew, windowMs: 30_000 };
        setCode(r.code);
        setFrontCode(r.frontCode ?? null);
        setLiveSettled(true);
        setOwnerState({ owner: r.owner, frozen: r.frozen, available: r.freezeAvailable });
        setTier(r.tier);
        timer = setTimeout(() => void tick(), Math.max(1000, r.expiresAt + skew - Date.now() + 250));
      } catch {
        if (alive) setLiveSettled(true);
        if (alive) timer = setTimeout(() => void tick(), 10_000);
      }
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, card, handle, space, loadLive, liveNonce]);

  useEffect(() => {
    if (!open || !ownerState.owner || card?.space === "alias" || front) return;
    loadFront().then(setFront).catch(() => setFront({ target: "root", alias: null }));
  }, [open, ownerState.owner, card?.space, front, loadFront]);

  const pickFront = async (target: "root" | "alias") => {
    if (!front || front.target === target || (target === "alias" && !front.alias)) return;
    const prev = front;
    setFront({ ...front, target });
    try {
      await saveFront({ data: { target } });
    } catch {
      setFront(prev);
      toast.error(t("card.front.failed"));
    }
  };

  // Never leave the stage empty: reveal after 8 s whatever is ready.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => setRevealTimeout(true), 8000);
    return () => window.clearTimeout(id);
  }, [open]);

  const toggleFreeze = async () => {
    const next = !ownerState.frozen;
    if (next && !window.confirm(t("card.freezeConfirm", { defaultValue: "Kaart bevriezen? Alle QR- en live-codes worden meteen ongeldig tot je weer ontdooit." }))) return;
    setBusy("freeze");
    try {
      await withStepUp(() => freezeCard({ data: { frozen: next, space } }), "card_lifecycle");
      toast.success(next ? t("card.frozen", { defaultValue: "Kaart bevroren." }) : t("card.unfrozen", { defaultValue: "Kaart weer actief." }));
      setLiveNonce((n) => n + 1);
    } catch {
      toast.error(t("card.freezeFailed", { defaultValue: "Bevriezen lukt nu niet." }));
    } finally {
      setBusy(null);
    }
  };

  // Gyroscope tilt (after the visitor allowed motion access on iOS).
  useEffect(() => {
    if (!open || !gyro) return;
    // Calibrate "flat" to how the pass is held when it opens (average of the first readings).
    const samples: { x: number; y: number }[] = [];
    let zero: { x: number; y: number } | null = null;
    let lastEvent = performance.now();
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      const angle = window.screen.orientation?.angle ?? 0;
      if (!zero) {
        samples.push(orientationToDegrees(e.beta, e.gamma, angle));
        if (samples.length < GYRO_CALIBRATION_SAMPLES) return;
        zero = {
          x: samples.reduce((s, v) => s + v.x, 0) / samples.length,
          y: samples.reduce((s, v) => s + v.y, 0) / samples.length,
        };
      }
      const now = performance.now();
      const prev = tilt.current;
      const dt = Math.min(0.1, (now - lastEvent) / 1000 || 1 / 60);
      lastEvent = now;
      const raw = orientationToTilt(e.beta, e.gamma, angle, zero);
      const x = filterGyro(prev.x, raw.x, dt);
      const y = filterGyro(prev.y, raw.y, dt);
      // Only a real change counts as activity; a still phone recentres after GYRO_REST_MS.
      if (x === prev.x && y === prev.y) return;
      tilt.current = { x, y, at: now, rest: GYRO_REST_MS };
      setFlatTilt({ x, y });
    };
    window.addEventListener("deviceorientation", onTilt);
    return () => window.removeEventListener("deviceorientation", onTilt);
  }, [open, gyro]);

  // Desktop fallback: without a gyroscope, the mouse anywhere in the viewport
  // sets the same tilt target, so it gets the identical lerp + spring damping.
  useEffect(() => {
    if (!open || gyro) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || grab.current) return;
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -((e.clientY / window.innerHeight) * 2 - 1);
      tilt.current = { x, y, at: performance.now() };
    };
    // Mouse leaves the window: target eases back to centre through the same lerp.
    const onLeave = (e: MouseEvent) => {
      if (e.relatedTarget) return;
      tilt.current = { x: 0, y: 0, at: performance.now() };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseout", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseout", onLeave);
    };
  }, [open, gyro]);

  useEffect(() => {
    if (webgl === false && images) setReady(true);
  }, [webgl, images]);

  const enableGyro = async () => {
    const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    try {
      if (!D || !window.isSecureContext) throw new Error("unavailable");
      if (D.requestPermission && (await D.requestPermission()) !== "granted") throw new Error("denied");
      // Only switch off the touch/mouse fallback once the sensor actually reports angles.
      const works = await new Promise<boolean>((resolve) => {
        const timer = window.setTimeout(() => { window.removeEventListener("deviceorientation", probe); resolve(false); }, 1200);
        function probe(e: DeviceOrientationEvent) {
          if (e.beta == null || e.gamma == null) return;
          window.clearTimeout(timer);
          window.removeEventListener("deviceorientation", probe);
          resolve(true);
        }
        window.addEventListener("deviceorientation", probe);
      });
      if (!works) throw new Error("silent");
      setGyro(true);
    } catch {
      toast.error(t("card.gyroDenied"));
    }
  };

  const setZoom = useCallback((z: number) => {
    const next = clampZoom(z);
    zoom.current = next;
    zoom.pan = clampPan(zoom.pan ?? { x: 0, y: 0 }, next);
    tilt.current = { ...tilt.current, at: performance.now() };
    setZoomed(next > 0.02);
  }, []);
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  const panBy = (dxPx: number, dyPx: number, r: DOMRect) => {
    // Content follows the hand: dragging right reveals the left side of the card.
    const z = Math.max(zoom.current, 0.15);
    const p = zoom.pan ?? { x: 0, y: 0 };
    zoom.pan = clampPan({ x: p.x - (dxPx / r.width) * 2.4 / z, y: p.y + (dyPx / r.height) * 2.4 / z }, zoom.current);
  };

  // Wheel + trackpad pinch (ctrlKey wheel); non-passive so the page never scrolls/zooms behind the card.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const before = zoom.current;
      const next = zoomFromWheel(before, e.deltaY * (e.ctrlKey ? 4 : 1), e.deltaMode);
      // Zoom towards the cursor: drift the pan target to the pointed spot.
      if (next > before) {
        const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
        const ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
        const p = zoom.pan ?? { x: 0, y: 0 };
        const w = Math.min(1, (next - before) * 3);
        zoom.pan = { x: p.x + (nx * 1.3 - p.x) * w, y: p.y + (ny * 1.3 - p.y) * w };
      }
      setZoom(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoom, open, faces]);

  const onGrab = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // Second finger: stop spinning, start pinch-zoom + two-finger pan.
      grab.current = null;
      drag.current.down = false;
      pinch.current = { ...spread(), z: zoom.current };
      return;
    }
    if (pointers.current.size > 2) return;
    grab.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    drag.current.down = zoom.current <= 0.02;
  }, []);
  const onRelease = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (grab.current?.id !== e.pointerId) return;
    grab.current = null;
    drag.current.down = false;
    tilt.current = { ...tilt.current, at: performance.now() };
  }, []);
  const onPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pc = pinch.current;
    if (pc && pointers.current.size >= 2) {
      const s2 = spread();
      setZoom(zoomFromPinch(zoom.current, pc.z, pc.dist, s2.dist));
      panBy(s2.mx - pc.mx, s2.my - pc.my, r);
      pc.mx = s2.mx;
      pc.my = s2.my;
      return;
    }
    const g = grab.current;
    if (g && g.id === e.pointerId) {
      if (zoom.current > 0.02) {
        // Zoomed in: one finger / mouse drag pans across the card details.
        panBy(e.clientX - g.x, e.clientY - g.y, r);
        g.x = e.clientX;
        g.y = e.clientY;
        tilt.current = { ...tilt.current, at: performance.now() };
        return;
      }
      if (webgl === false) setFlatTilt((t) => ({ x: Math.max(-1, Math.min(1, t.x + ((e.clientX - g.x) / r.width) * 2)), y: Math.max(-1, Math.min(1, t.y - ((e.clientY - g.y) / r.height) * 2)) }));
      drag.current.dx += ((e.clientX - g.x) / r.width) * SPIN_PER_FRAME_WIDTH;
      drag.current.dy += ((e.clientY - g.y) / r.height) * 1.2;
      g.x = e.clientX;
      g.y = e.clientY;
      tilt.current = { ...tilt.current, at: performance.now() };
      return;
    }
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    tilt.current = { x, y, at: performance.now() };
    if (webgl === false) setFlatTilt({ x, y });
  }, [setZoom, webgl]);

  const flip = () => {
    tilt.current = { ...tilt.current, at: performance.now() };
    setFlipped((v) => !v);
  };

  const toggleZoom = () => {
    if (zoomed) zoom.pan = { x: 0, y: 0 };
    setZoom(zoomed ? 0 : 0.6);
  };

  const checkCode = async () => {
    setVerdict(null);
    try {
      const r = await verifyLive({ data: { handle, space, code: verifyInput } });
      setVerdict(r.limited ? "limited" : r.valid ? "valid" : "invalid");
    } catch {
      setVerdict("invalid");
    }
  };

  const addGoogle = async () => {
    setBusy("google");
    // Open synchronously so the save page is not blocked as a popup.
    const tab = window.open("", "_blank");
    try {
      const body = await claimGoogle({ data: { handle, space } });
      if (!body.ok) throw new Error(body.error);
      if (tab) tab.location.href = body.saveUrl;
      else window.location.href = body.saveUrl;
    } catch {
      tab?.close();
      toast.error(t("wallet.failed"));
    } finally {
      setBusy(null);
    }
  };

  const addApple = async () => {
    setBusy("apple");
    try {
      const res = await fetch(`/api/wallet/profile/${encodeURIComponent(handle)}?type=apple${space ? `&space=${space}` : ""}`);
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `rout-${handle}.pkpass`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error(t("wallet.failed"));
    } finally {
      setBusy(null);
    }
  };

  const saveSnapshot = () => {
    try {
      const png = webgl ? snapshotRef.current?.() : images?.front;
      if (!png) return;
      const link = document.createElement("a");
      link.href = png;
      link.download = `rout-${handle}-snapshot.png`;
      link.click();
    } catch {
      toast.error(t("card.snapshotFailed", { defaultValue: "De kaartfoto kon niet worden gemaakt." }));
    }
  };

  const waitSecure = ownerState.owner && !ownerState.frozen && !secureSettled;
  const shown = card === null || revealTimeout || (ready && liveSettled && !waitSecure);
  const flat = images ? <FlatCard faces={images} flipped={flipped} tilt={flatTilt} onFlip={flip} /> : null;

  return (
    <Frame inline={inline} open={open} onOpenChange={onOpenChange}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" aria-hidden /> {t("card.title")}
          </DialogTitle>
          <DialogDescription>{vault === "key" ? t("card.descriptionKey", { defaultValue: "Je privé ROUT-kaart in 3D. Sleep of tik om te draaien; je beveiligde QR staat op de achterkant en verschijnt pas na bevestiging." }) : t("card.description")}</DialogDescription>
        </DialogHeader>

        <div
          className="relative h-[420px] w-full touch-none select-none overflow-hidden rounded-2xl bg-gradient-to-b from-muted/40 to-muted"
          onPointerMove={onPointer}
          onPointerDown={onGrab}
          onPointerUp={onRelease}
          onPointerCancel={onRelease}
          onDoubleClick={() => { if (zoomed) zoom.pan = { x: 0, y: 0 }; setZoom(zoomed ? 0 : 0.75); }}
          ref={stage}
          data-interface-artwork
          style={{ cursor: zoomed ? "move" : "grab" }}
          data-scene-ready={ready ? "true" : undefined}
          data-card-shown={shown ? "true" : undefined}
        >
          {!shown && (
            <div className="absolute inset-0 z-10 flex items-center justify-center" aria-busy="true">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
              <span className="sr-only">{t("card.loading", { defaultValue: "Kaart laden" })}</span>
            </div>
          )}
          <div className={cn("h-full w-full transition-opacity duration-300 ease-out", shown ? "opacity-100" : "opacity-0")}>
          {card === null ? (
            <p className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">{t("card.notFound")}</p>
          ) : !faces || webgl === null ? null : webgl ? (
            <GlBoundary fallback={<ReadyOnMount onReady={() => setReady(true)}><div className="flex h-full items-center p-4">{flat}</div></ReadyOnMount>}>
              <Suspense fallback={null}>
                <RoutCard3D
                  faces={faces}
                  finish={finish}
                  pbr={material}
                  secure={secure}
                  flipped={flipped}
                  tilt={tilt}
                  live={live}
                  zoom={zoom}
                  onFlip={flip}
                  drag={drag}
                  onFace={setFlipped}
                  snapshotRef={snapshotRef}
                  onReady={() => setReady(true)}
                  text={{ displayName: styledCard!.displayName, handle: card!.handle, subheader: styledCard && "regionDisplay" in styledCard && styledCard.regionDisplay ? styledCard.regionDisplay : card!.subheader, fg: styledCard!.hexForegroundColor, sovereignId: card!.sovereignId, code }}
                />
              </Suspense>
            </GlBoundary>
          ) : (
            <div className="flex h-full items-center p-4">{flat}</div>
          )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
          <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={flip}><RotateCw className="h-3.5 w-3.5" aria-hidden /> {t("card.flip")}</Button>
          <Button type="button" size="icon" variant="ghost" disabled={!ready || !card} onClick={saveSnapshot} aria-label={t("card.snapshot", { defaultValue: "Kaartfoto downloaden" })} title={t("card.snapshot", { defaultValue: "Kaartfoto downloaden" })}><Camera className="h-4 w-4" aria-hidden /></Button>
          {webgl && faces && (
            <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={toggleZoom} aria-pressed={zoomed}>
              {zoomed ? <ZoomOut className="h-3.5 w-3.5" aria-hidden /> : <ZoomIn className="h-3.5 w-3.5" aria-hidden />} {t("card.zoom", { defaultValue: "Loep" })}
            </Button>
          )}
          {!gyro && coarse && <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={() => void enableGyro()}><Smartphone className="h-3.5 w-3.5" aria-hidden /> {t("card.gyro")}</Button>}
        </div>

        {ownerState.owner || vault === "key" ? (
          <div className="grid gap-3">
            {card === null && vault === "key" && (
              <p className="rounded-xl border border-border p-3 text-xs text-muted-foreground">{t("card.ownerMissing", { defaultValue: "Je ROUT-kaart verschijnt zodra je profiel openbaar staat en geverifieerd is. Daarna zet je tweestapsverificatie aan en claim je je kaart." })}</p>
            )}
            {card?.space !== "alias" && front && (
              <fieldset className="grid gap-2 rounded-xl border border-border p-3">
                <legend className="px-1 text-sm font-semibold">{t("card.front.title")}</legend>
                <p className="text-xs text-muted-foreground">{t("card.front.lead")}</p>
                <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1" role="radiogroup" aria-label={t("card.front.title")}>
                  {(["root", "alias"] as const).map((target) => (
                    <button
                      key={target}
                      type="button"
                      role="radio"
                      aria-checked={front.target === target}
                      disabled={target === "alias" && !front.alias}
                      onClick={() => void pickFront(target)}
                      className={cn("min-h-10 rounded-md px-2 text-sm font-medium transition disabled:opacity-50", front.target === target ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                    >
                      {target === "root" ? t("card.front.root") : t("card.front.alias")}
                    </button>
                  ))}
                </div>
                {!front.alias && <p className="text-[11px] text-muted-foreground">{t("card.front.noAlias")}</p>}
                {front.target === "alias" && <p className="text-[11px] text-muted-foreground">{t("card.front.aliasNote")}</p>}
                <p className="text-[11px] text-muted-foreground">{t("card.front.back")}</p>
              </fieldset>
            )}
            {card?.space !== "alias" && <CardSecurityPanel onChange={() => setLiveNonce((n) => n + 1)} />}
            {vault !== "key" && <WalletVault only={["public", "stealth"]} />}
          </div>
        ) : (
        <div className="grid gap-2">
          <Button
            type="button"
            className="h-11 gap-2 rounded-full"
            disabled={!card || busy !== null || status?.google === false}
            onClick={() => void addGoogle()}
          >
            {busy === "google" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wallet className="h-4 w-4" aria-hidden />}
            {t("wallet.google")}
          </Button>
          <Button type="button" variant="outline" className="h-11 gap-2 rounded-full" disabled={!card || busy !== null || status?.apple === false} onClick={() => void addApple()}>
            {busy === "apple" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wallet className="h-4 w-4" aria-hidden />}
            {t("wallet.apple")}
          </Button>
          {status && (!status.google || !status.apple) && <p className="text-center text-xs text-muted-foreground">{t("wallet.partly")}</p>}
        </div>
        )}

        {card && ownerState.owner && card.space === "alias" && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border p-3">
            <p className="text-xs text-muted-foreground">
              {!ownerState.available
                ? t("card.freezeUnavailable", { defaultValue: "Bevriezen is nog niet ingesteld in de database." })
                : ownerState.frozen
                  ? t("card.frozenNote", { defaultValue: "Je kaart is bevroren: alle codes zijn ongeldig." })
                  : t("card.freezeNote", { defaultValue: "Kaart kwijt? Bevries hem en alle codes worden meteen ongeldig." })}
            </p>
            <Button type="button" size="sm" variant={ownerState.frozen ? "default" : "destructive"} disabled={!ownerState.available || busy === "freeze"} onClick={() => void toggleFreeze()}>
              {ownerState.frozen ? t("card.unfreeze", { defaultValue: "Ontdooien" }) : t("card.freeze", { defaultValue: "Bevriezen" })}
            </Button>
          </div>
        )}

        {card && ownerState.owner && card.space !== "alias" && (
          <div className="grid gap-2 rounded-2xl border border-border p-3 text-xs text-muted-foreground">
            <p className="flex items-start gap-2">
              <QrCode className="mt-0.5 h-4 w-4 shrink-0 text-foreground" aria-hidden />
              <span>{t("card.frontQrNote", { defaultValue: "Grote QR vooraan: iedereen mag hem scannen en komt op je profiel. De 6 cijfers achteraan wisselen elke 10 minuten, zodat een gelekte foto snel waardeloos is." })}</span>
            </p>
            <p className="flex items-start gap-2">
              <Nfc className="mt-0.5 h-4 w-4 shrink-0 text-foreground" aria-hidden />
              <span>{t("card.backQrNote", { defaultValue: "Kleine QR en NFC achteraan: een lange, eenmalige beveiligde link die elke minuut vervalt. Alleen die kant is bedoeld voor betalen en toegang." })}</span>
            </p>
            <Button type="button" variant="outline" className="mt-1 h-11 gap-2 rounded-full" disabled>
              <CreditCard className="h-4 w-4" aria-hidden /> {t("card.orderPhysical", { defaultValue: "Fysieke kaart bestellen · binnenkort" })}
            </Button>
          </div>
        )}

        {card && ownerState.owner && (
          <section className="grid gap-3 rounded-2xl border border-border p-3" aria-labelledby="rout-cmf-title">
            <div className="flex items-baseline justify-between">
              <h3 id="rout-cmf-title" className="text-sm font-semibold">{t("card.studio", { defaultValue: "Materiaal & afwerking" })}</h3>
              <span className="text-[11px] text-muted-foreground">{tier === "minor" ? t("card.tierMinor", { defaultValue: "Junior-tier" }) : t("card.tierSovereign", { defaultValue: "Sovereign-tier" })}</span>
            </div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("card.studio", { defaultValue: "Materiaal & afwerking" })}>
              {materialsFor(tier).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={material.id === m.id}
                  onClick={() => pickMaterial(m)}
                  className={cn("flex items-center gap-2 rounded-xl border p-2 text-left text-xs transition-colors", material.id === m.id ? "border-foreground bg-muted" : "border-border hover:bg-muted/50")}
                >
                  <span aria-hidden className="h-7 w-7 shrink-0 rounded-md border border-border" style={{ background: `linear-gradient(135deg, ${m.baseHex}, ${m.finish === "holo" ? "#7dd3fc" : m.baseHex})` }} />
                  <span className="grid">
                    <span className="font-medium">{m.name}</span>
                    <span className="text-[10px] text-muted-foreground">M {m.metalness.toFixed(2)} · R {m.roughness.toFixed(2)}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="rout-accent" className="text-xs font-medium">{t("card.accent", { defaultValue: "Accentkleur (tekst, ring, logo)" })}</label>
              <div className="flex items-center gap-2">
                <input id="rout-accent" type="color" value={accentHex} onChange={(e) => pickAccent(e.target.value)} className="h-9 w-12 cursor-pointer rounded-md border border-border bg-transparent" />
                <span className="text-xs text-muted-foreground">{t("card.contrast", { defaultValue: "Contrast {{r}}:1", r: contrastRatio(accentHex, material.baseHex).toFixed(2) })}</span>
              </div>
              {accentNote && <p role="status" className="text-xs text-muted-foreground">{accentNote}</p>}
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="rout-card-name" className="text-xs font-medium">{t("card.nameOnCard", { defaultValue: "Naam op de kaart" })}</label>
              <Input id="rout-card-name" value={nameText ?? card.displayName} maxLength={40} onChange={(e) => setNameText(e.target.value)} aria-invalid={!!nameHit} className={cn("h-9", nameHit && "border-destructive focus-visible:ring-destructive")} />
              <label htmlFor="rout-card-region" className="text-xs font-medium">{t("card.regionOnCard", { defaultValue: "Regio (bv. Brussel, BE)" })}</label>
              <Input id="rout-card-region" value={regionText} maxLength={40} onChange={(e) => setRegionText(e.target.value)} aria-invalid={!!regionHit} className={cn("h-9", regionHit && "border-destructive focus-visible:ring-destructive")} />
              {(nameHit || regionHit) && <p role="alert" className="text-xs text-destructive">{PRIVACY_MESSAGE}</p>}
            </div>
            <Button type="button" size="sm" onClick={() => void saveStudio()} disabled={busy !== null || !!nameHit || !!regionHit}>
              {busy === "design" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} {t("card.saveDesign", { defaultValue: "Ontwerp opslaan" })}
            </Button>
          </section>
        )}

        {card && ownerState.owner && <CardKeysPanel space={space} />}

        {/* The authenticity check is for someone looking at another member's card, never for the owner. */}
        {card && (code || !(ownerState.owner || vault === "key")) && (
          <div className="rounded-2xl border border-border p-3">
            {code ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                {t("card.liveOwner", { defaultValue: "Je live-code staat op de achterkant en wisselt elke 30 seconden. Een screenshot is dus snel ongeldig." })}
              </p>
            ) : (
              <form
                className="grid gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void checkCode();
                }}
              >
                <label htmlFor="rout-live-code" className="flex items-center gap-2 text-xs font-medium">
                  <ShieldCheck className="h-4 w-4 text-primary" aria-hidden /> {t("card.verifyLabel", { defaultValue: "Echtheid controleren: vraag de live-code op de achterkant" })}
                </label>
                <div className="flex gap-2">
                  <Input id="rout-live-code" value={verifyInput} onChange={(e) => { setVerifyInput(e.target.value); setVerdict(null); }} maxLength={12} autoComplete="off" spellCheck={false} placeholder="ABC 123" className="h-9 font-mono uppercase tracking-widest" />
                  <Button type="submit" size="sm" variant="outline" className="h-9" disabled={verifyInput.trim().length < 6}>{t("card.verify", { defaultValue: "Controleer" })}</Button>
                </div>
                {verdict && (
                  <p role="status" className={cn("text-xs", verdict === "valid" ? "text-primary" : "text-destructive")}>
                    {verdict === "valid"
                      ? t("card.verifyValid", { defaultValue: "Echt: deze code komt van de kaarthouder, nu." })
                      : verdict === "limited"
                        ? t("card.verifyLimited", { defaultValue: "Te veel pogingen. Probeer het over een paar minuten opnieuw." })
                        : t("card.verifyInvalid", { defaultValue: "Niet geldig of verlopen. Vraag de huidige code." })}
                  </p>
                )}
              </form>
            )}
          </div>
        )}

    </Frame>
  );
}

/** Marks the card ready once a fallback face is actually on screen. */
function ReadyOnMount({ onReady, children }: { onReady: () => void; children: ReactNode }) {
  useEffect(() => { onReady(); }, [onReady]);
  return <>{children}</>;
}

function Frame({ inline, open, onOpenChange, children }: { inline: boolean; open: boolean; onOpenChange: (v: boolean) => void; children: ReactNode }) {
  if (inline) return <Dialog open modal={false}><section className="mx-auto w-full max-w-md space-y-4 [&_[data-slot=dialog-header]]:text-left">{children}</section></Dialog>;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-md">{children}</DialogContent>
    </Dialog>
  );
}
