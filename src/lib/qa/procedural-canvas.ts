/** Browser-only GPU graphics: no media URL, uploads, storage or module-scope work. */
const VERTEX = `attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}`;
const FRAGMENT = `precision mediump float;
uniform vec2 u_resolution; uniform float u_time; uniform vec3 u_a; uniform vec3 u_b;
void main(){
 vec2 p=gl_FragCoord.xy/u_resolution.xy;
 vec2 q=p*vec2(1.2,1.8);
 float t=u_time*.22;
 for(int i=1;i<5;i++){float f=float(i);q+=vec2(sin(q.y*f*2.+t),cos(q.x*f*2.-t))*.16/f;}
 float wave=.5+.5*sin(q.x*4.+q.y*3.+t);
 float glow=.42+.58*smoothstep(.08,.94,wave);
 vec3 col=mix(u_a,u_b,wave)*glow;
 gl_FragColor=vec4(col,1.);
}`;

function color(css: string): [number, number, number] {
  const sample = document.createElement("canvas").getContext("2d");
  if (!sample) return [0.1, 0.5, 0.3];
  sample.fillStyle = css;
  sample.fillRect(0, 0, 1, 1);
  const bytes = sample.getImageData(0, 0, 1, 1).data;
  return [(bytes[0] ?? 0) / 255, (bytes[1] ?? 0) / 255, (bytes[2] ?? 0) / 255];
}
export function createProceduralCanvas(canvas: HTMLCanvasElement, theme: "aurora" | "glass" = "aurora") {
  const gl = canvas.getContext("webgl", { alpha: false, preserveDrawingBuffer: true, antialias: false });
  if (!gl) return null;
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
    return s;
  };
  const vertex = shader(gl.VERTEX_SHADER, VERTEX); const fragment = shader(gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram(); const buffer = gl.createBuffer();
  if (!vertex || !fragment || !program || !buffer) {
    if (vertex) gl.deleteShader(vertex); if (fragment) gl.deleteShader(fragment);
    if (program) gl.deleteProgram(program); if (buffer) gl.deleteBuffer(buffer);
    return null;
  }
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteShader(vertex); gl.deleteShader(fragment); gl.deleteProgram(program); gl.deleteBuffer(buffer); return null;
  }
  gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  const styles = getComputedStyle(document.documentElement);
  const a = color(`hsl(${styles.getPropertyValue(theme === "glass" ? "--story-ring-2" : "--story-ring")})`);
  const b = color(`hsl(${styles.getPropertyValue(theme === "glass" ? "--story-ring" : "--story-ring-2")})`);
  gl.uniform3fv(gl.getUniformLocation(program, "u_a"), a);
  gl.uniform3fv(gl.getUniformLocation(program, "u_b"), b);
  let disposed = false;
  return {
    draw(seconds: number) {
      if (disposed || gl.isContextLost()) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), canvas.width, canvas.height);
      gl.uniform1f(gl.getUniformLocation(program, "u_time"), seconds);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    dispose() {
      disposed = true;
      gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}