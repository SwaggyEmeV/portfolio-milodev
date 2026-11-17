// =====================================================================
//  EFECTOS DE INTERFAZ (todo lo que no es la escena 3D)
//  intro de arranque · cursor · texto "descifrado" · tacómetro ·
//  barra de progreso · botones magnéticos · aparición al scroll · tilt 3D
// =====================================================================
import { motor, actualizarMotor } from "./motor";

const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;
const conRaton = matchMedia("(pointer: fine)").matches;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------
// 1) INTRO: secuencia de arranque tipo terminal (una vez por sesión)
// ---------------------------------------------------------------------
async function intro() {
  let vista = false;
  try { vista = sessionStorage.getItem("intro-vista") === "1"; } catch {}
  if (vista || reducir) return;
  try { sessionStorage.setItem("intro-vista", "1"); } catch {}

  const capa = document.createElement("div");
  capa.className = "intro";
  capa.innerHTML = `<div class="intro-caja"><pre></pre><p class="intro-saltar">[ clic o tecla para saltar ]</p></div>`;
  document.body.append(capa);
  document.documentElement.classList.add("intro-activa");
  const pre = capa.querySelector("pre")!;

  let saltar = false;
  const fin = () => (saltar = true);
  addEventListener("keydown", fin, { once: true });
  capa.addEventListener("click", fin, { once: true });

  const lineas = [
    "> iniciando garaje.sys ...............",
    "> comprobando aceite ................ <ok>",
    "> cargando motor  [##########] 100%",
    "> sincronizando engranajes .......... <ok>",
    "> abriendo portal ...",
    "> acceso concedido. bienvenido.",
  ];
  for (const linea of lineas) {
    for (const letra of linea) {
      if (saltar) break;
      pre.textContent += letra;
      await esperar(letra === "." ? 4 : 10);
    }
    if (saltar) break;
    pre.textContent += "\n";
    await esperar(120);
  }
  if (!saltar) await esperar(350);
  pre.textContent = lineas.join("\n");
  capa.classList.add("intro-sale"); // CSS: se abre como una compuerta
  document.documentElement.classList.remove("intro-activa");
  await esperar(900);
  capa.remove();
}

// ---------------------------------------------------------------------
// 2) CURSOR PERSONALIZADO: punto exacto + aro que lo sigue con retraso
// ---------------------------------------------------------------------
function cursor() {
  if (!conRaton || reducir) return;
  const punto = document.createElement("div");
  const aro = document.createElement("div");
  punto.className = "cursor-punto";
  aro.className = "cursor-aro";
  document.body.append(punto, aro);
  document.documentElement.classList.add("cursor-propio");

  let x = innerWidth / 2, y = innerHeight / 2, ax = x, ay = y;
  addEventListener("pointermove", (e) => {
    x = e.clientX; y = e.clientY;
    punto.style.translate = `${x}px ${y}px`;
    const sobreEnlace = (e.target as HTMLElement).closest("a, button");
    aro.classList.toggle("cursor-activo", !!sobreEnlace);
  });
  addEventListener("pointerdown", () => aro.classList.add("cursor-clic"));
  addEventListener("pointerup", () => aro.classList.remove("cursor-clic"));
  document.addEventListener("pointerleave", () => { punto.style.opacity = aro.style.opacity = "0"; });
  document.addEventListener("pointerenter", () => { punto.style.opacity = aro.style.opacity = "1"; });

  const seguir = () => {
    ax += (x - ax) * 0.18;
    ay += (y - ay) * 0.18;
    aro.style.translate = `${ax}px ${ay}px`;
    requestAnimationFrame(seguir);
  };
  seguir();
}

// ---------------------------------------------------------------------
// 3) TEXTO DESCIFRADO: letras aleatorias que se "resuelven" en el texto real
// ---------------------------------------------------------------------
const SIMBOLOS = "!<>-_\\/[]{}=+*^?#01";
function descifrar(el: HTMLElement) {
  const final = el.dataset.texto ?? el.textContent ?? "";
  el.dataset.texto = final;
  if (reducir) return;
  const duracion = 700;
  const inicio = performance.now();
  const paso = (ahora: number) => {
    const t = Math.min((ahora - inicio) / duracion, 1);
    const resueltas = Math.floor(t * final.length);
    el.textContent = final
      .split("")
      .map((c, i) => (i < resueltas || c === " " ? c : SIMBOLOS[(Math.random() * SIMBOLOS.length) | 0]))
      .join("");
    if (t < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

// ---------------------------------------------------------------------
// 4) APARICIÓN AL SCROLL (+ descifrado de títulos)
// ---------------------------------------------------------------------
function apariciones() {
  const obs = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        el.classList.add("visible");
        el.querySelectorAll<HTMLElement>("[data-descifrar]").forEach(descifrar);
        if (el.hasAttribute("data-descifrar")) descifrar(el);
        obs.unobserve(el);
      }
    },
    { threshold: 0.15 },
  );
  // Textos a descifrar que no están dentro de un bloque con aparición
  document.querySelectorAll<HTMLElement>("[data-descifrar]").forEach((el) => {
    if (!el.closest("[data-reveal]")) obs.observe(el);
  });
  document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
    const hermanos = el.parentElement ? [...el.parentElement.children] : [];
    el.style.setProperty("--retraso", `${Math.min(hermanos.indexOf(el), 5) * 90}ms`);
    obs.observe(el);
  });
}

// ---------------------------------------------------------------------
// 5) INCLINACIÓN 3D de tarjetas y BOTONES MAGNÉTICOS
// ---------------------------------------------------------------------
function interacciones() {
  if (!conRaton || reducir) return;
  document.querySelectorAll<HTMLElement>("[data-tilt]").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      card.style.setProperty("--ry", `${(px - 0.5) * 14}deg`);
      card.style.setProperty("--rx", `${(0.5 - py) * 14}deg`);
      // posición del brillo que sigue al ratón (ver .brillo en global.css)
      card.style.setProperty("--mx", `${px * 100}%`);
      card.style.setProperty("--my", `${py * 100}%`);
    });
    card.addEventListener("pointerleave", () => {
      card.style.setProperty("--rx", "0deg");
      card.style.setProperty("--ry", "0deg");
    });
  });
  document.querySelectorAll<HTMLElement>("[data-iman]").forEach((btn) => {
    btn.addEventListener("pointermove", (e) => {
      const r = btn.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      btn.style.translate = `${dx * 0.25}px ${dy * 0.35}px`;
    });
    btn.addEventListener("pointerleave", () => (btn.style.translate = "0 0"));
  });
}

// ---------------------------------------------------------------------
// 6) HUD: tacómetro (rpm según la velocidad del scroll), marcha según la
//    sección, y barra de progreso de la página
// ---------------------------------------------------------------------
function hud() {
  const tacometro = document.querySelector<HTMLElement>("[data-tacometro]");
  const aguja = tacometro?.querySelector<SVGElement>("[data-aguja]");
  const arco = tacometro?.querySelector<SVGPathElement>("[data-arco]");
  const textoRpm = tacometro?.querySelector<HTMLElement>("[data-rpm]");
  const textoMarcha = tacometro?.querySelector<HTMLElement>("[data-marcha]");
  const barra = document.querySelector<HTMLElement>("[data-progreso]");
  const secciones = [...document.querySelectorAll<HTMLElement>("[data-marcha-seccion]")];
  const largoArco = arco?.getTotalLength() ?? 0;
  if (arco) arco.style.strokeDasharray = `${largoArco}`;

  const marchas = ["N", "1", "2", "3", "4", "5"];
  const loop = () => {
    actualizarMotor();
    const max = document.documentElement.scrollHeight - innerHeight;
    const progreso = max > 0 ? scrollY / max : 0;
    if (barra) barra.style.scale = `${progreso} 1`;

    // Marcha = última sección cuyo inicio ya pasó la mitad de la pantalla
    let marcha = 0;
    secciones.forEach((s, i) => { if (s.getBoundingClientRect().top < innerHeight * 0.5) marcha = i + 1; });
    motor.marcha = marcha;

    if (tacometro && aguja && arco && textoRpm && textoMarcha) {
      const frac = Math.min(motor.rpm / 12000, 1);
      aguja.style.rotate = `${-120 + frac * 240}deg`;      // de -120° a +120°
      arco.style.strokeDashoffset = `${largoArco * (1 - frac)}`;
      textoRpm.textContent = String(Math.round(motor.rpm / 50) * 50).padStart(5, " ");
      tacometro.classList.toggle("zona-roja", motor.rpm > 9500);
      const m = marchas[Math.min(marcha, marchas.length - 1)];
      if (textoMarcha.textContent !== m) {
        textoMarcha.textContent = m;
        textoMarcha.animate([{ scale: "1.6", opacity: 0.4 }, { scale: "1", opacity: 1 }], { duration: 300, easing: "ease-out" });
      }
    }
    requestAnimationFrame(loop);
  };
  loop();
}

// ---------------------------------------------------------------------
// 7) ESCENA 3D: se carga aparte (import dinámico) para no frenar el texto
// ---------------------------------------------------------------------
function escena3d() {
  const canvas = document.querySelector<HTMLCanvasElement>("[data-escena-canvas]");
  if (!canvas) return;
  // ¿Hay WebGL? Si no, quitamos el canvas y queda el fondo de CSS.
  const prueba = document.createElement("canvas");
  if (!(prueba.getContext("webgl2") || prueba.getContext("webgl"))) { canvas.remove(); return; }
  import("./escena")
    .then(({ iniciarEscena }) => {
      iniciarEscena(canvas);
      canvas.classList.add("lista"); // CSS: aparece con un fundido
    })
    .catch(() => canvas.remove());
}

export function iniciarEfectos() {
  escena3d();
  apariciones();
  interacciones();
  cursor();
  hud();
  intro();
  console.log(
    "%c> acceso concedido",
    "color:#4ade80;font-family:monospace;font-size:14px",
    "\n¿Curioseando el código? Me caes bien. Escríbeme. — Miller",
  );
}
