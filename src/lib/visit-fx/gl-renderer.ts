import { STRIDE } from "./protocol";

const VS = `
attribute vec2 a_corner; attribute vec2 a_pos; attribute vec4 a_props; // rot, squash, alpha, tex
attribute float a_size;
uniform vec2 u_res; uniform float u_cam; uniform float u_tex; uniform float u_time;
varying vec2 v_uv; varying float v_alpha;
void main(){
  float s = a_props.y;
  // Soft-body squash & stretch: platdrukken met jelly-golf, onderkant blijft op de grond.
  float wob = s * 0.12 * sin(u_time * 0.03 + a_pos.x);
  vec2 c = a_corner;
  c.y = (c.y - 0.5) * (1.0 - s * 0.8) + 0.5 - s * 0.4;
  c.x *= 1.0 + s * (0.9 + wob) * (1.0 - abs(a_corner.y - 0.5));
  float cr = cos(a_props.x), sr = sin(a_props.x);
  vec2 p = vec2(c.x * cr - c.y * sr, c.x * sr + c.y * cr) * a_size + a_pos;
  p.y -= u_cam;
  vec2 clip = p / u_res * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = vec2((a_props.w + a_corner.x + 0.5) / u_tex, a_corner.y + 0.5);
  v_alpha = a_props.z;
}`;
const FS = `precision mediump float; uniform sampler2D u_img; varying vec2 v_uv; varying float v_alpha;
void main(){ vec4 c = texture2D(u_img, v_uv); gl_FragColor = c * v_alpha; }`;

const CORNERS = [-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5];

/** Native WebGL-renderer: emoji's één keer als texture-atlas op de GPU. */
export function createGlRenderer(canvas: HTMLCanvasElement, emojis: string[]) {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;
  const sh = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const cell = 128, atlas = document.createElement("canvas");
  atlas.width = cell * emojis.length; atlas.height = cell;
  const a = atlas.getContext("2d")!;
  a.textAlign = "center"; a.textBaseline = "middle";
  a.font = `${cell * 0.8}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  emojis.forEach((e, i) => a.fillText(e, cell * i + cell / 2, cell / 2 + 6));
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const buf = gl.createBuffer();
  const loc = (n: string) => gl.getAttribLocation(prog, n);
  const attrs: [number, number, number][] = [[loc("a_corner"), 2, 0], [loc("a_pos"), 2, 2], [loc("a_props"), 4, 4], [loc("a_size"), 1, 8]];
  const F = 9; let verts = new Float32Array(0);
  const uRes = gl.getUniformLocation(prog, "u_res"), uTex = gl.getUniformLocation(prog, "u_tex"), uTime = gl.getUniformLocation(prog, "u_time"), uCam = gl.getUniformLocation(prog, "u_cam");

  return {
    draw(data: Float32Array, count: number, w: number, h: number, time: number, camY = 0) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      gl.viewport(0, 0, cw, ch); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      if (!count) return;
      if (verts.length < count * 6 * F) verts = new Float32Array(count * 6 * F);
      for (let i = 0; i < count; i++) {
        const o = i * STRIDE;
        for (let v = 0; v < 6; v++) {
          const k = (i * 6 + v) * F;
          verts[k] = CORNERS[v * 2]; verts[k + 1] = CORNERS[v * 2 + 1];
          verts[k + 2] = data[o]; verts[k + 3] = data[o + 1];
          verts[k + 4] = data[o + 2]; verts[k + 5] = data[o + 3]; verts[k + 6] = data[o + 4]; verts[k + 7] = data[o + 5];
          verts[k + 8] = data[o + 6];
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, count * 6 * F), gl.STREAM_DRAW);
      for (const [l, size, off] of attrs) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, F * 4, off * 4); }
      gl.uniform2f(uRes, w, h); gl.uniform1f(uTex, emojis.length); gl.uniform1f(uTime, time); gl.uniform1f(uCam, camY);
      gl.drawArrays(gl.TRIANGLES, 0, count * 6);
    },
    dispose() { gl.deleteBuffer(buf); gl.deleteTexture(tex); gl.deleteProgram(prog); gl.getExtension("WEBGL_lose_context")?.loseContext(); },
  };
}
