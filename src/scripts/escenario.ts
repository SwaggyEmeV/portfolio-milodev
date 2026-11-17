// =====================================================================
//  EL ESCENARIO: todo lo que se mueve alrededor de la terminal
//  - el SCROLL dirige la terminal: cada tramo de la página es una ETAPA y
//    la terminal teclea sola su comando (y lo rebobina al subir)
//  - palabra gigante de fondo con paralaje, suelo en perspectiva que avanza
//  - foco de luz y brillo del borde que siguen al ratón, ventana con
//    inclinación 3D
//  - tacómetro: las rpm suben con la VELOCIDAD del scroll
// =====================================================================
import { terminal } from "./terminal";

const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;
const punteroFino = matchMedia("(pointer: fine)").matches;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function req<T extends HTMLElement | SVGElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`escenario: falta ${selector}`);
  return el;
}

// Comandos que la terminal teclea al entrar en cada etapa (la 0 es el arranque)
const ETAPAS: { cmds: string[] }[] = [
  { cmds: [] },
  { cmds: ["ps aux"] },
  { cmds: ["cat ~/sobre_mi.md", "cat ~/stack.txt"] },
  { cmds: ["cat ~/garaje/*"] },
  { cmds: ["contacto"] },
];
const N = ETAPAS.length;
const MARCHAS = ["N", "1", "2", "3", "4"];
const NOMBRES = ["home", "proyectos", "sobre_mí", "garaje", "contacto"];
const LARGO_ARCO = 268.08; // 240° de un círculo de radio 64

const raiz = req<HTMLElement>("[data-escenario]");
const ventana = req<HTMLElement>("[data-ventana]");
const rielRelleno = req<HTMLElement>("[data-riel-relleno]");
const ghosts = [...document.querySelectorAll<HTMLElement>("[data-ghost]")];
const pasos = [...document.querySelectorAll<HTMLElement>("[data-paso]")];
const tabs = [...document.querySelectorAll<HTMLElement>("[data-tab]")];
const arco = req<SVGPathElement>("[data-g-arco]");
const aguja = req<SVGElement>("[data-g-aguja]");
const gRpm = req<HTMLElement>("[data-g-rpm]");
const gMarcha = req<HTMLElement>("[data-g-marcha]");
const gNombre = req<HTMLElement>("[data-g-nombre]");
const readout = req<HTMLElement>("[data-readout]");
arco.style.strokeDasharray = String(LARGO_ARCO);

// ---------------------------------------------------------------------
//  ETAPAS: sincroniza la terminal con la etapa que marca el scroll
// ---------------------------------------------------------------------
let objetivo = -1; // etapa que debería verse
let actual = -1; // etapa que la terminal ya muestra
let ocupado = false;

async function sincronizar() {
  ocupado = true;
  while (actual !== objetivo) {
    if (actual < objetivo) {
      const sig = actual + 1;
      // si el visitante se salta etapas de golpe, las intermedias aparecen sin animar
      const animar = !reducir && sig === objetivo;
      await terminal.mostrar(sig, ETAPAS[sig].cmds, () => !animar || objetivo !== sig);
      actual = sig;
    } else {
      await terminal.quitar(actual);
      actual -= 1;
    }
  }
  ocupado = false;
}

function pedirEtapa(n: number) {
  objetivo = n;
  if (!ocupado) void sincronizar();
}

// Posición de scroll (px) del centro de cada etapa
function posicion(i: number) {
  const rango = Math.max(1, raiz.offsetHeight - innerHeight);
  const inicio = scrollY + raiz.getBoundingClientRect().top;
  return i === 0 ? inicio : inicio + ((i + 0.5) / N) * rango;
}
function irA(i: number) {
  scrollTo({ top: posicion(i), behavior: reducir ? "auto" : "smooth" });
}

// Clic en el riel o en la barra tmux: viajar a esa etapa
document.addEventListener("click", (e) => {
  const boton = (e.target as HTMLElement).closest<HTMLElement>("[data-ir]");
  if (boton) irA(Number(boton.dataset.ir));
});

// ---------------------------------------------------------------------
//  RATÓN: foco de luz, brillo del borde e inclinación de la ventana
// ---------------------------------------------------------------------
const mouse = { x: innerWidth / 2, y: innerHeight / 2, cx: innerWidth / 2, cy: innerHeight / 2 };
if (punteroFino && !reducir) {
  addEventListener("pointermove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
}

// ---------------------------------------------------------------------
//  TACÓMETRO: rpm = reposo + velocidad del scroll (+ un golpe con `rev`)
// ---------------------------------------------------------------------
let rpm = 1100;
let golpe = 0;
document.addEventListener("rev", () => (golpe = 11000));

// ---------------------------------------------------------------------
//  BUCLE PRINCIPAL
// ---------------------------------------------------------------------
let etapaVista = -1;
let ultimoY = scrollY;
let ultimoT = performance.now();
let vel = 0;

function cambiarEtapa(n: number) {
  etapaVista = n;
  raiz.dataset.etapaActual = String(n);
  ghosts.forEach((g) => g.classList.toggle("activa", Number(g.dataset.ghost) === n));
  pasos.forEach((p) => {
    const i = Number(p.dataset.paso);
    p.classList.toggle("activa", i === n);
    p.classList.toggle("hecha", i < n);
    p.setAttribute("aria-current", i === n ? "step" : "false");
  });
  tabs.forEach((t) => t.setAttribute("aria-current", Number(t.dataset.tab) === n ? "true" : "false"));
  gMarcha.textContent = MARCHAS[n] ?? "N";
  gNombre.textContent = NOMBRES[n] ?? "home";
  pedirEtapa(n);
}

function frame(ahora: number) {
  const dt = clamp(ahora - ultimoT, 1, 100);
  ultimoT = ahora;

  // progreso del scroll dentro del escenario
  const rango = Math.max(1, raiz.offsetHeight - innerHeight);
  const p = clamp(-raiz.getBoundingClientRect().top / rango, 0, 1);
  const banda = p * N;
  const etapa = Math.min(N - 1, Math.floor(banda));
  const ps = clamp(banda - etapa, 0, 1);
  if (etapa !== etapaVista) cambiarEtapa(etapa);

  // velocidad de scroll (px/ms) suavizada
  const y = scrollY;
  vel += (Math.abs(y - ultimoY) / dt - vel) * 0.1;
  ultimoY = y;

  // rpm: la aguja persigue al objetivo; el golpe de `rev` decae solo
  golpe *= Math.pow(0.5, dt / 600);
  const rpmObjetivo = clamp(1100 + vel * 3500 + golpe, 1100, 12000);
  rpm += (rpmObjetivo - rpm) * 0.12;
  const frac = clamp(rpm / 12000, 0, 1);
  const roja = rpm > 9500;
  arco.style.strokeDashoffset = String(LARGO_ARCO * (1 - frac));
  aguja.style.rotate = `${-120 + frac * 240}deg`;
  gRpm.textContent = String(Math.round(rpm / 50) * 50);
  gRpm.classList.toggle("roja", roja);
  arco.classList.toggle("roja", roja);
  readout.textContent = `${MARCHAS[etapa]} · ${Math.round(rpm / 50) * 50} rpm`;

  // variables CSS que usan los estilos (paralaje, foco, inclinación)
  raiz.style.setProperty("--p", p.toFixed(4));
  raiz.style.setProperty("--ps", ps.toFixed(4));
  // el suelo avanza hacia ti al bajar (la rejilla mide 72px, así que el bucle es continuo)
  raiz.style.setProperty("--suelo", `${((p * 3600) % 72).toFixed(1)}px`);
  rielRelleno.style.height = `${(p * 100).toFixed(2)}%`;

  if (punteroFino && !reducir) {
    mouse.cx += (mouse.x - mouse.cx) * 0.08;
    mouse.cy += (mouse.y - mouse.cy) * 0.08;
    raiz.style.setProperty("--mx", `${mouse.cx.toFixed(1)}px`);
    raiz.style.setProperty("--my", `${mouse.cy.toFixed(1)}px`);
    raiz.style.setProperty("--nx", ((mouse.cx / innerWidth) * 2 - 1).toFixed(3));
    raiz.style.setProperty("--ny", ((mouse.cy / innerHeight) * 2 - 1).toFixed(3));
    const r = ventana.getBoundingClientRect();
    ventana.style.setProperty("--wx", `${(mouse.cx - r.left).toFixed(1)}px`);
    ventana.style.setProperty("--wy", `${(mouse.cy - r.top).toFixed(1)}px`);
  }

  requestAnimationFrame(frame);
}

// --- Arranque: si llegan con un #enlace (/#garaje), saltar a esa etapa
try {
  const datos = JSON.parse(req("#datos-terminal").textContent ?? "{}") as { tabs?: { href: string }[] };
  const i = location.hash ? (datos.tabs ?? []).findIndex((x) => x.href === `/${location.hash}`) : -1;
  if (i > 0) {
    // El navegador restaura el scroll de la visita anterior después de cargar: lo desactivamos
    // y repetimos el salto cuando termina de cargar (el alto de la página ya es el definitivo).
    history.scrollRestoration = "manual";
    scrollTo({ top: posicion(i), behavior: "auto" });
    addEventListener("load", () => scrollTo({ top: posicion(i), behavior: "auto" }), { once: true });
  }
} catch {}

requestAnimationFrame(frame);
