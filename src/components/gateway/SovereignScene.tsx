import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { AdditiveBlending, CatmullRomCurve3, Color, Group, ShaderMaterial, TextureLoader, Vector3 } from 'three';
import landMask from '@/assets/rout-land-mask.png';

/*
 * Original GLSL. "Signal field": clustered spectral bars that flicker like live
 * routing telemetry, a dotted Natural Earth globe (public domain) with an
 * atmosphere rim, and light pulses travelling from Brussels to the network.
 */
const fieldVertex = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const fieldFragment = `precision highp float;
uniform float time;uniform vec2 resolution;uniform vec3 emerald;uniform vec3 cyan;uniform vec2 pointer;varying vec2 vUv;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(float x){float i=floor(x);float f=fract(x);return mix(h(vec2(i,1.)),h(vec2(i+1.,1.)),smoothstep(0.,1.,f));}
void main(){
  vec2 uv=vUv;float aspect=resolution.x/resolution.y;
  vec3 col=vec3(0.);
  // Original fluid-inspired interference ribbons, not a copied Shadertoy shader.
  vec2 flow=uv;flow.x*=aspect;
  float warp=sin(flow.x*2.4+time*.17)*.07+sin(flow.x*5.-time*.12)*.035;
  float center=.24+warp+sin(flow.x*1.8+time*.08)*.055;
  for(int ribbon=0;ribbon<7;ribbon++){
    float r=float(ribbon);
    float path=center+r*.009+sin(flow.x*3.2+time*.14+r*.3)*.012;
    float line=exp(-abs(flow.y-path)*480.);
    col+=mix(emerald,cyan,r/6.)*line*.26;
  }
  for(int layer=0;layer<3;layer++){
    float L=float(layer);
    float cols=18.+L*10.;float rows=6.+L*3.;
    float drift=time*(.012+L*.006);
    vec2 g=vec2(uv.x*cols*aspect/1.6,(uv.y+drift)*rows);
    vec2 cell=floor(g);vec2 f=fract(g);
    float on=step(.62-L*.04,h(cell+L*17.));
    float life=noise(time*(.35+h(cell)*.6)+h(cell*3.1)*40.);
    on*=smoothstep(.35,.75,life);
    float stripes=cols*aspect*14.;
    float sx=uv.x*stripes;float sid=floor(sx);
    float bar=pow(1.-abs(fract(sx)-.5)*2.,6.)*step(.35,h(vec2(sid,cell.y+L)));
    float shape=smoothstep(0.,.18,f.y)*smoothstep(1.,.55,f.y)*smoothstep(0.,.08,f.x)*smoothstep(1.,.92,f.x);
    float tone=h(vec2(sid,L));
    vec3 c=mix(emerald,cyan,tone);
    c=mix(c,vec3(1.,.96,.86),step(.965,h(cell+vec2(9.,L)))*life);
    float depth=1./(1.+L*1.3);
    col+=c*bar*shape*on*(.22+life*.9)*depth;
  }
  float scan=.85+.15*sin(uv.y*resolution.y*1.4+time*3.);
  vec2 q=uv-vec2(.5,.56);q.x*=aspect;
  float clear=smoothstep(.12,.62,length(q*vec2(.9,1.4)));
  float glow=exp(-8.*length((uv-pointer)*vec2(aspect,1.)));
  float topfade=smoothstep(.02,.25,uv.y)*smoothstep(1.,.82,uv.y);
  col*=1.6*scan*topfade*(.2+clear*.8)*(1.+glow*1.2);
  gl_FragColor=vec4(col,min(1.,max(col.r,max(col.g,col.b))));
}`;

const globeVertex = `uniform sampler2D land;uniform float pixelRatio;uniform float time;varying float alpha;varying float land2;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.);
float l=texture2D(land,uv).r;land2=l;
float facing=smoothstep(-.1,.8,normalize(normalMatrix*normal).z);
alpha=(l*.95+.07)*facing;
gl_Position=projectionMatrix*mv;gl_PointSize=(l>.5?2.6:1.5)*pixelRatio;}`;
const globeFragment = `uniform vec3 ink;uniform vec3 emerald;varying float alpha;varying float land2;
void main(){float m=1.-smoothstep(.25,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(mix(emerald*.7,ink,land2),alpha*m);}`;
const rimVertex = `varying vec3 n;varying vec3 v;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`;
const rimFragment = `uniform vec3 emerald;varying vec3 n;varying vec3 v;void main(){float r=pow(1.-max(dot(n,v),0.),3.2);gl_FragColor=vec4(emerald,r*.55);}`;
const arcVertex = `attribute float t;varying float vt;void main(){vt=t;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const arcFragment = `uniform float time;uniform float offset;uniform vec3 cyan;varying float vt;
void main(){float p=fract(time*.18+offset);float head=smoothstep(p-.16,p,vt)*step(vt,p);gl_FragColor=vec4(cyan,.28+head);}`;

const R = 2.6;
function toVec(lat: number, lng: number, r = R) {
  const la = (lat * Math.PI) / 180, lo = (lng * Math.PI) / 180;
  return new Vector3(Math.sin(lo) * Math.cos(la) * r, Math.sin(la) * r, Math.cos(lo) * Math.cos(la) * r);
}
const HUB: [number, number] = [50.85, 4.35];
const NODES: [number, number][] = [[52.37, 4.9], [48.86, 2.35], [52.52, 13.4], [51.5, -0.12], [40.42, -3.7], [41.9, 12.5], [59.33, 18.07], [38.72, -9.14], [47.37, 8.54], [50.08, 14.43], [60.17, 24.94], [40.71, -74], [25.2, 55.27]];

function Arc({ to, offset, cyan }: { to: [number, number]; offset: number; cyan: Color }) {
  const mat = useRef<ShaderMaterial>(null);
  const { pos, t } = useMemo(() => {
    const a = toVec(...HUB), b = toVec(...to);
    const lift = 1 + a.distanceTo(b) * 0.22;
    const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(R * lift);
    const pts = new CatmullRomCurve3([a, mid, b]).getPoints(64);
    return { pos: new Float32Array(pts.flatMap((p) => [p.x, p.y, p.z])), t: new Float32Array(pts.map((_, i) => i / 64)) };
  }, [to]);
  const uniforms = useMemo(() => ({ time: { value: 0 }, offset: { value: offset }, cyan: { value: cyan } }), [offset, cyan]);
  useFrame((s) => { if (mat.current) mat.current.uniforms.time.value = s.clock.elapsedTime; });
  return <line>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[pos, 3]} /><bufferAttribute attach="attributes-t" args={[t, 1]} /></bufferGeometry>
    <shaderMaterial ref={mat} vertexShader={arcVertex} fragmentShader={arcFragment} uniforms={uniforms} transparent depthWrite={false} blending={AdditiveBlending} />
  </line>;
}

function Globe({ colors, reduced, ready }: { colors: { ink: string; emerald: string; cyan: string }; reduced: boolean; ready: () => void }) {
  const map = useLoader(TextureLoader, landMask);
  const group = useRef<Group>(null);
  const announced = useRef(false);
  const { gl } = useThree();
  const c = useMemo(() => ({ ink: new Color(colors.ink), emerald: new Color(colors.emerald), cyan: new Color(colors.cyan) }), [colors]);
  const uniforms = useMemo(() => ({ land: { value: map }, ink: { value: c.ink }, emerald: { value: c.emerald }, time: { value: 0 }, pixelRatio: { value: gl.getPixelRatio() } }), [map, c, gl]);
  const rimUniforms = useMemo(() => ({ emerald: { value: c.emerald } }), [c]);
  const buffers = useMemo(() => {
    const n = 26000, pos = new Float32Array(n * 3), normals = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i;
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      const lat = Math.asin(y), lng = Math.atan2(x, z);
      pos.set([x * R, y * R, z * R], i * 3); normals.set([x, y, z], i * 3);
      uv.set([(lng + Math.PI) / (2 * Math.PI), (lat + Math.PI / 2) / Math.PI], i * 2);
    }
    return { pos, normals, uv };
  }, []);
  useFrame((state, delta) => {
    if (!announced.current) { announced.current = true; ready(); }
    if (!group.current || reduced) return;
    const d = Math.min(delta, 0.05);
    group.current.rotation.y += d * 0.035;
    const host = state.gl.domElement.closest<HTMLElement>('[data-sovereign-scene]');
    const x = parseFloat(host?.style.getPropertyValue('--lg-x') || '50') / 100 - 0.5;
    group.current.rotation.z += (-x * 0.06 - group.current.rotation.z) * (1 - Math.exp(-3 * d));
  });
  return <group position={[0, -3.6, 0]} rotation={[0.55, 0, 0]}>
    <group ref={group} rotation={[0, -0.25, 0]}>
      <points><bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[buffers.pos, 3]} />
        <bufferAttribute attach="attributes-normal" args={[buffers.normals, 3]} />
        <bufferAttribute attach="attributes-uv" args={[buffers.uv, 2]} />
      </bufferGeometry><shaderMaterial vertexShader={globeVertex} fragmentShader={globeFragment} uniforms={uniforms} transparent depthWrite={false} /></points>
      {NODES.map((n, i) => <Arc key={i} to={n} offset={i * 0.137} cyan={c.cyan} />)}
      <mesh position={toVec(...HUB, R * 1.005)}><sphereGeometry args={[0.035, 12, 12]} /><meshBasicMaterial color={c.cyan} /></mesh>
    </group>
    <mesh scale={1.06}><sphereGeometry args={[R, 64, 64]} /><shaderMaterial vertexShader={rimVertex} fragmentShader={rimFragment} uniforms={rimUniforms} transparent depthWrite={false} blending={AdditiveBlending} /></mesh>
  </group>;
}

function Field({ emerald, cyan, reduced }: { emerald: string; cyan: string; reduced: boolean }) {
  const material = useRef<ShaderMaterial>(null);
  const { size } = useThree();
  const uniforms = useMemo(() => ({ time: { value: 4 }, resolution: { value: [1, 1] }, pointer: { value: [0.5, 0.5] }, emerald: { value: new Color(emerald) }, cyan: { value: new Color(cyan) } }), [emerald, cyan]);
  useFrame((state, delta) => {
    const m = material.current; if (!m) return;
    m.uniforms.resolution.value = [size.width, size.height];
    if (!reduced) m.uniforms.time.value += Math.min(delta, 0.05);
    const host = state.gl.domElement.closest<HTMLElement>('[data-sovereign-scene]');
    const px = parseFloat(host?.style.getPropertyValue('--lg-x') || '50') / 100, py = parseFloat(host?.style.getPropertyValue('--lg-y') || '50') / 100;
    const p = m.uniforms.pointer.value as number[];
    p[0] += (px - p[0]) * 0.06; p[1] += (1 - py - p[1]) * 0.06;
  });
  return <mesh frustumCulled={false} renderOrder={-1}><planeGeometry args={[2, 2]} /><shaderMaterial ref={material} uniforms={uniforms} vertexShader={fieldVertex} fragmentShader={fieldFragment} transparent depthTest={false} depthWrite={false} blending={AdditiveBlending} /></mesh>;
}

export default function SovereignScene({ active, reduced, colors, onReady }: { active: boolean; reduced: boolean; colors: { ink: string; emerald: string; cyan: string }; onReady: () => void }) {
  return <Canvas aria-hidden dpr={[1, 1.5]} flat camera={{ position: [0, 0, 9], fov: 42 }} frameloop={active && !reduced ? 'always' : 'demand'} gl={{ antialias: true, alpha: true }}>
    <Field emerald={colors.emerald} cyan={colors.cyan} reduced={reduced} />
    <Suspense fallback={null}><Globe colors={colors} reduced={reduced} ready={onReady} /></Suspense>
  </Canvas>;
}
