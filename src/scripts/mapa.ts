// El mapa de red en 3D: una constelación de hosts que flota alrededor del
// núcleo. Cada nodo tiene (x, y, z); una cámara orbital (giro + inclinación +
// distancia) los proyecta con perspectiva sobre un canvas 2D. Sin librerías.
//
// Arrastra el fondo para girar la red, la rueda acerca la cámara, un nodo se
// pulsa (abre su expediente) o se arrastra. Un radar barre el plano del suelo
// y "pinga" cada host al pasar; los paquetes viajan por los enlaces.

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

const ZOOM_MIN = 0.55;
const ZOOM_MAX = 2.6;
const FOCAL = 3.2; // con zoom ×1 la cámara está a esta distancia del núcleo
const RADIO = 1.5; // radio máximo del mundo (en unidades)
const VISTA = { yaw: 0.6, pitch: 0.38, k: 1 };

type N = NodoDef & {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  fx: number; fy: number; fz: number;
  r: number; vis: boolean; pulso: number; entra: number; fase: number;
  // proyección de este fotograma
  sx: number; sy: number; sz: number; p: number; ok: boolean;
};
type Paquete = { e: number; t: number; v: number; dir: 1 | -1 };
type Punto = { x: number; y: number; d: number; p: number; ok: boolean };

// Mismos valores que en global.css (@theme)
const AGUA = "110,231,183";
const ALERTA = "255,59,92";
const LUZ = "214,232,224";
const NIEBLA = "111,140,130";
const NOCHE = "5,10,12";
const FUENTE = '"JetBrains Mono", ui-monospace, Consolas, monospace';
const TAU = Math.PI * 2;
const lim = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// Generador pseudoaleatorio con semilla: el mapa sale igual en cada visita
function semilla(s: number) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function crearMapa(o: MapaOpts) {
  const { canvas, reducido } = o;
  const ctx = canvas.getContext("2d")!;
  let w = 0, h = 0, dpr = 1;
  let iniciado = false, t0 = 0, ultimo = 0, sweep = 0, ultimoMov = -9999;
  let hover: N | null = null;
  let activo: string | null = null;
  let resaltado: string | null = null; // desde la lista de objetivos
  let autoGiro = true;
  const ptr = { x: 0, y: 0, dentro: false };
  let arrastre: { n: N; ox: number; oy: number; mov: boolean } | null = null;
  // si hay un filtro encima del canvas que deforma la imagen (CRT), corrige el puntero
  let deform: ((x: number, y: number, w: number, h: number) => { x: number; y: number }) | null = null;

  /* ---------- cámara orbital ---------- */
  // `cam` es la vista actual y `tcam` la objetivo: la cámara se desliza de una a la otra.
  const cam = { ...VISTA };
  const tcam = { ...VISTA };
  let cx = 0, cy = 0, U = 1; // centro de proyección y unidad en píxeles
  let margen = 0, tmargen = 0; // espacio tapado por el expediente (a la derecha)
  let D = FOCAL; // distancia de la cámara al núcleo
  const rot = { cy: 1, sy: 0, cp: 1, sp: 0 };
  let vYaw = 0, vPitch = 0; // inercia del giro

  function preparar() {
    rot.cy = Math.cos(cam.yaw); rot.sy = Math.sin(cam.yaw);
    rot.cp = Math.cos(cam.pitch); rot.sp = Math.sin(cam.pitch);
    D = FOCAL / cam.k;
    U = Math.min(w, h) * 0.4;
    cx = (w - margen) / 2;
    cy = h * 0.5;
  }
  /** Proyecta un punto del mundo a la pantalla (con perspectiva). */
  function proy(x: number, y: number, z: number, s: Punto) {
    const x1 = x * rot.cy + z * rot.sy;
    const z1 = -x * rot.sy + z * rot.cy;
    const y2 = y * rot.cp - z1 * rot.sp;
    const z2 = y * rot.sp + z1 * rot.cp;
    const prof = D + z2;
    s.ok = prof > 0.18;
    s.p = s.ok ? FOCAL / prof : 0;
    s.x = cx + x1 * U * s.p;
    s.y = cy + y2 * U * s.p;
    s.d = z2;
    return s;
  }
  /** Lo contrario: un punto de la pantalla a una profundidad dada, de vuelta al mundo. */
  function aMundo(sx: number, sy: number, z2: number) {
    const p = FOCAL / (D + z2);
    const x1 = (sx - cx) / (U * p);
    const y2 = (sy - cy) / (U * p);
    const y = y2 * rot.cp + z2 * rot.sp;
    const z1 = -y2 * rot.sp + z2 * rot.cp;
    return { x: x1 * rot.cy - z1 * rot.sy, y, z: x1 * rot.sy + z1 * rot.cy };
  }
  // los nodos lejanos se ven más tenues
  const prof = (d: number) => 1 - 0.6 * lim((d + 1.3) / 2.6, 0, 1);

  function zoomPor(f: number) {
    tcam.k = lim(tcam.k * f, ZOOM_MIN, ZOOM_MAX);
    if (reducido) cam.k = tcam.k;
    o.onZoom?.(tcam.k);
  }
  function reiniciarVista() {
    tcam.yaw += wrap(VISTA.yaw - tcam.yaw);
    tcam.pitch = VISTA.pitch;
    tcam.k = VISTA.k;
    vYaw = vPitch = 0;
    if (reducido) Object.assign(cam, tcam);
    o.onZoom?.(tcam.k);
  }
  const wrap = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

  /* ---------- nodos ---------- */
  const nodos: N[] = o.nodos.map((d) => ({
    ...d,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fx: 0, fy: 0, fz: 0,
    r: d.tipo === "core" ? 24 : d.tipo === "hub" ? 12 : d.forma === "punto" ? 5 : 8,
    vis: false, pulso: 0, entra: 0, fase: Math.random() * TAU,
    sx: 0, sy: 0, sz: 0, p: 1, ok: true,
  }));
  const porId = new Map(nodos.map((n) => [n.id, n]));
  const enlaces = o.enlaces.map(([a, b]) => [porId.get(a)!, porId.get(b)!] as [N, N]);
  const paquetes: Paquete[] = [];
  const core = nodos.find((n) => n.tipo === "core")!;
  const hubs = nodos.filter((n) => n.tipo === "hub");

  // polvo de fondo: da sensación de profundidad al girar
  const rnd = semilla(7);
  const polvo = Array.from({ length: 130 }, () => {
    const u = rnd() * 2 - 1, a = rnd() * TAU, r = Math.sqrt(1 - u * u), m = 1.6 + rnd() * 1.8;
    return [Math.cos(a) * r * m, u * m * 0.75, Math.sin(a) * r * m] as const;
  });

  function colocar() {
    core.x = core.y = core.z = 0;
    hubs.forEach((hb, i) => {
      // los hubs se reparten por una esfera (espiral de Fibonacci)
      const y = 1 - ((i + 0.5) / hubs.length) * 2;
      const rr = Math.sqrt(1 - y * y), a = i * 2.399963;
      hb.x = Math.cos(a) * rr * 0.7; hb.y = y * 0.55; hb.z = Math.sin(a) * rr * 0.7;
      nodos.filter((n) => n.padre === hb.id).forEach((hj) => {
        const u = rnd() * 2 - 1, b = rnd() * TAU, q = Math.sqrt(1 - u * u);
        hj.x = hb.x + Math.cos(b) * q * 0.28; hj.y = hb.y + u * 0.28; hj.z = hb.z + Math.sin(b) * q * 0.28;
      });
    });
    for (let i = 0; i < 320; i++) paso(1, true); // que arranque ya asentado
    nodos.forEach((n) => { n.vx = n.vy = n.vz = 0; });
  }

  function medir() {
    const nw = canvas.clientWidth, nh = canvas.clientHeight;
    if (!nw || !nh) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(nw * dpr);
    canvas.height = Math.round(nh * dpr);
    w = nw; h = nh;
  }

  /* ---------- física (en 3D) ---------- */
  function paso(dt: number, frio = false) {
    const Lh = 0.7, Ll = 0.3;
    for (const n of nodos) { n.fx = 0; n.fy = 0; n.fz = 0; }

    // repulsión entre todos los pares
    for (let i = 0; i < nodos.length; i++) {
      for (let j = i + 1; j < nodos.length; j++) {
        const a = nodos[i], b = nodos[j];
        let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d2 = dx * dx + dy * dy + dz * dz + 0.004;
        const d = Math.sqrt(d2);
        const f = (a.tipo === "hoja" && b.tipo === "hoja" ? 6e-5 : 1.8e-4) / d2;
        dx /= d; dy /= d; dz /= d;
        a.fx -= dx * f; a.fy -= dy * f; a.fz -= dz * f;
        b.fx += dx * f; b.fy += dy * f; b.fz += dz * f;
      }
    }
    // resortes de los enlaces
    for (const [a, b] of enlaces) {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001;
      const L = a.tipo === "core" || b.tipo === "core" ? Lh : Ll;
      const f = (d - L) * 0.03;
      a.fx += (dx / d) * f; a.fy += (dy / d) * f; a.fz += (dz / d) * f;
      b.fx -= (dx / d) * f; b.fy -= (dy / d) * f; b.fz -= (dz / d) * f;
    }
    for (const n of nodos) {
      // gravedad suave hacia el centro (el núcleo, firme); en vertical, algo más: la red se achata
      const g = n.tipo === "core" ? 0.08 : 0.004;
      n.fx -= n.x * g; n.fy -= n.y * g * 1.8; n.fz -= n.z * g;
      // respiración
      if (!reducido && !frio) {
        n.fx += Math.sin(ultimo * 0.0006 + n.fase) * 1.3e-4;
        n.fy += Math.cos(ultimo * 0.0005 + n.fase * 1.3) * 1.3e-4;
        n.fz += Math.sin(ultimo * 0.0004 + n.fase * 0.7) * 1.3e-4;
      }
    }
    for (const n of nodos) {
      if (arrastre?.n === n) continue;
      const amort = frio ? 0.6 : 0.86;
      n.vx = (n.vx + n.fx * dt) * amort;
      n.vy = (n.vy + n.fy * dt) * amort;
      n.vz = (n.vz + n.fz * dt) * amort;
      n.x += n.vx * dt; n.y += n.vy * dt; n.z += n.vz * dt;
      limitarMundo(n);
    }
  }
  function limitarMundo(n: N) {
    const m = Math.hypot(n.x, n.y, n.z);
    if (m > RADIO) { const f = RADIO / m; n.x *= f; n.y *= f; n.z *= f; }
  }

  /* ---------- dibujo ---------- */
  const rgba = (c: string, a: number) => `rgba(${c},${a})`;
  const salida = (t: number) => 1 - Math.pow(1 - lim(t, 0, 1), 3);
  const cruza = (prev: number, cur: number, a: number) => (cur >= prev ? a > prev && a <= cur : a > prev || a <= cur);
  const Q: Punto = { x: 0, y: 0, d: 0, p: 0, ok: false };
  const Q2: Punto = { x: 0, y: 0, d: 0, p: 0, ok: false };
  const Q3: Punto = { x: 0, y: 0, d: 0, p: 0, ok: false };

  function texto(s: string, x: number, y: number, tam: number, color: string, alinear: CanvasTextAlign = "center", peso = "500") {
    ctx.font = `${peso} ${tam}px ${FUENTE}`;
    ctx.textAlign = alinear;
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  /** Circunferencia en el plano horizontal (el "suelo" del radar). */
  function anillo(R: number, y = 0) {
    const seg = 80;
    ctx.beginPath();
    let mover = true;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU;
      proy(Math.cos(a) * R, y, Math.sin(a) * R, Q);
      if (!Q.ok) { mover = true; continue; }
      if (mover) ctx.moveTo(Q.x, Q.y); else ctx.lineTo(Q.x, Q.y);
      mover = false;
    }
    ctx.stroke();
  }

  function dibujar(ahora: number) {
    const dt = Math.min(2, (ahora - (ultimo || ahora)) / 16.67);
    const prevSweep = sweep;
    ultimo = ahora;
    if (!reducido) sweep = (sweep + dt * 0.0105) % TAU;
    paso(dt);
    const t = ahora - t0;

    // --- cámara ---
    const sobreNodo = hover || arrastre;
    if (!reducido) {
      if (giro?.mov) {
        // el giro lo manda el puntero
      } else if (Math.abs(vYaw) > 1e-4 || Math.abs(vPitch) > 1e-4) {
        tcam.yaw += vYaw * dt;
        tcam.pitch = lim(tcam.pitch + vPitch * dt, -1.3, 1.3);
        const fr = Math.pow(0.93, dt);
        vYaw *= fr; vPitch *= fr;
      } else if (autoGiro && !activo && !sobreNodo && !pinch) {
        // giro lento de reposo; casi parado mientras el puntero se mueve sobre el mapa
        const quieto = ahora - ultimoMov > 1600;
        tcam.yaw -= 0.0013 * dt * (quieto ? 1 : 0.2);
      }
    }
    const enIntro = iniciado && t < 2400;
    const suave = reducido ? 1 : giro?.mov ? 0.6 : Math.min(1, (enIntro ? 0.05 : 0.14) * dt);
    cam.yaw += (tcam.yaw - cam.yaw) * suave;
    cam.pitch += (tcam.pitch - cam.pitch) * suave;
    cam.k += (tcam.k - cam.k) * suave;
    margen += (tmargen - margen) * Math.min(1, 0.12 * dt);
    if (Math.abs(tcam.k - cam.k) < 0.0005) cam.k = tcam.k;
    preparar();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    // entrada escalonada de los nodos
    nodos.forEach((n, i) => { n.entra = iniciado ? lim((t - i * 55) / 500, 0, 1) : 0; });

    // proyección de todos los nodos
    for (const n of nodos) {
      proy(n.x, n.y, n.z, Q);
      n.sx = Q.x; n.sy = Q.y; n.sz = Q.d; n.p = Q.p; n.ok = Q.ok;
    }

    // --- polvo de fondo ---
    ctx.fillStyle = rgba(AGUA, 1);
    for (const [x, y, z] of polvo) {
      proy(x, y, z, Q);
      if (!Q.ok || Q.x < 0 || Q.x > w || Q.y < 0 || Q.y > h) continue;
      ctx.globalAlpha = 0.07 + 0.22 * prof(Q.d);
      ctx.fillRect(Q.x, Q.y, Q.p > 1.1 ? 2 : 1, Q.p > 1.1 ? 2 : 1);
    }
    ctx.globalAlpha = 1;

    // --- radar: el suelo con anillos, el eje vertical y el barrido ---
    if (iniciado) {
      ctx.strokeStyle = rgba(AGUA, 0.08);
      ctx.setLineDash([2, 7]);
      for (const R of [0.5, 0.95, 1.4]) anillo(R);
      ctx.setLineDash([]);
      // eje vertical con marcas
      ctx.strokeStyle = rgba(AGUA, 0.1);
      proy(0, -1.25, 0, Q); proy(0, 1.25, 0, Q2);
      if (Q.ok && Q2.ok) { ctx.beginPath(); ctx.moveTo(Q.x, Q.y); ctx.lineTo(Q2.x, Q2.y); ctx.stroke(); }
      if (!reducido) {
        const R = 1.4, N = 16, ancho = 1.1;
        for (let i = 0; i < N; i++) {
          const a0 = sweep - ancho + (ancho * i) / N, a1 = sweep - ancho + (ancho * (i + 1)) / N;
          proy(0, 0, 0, Q); proy(Math.cos(a0) * R, 0, Math.sin(a0) * R, Q2); proy(Math.cos(a1) * R, 0, Math.sin(a1) * R, Q3);
          if (!Q.ok || !Q2.ok || !Q3.ok) break;
          ctx.fillStyle = rgba(AGUA, 0.12 * Math.pow((i + 1) / N, 1.8));
          ctx.beginPath(); ctx.moveTo(Q.x, Q.y); ctx.lineTo(Q2.x, Q2.y); ctx.lineTo(Q3.x, Q3.y); ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = rgba(AGUA, 0.3);
        proy(0, 0, 0, Q); proy(Math.cos(sweep) * R, 0, Math.sin(sweep) * R, Q2);
        if (Q.ok && Q2.ok) { ctx.beginPath(); ctx.moveTo(Q.x, Q.y); ctx.lineTo(Q2.x, Q2.y); ctx.stroke(); }
        // el radar "pinga" cada host al pasar
        for (const n of nodos) {
          if (n === core) continue;
          const a = (Math.atan2(n.z, n.x) + TAU) % TAU;
          if (cruza(prevSweep, sweep, a)) n.pulso = 1;
        }
      }
      // plomadas: una línea de cada hub al suelo, para leer la altura
      ctx.setLineDash([1, 4]);
      for (const n of hubs) {
        if (n.entra <= 0 || !n.ok) continue;
        proy(n.x, 0, n.z, Q);
        if (!Q.ok) continue;
        ctx.strokeStyle = rgba(AGUA, 0.16 * n.entra * prof(n.sz));
        ctx.beginPath(); ctx.moveTo(n.sx, n.sy); ctx.lineTo(Q.x, Q.y); ctx.stroke();
        ctx.fillStyle = rgba(AGUA, 0.3 * n.entra);
        ctx.fillRect(Q.x - 1.5, Q.y - 1, 3, 2);
      }
      ctx.setLineDash([]);
    }

    // --- enlaces ---
    for (const [a, b] of enlaces) {
      const k = Math.min(a.entra, b.entra);
      if (k <= 0 || !a.ok || !b.ok) continue;
      const foco = hover === a || hover === b || activo === a.abre || activo === b.abre || resaltado === a.id || resaltado === b.id;
      const alt = a.vis || b.vis;
      const hoja = a.tipo === "hoja" || b.tipo === "hoja";
      ctx.strokeStyle = rgba(AGUA, (foco ? 0.7 : alt ? 0.36 : 0.17) * k * prof((a.sz + b.sz) / 2));
      ctx.setLineDash(hoja ? [3, 5] : []);
      ctx.lineDashOffset = reducido ? 0 : -t * 0.012;
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    ctx.setLineDash([]);

    // --- paquetes viajando por los enlaces ---
    if (iniciado && !reducido) {
      if (paquetes.length < 18 && Math.random() < 0.07) {
        paquetes.push({ e: (Math.random() * enlaces.length) | 0, t: 0, v: 0.004 + Math.random() * 0.01, dir: Math.random() < 0.5 ? 1 : -1 });
      }
      for (let i = paquetes.length - 1; i >= 0; i--) {
        const pk = paquetes[i];
        pk.t += pk.v * dt;
        if (pk.t >= 1) { paquetes.splice(i, 1); continue; }
        const [a, b] = enlaces[pk.e];
        const u = pk.dir === 1 ? pk.t : 1 - pk.t;
        proy(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u, Q);
        if (!Q.ok) continue;
        const f = prof(Q.d), s = Math.max(2, 3 * Q.p);
        ctx.fillStyle = rgba(AGUA, 0.9 * f);
        ctx.fillRect(Q.x - s / 2, Q.y - s / 2, s, s);
        const u2 = pk.dir === 1 ? Math.max(0, u - 0.05) : Math.min(1, u + 0.05);
        proy(a.x + (b.x - a.x) * u2, a.y + (b.y - a.y) * u2, a.z + (b.z - a.z) * u2, Q);
        ctx.fillStyle = rgba(AGUA, 0.25 * f);
        ctx.fillRect(Q.x - s / 3, Q.y - s / 3, s / 1.5, s / 1.5);
      }
    }

    // --- nodos: de los lejanos a los cercanos ---
    const orden = nodos.filter((n) => n.entra > 0 && n.ok).sort((a, b) => b.sz - a.sz);
    for (const n of orden) {
      const e = salida(n.entra);
      const foco = hover === n || (activo === n.abre && n.tipo !== "hoja") || activo === n.id || resaltado === n.id;
      ctx.globalAlpha = foco ? 1 : prof(n.sz);

      // onda del ping
      if (n.pulso > 0) {
        ctx.strokeStyle = rgba(n.vis ? AGUA : ALERTA, n.pulso * 0.5);
        ctx.beginPath(); ctx.arc(n.sx, n.sy, (n.r + (1 - n.pulso) * 22) * n.p, 0, TAU); ctx.stroke();
        n.pulso = Math.max(0, n.pulso - dt * 0.022);
      }

      if (n.tipo === "core") dibujarCore(n, e, t);
      else if (n.tipo === "hub") dibujarHub(n, e, t, foco);
      else dibujarHoja(n, e, foco);
    }
    ctx.globalAlpha = 1;

    // --- retículo y fichas ---
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
      const deg = (r: number) => Math.round((((r * 180) / Math.PI) % 360 + 360) % 360);
      texto(`az:${deg(cam.yaw)}° el:${Math.round((cam.pitch * 180) / Math.PI)}° ×${cam.k.toFixed(1)}`, ptr.x + 16, ptr.y - 12, 9.5, rgba(NIEBLA, 0.9), "left");
    }

    // --- ficha del nodo bajo el puntero ---
    if (hover && hover.entra > 0.9 && hover.ok) {
      const lineas = [hover.etiqueta.toUpperCase()];
      if (hover.ip) lineas.push(hover.ip);
      lineas.push(hover.tipo === "hoja" ? "pulsa para abrir" : hover.vis ? "comprometido ✓" : "sin explorar — pulsa");
      cajaTexto(hover, lineas, hover.vis || hover.tipo === "hoja" ? AGUA : ALERTA);
    }

    requestAnimationFrame(dibujar);
  }

  // tamaño de texto y separaciones según la perspectiva
  const esc = (n: N) => lim(n.p, 0.8, 1.3);

  function dibujarCore(n: N, e: number, t: number) {
    const r = n.r * e * n.p, s = esc(n);
    // anillo exterior girando
    ctx.strokeStyle = rgba(AGUA, 0.45 * e);
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.arc(n.sx, n.sy, r + 11 * n.p + Math.sin(t * 0.002) * 1.5, t * 0.0004, t * 0.0004 + TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    // hexágono
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + (reducido ? 0 : t * 0.0002);
      const x = n.sx + Math.cos(a) * r, y = n.sy + Math.sin(a) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = rgba(n.vis ? AGUA : NOCHE, n.vis ? 0.9 : 0.85);
    ctx.fill();
    ctx.strokeStyle = rgba(AGUA, 1);
    ctx.lineWidth = hover === n ? 2.5 : 1.6;
    ctx.stroke();
    ctx.lineWidth = 1;
    texto("M", n.sx, n.sy + 6 * s, 17 * s, n.vis ? rgba(NOCHE, 1) : rgba(AGUA, 1), "center", "700");
    texto("MILLER", n.sx, n.sy + r + 28 * s, 11 * s, rgba(LUZ, e), "center", "700");
    if (n.ip) texto(n.ip, n.sx, n.sy + r + 41 * s, 9.5 * s, rgba(NIEBLA, e));
  }

  function dibujarHub(n: N, e: number, t: number, foco: boolean) {
    const r = n.r * e * n.p, s = esc(n);
    ctx.beginPath();
    ctx.moveTo(n.sx, n.sy - r); ctx.lineTo(n.sx + r, n.sy); ctx.lineTo(n.sx, n.sy + r); ctx.lineTo(n.sx - r, n.sy);
    ctx.closePath();
    ctx.fillStyle = n.vis ? rgba(AGUA, 0.95) : rgba(NOCHE, 0.9);
    ctx.fill();
    ctx.strokeStyle = rgba(AGUA, foco ? 1 : 0.8);
    ctx.lineWidth = foco ? 2.4 : 1.5;
    ctx.stroke();
    ctx.lineWidth = 1;
    if (!n.vis) {
      // punto rojo parpadeante: objetivo pendiente
      const a = reducido ? 0.9 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.005 + n.fase));
      ctx.fillStyle = rgba(ALERTA, a);
      ctx.beginPath(); ctx.arc(n.sx, n.sy, 2.6 * s, 0, TAU); ctx.fill();
    }
    if (foco || activo === n.abre) corchetes(n, r + 9 * s, n.vis ? AGUA : ALERTA, t);
    texto(n.etiqueta.toUpperCase(), n.sx, n.sy + r + 17 * s, 10.5 * s, rgba(LUZ, e * (foco ? 1 : 0.85)), "center", "700");
    if (n.ip) texto(n.ip, n.sx, n.sy + r + 29 * s, 9 * s, rgba(NIEBLA, e));
  }

  function dibujarHoja(n: N, e: number, foco: boolean) {
    const r = n.r * e * n.p, s = esc(n);
    const lleno = n.vis;
    ctx.strokeStyle = rgba(foco ? AGUA : n.forma === "punto" ? NIEBLA : AGUA, foco ? 1 : 0.75);
    ctx.fillStyle = lleno || n.forma === "punto" ? rgba(foco || lleno ? AGUA : NIEBLA, lleno ? 0.9 : 0.8) : rgba(NOCHE, 0.9);
    ctx.lineWidth = foco ? 2 : 1.2;
    ctx.beginPath();
    if (n.forma === "cuadro") ctx.rect(n.sx - r * 0.75, n.sy - r * 0.75, r * 1.5, r * 1.5);
    else ctx.arc(n.sx, n.sy, n.forma === "punto" ? r * 0.5 : r * 0.7, 0, TAU);
    ctx.fill();
    if (n.forma !== "punto") ctx.stroke();
    ctx.lineWidth = 1;
    // etiqueta: proyectos siempre; el resto cuando el padre está en foco
    const padreEnFoco = n.padre && (hover?.id === n.padre || hover?.padre === n.padre || activo === n.padre || resaltado === n.padre);
    if (n.forma === "cuadro" || foco || padreEnFoco) {
      texto(n.etiqueta, n.sx, n.sy + r + 13 * s, 9.5 * s, rgba(foco ? LUZ : NIEBLA, e * (foco ? 1 : 0.95)));
    }
  }

  function corchetes(n: N, r: number, color: string, t: number) {
    const a = reducido ? 0 : t * 0.0008;
    ctx.strokeStyle = rgba(color, 0.95);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const ang = a + (i * TAU) / 4;
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, r, ang - 0.28, ang + 0.28);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  function cajaTexto(n: N, lineas: string[], color: string) {
    ctx.globalAlpha = 1;
    ctx.font = `500 10px ${FUENTE}`;
    const ancho = Math.max(...lineas.map((l) => ctx.measureText(l).width)) + 22;
    const alto = lineas.length * 14 + 12;
    const rr = n.r * n.p;
    let x = n.sx + rr + 16, y = n.sy - alto / 2;
    if (x + ancho > w - 6) x = n.sx - rr - 16 - ancho;
    y = lim(y, 6, h - alto - 6);
    ctx.fillStyle = rgba(NOCHE, 0.94);
    ctx.fillRect(x, y, ancho, alto);
    ctx.strokeStyle = rgba(color, 0.8);
    ctx.strokeRect(x + 0.5, y + 0.5, ancho, alto);
    ctx.fillStyle = rgba(color, 1);
    ctx.fillRect(x, y, 3, alto);
    lineas.forEach((l, i) => texto(l, x + 12, y + 15 + i * 14, 10, rgba(i === 0 ? LUZ : i === 1 ? NIEBLA : color, 1), "left", i === 0 ? "700" : "500"));
  }

  /* ---------- puntero ---------- */
  // x, y en coordenadas de pantalla; gana el nodo más cercano a la cámara
  function bajo(x: number, y: number): N | null {
    let mejor: N | null = null;
    for (const n of nodos) {
      if (n.entra < 0.6 || !n.ok) continue;
      const rr = Math.max(n.r * n.p + 9, 17);
      if (Math.hypot(n.sx - x, n.sy - y) < rr && (!mejor || n.sz < mejor.sz)) mejor = n;
    }
    return mejor;
  }
  const local = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    return deform ? deform(x, y, r.width, r.height) : { x, y };
  };
  function cursor() {
    canvas.style.cursor = hover ? "pointer" : giro?.mov ? "grabbing" : "grab";
  }
  function cambiarHover(n: N | null) {
    if (n === hover) return;
    hover = n;
    cursor();
    o.onHover?.(n ? n.id : null);
  }

  // Punteros activos: 1 = arrastrar nodo o girar la red · 2 = pellizco (zoom)
  const punteros = new Map<number, { x: number; y: number }>();
  let giro: { mov: boolean; x0: number; y0: number } | null = null;
  let pinch: { d: number } | null = null;
  const separacion = () => {
    const [a, b] = [...punteros.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) };
  };

  canvas.addEventListener("pointermove", (e) => {
    const p = local(e);
    ptr.x = p.x; ptr.y = p.y; ptr.dentro = true;
    ultimoMov = performance.now();
    const prev = punteros.get(e.pointerId);
    if (prev) punteros.set(e.pointerId, p);
    if (pinch && punteros.size === 2) {
      const s = separacion();
      if (pinch.d > 0) zoomPor(s.d / pinch.d);
      pinch.d = s.d;
      return;
    }
    if (arrastre) {
      if (Math.hypot(p.x - arrastre.ox, p.y - arrastre.oy) > 5) arrastre.mov = true;
      if (arrastre.mov) {
        // el nodo se mueve en el plano de la pantalla, a su misma profundidad
        const n = arrastre.n;
        Object.assign(n, aMundo(p.x, p.y, n.sz));
        limitarMundo(n);
        n.vx = n.vy = n.vz = 0;
      }
      return;
    }
    if (giro && prev) {
      if (!giro.mov && Math.hypot(p.x - giro.x0, p.y - giro.y0) > 4) { giro.mov = true; cursor(); }
      if (giro.mov) {
        const dx = p.x - prev.x, dy = p.y - prev.y;
        tcam.yaw -= dx * 0.0062;
        tcam.pitch = lim(tcam.pitch + dy * 0.0062, -1.3, 1.3);
        // la inercia sigue la velocidad del gesto
        vYaw = vYaw * 0.5 - dx * 0.0062 * 0.5;
        vPitch = vPitch * 0.5 + dy * 0.0062 * 0.5;
      }
      return;
    }
    cambiarHover(bajo(p.x, p.y));
  });
  canvas.addEventListener("pointerleave", () => {
    if (!arrastre && !giro) { ptr.dentro = false; cambiarHover(null); }
  });
  canvas.addEventListener("pointerdown", (e) => {
    const p = local(e);
    ptr.x = p.x; ptr.y = p.y; ptr.dentro = true;
    ultimoMov = performance.now();
    punteros.set(e.pointerId, p);
    canvas.setPointerCapture(e.pointerId);
    if (punteros.size === 2) { arrastre = null; giro = null; pinch = { d: separacion().d }; return; }
    vYaw = vPitch = 0;
    const n = bajo(p.x, p.y);
    cambiarHover(n);
    if (n) arrastre = { n, ox: p.x, oy: p.y, mov: false };
    else giro = { mov: false, x0: p.x, y0: p.y };
  });
  const soltar = (e: PointerEvent) => {
    punteros.delete(e.pointerId);
    if (punteros.size < 2) pinch = null;
    if (giro) { giro = null; cursor(); }
    if (arrastre) {
      const { n, mov } = arrastre;
      arrastre = null;
      if (e.type === "pointerup" && !mov) o.onAbrir(n.abre, n.id);
    }
    if (e.pointerType !== "mouse") { ptr.dentro = false; cambiarHover(null); }
  };
  canvas.addEventListener("pointerup", soltar);
  canvas.addEventListener("pointercancel", soltar);

  // Rueda del ratón (y pellizco del trackpad): acerca o aleja la cámara
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
      const dy = Math.max(-120, Math.min(120, e.deltaY * px));
      zoomPor(Math.exp(-dy * 0.0018));
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
  colocar();
  canvas.style.cursor = "grab";
  canvas.style.touchAction = "none";
  requestAnimationFrame(dibujar);

  return {
    /** Empieza a mostrar los nodos (tras la intro). La cámara arranca lejos y girando, y se acomoda. */
    iniciar() {
      iniciado = true;
      t0 = performance.now();
      if (!reducido) { cam.k = 0.5; cam.yaw = tcam.yaw + 1.7; cam.pitch = tcam.pitch - 0.35; }
    },
    /** Marca un nodo como comprometido (relleno agua). */
    setVisitado(id: string) { const n = porId.get(id); if (n) { n.vis = true; n.pulso = 1; } },
    /** Expediente abierto: corchetes girando alrededor del nodo y la cámara se pone de cara a él. */
    setActivo(abre: string | null) {
      activo = abre;
      if (!abre) return;
      const n = porId.get(abre) ?? nodos.find((x) => x.abre === abre && x.tipo !== "hoja");
      if (!n || n.tipo === "core" || Math.hypot(n.x, n.z) < 0.05) return;
      vYaw = vPitch = 0;
      tcam.yaw += wrap(Math.atan2(n.x, -n.z) - tcam.yaw);
      tcam.pitch = lim(tcam.pitch, 0.18, 0.5);
      if (reducido) Object.assign(cam, tcam);
    },
    /** Resalta un nodo desde fuera (lista de objetivos). */
    resaltar(id: string | null) { resaltado = id; },
    /** Zoom desde fuera (botones + / −). */
    zoom(f: number) { zoomPor(f); },
    /** Vuelve a la vista inicial. */
    reiniciarVista,
    /** Reserva espacio a la derecha (el expediente): la red se centra en lo que queda visible. */
    setMargenDer(px: number) { tmargen = px; if (reducido) margen = px; },
    /** Giro automático de reposo. Devuelve el estado nuevo. */
    autoGirar(b?: boolean) { autoGiro = b ?? !autoGiro; return autoGiro; },
    /** Corrige las coordenadas del puntero cuando un filtro (CRT) deforma el canvas. */
    setDeformador(f: typeof deform) { deform = f; },
  };
}
