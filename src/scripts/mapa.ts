// El mapa de red: un canvas 2D con nodos que flotan (física de resortes),
// un radar que "pinga" cada host al pasar, paquetes viajando por los enlaces y
// un retículo que sigue al puntero. Sin librerías: solo Canvas.
//
// Los nodos se pueden pulsar (abren su expediente) y arrastrar.

export type NodoDef = {
  id: string;
  tipo: "core" | "hub" | "hoja";
  forma?: "cuadro" | "circulo" | "punto"; // solo hojas
  etiqueta: string;
  ip?: string;
  abre: string; // qué expediente abre al pulsarlo
  padre?: string;
};

export type MapaOpts = {
  canvas: HTMLCanvasElement;
  nodos: NodoDef[];
  enlaces: [string, string][];
  reducido: boolean;
  onAbrir: (abre: string, id: string) => void;
  onHover?: (id: string | null) => void;
  onZoom?: (k: number) => void;
};

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 3.2;

type N = NodoDef & {
  x: number; y: number; vx: number; vy: number; fx: number; fy: number;
  r: number; vis: boolean; pulso: number; entra: number; fase: number;
};
type Paquete = { e: number; t: number; v: number; dir: 1 | -1 };

// Mismos valores que en global.css (@theme)
const AGUA = "110,231,183";
const ALERTA = "255,59,92";
const LUZ = "214,232,224";
const NIEBLA = "111,140,130";
const NOCHE = "5,10,12";
const FUENTE = '"JetBrains Mono", ui-monospace, Consolas, monospace';
const TAU = Math.PI * 2;

export function crearMapa(o: MapaOpts) {
  const { canvas, reducido } = o;
  const ctx = canvas.getContext("2d")!;
  let w = 0, h = 0, dpr = 1;
  let iniciado = false, t0 = 0, ultimo = 0, sweep = 0;
  let hover: N | null = null;
  let activo: string | null = null;
  let resaltado: string | null = null; // desde la lista de objetivos
  const ptr = { x: 0, y: 0, dentro: false };
  let arrastre: { n: N; ox: number; oy: number; mov: boolean } | null = null;

  // Cámara: pantalla = mundo * k + (x, y). `v` es la vista actual y `tv` la
  // vista objetivo: la cámara se desliza suavemente de una a la otra.
  const v = { k: 1, x: 0, y: 0 };
  const tv = { k: 1, x: 0, y: 0 };
  const aMundo = (sx: number, sy: number) => ({ x: (sx - v.x) / v.k, y: (sy - v.y) / v.k });
  const aPantalla = (n: { x: number; y: number }) => ({ x: n.x * v.k + v.x, y: n.y * v.k + v.y });
  // que el mundo nunca salga del todo de la pantalla
  function limitar(t: typeof tv) {
    t.k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, t.k));
    t.x = Math.min(w - 80, Math.max(80 - w * t.k, t.x));
    t.y = Math.min(h - 80, Math.max(80 - h * t.k, t.y));
  }
  /** Zoom multiplicativo anclado a un punto de la pantalla (por defecto, el centro). */
  function zoomPor(f: number, sx = w / 2, sy = h / 2) {
    const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, tv.k * f));
    const mx = (sx - tv.x) / tv.k, my = (sy - tv.y) / tv.k;
    tv.k = k; tv.x = sx - mx * k; tv.y = sy - my * k;
    limitar(tv);
    if (reducido) Object.assign(v, tv);
    o.onZoom?.(tv.k);
  }
  function reiniciarVista() {
    Object.assign(tv, { k: 1, x: 0, y: 0 });
    if (reducido) Object.assign(v, tv);
    o.onZoom?.(1);
  }

  const nodos: N[] = o.nodos.map((d) => ({
    ...d,
    x: 0, y: 0, vx: 0, vy: 0, fx: 0, fy: 0,
    r: d.tipo === "core" ? 24 : d.tipo === "hub" ? 12 : d.forma === "punto" ? 5 : 8,
    vis: false, pulso: 0, entra: 0, fase: Math.random() * TAU,
  }));
  const porId = new Map(nodos.map((n) => [n.id, n]));
  const enlaces = o.enlaces.map(([a, b]) => [porId.get(a)!, porId.get(b)!] as [N, N]);
  const paquetes: Paquete[] = [];
  const core = nodos.find((n) => n.tipo === "core")!;
  const hubs = nodos.filter((n) => n.tipo === "hub");

  /* ---------- tamaño y posición inicial ---------- */
  const S = () => Math.min(w, h);

  function colocar() {
    const cx = w / 2, cy = h / 2, s = S();
    core.x = cx; core.y = cy;
    hubs.forEach((hb, i) => {
      const a = -Math.PI / 2 + (i / hubs.length) * TAU + 0.25;
      hb.x = cx + Math.cos(a) * s * 0.3;
      hb.y = cy + Math.sin(a) * s * 0.3;
      const hijos = nodos.filter((n) => n.padre === hb.id);
      hijos.forEach((hj, k) => {
        const aa = a + ((k - (hijos.length - 1) / 2) / Math.max(hijos.length, 1)) * 1.7;
        hj.x = hb.x + Math.cos(aa) * s * 0.14;
        hj.y = hb.y + Math.sin(aa) * s * 0.14;
      });
    });
    for (let i = 0; i < 260; i++) paso(1, true); // que arranque ya asentado
    nodos.forEach((n) => { n.vx = n.vy = 0; });
  }

  function medir() {
    const nw = canvas.clientWidth, nh = canvas.clientHeight;
    if (!nw || !nh) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(nw * dpr);
    canvas.height = Math.round(nh * dpr);
    const primera = w === 0;
    const ow = w, oh = h;
    w = nw; h = nh;
    if (primera) colocar();
    else nodos.forEach((n) => { n.x *= w / ow; n.y *= h / oh; });
  }

  /* ---------- física ---------- */
  function paso(dt: number, frio = false) {
    const s = S(), cx = w / 2, cy = h / 2;
    const Lh = s * 0.3, Ll = s * 0.14;
    for (const n of nodos) { n.fx = 0; n.fy = 0; }

    // repulsión entre todos los pares
    for (let i = 0; i < nodos.length; i++) {
      for (let j = i + 1; j < nodos.length; j++) {
        const a = nodos[i], b = nodos[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy + 0.5;
        const d = Math.sqrt(d2);
        const k = (a.tipo === "hoja" && b.tipo === "hoja" ? 700 : 2400) * (s / 600);
        const f = k / d2;
        dx /= d; dy /= d;
        a.fx -= dx * f; a.fy -= dy * f;
        b.fx += dx * f; b.fy += dy * f;
      }
    }
    // resortes de los enlaces
    for (const [a, b] of enlaces) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const L = a.tipo === "core" || b.tipo === "core" ? Lh : Ll;
      const f = (d - L) * 0.03;
      a.fx += (dx / d) * f; a.fy += (dy / d) * f;
      b.fx -= (dx / d) * f; b.fy -= (dy / d) * f;
    }
    for (const n of nodos) {
      // gravedad suave hacia el centro (el núcleo, firme)
      const g = n.tipo === "core" ? 0.08 : 0.004;
      n.fx += (cx - n.x) * g; n.fy += (cy - n.y) * g;
      // respiración
      if (!reducido && !frio) {
        n.fx += Math.sin(ultimo * 0.0006 + n.fase) * 0.035;
        n.fy += Math.cos(ultimo * 0.0005 + n.fase * 1.3) * 0.035;
      }
      // el puntero empuja los nodos cercanos
      if (ptr.dentro && !arrastre && !frio) {
        const pw = aMundo(ptr.x, ptr.y);
        const dx = n.x - pw.x, dy = n.y - pw.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        if (d < 90) { const f = ((90 - d) / 90) * 0.5; n.fx += (dx / d) * f; n.fy += (dy / d) * f; }
      }
    }
    const margen = 44;
    for (const n of nodos) {
      if (arrastre?.n === n) continue;
      n.vx = (n.vx + n.fx * dt) * (frio ? 0.6 : 0.86);
      n.vy = (n.vy + n.fy * dt) * (frio ? 0.6 : 0.86);
      n.x += n.vx * dt; n.y += n.vy * dt;
      n.x = Math.max(margen, Math.min(w - margen, n.x));
      n.y = Math.max(margen + 8, Math.min(h - margen - 14, n.y));
    }
  }

  /* ---------- dibujo ---------- */
  const rgba = (c: string, a: number) => `rgba(${c},${a})`;
  const salida = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  const cruza = (prev: number, cur: number, a: number) => (cur >= prev ? a > prev && a <= cur : a > prev || a <= cur);

  function texto(s: string, x: number, y: number, tam: number, color: string, alinear: CanvasTextAlign = "center", peso = "500") {
    ctx.font = `${peso} ${tam}px ${FUENTE}`;
    ctx.textAlign = alinear;
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  function dibujar(ahora: number) {
    const dt = Math.min(2, (ahora - (ultimo || ahora)) / 16.67);
    const prevSweep = sweep;
    ultimo = ahora;
    if (!reducido) sweep = (sweep + dt * 0.0105) % TAU;
    paso(dt);

    // la cámara se desliza hacia su vista objetivo
    const suave = Math.min(1, 0.2 * dt);
    v.k += (tv.k - v.k) * suave;
    v.x += (tv.x - v.x) * suave;
    v.y += (tv.y - v.y) * suave;
    if (Math.abs(tv.k - v.k) < 0.0005) v.k = tv.k;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // todo lo que sigue se dibuja en coordenadas del mundo (con zoom y desplazamiento)
    ctx.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * v.x, dpr * v.y);
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    const t = ahora - t0;
    const s = S();

    // entrada escalonada de los nodos
    nodos.forEach((n, i) => { n.entra = iniciado ? Math.min(1, Math.max(0, (t - i * 55) / 500)) : 0; });

    // --- radar: anillos y barrido alrededor del núcleo ---
    if (iniciado) {
      ctx.strokeStyle = rgba(AGUA, 0.07);
      ctx.setLineDash([2, 7]);
      for (const k of [0.3, 0.52, 0.76]) {
        ctx.beginPath(); ctx.arc(core.x, core.y, s * k, 0, TAU); ctx.stroke();
      }
      ctx.setLineDash([]);
      if (!reducido) {
        const R = s * 0.82;
        if (typeof ctx.createConicGradient === "function") {
          const g = ctx.createConicGradient(sweep - 1.1, core.x, core.y);
          g.addColorStop(0, rgba(AGUA, 0));
          g.addColorStop(0.175, rgba(AGUA, 0.12));
          g.addColorStop(0.1751, rgba(AGUA, 0));
          g.addColorStop(1, rgba(AGUA, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(core.x, core.y, R, 0, TAU); ctx.fill();
        }
        ctx.strokeStyle = rgba(AGUA, 0.28);
        ctx.beginPath();
        ctx.moveTo(core.x, core.y);
        ctx.lineTo(core.x + Math.cos(sweep) * R, core.y + Math.sin(sweep) * R);
        ctx.stroke();
        // el radar "pinga" cada host al pasar
        for (const n of nodos) {
          if (n === core) continue;
          const a = (Math.atan2(n.y - core.y, n.x - core.x) + TAU) % TAU;
          if (cruza(prevSweep, sweep, a)) n.pulso = 1;
        }
      }
    }

    // --- enlaces ---
    for (const [a, b] of enlaces) {
      const k = Math.min(a.entra, b.entra);
      if (k <= 0) continue;
      const foco = hover === a || hover === b || activo === a.abre || activo === b.abre || resaltado === a.id || resaltado === b.id;
      const alt = a.vis || b.vis;
      const hoja = a.tipo === "hoja" || b.tipo === "hoja";
      ctx.strokeStyle = rgba(AGUA, (foco ? 0.7 : alt ? 0.34 : 0.15) * k);
      ctx.setLineDash(hoja ? [3, 5] : []);
      ctx.lineDashOffset = reducido ? 0 : -t * 0.012;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.setLineDash([]);

    // --- paquetes viajando por los enlaces ---
    if (iniciado && !reducido) {
      if (paquetes.length < 16 && Math.random() < 0.07) {
        paquetes.push({ e: (Math.random() * enlaces.length) | 0, t: 0, v: 0.004 + Math.random() * 0.01, dir: Math.random() < 0.5 ? 1 : -1 });
      }
      for (let i = paquetes.length - 1; i >= 0; i--) {
        const p = paquetes[i];
        p.t += p.v * dt;
        if (p.t >= 1) { paquetes.splice(i, 1); continue; }
        const [a, b] = enlaces[p.e];
        const u = p.dir === 1 ? p.t : 1 - p.t;
        const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u;
        ctx.fillStyle = rgba(AGUA, 0.9);
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        ctx.fillStyle = rgba(AGUA, 0.25);
        const u2 = p.dir === 1 ? Math.max(0, u - 0.05) : Math.min(1, u + 0.05);
        ctx.fillRect(a.x + (b.x - a.x) * u2 - 1, a.y + (b.y - a.y) * u2 - 1, 2, 2);
      }
    }

    // --- nodos ---
    for (const n of nodos) {
      if (n.entra <= 0) continue;
      const e = salida(n.entra);
      const foco = hover === n || activo === n.abre && n.tipo !== "hoja" || activo === n.id || resaltado === n.id;

      // onda del ping
      if (n.pulso > 0) {
        ctx.strokeStyle = rgba(n.vis ? AGUA : ALERTA, n.pulso * 0.5);
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + (1 - n.pulso) * 22, 0, TAU); ctx.stroke();
        n.pulso = Math.max(0, n.pulso - dt * 0.022);
      }

      if (n.tipo === "core") dibujarCore(n, e, t);
      else if (n.tipo === "hub") dibujarHub(n, e, t, foco);
      else dibujarHoja(n, e, foco);
    }

    // --- retículo y fichas: en coordenadas de pantalla (sin zoom) ---
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 1;
    if (iniciado && ptr.dentro && !reducido) {
      ctx.strokeStyle = rgba(AGUA, 0.1);
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.moveTo(0, ptr.y); ctx.lineTo(w, ptr.y);
      ctx.moveTo(ptr.x, 0); ctx.lineTo(ptr.x, h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = rgba(AGUA, 0.55);
      ctx.beginPath(); ctx.arc(ptr.x, ptr.y, 9, 0, TAU); ctx.stroke();
      const pw = aMundo(ptr.x, ptr.y);
      texto(`x:${Math.round(pw.x)} y:${Math.round(pw.y)} ×${v.k.toFixed(1)}`, ptr.x + 16, ptr.y - 12, 9.5, rgba(NIEBLA, 0.9), "left");
    }

    // --- ficha del nodo bajo el puntero ---
    if (hover && hover.entra > 0.9) {
      const lineas = [hover.etiqueta.toUpperCase()];
      if (hover.ip) lineas.push(hover.ip);
      lineas.push(hover.tipo === "hoja" ? "pulsa para abrir" : hover.vis ? "comprometido ✓" : "sin explorar — pulsa");
      cajaTexto(hover, lineas, hover.vis || hover.tipo === "hoja" ? AGUA : ALERTA);
    }

    requestAnimationFrame(dibujar);
  }

  function dibujarCore(n: N, e: number, t: number) {
    const r = n.r * e;
    // anillo exterior girando
    ctx.strokeStyle = rgba(AGUA, 0.45 * e);
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.arc(n.x, n.y, r + 11 + Math.sin(t * 0.002) * 1.5, t * 0.0004, t * 0.0004 + TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    // hexágono
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + (reducido ? 0 : t * 0.0002);
      const x = n.x + Math.cos(a) * r, y = n.y + Math.sin(a) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = rgba(n.vis ? AGUA : NOCHE, n.vis ? 0.9 : 0.85);
    ctx.fill();
    ctx.strokeStyle = rgba(AGUA, 1);
    ctx.lineWidth = hover === n ? 2.5 : 1.6;
    ctx.stroke();
    ctx.lineWidth = 1;
    texto("M", n.x, n.y + 6, 17, n.vis ? rgba(NOCHE, 1) : rgba(AGUA, 1), "center", "700");
    texto("MILLER", n.x, n.y + r + 28, 11, rgba(LUZ, e), "center", "700");
    if (n.ip) texto(n.ip, n.x, n.y + r + 41, 9.5, rgba(NIEBLA, e));
  }

  function dibujarHub(n: N, e: number, t: number, foco: boolean) {
    const r = n.r * e;
    ctx.beginPath();
    ctx.moveTo(n.x, n.y - r); ctx.lineTo(n.x + r, n.y); ctx.lineTo(n.x, n.y + r); ctx.lineTo(n.x - r, n.y);
    ctx.closePath();
    ctx.fillStyle = n.vis ? rgba(AGUA, 0.95) : rgba(NOCHE, 0.9);
    ctx.fill();
    ctx.strokeStyle = rgba(n.vis ? AGUA : AGUA, foco ? 1 : 0.8);
    ctx.lineWidth = foco ? 2.4 : 1.5;
    ctx.stroke();
    ctx.lineWidth = 1;
    if (!n.vis) {
      // punto rojo parpadeante: objetivo pendiente
      const a = reducido ? 0.9 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.005 + n.fase));
      ctx.fillStyle = rgba(ALERTA, a);
      ctx.beginPath(); ctx.arc(n.x, n.y, 2.6, 0, TAU); ctx.fill();
    }
    if (foco || activo === n.abre) corchetes(n, r + 9, n.vis ? AGUA : ALERTA, t);
    texto(n.etiqueta.toUpperCase(), n.x, n.y + r + 17, 10.5, rgba(LUZ, e * (foco ? 1 : 0.85)), "center", "700");
    if (n.ip) texto(n.ip, n.x, n.y + r + 29, 9, rgba(NIEBLA, e));
  }

  function dibujarHoja(n: N, e: number, foco: boolean) {
    const r = n.r * e;
    const lleno = n.vis;
    ctx.strokeStyle = rgba(foco ? AGUA : n.forma === "punto" ? NIEBLA : AGUA, foco ? 1 : 0.75);
    ctx.fillStyle = lleno || n.forma === "punto" ? rgba(foco || lleno ? AGUA : NIEBLA, lleno ? 0.9 : 0.8) : rgba(NOCHE, 0.9);
    ctx.lineWidth = foco ? 2 : 1.2;
    ctx.beginPath();
    if (n.forma === "cuadro") ctx.rect(n.x - r * 0.75, n.y - r * 0.75, r * 1.5, r * 1.5);
    else ctx.arc(n.x, n.y, n.forma === "punto" ? r * 0.5 : r * 0.7, 0, TAU);
    ctx.fill();
    if (n.forma !== "punto") ctx.stroke();
    ctx.lineWidth = 1;
    // etiqueta: proyectos siempre; el resto cuando el padre está en foco
    const padreEnFoco = n.padre && (hover?.id === n.padre || hover?.padre === n.padre || activo === n.padre || resaltado === n.padre);
    if (n.forma === "cuadro" || foco || padreEnFoco) {
      texto(n.etiqueta, n.x, n.y + r + 13, 9.5, rgba(foco ? LUZ : NIEBLA, e * (foco ? 1 : 0.95)));
    }
  }

  function corchetes(n: N, r: number, color: string, t: number) {
    const a = reducido ? 0 : t * 0.0008;
    ctx.strokeStyle = rgba(color, 0.95);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const ang = a + (i * TAU) / 4;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, ang - 0.28, ang + 0.28);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  function cajaTexto(n: N, lineas: string[], color: string) {
    ctx.font = `500 10px ${FUENTE}`;
    const ancho = Math.max(...lineas.map((l) => ctx.measureText(l).width)) + 22;
    const alto = lineas.length * 14 + 12;
    const p = aPantalla(n);
    const rr = n.r * v.k;
    let x = p.x + rr + 16, y = p.y - alto / 2;
    if (x + ancho > w - 6) x = p.x - rr - 16 - ancho;
    y = Math.max(6, Math.min(h - alto - 6, y));
    ctx.fillStyle = rgba(NOCHE, 0.94);
    ctx.fillRect(x, y, ancho, alto);
    ctx.strokeStyle = rgba(color, 0.8);
    ctx.strokeRect(x + 0.5, y + 0.5, ancho, alto);
    ctx.fillStyle = rgba(color, 1);
    ctx.fillRect(x, y, 3, alto);
    lineas.forEach((l, i) => texto(l, x + 12, y + 15 + i * 14, 10, rgba(i === 0 ? LUZ : i === 1 ? NIEBLA : color, 1), "left", i === 0 ? "700" : "500"));
  }

  /* ---------- puntero ---------- */
  // x, y en coordenadas de pantalla
  function bajo(x: number, y: number): N | null {
    let mejor: N | null = null, md = Infinity;
    for (const n of nodos) {
      if (n.entra < 0.6) continue;
      const p = aPantalla(n);
      const rr = Math.max(n.r * v.k + 9, 17);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < rr && d < md) { mejor = n; md = d; }
    }
    return mejor;
  }
  const local = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function cursor() {
    canvas.style.cursor = hover ? "pointer" : pan?.mov ? "grabbing" : "crosshair";
  }
  function cambiarHover(n: N | null) {
    if (n === hover) return;
    hover = n;
    cursor();
    o.onHover?.(n ? n.id : null);
  }

  // Punteros activos: 1 = arrastrar nodo o desplazar el mapa · 2 = pellizco (zoom)
  const punteros = new Map<number, { x: number; y: number }>();
  let pan: { mov: boolean; x0: number; y0: number } | null = null;
  let pinch: { d: number } | null = null;
  const separacion = () => {
    const [a, b] = [...punteros.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  canvas.addEventListener("pointermove", (e) => {
    const p = local(e);
    ptr.x = p.x; ptr.y = p.y; ptr.dentro = true;
    const prev = punteros.get(e.pointerId);
    if (prev) punteros.set(e.pointerId, p);
    if (pinch && punteros.size === 2) {
      const s = separacion();
      if (pinch.d > 0) zoomPor(s.d / pinch.d, s.x, s.y);
      pinch.d = s.d;
      return;
    }
    if (arrastre) {
      if (Math.hypot(p.x - arrastre.ox, p.y - arrastre.oy) > 5) arrastre.mov = true;
      if (arrastre.mov) {
        const pw = aMundo(p.x, p.y);
        arrastre.n.x = pw.x; arrastre.n.y = pw.y; arrastre.n.vx = arrastre.n.vy = 0;
      }
      return;
    }
    if (pan && prev) {
      if (!pan.mov && Math.hypot(p.x - pan.x0, p.y - pan.y0) > 4) { pan.mov = true; cursor(); }
      if (pan.mov) {
        tv.x += p.x - prev.x; tv.y += p.y - prev.y;
        limitar(tv);
        v.x = tv.x; v.y = tv.y;
      }
      return;
    }
    cambiarHover(bajo(p.x, p.y));
  });
  canvas.addEventListener("pointerleave", () => {
    if (!arrastre && !pan) { ptr.dentro = false; cambiarHover(null); }
  });
  canvas.addEventListener("pointerdown", (e) => {
    const p = local(e);
    ptr.x = p.x; ptr.y = p.y; ptr.dentro = true;
    punteros.set(e.pointerId, p);
    canvas.setPointerCapture(e.pointerId);
    if (punteros.size === 2) { arrastre = null; pan = null; pinch = { d: separacion().d }; return; }
    const n = bajo(p.x, p.y);
    cambiarHover(n);
    if (n) arrastre = { n, ox: p.x, oy: p.y, mov: false };
    else pan = { mov: false, x0: p.x, y0: p.y };
  });
  const soltar = (e: PointerEvent) => {
    punteros.delete(e.pointerId);
    if (punteros.size < 2) pinch = null;
    if (pan) { pan = null; cursor(); }
    if (arrastre) {
      const { n, mov } = arrastre;
      arrastre = null;
      if (e.type === "pointerup" && !mov) o.onAbrir(n.abre, n.id);
    }
    if (e.pointerType !== "mouse") { ptr.dentro = false; cambiarHover(null); }
  };
  canvas.addEventListener("pointerup", soltar);
  canvas.addEventListener("pointercancel", soltar);

  // Rueda del ratón (y pellizco del trackpad): zoom hacia el puntero
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const p = local(e);
      const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
      const dy = Math.max(-120, Math.min(120, e.deltaY * px));
      zoomPor(Math.exp(-dy * 0.0018), p.x, p.y);
    },
    { passive: false },
  );
  // Doble clic en el vacío: vuelve a la vista inicial
  canvas.addEventListener("dblclick", (e) => {
    const p = local(e);
    if (!bajo(p.x, p.y)) reiniciarVista();
  });

  /* ---------- arranque ---------- */
  new ResizeObserver(medir).observe(canvas);
  medir();
  canvas.style.cursor = "crosshair";
  canvas.style.touchAction = "none";
  requestAnimationFrame(dibujar);

  return {
    /** Empieza a mostrar los nodos (tras la intro). La cámara arranca alejada y se acerca. */
    iniciar() {
      iniciado = true;
      t0 = performance.now();
      if (!reducido) { v.k = 0.55; v.x = w * 0.225; v.y = h * 0.225; }
    },
    /** Marca un nodo como comprometido (relleno agua). */
    setVisitado(id: string) { const n = porId.get(id); if (n) { n.vis = true; n.pulso = 1; } },
    /** Expediente abierto (corchetes girando alrededor del nodo). */
    setActivo(abre: string | null) { activo = abre; },
    /** Resalta un nodo desde fuera (lista de objetivos). */
    resaltar(id: string | null) { resaltado = id; },
    /** Zoom desde fuera (botones + / −). */
    zoom(f: number) { zoomPor(f); },
    /** Vuelve a la vista inicial. */
    reiniciarVista,
  };
}
