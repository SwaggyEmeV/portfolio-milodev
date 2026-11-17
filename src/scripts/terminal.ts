// =====================================================================
//  LA TERMINAL DEL HOME
//  Un mini "shell" en el navegador: lee el árbol de archivos de los datos
//  que Astro incrustó (#datos-terminal), ejecuta comandos y escribe la
//  salida en pantalla. Todo el texto se inserta con textContent (nunca
//  innerHTML), así ningún contenido puede inyectar HTML.
// =====================================================================

type Color = "acc" | "bone" | "dim" | "warn";
type Linea = { a?: string; ca?: Color; b: string; cb?: Color; href?: string };
type Resultado = {
  out: Linea[];
  cwd?: string;
  gear?: number;
  rpm?: number;
  clear?: boolean;
  abrir?: string;
};
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
  tabs: { etiqueta: string; cmd: string; href: string }[];
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
const panel = req<HTMLElement>("[data-t-panel]");
const scroll = req<HTMLElement>("[data-t-scroll]");
const salida = req<HTMLElement>("[data-t-salida]");
const input = req<HTMLInputElement>("[data-t-input]");
const promptEl = req<HTMLElement>("[data-t-prompt]");
const rpmBarra = req<HTMLElement>("[data-t-rpm-barra]");
const rpmTexto = req<HTMLElement>("[data-t-rpm-texto]");
const marchaEl = req<HTMLElement>("[data-t-marcha]");
const marchaNombre = req<HTMLElement>("[data-t-marcha-nombre]");
const historialEl = req<HTMLElement>("[data-t-historial]");
const cuentaEl = req<HTMLElement>("[data-t-cuenta]");

// --- Constructores de líneas
const ln = (a: string, ca: Color, b: string, cb: Color, href?: string): Linea => ({ a, ca, b, cb, href });
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
// Marcha del tacómetro según la "sección" que se está viendo
const GEAR: Record<string, number> = { proyectos: 1, "sobre_mi.md": 2, "stack.txt": 2, garaje: 3, "contacto.sh": 4 };
const MARCHAS = ["N", "1", "2", "3", "4"];
const NOMBRES = ["home", "proyectos", "sobre_mí", "garaje", "contacto"];
const COMANDOS = ["help", "neofetch", "whoami", "ls", "cd", "cat", "open", "pwd", "history", "contacto", "rev", "clear", "sudo", "exit"];

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

// --- Estado
const estado = { cwd: "", hist: [] as string[], hi: -1, gear: 0, rpm: 1100, n: 0 };

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
const marchaDe = (ruta: string) => GEAR[ruta] ?? GEAR[ruta.split("/")[0]] ?? 0;

function ejecutar(crudo: string): Resultado {
  const partes = crudo.split(/\s+/);
  const cmd = partes[0].toLowerCase();
  const args = partes.slice(1).filter((x) => !x.startsWith("-"));
  const arg = args[0] ?? "";

  switch (cmd) {
    case "help":
      return {
        out: [
          h("comandos"),
          kv("help", "esta ayuda"),
          kv("neofetch", "quién soy, en una pantalla"),
          kv("whoami", "nombre y rol"),
          kv("ls [dir]", "listar archivos"),
          kv("cd <dir>", "entrar a una carpeta (cd .. para salir)"),
          kv("cat <archivo>", "leer un archivo"),
          kv("open <proyecto>", "abrir la página completa de un proyecto"),
          kv("contacto", "cómo escribirme"),
          kv("rev", "acelera el motor"),
          kv("clear", "limpiar la pantalla"),
          gap(),
          d("↑ ↓ historial · tab autocompleta · ctrl+l limpia · prueba también: sudo"),
        ],
      };
    case "neofetch":
      return { out: neofetch(), gear: 0 };
    case "whoami":
      return { out: [t(`${datos.nombre} · ${datos.rol.toLowerCase()}`), d(datos.frase)] };
    case "pwd":
      return { out: [t(`/home/${datos.usuario}${estado.cwd ? `/${estado.cwd}` : ""}`)] };
    case "history":
      return { out: estado.hist.length ? estado.hist.map((x, i) => kv(String(i + 1), x)) : [d("(sin historial todavía)")] };
    case "clear":
      return { out: [], clear: true, gear: 0 };
    case "contacto":
    case "contact":
      return { out: contacto(), gear: 4 };
    case "rev":
      return { out: [w("vrrrooOOOOM!!  ▮▮▮▮▮▮▮▮▮▮▮▮"), d("rpm 12000 · zona roja")], rpm: 12000 };
    case "sudo":
      return { out: [w(`${datos.usuario} no está en el archivo sudoers. Este incidente será reportado.`), d("// fsociety ya lo sabe.")] };
    case "exit":
    case "logout":
      return { out: [d("logout"), t("...pero aún no has visto el garaje. Prueba: cd ~/garaje")] };

    case "ls": {
      const ruta = resolver(arg, estado.cwd);
      const lista = DIRS[ruta];
      if (lista) {
        return {
          out: lista.map((x) => (x.endsWith("/") ? ln("", "acc", x, "acc") : t(x))),
          gear: ruta === "proyectos" ? 1 : ruta === "garaje" ? 3 : 0,
        };
      }
      if (FILES[ruta]) return { out: [t(arg)] };
      return { out: [w(`ls: no se puede acceder a '${arg}': No existe el archivo o directorio`)] };
    }

    case "cd": {
      const ruta = arg ? resolver(arg, estado.cwd) : "";
      if (DIRS[ruta] !== undefined) return { out: [], cwd: ruta, gear: marchaDe(ruta) };
      return { out: [w(`bash: cd: ${arg}: No existe el archivo o directorio`)] };
    }

    case "cat": {
      if (!arg) return { out: [w("cat: falta el nombre del archivo")] };
      const ruta = resolver(arg, estado.cwd);
      const archivo = FILES[ruta];
      if (archivo) return { out: archivo(), gear: marchaDe(ruta) };
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
function pintar(lineas: Linea[]) {
  const frag = document.createDocumentFragment();
  for (const l of lineas) {
    const fila = document.createElement("div");
    fila.className = "linea";
    if (l.a) {
      const pre = document.createElement("span");
      pre.className = `c-${l.ca ?? "bone"}`;
      pre.textContent = l.a;
      fila.append(pre);
    }
    const texto = document.createElement(l.href ? "a" : "span");
    texto.className = `c-${l.cb ?? "bone"}`;
    texto.textContent = l.b || " ";
    if (l.href && texto instanceof HTMLAnchorElement) {
      texto.href = l.href;
      texto.classList.add("enlace");
      if (/^https?:/.test(l.href)) {
        texto.target = "_blank";
        texto.rel = "noopener";
      }
    }
    fila.append(texto);
    frag.append(fila);
  }
  salida.append(frag);
  while (salida.childElementCount > 300) salida.firstElementChild?.remove();
  scroll.scrollTop = scroll.scrollHeight;
}

function actualizarPanel() {
  const { rpm, gear, hist, cwd } = estado;
  const roja = rpm > 9500;
  rpmBarra.style.width = `${Math.round((rpm / 12000) * 100)}%`;
  rpmBarra.classList.toggle("roja", roja);
  rpmTexto.textContent = `${Math.round(rpm / 50) * 50} rpm${roja ? " · zona roja" : ""}`;
  rpmTexto.className = `mt-2 text-[13px] ${roja ? "text-motor" : "text-agua"}`;
  marchaEl.textContent = MARCHAS[gear] ?? "N";
  marchaNombre.textContent = NOMBRES[gear] ?? "home";
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
  document.querySelectorAll<HTMLElement>("[data-tab]").forEach((tab) => {
    tab.setAttribute("aria-current", Number(tab.dataset.tab) === gear ? "true" : "false");
  });
}

function correr(entrada: string) {
  const crudo = entrada.trim();
  const eco = ln(`${prompt(estado.cwd)} `, "acc", crudo, "bone");
  input.value = "";
  estado.hi = -1;
  if (!crudo) {
    pintar([eco]);
    return;
  }
  const r = ejecutar(crudo);
  estado.n += 1;
  estado.hist = [...estado.hist, crudo].slice(-50);
  if (r.clear) salida.replaceChildren();
  else pintar([eco, ...r.out]);
  if (r.cwd !== undefined) estado.cwd = r.cwd;
  if (r.gear !== undefined) estado.gear = r.gear;
  // Cada comando sube las rpm; `rev` las lleva a zona roja y `clear` las resetea
  estado.rpm = r.rpm ?? (r.clear ? 1100 : Math.min(9000, 1100 + estado.n * 650));
  actualizarPanel();
  if (r.abrir) setTimeout(() => (location.href = r.abrir as string), 350);
}

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

// --- Eventos
input.addEventListener("keydown", (e) => {
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

// --- Arranque
async function iniciar() {
  actualizarPanel();
  let visto = false;
  try {
    visto = sessionStorage.getItem("boot-visto") === "1";
    sessionStorage.setItem("boot-visto", "1");
  } catch {}

  const arranque = [
    ln("> iniciando garaje.sys ........ ", "dim", "ok", "acc"),
    ln(`> abriendo sesión ${datos.usuario}@garaje ... `, "dim", "ok", "acc"),
    ln("> ", "dim", "acceso concedido. bienvenido.", "acc"),
  ];
  if (visto || reducir) pintar(arranque);
  else {
    for (const l of arranque) {
      pintar([l]);
      await esperar(140);
    }
  }
  const hayExplorador = matchMedia("(min-width: 900px)").matches;
  pintar([
    gap(),
    ...neofetch(),
    gap(),
    d(hayExplorador ? "Escribe help, usa el explorador de la izquierda o toca un comando de abajo." : "Escribe help o toca un comando de abajo."),
  ]);

  // Enlaces desde otras páginas: /#proyectos, /#sobre-mi, /#garaje, /#contacto
  const tab = location.hash ? datos.tabs.find((x) => x.href === `/${location.hash}`) : undefined;
  if (tab && tab.cmd !== "neofetch") correr(tab.cmd);
  if (punteroFino) input.focus();
}
iniciar();
