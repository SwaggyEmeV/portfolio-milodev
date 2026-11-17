// =====================================================================
//  EL MOTOR DE LA TERMINAL
//  Un mini "shell" en el navegador: lee el árbol de archivos de los datos
//  que Astro incrustó (#datos-terminal), ejecuta comandos y escribe la
//  salida. Todo el texto se inserta con textContent (nunca innerHTML), así
//  ningún contenido puede inyectar HTML.
//
//  Además de los comandos que escribe el visitante, expone una pequeña API
//  (`terminal`) que usa escenario.ts para "teclear" comandos solos según
//  el scroll: cada comando automático es una ETAPA de la página.
// =====================================================================

type Color = "acc" | "bone" | "dim" | "warn";
// a = prefijo, b = texto principal (puede ser enlace), c = cola
type Linea = { a?: string; ca?: Color; b: string; cb?: Color; href?: string; c?: string; cc?: Color };
type Resultado = { out: Linea[]; cwd?: string; clear?: boolean; abrir?: string };
type Datos = {
  usuario: string;
  nombre: string;
  rol: string;
  frase: string;
  email: string;
  github: string;
  linkedin: string;
  sobreMi: string[];
  ficha: [string, string][];
  tecnologias: { nombre: string; capa: string }[];
  intereses: { archivo: string; titulo: string; texto: string }[];
  proyectos: {
    slug: string;
    titulo: string;
    resumen: string;
    tecnologias: string[];
    destacado: boolean;
    demo?: string;
    repo?: string;
    cuerpo: string;
  }[];
};

function req<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`terminal: falta ${selector}`);
  return el;
}

const datos: Datos = JSON.parse(req("#datos-terminal").textContent ?? "{}");
const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;
const punteroFino = matchMedia("(pointer: fine)").matches;
const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// --- Elementos de la página
const scroll = req<HTMLElement>("[data-t-scroll]");
const salida = req<HTMLElement>("[data-t-salida]");
const input = req<HTMLInputElement>("[data-t-input]");
const promptEl = req<HTMLElement>("[data-t-prompt]");
const historialEl = req<HTMLElement>("[data-t-historial]");
const cuentaEl = req<HTMLElement>("[data-t-cuenta]");

// --- Constructores de líneas
const ln = (a: string, ca: Color, b: string, cb: Color, href?: string, c?: string, cc?: Color): Linea => ({ a, ca, b, cb, href, c, cc });
const t = (b: string): Linea => ln("", "bone", b, "bone");
const h = (b: string): Linea => ln("", "acc", b, "acc");
const d = (b: string): Linea => ln("", "dim", b, "dim");
const w = (b: string): Linea => ln("", "warn", b, "warn");
const kv = (k: string, v: string, href?: string): Linea => ln(k.padEnd(16), "dim", v, href ? "acc" : "bone", href);
const gap = (): Linea => t("");

// --- Sistema de archivos (carpetas y contenido), construido con los datos
const DIRS: Record<string, string[]> = {
  "": ["proyectos/", "garaje/", "sobre_mi.md", "stack.txt", "contacto.sh"],
  proyectos: datos.proyectos.map((p) => `${p.slug}.md`),
  garaje: datos.intereses.map((i) => i.archivo),
};
const COMANDOS = ["help", "neofetch", "whoami", "ps", "ls", "cd", "cat", "open", "pwd", "history", "contacto", "rev", "clear", "sudo", "exit"];

/** Markdown muy simple -> líneas de terminal (títulos en acento, resto igual). */
function markdown(src: string): Linea[] {
  const out: Linea[] = [];
  for (const crudo of src.split(/\r?\n/)) {
    const lin = crudo.trimEnd();
    if (!lin.trim()) {
      // sin línea en blanco al principio, repetida, ni justo debajo de un título
      const previa = out[out.length - 1];
      if (previa && previa.b !== "" && previa.cb !== "acc") out.push(gap());
      continue;
    }
    const limpio = lin
      .replace(/`(.+?)`/g, "$1")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1");
    out.push(limpio.startsWith("#") ? h(limpio) : t(limpio));
  }
  while (out.length && out[out.length - 1].b === "") out.pop();
  return out;
}

function contacto(): Linea[] {
  return [
    h("# contacto"),
    t("Si tienes una idea, una oferta o solo quieres hablar de código o de motos, escríbeme. Respondo rápido."),
    gap(),
    kv("email", datos.email, `mailto:${datos.email}`),
    kv("github", datos.github.replace(/^https?:\/\//, ""), datos.github),
    kv("linkedin", datos.linkedin.replace(/^https?:\/\//, ""), datos.linkedin),
  ];
}

/** Tabla de proyectos estilo `ps aux`. */
function procesos(): Linea[] {
  // El espacio de relleno va en la cola (no en el enlace) para que el subrayado no se alargue
  const ancho = Math.max(10, ...datos.proyectos.map((p) => p.slug.length)) + 2;
  const filas = datos.proyectos.map((p, i) =>
    ln(
      `${String(i + 1).padStart(4, "0")}  ${p.destacado ? "● destacado" : "● running  "}  `,
      p.destacado ? "acc" : "dim",
      p.slug,
      "acc",
      `/proyectos/${p.slug}`,
      " ".repeat(ancho - p.slug.length) + p.tecnologias.join(" · "),
      "bone",
    ),
  );
  return [d(`PID   ESTADO       ${"PROYECTO".padEnd(ancho)}STACK`), ...filas, gap(), d("→ open <proyecto> abre la página completa")];
}

const FILES: Record<string, () => Linea[]> = {
  "sobre_mi.md": () => {
    const out: Linea[] = [h("# sobre_mí")];
    datos.sobreMi.forEach((parrafo) => out.push(gap(), t(parrafo)));
    return out;
  },
  "stack.txt": () => [h("# caja_de_herramientas"), gap(), ...datos.tecnologias.map((x) => kv(x.nombre, x.capa))],
  "contacto.sh": contacto,
};
for (const p of datos.proyectos) {
  FILES[`proyectos/${p.slug}.md`] = () => {
    const out: Linea[] = [h(`# ${p.titulo}`), t(p.resumen), gap(), kv("stack", p.tecnologias.join(" · "))];
    if (p.destacado) out.push(kv("estado", "destacado"));
    if (p.demo) out.push(kv("demo", p.demo, p.demo));
    if (p.repo) out.push(kv("repo", p.repo, p.repo));
    out.push(gap(), ...markdown(p.cuerpo), gap());
    out.push(ln("", "dim", `abrir página completa → /proyectos/${p.slug}`, "acc", `/proyectos/${p.slug}`));
    return out;
  };
}
for (const i of datos.intereses) {
  FILES[`garaje/${i.archivo}`] = () => [h(`# ${i.titulo}`), t(i.texto), ...(i.archivo === "mr-robot.txt" ? [gap(), d("// hello, friend.")] : [])];
}

// --- neofetch: "M" en ASCII + ficha
// ASCII puro (sin caracteres de bloque): se ve igual en cualquier tipografía monoespaciada
const ARTE = ["  __  __ ", " |  \\/  |", " | |\\/| |", " | |  | |", " |_|  |_|"];
function neofetch(): Linea[] {
  const cabecera = `${datos.usuario}@garaje`;
  const info: [string, Color][] = [
    [cabecera, "acc"],
    ["-".repeat(cabecera.length), "dim"],
    ...datos.ficha.map(([k, v]): [string, Color] => [`${k.padEnd(9)}${v}`, "bone"]),
  ];
  // En pantallas estrechas no cabe el arte junto a la ficha: solo la ficha
  if (matchMedia("(max-width: 560px)").matches) return info.map(([texto, color]) => ln("", "bone", texto, color));
  const filas = Math.max(ARTE.length, info.length);
  return Array.from({ length: filas }, (_, i) => ln((ARTE[i] ?? "").padEnd(18), "acc", info[i]?.[0] ?? "", info[i]?.[1] ?? "bone"));
}

// --- Estado del shell
const estado = { cwd: "", hist: [] as string[], hi: -1 };

const prompt = (cwd: string) => `${datos.usuario}@garaje:${cwd ? `~/${cwd}` : "~"}$`;

/** Convierte lo que escribe el usuario en una ruta normalizada ("" = home). */
function resolver(arg: string, cwd: string): string {
  const absoluta = arg.startsWith("~") || arg.startsWith("/");
  const partes = absoluta || !cwd ? [] : [cwd];
  for (const x of arg.replace(/^~/, "").split("/")) {
    if (!x || x === ".") continue;
    if (x === "..") partes.pop();
    else partes.push(x);
  }
  return partes.join("/");
}

function ejecutar(crudo: string): Resultado {
  const partes = crudo.split(/\s+/);
  const cmd = partes[0].toLowerCase();
  const args = partes.slice(1).filter((x) => !x.startsWith("-") && x !== "aux");
  const arg = args[0] ?? "";

  switch (cmd) {
    case "help":
      return {
        out: [
          h("comandos"),
          kv("help", "esta ayuda"),
          kv("neofetch", "quién soy, en una pantalla"),
          kv("whoami", "nombre y rol"),
          kv("ps", "lista de proyectos en ejecución"),
          kv("ls [dir]", "listar archivos"),
          kv("cd <dir>", "entrar a una carpeta (cd .. para salir)"),
          kv("cat <archivo>", "leer un archivo (admite carpeta/*)"),
          kv("open <proyecto>", "abrir la página completa de un proyecto"),
          kv("contacto", "cómo escribirme"),
          kv("rev", "acelera el motor"),
          kv("clear", "limpiar la pantalla"),
          gap(),
          d("↑ ↓ historial · tab autocompleta · ctrl+l limpia · prueba también: sudo"),
        ],
      };
    case "neofetch":
      return { out: neofetch() };
    case "whoami":
      return { out: [t(`${datos.nombre} · ${datos.rol.toLowerCase()}`), d(datos.frase)] };
    case "ps":
      return { out: procesos() };
    case "pwd":
      return { out: [t(`/home/${datos.usuario}${estado.cwd ? `/${estado.cwd}` : ""}`)] };
    case "history":
      return { out: estado.hist.length ? estado.hist.map((x, i) => kv(String(i + 1), x)) : [d("(sin historial todavía)")] };
    case "clear":
      return { out: [], clear: true };
    case "contacto":
    case "contact":
      return { out: contacto() };
    case "rev":
      document.dispatchEvent(new CustomEvent("rev")); // el escenario sube el tacómetro
      return { out: [w("vrrrooOOOOM!!  ▮▮▮▮▮▮▮▮▮▮▮▮"), d("rpm 12000 · zona roja")] };
    case "sudo":
      return { out: [w(`${datos.usuario} no está en el archivo sudoers. Este incidente será reportado.`), d("// fsociety ya lo sabe.")] };
    case "exit":
    case "logout":
      return { out: [d("logout"), t("...pero aún no has visto el garaje. Prueba: cd ~/garaje")] };

    case "ls": {
      const ruta = resolver(arg, estado.cwd);
      const lista = DIRS[ruta];
      if (lista) return { out: lista.map((x) => (x.endsWith("/") ? ln("", "acc", x, "acc") : t(x))) };
      if (FILES[ruta]) return { out: [t(arg)] };
      return { out: [w(`ls: no se puede acceder a '${arg}': No existe el archivo o directorio`)] };
    }

    case "cd": {
      const ruta = arg ? resolver(arg, estado.cwd) : "";
      if (DIRS[ruta] !== undefined) return { out: [], cwd: ruta };
      return { out: [w(`bash: cd: ${arg}: No existe el archivo o directorio`)] };
    }

    case "cat": {
      if (!arg) return { out: [w("cat: falta el nombre del archivo")] };
      // cat carpeta/*  ->  todos los archivos de la carpeta
      if (arg.endsWith("/*")) {
        const carpeta = resolver(arg.slice(0, -2), estado.cwd);
        const archivos = (DIRS[carpeta] ?? []).filter((x) => !x.endsWith("/"));
        if (!archivos.length) return { out: [w(`cat: ${arg}: No existe el archivo o directorio`)] };
        const out: Linea[] = [];
        archivos.forEach((x, i) => {
          if (i) out.push(gap());
          out.push(...FILES[carpeta ? `${carpeta}/${x}` : x]());
        });
        return { out };
      }
      const ruta = resolver(arg, estado.cwd);
      const archivo = FILES[ruta];
      if (archivo) return { out: archivo() };
      if (DIRS[ruta] !== undefined) return { out: [w(`cat: ${arg}: es un directorio`)] };
      return { out: [w(`cat: ${arg}: No existe el archivo o directorio`)] };
    }

    case "open": {
      if (!arg) return { out: [w("open: falta el proyecto (ej: open blog-php)")] };
      const ruta = resolver(arg, estado.cwd);
      const m = ruta.match(/^(?:proyectos\/)?([^/]+?)(?:\.md)?$/);
      const proyecto = datos.proyectos.find((p) => p.slug === (m ? m[1] : ""));
      if (!proyecto) return { out: [w(`open: ${arg}: no es un proyecto`)] };
      return { out: [d(`abriendo /proyectos/${proyecto.slug} ...`)], abrir: `/proyectos/${proyecto.slug}` };
    }

    default:
      return { out: [w(`bash: ${cmd}: comando no encontrado`), d("escribe 'help' para ver lo que sí existe")] };
  }
}

// --- Pintar en pantalla
/** Un bloque agrupa un comando y su salida. Los automáticos llevan data-etapa. */
function nuevoBloque(etapa?: number): HTMLElement {
  const bloque = document.createElement("div");
  bloque.className = "bloque";
  if (etapa !== undefined) bloque.dataset.fase = String(etapa);
  salida.append(bloque);
  // memoria acotada: se descartan los bloques de usuario más antiguos
  const propios = salida.querySelectorAll(".bloque:not([data-fase])");
  if (propios.length > 60) propios[0].remove();
  return bloque;
}

function pintarEn(bloque: HTMLElement, lineas: Linea[]) {
  const frag = document.createDocumentFragment();
  lineas.forEach((l, i) => {
    const fila = document.createElement("div");
    fila.className = "linea";
    fila.style.setProperty("--i", String(Math.min(i, 24))); // retraso escalonado de la animación de entrada
    const parte = (texto: string, color: Color | undefined, enlace?: string) => {
      const el = document.createElement(enlace ? "a" : "span");
      el.className = `c-${color ?? "bone"}`;
      el.textContent = texto;
      if (enlace && el instanceof HTMLAnchorElement) {
        el.href = enlace;
        el.classList.add("enlace");
        if (/^https?:/.test(enlace)) {
          el.target = "_blank";
          el.rel = "noopener";
        }
      }
      return el;
    };
    if (l.a) fila.append(parte(l.a, l.ca));
    fila.append(parte(l.b || " ", l.cb, l.href));
    if (l.c) fila.append(parte(l.c, l.cc));
    frag.append(fila);
  });
  bloque.append(frag);
  scroll.scrollTop = scroll.scrollHeight;
}

function actualizarPanel() {
  const { hist, cwd } = estado;
  cuentaEl.textContent = String(hist.length);
  historialEl.replaceChildren(
    ...(hist.length ? hist.slice(-6).reverse() : ["—"]).map((x) => {
      const fila = document.createElement("div");
      fila.className = "break-words whitespace-pre-wrap";
      fila.textContent = hist.length ? `$ ${x}` : x;
      return fila;
    }),
  );
  promptEl.textContent = prompt(cwd);
}

/** Ejecuta lo que escribió el visitante. */
function correr(entrada: string) {
  const crudo = entrada.trim();
  const eco = ln(`${prompt(estado.cwd)} `, "acc", crudo, "bone");
  input.value = "";
  estado.hi = -1;
  if (!crudo) {
    pintarEn(nuevoBloque(), [eco]);
    return;
  }
  const r = ejecutar(crudo);
  estado.hist = [...estado.hist, crudo].slice(-50);
  if (r.clear) salida.replaceChildren();
  else pintarEn(nuevoBloque(), [eco, ...r.out]);
  if (r.cwd !== undefined) estado.cwd = r.cwd;
  actualizarPanel();
  if (r.abrir) setTimeout(() => (location.href = r.abrir as string), 350);
}

// --- API para el escenario (etapas automáticas según el scroll)
type Saltar = () => boolean; // true = no animar (terminar de golpe)

async function arranque(saltar: Saltar) {
  const bloque = nuevoBloque(0);
  let visto = false;
  try {
    visto = sessionStorage.getItem("boot-visto") === "1";
    sessionStorage.setItem("boot-visto", "1");
  } catch {}
  const lineas = [
    ln("> iniciando garaje.sys ........ ", "dim", "ok", "acc"),
    ln(`> abriendo sesión ${datos.usuario}@garaje ... `, "dim", "ok", "acc"),
    ln("> ", "dim", "acceso concedido. bienvenido.", "acc"),
  ];
  for (const l of lineas) {
    pintarEn(bloque, [l]);
    if (!visto && !reducir && !saltar()) await esperar(150);
  }
  const hayExplorador = matchMedia("(min-width: 900px)").matches;
  pintarEn(bloque, [
    gap(),
    ...neofetch(),
    gap(),
    d("↓ haz scroll: la terminal avanza sola."),
    d(hayExplorador ? "También puedes escribir help o usar el explorador." : "También puedes escribir help o tocar un comando de abajo."),
  ]);
}

/** Teclea un comando en la línea de comandos y lo ejecuta (sin tocar el historial del visitante). */
async function teclearYCorrer(cmd: string, etapa: number, saltar: Saltar) {
  const previo = input.value;
  input.readOnly = true;
  input.value = "";
  for (const ch of cmd) {
    input.value += ch;
    if (!saltar()) await esperar(14 + Math.random() * 22);
  }
  if (!saltar()) await esperar(220);
  input.value = previo;
  input.readOnly = false;
  const r = ejecutar(cmd);
  pintarEn(nuevoBloque(etapa), [ln(`${prompt(estado.cwd)} `, "acc", cmd, "bone"), ...r.out]);
}

export const terminal = {
  /** Muestra una etapa: la 0 es el arranque; las demás teclean sus comandos. */
  async mostrar(etapa: number, cmds: string[], saltar: Saltar) {
    if (etapa === 0) await arranque(saltar);
    else for (const c of cmds) await teclearYCorrer(c, etapa, saltar);
  },
  /** Quita (con un fundido) lo que escribió una etapa: así el scroll hacia arriba "rebobina". */
  async quitar(etapa: number) {
    const bloques = salida.querySelectorAll<HTMLElement>(`[data-fase="${etapa}"]`);
    if (!bloques.length) return;
    bloques.forEach((b) => b.classList.add("sale"));
    if (!reducir) await esperar(220);
    bloques.forEach((b) => b.remove());
    scroll.scrollTop = scroll.scrollHeight;
  },
};

// --- Autocompletado y eventos
function autocompletar(texto: string): string {
  const i = texto.lastIndexOf(" ");
  if (i < 0) {
    const c = COMANDOS.filter((x) => x.startsWith(texto));
    return c.length === 1 ? `${c[0]} ` : texto;
  }
  const cabeza = texto.slice(0, i + 1);
  const ficha = texto.slice(i + 1);
  const pool = [...(DIRS[estado.cwd] ?? []), ...(estado.cwd ? [".."] : [])];
  const c = pool.filter((x) => x.startsWith(ficha));
  return c.length === 1 ? cabeza + c[0] : texto;
}

input.addEventListener("keydown", (e) => {
  if (input.readOnly) return;
  if (e.key === "Enter") {
    e.preventDefault();
    correr(input.value);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    const hi = Math.min(estado.hist.length - 1, estado.hi + 1);
    if (hi >= 0) {
      estado.hi = hi;
      input.value = estado.hist[estado.hist.length - 1 - hi];
    }
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    estado.hi = Math.max(estado.hi - 1, -1);
    input.value = estado.hi >= 0 ? estado.hist[estado.hist.length - 1 - estado.hi] : "";
  } else if (e.key === "Tab") {
    e.preventDefault();
    input.value = autocompletar(input.value);
  } else if (e.key === "l" && e.ctrlKey) {
    e.preventDefault();
    correr("clear");
  }
});

document.addEventListener("click", (e) => {
  const objetivo = e.target as HTMLElement;
  const boton = objetivo.closest<HTMLElement>("[data-cmd]");
  if (boton?.dataset.cmd) {
    correr(boton.dataset.cmd);
    if (punteroFino) input.focus();
    return;
  }
  // Clic en el panel de la terminal: enfoca la línea de comandos (si no se está seleccionando texto)
  if (objetivo.closest("[data-t-panel]") && !objetivo.closest("a, button, input") && !getSelection()?.toString()) {
    input.focus();
  }
});

// La rueda del ratón sobre la salida sigue moviendo la PÁGINA (el scroll dirige la terminal).
// La salida se puede recorrer con la barra, el teclado o el dedo.
if (punteroFino) {
  scroll.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      scrollBy(0, e.deltaY);
    },
    { passive: false },
  );
}

actualizarPanel();
