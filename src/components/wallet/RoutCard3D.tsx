/**
 * WebGL ROUT Card (portrait 1 : 1.588). Loaded lazily, client only.
 * One useFrame drives physics (mass-spring tilt), idle spin, flip, zoom,
 * the moving light and the shader clock; per-frame state lives in refs.
 * Text is SDF (troika, generated in a worker) so it stays sharp at any zoom.
 */
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, Text } from "@react-three/drei";
import * as THREE from "three";
import { configureTextBuilder } from "troika-three-text";
import { BACK_QR, CARD_RATIO, FACE_H, FACE_W, FRONT_TEXT_Y, type CardFaces, type QrBox } from "./card-faces";
import { MAX_TILT_RAD, SPIN_SNAP_SPEED, clampDragPitch, clampTilt, decaySpin, isBackFace, lerpDamp, nearestFace, stepSpring, tiltTarget, type Spring } from "./card-physics";
import { createSecurityMaterial } from "./card-shader";
import { captureCardSnapshot } from "./card-snapshot";

// Troika's nested blob importScripts conflicts with our strict script-src.
// Typeset once on the main thread; keep the same GPU SDF rendering and CSP.
configureTextBuilder({ useWorker: false, defaultFontURL: "/fonts/Inter-SemiBold.ttf" });

export type CardFinish = "metal" | "glass" | "holo" | "junior";
/** `rest` (ms): recentre after this long without change; omitted = never (mouse). */
export type TiltRef = { current: { x: number; y: number; at: number; rest?: number } };
export type LiveRef = { current: { seed: [number, number, number, number]; expiresAt: number; windowMs: number } };
/** current: 0 (overview) .. 1 (closest). pan: card-local offset the camera looks at, in [-1,1]. */
export type ZoomRef = { current: number; pan?: { x: number; y: number } };
/** Grab input: dx/dy are radians accumulated since the last frame (consumed by the card). */
export type DragRef = { current: { down: boolean; dx: number; dy: number } };

const W = 1;
const H = CARD_RATIO;
const DEPTH = 0.018;
const RADIUS = 0.07;
const FRONT_Z = DEPTH / 2 + 0.0025;
const BACK_Z = -DEPTH / 2 - 0.0025;
/** Feel constants. */
const IDLE_PERIOD_S = 28;
const IDLE_AFTER_MS = 3500;
const FLIP_DAMP = 6;
const TILT_YAW = MAX_TILT_RAD;
const TILT_PITCH = MAX_TILT_RAD;
const CAMERA_FAR = 3.7;
const CAMERA_NEAR = 1.15;
const ZOOM_DAMP = 5;
const FONT = "/fonts/Inter-SemiBold.ttf";
const MONO = "/fonts/og-jetbrains-mono.ttf";
const MICRO = "ROUT SOVEREIGN INFRASTRUCTURE // SECURE NODE // NO-TRACKING // ";
const FINISH_INDEX: Record<CardFinish, number> = { metal: 0, glass: 1, holo: 2, junior: 2 };

/** Canvas pixel → card-local coordinates. */
const cx = (px: number) => (px / FACE_W - 0.5) * W;
const cy = (py: number) => (0.5 - py / FACE_H) * H;

function cardShape(): THREE.Shape {
  const s = new THREE.Shape();
  const x = -W / 2;
  const y = -H / 2;
  s.moveTo(x + RADIUS, y);
  s.lineTo(x + W - RADIUS, y);
  s.quadraticCurveTo(x + W, y, x + W, y + RADIUS);
  s.lineTo(x + W, y + H - RADIUS);
  s.quadraticCurveTo(x + W, y + H, x + W - RADIUS, y + H);
  s.lineTo(x + RADIUS, y + H);
  s.quadraticCurveTo(x, y + H, x, y + H - RADIUS);
  s.lineTo(x, y + RADIUS);
  s.quadraticCurveTo(x, y, x + RADIUS, y);
  return s;
}

/** ShapeGeometry UVs are in shape units; remap them to 0..1 for the face textures. */
function faceGeometry(shape: THREE.Shape): THREE.ShapeGeometry {
  const g = new THREE.ShapeGeometry(shape, 48);
  const pos = g.attributes["position"] as THREE.BufferAttribute;
  const uv = g.attributes["uv"] as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + W / 2) / W, (pos.getY(i) + H / 2) / H);
  uv.needsUpdate = true;
  return g;
}

/** Secure QR lifetime (ms epoch); exp 0 = no secure QR on the back. */
export type SecureRef = MutableRefObject<{ iat: number; exp: number }>;

const ringVertex = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// Shrinking time ring around the secure QR; branch-free, colour runs green -> amber -> red.
const ringFragment = /* glsl */ `
uniform float uFrac;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = max(abs(p.x), abs(p.y));
  float band = smoothstep(0.955, 0.965, r) * (1.0 - smoothstep(0.99, 1.0, r));
  float a = fract(atan(p.x, p.y) / 6.2831853 + 1.0);
  float on = step(a, uFrac) * step(0.0001, uFrac);
  vec3 c = mix(vec3(0.94, 0.27, 0.27), mix(vec3(0.98, 0.75, 0.14), vec3(0.2, 0.83, 0.6), smoothstep(0.35, 0.7, uFrac)), smoothstep(0.1, 0.35, uFrac));
  gl_FragColor = vec4(c, band * on);
}`;

type CardProps = {
  faces: CardFaces;
  finish: CardFinish;
  /** PBR values from the CMF engine; overrides the finish defaults. */
  pbr?: { roughness: number; metalness: number; clearcoat: number; anisotropy: number } | null;
  flipped: boolean;
  tilt: TiltRef;
  live: LiveRef;
  zoom: ZoomRef;
  secure?: SecureRef;
  onFlip: () => void;
  drag?: DragRef;
  /** Called when a grab-spin settles on the other face. */
  onFace?: (back: boolean) => void;
  snapshotRef?: MutableRefObject<(() => string) | null>;
  text: { displayName: string; handle: string; subheader: string; fg: string; sovereignId: string; code: string | null };
};

/** Name pressed into the material: a dark offset "shadow" under a metallic face.
 * The shadow is only pressed under large text — at small sizes the sub-pixel
 * offset would smear the glyphs instead of embossing them. */
function Embossed({ children, y, size, color, weight }: { children: string; y: number; size: number; color: string; weight?: "mono" }) {
  const font = weight === "mono" ? MONO : FONT;
  return (
    <group position={[0, y, FRONT_Z + 0.0006]}>
      {size >= 0.06 && (
        <Text font={font} fontSize={size} sdfGlyphSize={128} maxWidth={W * 0.86} anchorX="center" anchorY="middle" position={[0.0018, -0.0018, 0]} color="#000000" fillOpacity={0.35}>
          {children}
        </Text>
      )}
      <Text font={font} fontSize={size} sdfGlyphSize={128} maxWidth={W * 0.86} anchorX="center" anchorY="middle" position={[0, 0, 0.0004]} color={color}>
        {children}
        <meshBasicMaterial color={color} toneMapped={false} />
      </Text>
    </group>
  );
}

/** Four joined sides, SDF glyphs generated locally rather than canvas print. */
function MicroBorder({ color, onSync }: { color: string; onSync: (side: number) => void }) {
  const sides: { x: number; y: number; angle: number; length: number }[] = [
    { x: 0, y: H / 2 - 0.044, angle: 0, length: W - 0.11 },
    { x: W / 2 - 0.044, y: 0, angle: -Math.PI / 2, length: H - 0.11 },
    { x: 0, y: -H / 2 + 0.044, angle: Math.PI, length: W - 0.11 },
    { x: -W / 2 + 0.044, y: 0, angle: Math.PI / 2, length: H - 0.11 },
  ];
  return <>{sides.map((side, index) => (
    <Text key={index} font={MONO} fontSize={0.0065} sdfGlyphSize={128} letterSpacing={0}
      position={[side.x, side.y, 0]} rotation={[0, 0, side.angle]} anchorX="center" anchorY="middle"
      clipRect={[-side.length / 2, -0.012, side.length / 2, 0.012]} color={color} fillOpacity={0.7}
      onSync={() => onSync(index)}>
      {MICRO.repeat(8)}
    </Text>
  ))}</>;
}

function Card({ faces, finish, pbr, flipped, tilt, live, zoom, secure, onFlip, drag, onFace, text, glyphs }: CardProps & { glyphs: MutableRefObject<Set<string>> }) {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const ring = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: ringVertex, fragmentShader: ringFragment, transparent: true, depthWrite: false, toneMapped: false, uniforms: { uFrac: { value: 0 } } }),
    [],
  );
  useEffect(() => () => ring.dispose(), [ring]);
  const group = useRef<THREE.Group>(null);
  const watermark = useRef<THREE.Group>(null);
  const timer = useRef<THREE.Mesh>(null);
  const motion = useRef({ idle: 0, flip: 0, spinV: 0, snap: 0 as number | null, dragPitch: 0, z: CAMERA_FAR, yaw: { x: 0, v: 0 } as Spring, pitch: { x: 0, v: 0 } as Spring, tx: 0, ty: 0 });
  const camera = useThree((s) => s.camera);
  const maxAniso = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  // Face the card shows; external flips (button/tap) add half a turn from wherever it is.
  const shownFace = useRef(flipped);
  useEffect(() => {
    if (flipped === shownFace.current) return;
    shownFace.current = flipped;
    const m = motion.current;
    m.spinV = 0;
    m.snap = nearestFace(m.flip) + Math.PI;
  }, [flipped]);
  const shape = useMemo(cardShape, []);
  const body = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 3, curveSegments: 48 });
    g.translate(0, 0, -DEPTH / 2);
    return g;
  }, [shape]);
  const face = useMemo(() => faceGeometry(shape), [shape]);
  const textures = useMemo(() => {
    const make = (c: HTMLCanvasElement, srgb: boolean) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = maxAniso;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      return t;
    };
    return { front: make(faces.front, true), back: make(faces.back, true), mask: make(faces.mask, false), portrait: faces.portrait ? make(faces.portrait, false) : null };
  }, [faces, maxAniso]);
  const security = useMemo(() => createSecurityMaterial(textures.front, textures.mask, [1 / FACE_W, 1 / FACE_H], false, textures.portrait), [textures]);
  const backSecurity = useMemo(() => createSecurityMaterial(textures.back, textures.mask, [1 / FACE_W, 1 / FACE_H], true), [textures]);
  const materials = useMemo(() => [security, backSecurity], [security, backSecurity]);
  useEffect(() => {
    // Reserve exactly the printed QR panel, so no unprinted rim shows around it.
    const toUv = (b: QrBox | undefined, m: THREE.ShaderMaterial) => {
      const u = m.uniforms["uQrBox"];
      if (b && u?.value instanceof THREE.Vector4) {
        // Inset past the rounded corners so the shader covers them, never bare body.
        const i = 5;
        u.value.set((b.x + i) / FACE_W, 1 - (b.y + b.w - i) / FACE_H, (b.x + b.w - i) / FACE_W, 1 - (b.y + i) / FACE_H);
      }
    };
    toUv(faces.qrFront, security);
    toUv(faces.qrBack, backSecurity);
  }, [faces, security, backSecurity]);
  useEffect(() => {
    for (const material of materials) {
    const u = material.uniforms;
    const set = (name: string, value: number) => { const uniform = u[name]; if (uniform) uniform.value = value; };
    set("uFinish", FINISH_INDEX[finish]);
    set("uRough", pbr ? pbr.roughness : -1);
    set("uMetal", pbr ? pbr.metalness : -1);
    set("uClearcoat", pbr ? pbr.clearcoat : 0);
    set("uAniso", pbr ? pbr.anisotropy : 0);
    }
  }, [materials, finish, pbr]);
  useEffect(() => () => {
    textures.front.dispose();
    textures.back.dispose();
    textures.mask.dispose();
    textures.portrait?.dispose();
  }, [textures]);
  useEffect(() => () => security.dispose(), [security]);
  useEffect(() => () => backSecurity.dispose(), [backSecurity]);
  useEffect(() => () => body.dispose(), [body]);
  useEffect(() => () => face.dispose(), [face]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const m = motion.current;
    const t = tilt.current;
    const now = performance.now();
    const d = drag?.current;
    const grabbing = Boolean(d?.down);
    const interacting = grabbing || m.snap === null || now - t.at < IDLE_AFTER_MS || zoom.current > 0;
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    if (interacting) {
      // Settle the idle spin to the nearest full turn so the chosen face shows.
      const target = Math.round(m.idle / (Math.PI * 2)) * Math.PI * 2;
      m.idle += (target - m.idle) * k(FLIP_DAMP);
    } else if (!reducedMotion) {
      m.idle += dt * ((Math.PI * 2) / IDLE_PERIOD_S);
    }
    // Grab-and-spin: follow the hand 1:1, coast with friction on release, then snap to a face.
    if (d && grabbing) {
      m.snap = null;
      m.flip += d.dx;
      m.spinV += (d.dx / Math.max(dt, 1e-3) - m.spinV) * 0.5;
      m.dragPitch = clampDragPitch(m.dragPitch + d.dy);
      d.dx = 0;
      d.dy = 0;
    } else {
      if (m.snap === null) {
        if (Math.abs(m.spinV) > SPIN_SNAP_SPEED && !reducedMotion) {
          m.flip += m.spinV * dt;
          m.spinV = decaySpin(m.spinV, dt);
        } else {
          m.spinV = 0;
          m.snap = nearestFace(m.flip + (reducedMotion ? 0 : m.spinV * 0.12));
        }
      }
      if (m.snap !== null) {
        m.flip += (m.snap - m.flip) * k(FLIP_DAMP);
        const back = isBackFace(m.snap);
        if (back !== shownFace.current) {
          shownFace.current = back;
          onFace?.(back);
        }
      }
      m.dragPitch += (0 - m.dragPitch) * k(FLIP_DAMP);
    }
    // Low-pass the raw target first (hand tremor), then the mass-spring adds inertia.
    const rest = t.rest ?? Infinity;
    m.tx = lerpDamp(m.tx, tiltTarget(t.x, now - t.at, rest), dt);
    m.ty = lerpDamp(m.ty, tiltTarget(t.y, now - t.at, rest), dt);
    m.yaw = stepSpring(m.yaw, m.tx * TILT_YAW, dt);
    m.pitch = stepSpring(m.pitch, -m.ty * TILT_PITCH, dt);
    const g = group.current;
    if (g) {
      g.rotation.y = (reducedMotion ? 0 : m.idle) + m.flip + Math.max(-TILT_YAW, Math.min(TILT_YAW, m.yaw.x));
      g.rotation.x = Math.max(-TILT_PITCH, Math.min(TILT_PITCH, m.pitch.x)) + m.dragPitch;
      g.position.y = reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 0.8) * 0.02 * (1 - zoom.current);
    }
    m.z += (CAMERA_FAR + (CAMERA_NEAR - CAMERA_FAR) * zoom.current - m.z) * k(ZOOM_DAMP);
    camera.position.z = m.z;
    // Pan only as far as the zoom allows, so the card never leaves the frame.
    const pan = zoom.pan ?? { x: 0, y: 0 };
    const reach = zoom.current;
    camera.position.x += (pan.x * W * 0.5 * reach - camera.position.x) * k(ZOOM_DAMP);
    camera.position.y += (pan.y * H * 0.5 * reach - camera.position.y) * k(ZOOM_DAMP);
    const wm = watermark.current;
    if (wm) {
      // Rigidly printed: every element stays fixed to the card body.
      wm.position.x = cx(150);
      wm.position.y = cy(960);
      wm.rotation.z = 0;
    }
    for (const material of materials) {
    const u = material.uniforms;
    const motionUniform = u["uMotion"];
    if (motionUniform) motionUniform.value = reducedMotion ? 0 : 1;
    const gyro = u["uGyro"];
    if (gyro) (gyro.value as THREE.Vector2).set(m.yaw.x / TILT_YAW, m.pitch.x / TILT_PITCH);
    // Real wall-clock time, so a replayed recording drifts out of phase.
    const time = u["uTime"];
    if (time) time.value = (Date.now() % 3_600_000) / 1000;
    const s = live.current.seed;
    const seed = u["uSeed"];
    if (seed?.value instanceof THREE.Vector4) seed.value.set(s[0], s[1], s[2], s[3]);
    const light = u["uLightPos"];
    if (light?.value instanceof THREE.Vector3) light.value.set(clampTilt(t.x) * 2.2 + (reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 0.3) * 0.4), clampTilt(t.y) * 2 + 0.8, 2.4);
    }
    if (secure) {
      const { iat, exp } = secure.current;
      const fraction = ring.uniforms["uFrac"];
      if (fraction) fraction.value = exp > 0 ? Math.max(0, Math.min(1, (exp - Date.now()) / Math.max(1, exp - iat))) : 0;
    }
    if (timer.current) {
      const left = Math.max(0, Math.min(1, (live.current.expiresAt - Date.now()) / live.current.windowMs));
      timer.current.scale.x = Math.max(left, 0.0001);
    }
  });

  // Back-face layout in canvas pixels (matches card-faces.ts).
  const qrSize = BACK_QR.size;
  const qy = BACK_QR.y;
  const slotY = qy + qrSize + 80 + 40;

  return (
    <group name="rout-card-body" ref={group} onClick={(e) => { e.stopPropagation(); if (e.delta < 6 && zoom.current <= 0.02) onFlip(); }}>
      <mesh geometry={body}>
        <meshPhysicalMaterial color="#26262b" metalness={0.95} roughness={0.32} clearcoat={0.4} />
      </mesh>
      <mesh geometry={face} position={[0, 0, FRONT_Z]} material={security} />
      <mesh geometry={face} position={[0, 0, BACK_Z]} rotation={[0, Math.PI, 0]} material={backSecurity} />

      <group ref={watermark} position={[cx(150), cy(960), FRONT_Z + 0.0018]}>
        <Text font={FONT} fontSize={0.08} sdfGlyphSize={128} letterSpacing={0} anchorX="center" anchorY="middle"
          onSync={() => glyphs.current.add("watermark")}>
          ROUT
          <meshPhysicalMaterial color={text.fg} metalness={0.65} roughness={0.22} iridescence={1}
            iridescenceIOR={1.45} iridescenceThicknessRange={[220, 480]} transparent opacity={0.18} depthWrite={false} />
        </Text>
      </group>

      {/* Front: SDF name / handle / tagline and micro-text border. */}
      <Embossed y={cy(FRONT_TEXT_Y.name) + 0.01} size={0.064} color={text.fg}>{text.displayName}</Embossed>
      <Embossed y={cy(FRONT_TEXT_Y.handle) + 0.009} size={0.04} color={text.fg}>{`@${text.handle}`}</Embossed>
      <Embossed y={cy(FRONT_TEXT_Y.sub) + 0.007} size={0.028} color={text.fg}>{text.subheader}</Embossed>
      <group position={[0, 0, FRONT_Z + 0.0008]}>
        <MicroBorder color={text.fg} onSync={(side) => glyphs.current.add(`front-${side}`)} />
      </group>

      {/* Back: rotating live code + countdown. */}
      <group position={[0, 0, BACK_Z - 0.0006]} rotation={[0, Math.PI, 0]}>
        <Text font={MONO} fontSize={0.06} sdfGlyphSize={128} letterSpacing={0.18} position={[0, cy(slotY), 0]} anchorX="center" anchorY="middle" color="#f4f4f5">
          {text.code ? `${text.code.slice(0, 3)} ${text.code.slice(3)}` : "··· ···"}
        </Text>
        <mesh position={[0, cy(qy + qrSize / 2), 0.0003]} material={ring}>
          <planeGeometry args={[(qrSize + 20) / FACE_W, ((qrSize + 20) / FACE_H) * H]} />
        </mesh>
        <mesh ref={timer} position={[0, cy(slotY + 22), 0.0002]}>
          <planeGeometry args={[cx(FACE_W - 64) - cx(64), 0.004]} />
          <meshBasicMaterial color="#34d399" toneMapped={false} />
        </mesh>
        <MicroBorder color={text.fg} onSync={(side) => glyphs.current.add(`back-${side}`)} />
      </group>
    </group>
  );
}

function ReadySignal({ onReady, glyphs }: { onReady: () => void; glyphs: MutableRefObject<Set<string>> }) {
  const frames = useRef(0);
  useFrame(() => {
    // Wait for actual optical SDF synchronization, then one completed render.
    if (glyphs.current.size < 9) return;
    frames.current += 1;
    if (frames.current === 2) onReady();
  });
  return null;
}

function SnapshotBridge({ snapshotRef }: { snapshotRef: MutableRefObject<(() => string) | null> }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    snapshotRef.current = () => {
      const card = scene.getObjectByName("rout-card-body");
      if (!card) throw new Error("Card not ready");
      const rotation = card.rotation.clone(), position = card.position.clone();
      const cameraPosition = camera.position.clone(), cameraRotation = camera.quaternion.clone();
      try {
        // Static front only: never export the private, rotating code on the back.
        card.rotation.set(0, 0, 0);
        card.position.set(0, 0, 0);
        camera.position.set(0, 0, CAMERA_FAR);
        camera.lookAt(0, 0, 0);
        return captureCardSnapshot(gl, scene, camera);
      } finally {
        card.rotation.copy(rotation); card.position.copy(position);
        camera.position.copy(cameraPosition); camera.quaternion.copy(cameraRotation);
        gl.render(scene, camera);
      }
    };
    return () => { snapshotRef.current = null; };
  }, [gl, scene, camera, snapshotRef]);
  return null;
}

/** Native resolution, supersampled to at least 2x so sub-pixel engraving resolves; capped at 3x. */
function renderDpr(): number {
  const native = typeof window === "undefined" ? 2 : window.devicePixelRatio || 1;
  return Math.min(Math.max(native, 2), 3);
}

export default function RoutCard3D(props: CardProps & { onReady: () => void }) {
  const { onReady, ...card } = props;
  const glyphs = useRef(new Set<string>());
  return (
    <Canvas
      dpr={renderDpr()}
      camera={{ position: [0, 0, CAMERA_FAR], fov: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 3, 4]} intensity={1.2} />
      <Environment resolution={128}>
        <Lightformer intensity={2} position={[0, 4, 2]} scale={[8, 2, 1]} />
        <Lightformer intensity={1.2} color="#9bb7ff" position={[-4, 0, 1]} rotation-y={Math.PI / 2} scale={[8, 2, 1]} />
        <Lightformer intensity={1} color="#ffd1a8" position={[4, -1, 1]} rotation-y={-Math.PI / 2} scale={[8, 2, 1]} />
      </Environment>
      <Card {...card} glyphs={glyphs} />
      <ReadySignal onReady={onReady} glyphs={glyphs} />
      {card.snapshotRef && <SnapshotBridge snapshotRef={card.snapshotRef} />}
    </Canvas>
  );
}
