// Pantalla CRT: un filtro WebGL que se pone sobre el canvas del mapa.
// Curvatura de tubo, aberración cromática, resplandor (bloom) del fósforo,
// líneas de escaneo, máscara RGB, grano, parpadeo y una banda que rueda.
//
// El resto de la página (paneles, texto) recibe el efecto con CSS: ver `.crt-on`
// en global.css. Dibujar el DOM entero dentro de una textura sería frágil y lento.

// Curvatura: la misma fórmula en el shader y en JS (para que el ratón acierte).
const CX = 6;
const CY = 5;

/** Dónde cae, dentro de la imagen original, lo que el usuario ve en (x, y). */
export function corregirPuntero(x: number, y: number, w: number, h: number) {
  let u = (x / w) * 2 - 1;
  let v = 1 - (y / h) * 2;
  const ox = Math.abs(v) / CX, oy = Math.abs(u) / CY;
  u += u * ox * ox;
  v += v * oy * oy;
  return { x: Math.min(w, Math.max(0, (u * 0.5 + 0.5) * w)), y: Math.min(h, Math.max(0, (1 - (v * 0.5 + 0.5)) * h)) };
}

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_time;
uniform float u_vivo;
varying vec2 v_uv;

const float CX = ${CX}.0;
const float CY = ${CY}.0;

vec2 curva(vec2 uv) {
  uv = uv * 2.0 - 1.0;
  vec2 off = abs(uv.yx) / vec2(CX, CY);
  uv = uv + uv * off * off;
  return uv * 0.5 + 0.5;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = curva(v_uv);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0); return; }

  // aberración cromática: crece hacia los bordes
  vec2 c = uv - 0.5;
  float d2 = dot(c, c);
  vec2 ab = c * (0.0012 + d2 * 0.008);
  vec4 sr = texture2D(u_tex, uv + ab);
  vec4 sg = texture2D(u_tex, uv);
  vec4 sb = texture2D(u_tex, uv - ab);
  vec4 col = vec4(sr.r, sg.g, sb.b, max(max(sr.a, sg.a), sb.a));

  // resplandor: dos anillos de 8 muestras alrededor del píxel
  vec2 px = 1.0 / u_res;
  vec4 glow = vec4(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    vec2 o = vec2(cos(a), sin(a));
    glow += texture2D(u_tex, uv + o * px * 3.0) + texture2D(u_tex, uv + o * px * 7.0) * 0.6;
  }
  glow /= 12.8;
  col.rgb += glow.rgb * 0.85;
  col.a = max(col.a, max(glow.r, max(glow.g, glow.b)) * 0.85);

  // líneas de escaneo y máscara de fósforo (tríadas RGB)
  float linea = 0.5 + 0.5 * sin(v_uv.y * u_res.y * 2.0943951);
  col.rgb *= 1.0 - 0.16 * linea;
  float m = mod(gl_FragCoord.x, 3.0);
  vec3 masc = m < 1.0 ? vec3(1.0, 0.84, 0.84) : (m < 2.0 ? vec3(0.84, 1.0, 0.84) : vec3(0.84, 0.84, 1.0));
  col.rgb *= masc;

  // parpadeo, banda que rueda y grano (u_vivo = 0 con "menos movimiento")
  float parpadeo = 0.975 + 0.025 * hash(vec2(floor(u_time * 24.0), 3.0));
  float banda = smoothstep(0.0, 1.0, 1.0 - abs(fract(v_uv.y * 0.8 - u_time * 0.045) - 0.5) * 2.0);
  col.rgb *= (parpadeo + 0.045 * banda * u_vivo);
  float g = hash(v_uv * u_res + fract(u_time) * 91.7) - 0.5;
  col.rgb += g * 0.035 * u_vivo * vec3(0.43, 0.9, 0.72);
  col.a += abs(g) * 0.03 * u_vivo;

  // viñeta y esquinas redondeadas
  col *= 1.0 - d2 * 1.15;
  float borde = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  col *= smoothstep(0.0, 0.014, borde);

  gl_FragColor = clamp(col, 0.0, 1.0);
}`;

export type CRT = { activar(b: boolean): boolean; soportado: boolean };

/** Crea el filtro. `fuente` es el canvas 2D del mapa y `destino` el canvas WebGL encima. */
export function crearCRT(fuente: HTMLCanvasElement, destino: HTMLCanvasElement, reducido: boolean): CRT {
  const gl = destino.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
  const nada: CRT = { activar: () => false, soportado: false };
  if (!gl) return nada;

  const compilar = (tipo: number, src: string) => {
    const s = gl.createShader(tipo)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = compilar(gl.VERTEX_SHADER, VERT);
  const fs = compilar(gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram()!;
  if (!vs || !fs) return nada;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return nada;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

  const uRes = gl.getUniformLocation(prog, "u_res");
  const uTime = gl.getUniformLocation(prog, "u_time");
  const uVivo = gl.getUniformLocation(prog, "u_vivo");
  gl.uniform1f(uVivo, reducido ? 0 : 1);
  gl.clearColor(0, 0, 0, 0);

  let encendido = false;
  let perdido = false;
  const t0 = performance.now();

  function cuadro() {
    if (!encendido || perdido) return;
    requestAnimationFrame(cuadro);
    const w = fuente.width, h = fuente.height;
    if (!w || !h) return;
    if (destino.width !== w || destino.height !== h) { destino.width = w; destino.height = h; }
    gl!.viewport(0, 0, w, h);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, fuente);
    gl!.uniform2f(uRes, w, h);
    gl!.uniform1f(uTime, reducido ? 0 : (performance.now() - t0) / 1000);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
  }

  destino.addEventListener("webglcontextlost", (e) => { e.preventDefault(); perdido = true; });

  return {
    soportado: true,
    /** Enciende o apaga el filtro. Devuelve si quedó encendido. */
    activar(b: boolean) {
      if (b === encendido) return encendido;
      if (b && perdido) return false;
      encendido = b;
      fuente.style.opacity = b ? "0" : ""; // el canvas 2D sigue recibiendo el ratón, pero se ve el filtrado
      if (b) requestAnimationFrame(cuadro);
      return encendido;
    },
  };
}
