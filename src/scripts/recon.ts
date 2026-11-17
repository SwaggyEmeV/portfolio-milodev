// El home por dentro: intro, expedientes, tráfico de red y consola.
// El canvas con los nodos vive en mapa.ts; los datos llegan como JSON desde Recon.astro.
import { crearMapa, type NodoDef } from "./mapa";
import { crearCRT, corregirPuntero } from "./crt";
import { descifrar, prefiereMenosMovimiento } from "./scramble";

type Tec = { nombre: string; puerto: number; capa: string; estado: string };
type Proy = {
  slug: string; titulo: string; resumen: string; tecnologias: string[];
  destacado: boolean; demo?: string; repo?: string; fecha: string;
};
type Interes = { archivo: string; titulo: string; texto: string };
type Host = { id: string; ip: string; nombre: string };
type Datos = {
  usuario: string; host: string; nombre: string; rol: string; frase: string;
  email: string; github: string; linkedin: string; sobreMi: string[];
  ficha: [string, string][]; tecnologias: Tec[]; intereses: Interes[];
  hosts: Host[]; proyectos: Proy[];
};

const raiz = document.querySelector<HTMLElement>("[data-recon]");
const datosEl = document.getElementById("datos-recon");
if (raiz && datosEl) arrancar(raiz, JSON.parse(datosEl.textContent || "{}") as Datos);

function arrancar(raiz: HTMLElement, d: Datos) {
  const $ = <T extends HTMLElement>(s: string) => raiz.querySelector<T>(s)!;
  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const norm = (s: string) => s.trim().toLowerCase().replace(/_/g, "-").replace(/^\.?\/+/, "").replace(/\/$/, "");
  const rnd = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
  const azar = (n: number) => (Math.random() * n) | 0;
  const reducido = prefiereMenosMovimiento();
  const corto = (u: string) => u.replace(/^https?:\/\//, "");

  const hostPorId = new Map(d.hosts.map((h) => [h.id, h]));
  const primarios = d.hosts.map((h) => h.id);
  const ultimoOcteto = (ip: string) => Number(ip.split(".").pop());
  const ipHoja = (hub: string, i: number) => `10.13.37.${ultimoOcteto(hostPorId.get(hub)!.ip) + i + 1}`;

  /* ============================================================
     NODOS Y ENLACES
     ============================================================ */
  const nodos: NodoDef[] = [];
  const enlaces: [string, string][] = [];
  for (const h of d.hosts) {
    nodos.push({ id: h.id, tipo: h.id === "core" ? "core" : "hub", etiqueta: h.nombre, ip: h.ip, abre: h.id });
    if (h.id !== "core") enlaces.push(["core", h.id]);
  }
  d.proyectos.forEach((p, i) => {
    nodos.push({ id: `proy:${p.slug}`, tipo: "hoja", forma: "cuadro", etiqueta: p.slug, ip: ipHoja("proyectos", i), abre: `proy:${p.slug}`, padre: "proyectos" });
    enlaces.push(["proyectos", `proy:${p.slug}`]);
  });
  d.intereses.forEach((it, i) => {
    nodos.push({ id: `gar:${it.archivo}`, tipo: "hoja", forma: "circulo", etiqueta: it.archivo, ip: ipHoja("garaje", i), abre: `gar:${it.archivo}`, padre: "garaje" });
    enlaces.push(["garaje", `gar:${it.archivo}`]);
  });
  d.tecnologias.forEach((t, i) => {
    nodos.push({ id: `tec:${t.nombre}`, tipo: "hoja", forma: "punto", etiqueta: `${t.nombre}:${t.puerto}`, abre: "stack", padre: "stack" });
    enlaces.push(["stack", `tec:${t.nombre}`]);
  });

  /* ============================================================
     ESTADO: hosts comprometidos
     ============================================================ */
  const visitados = new Set<string>();
  let esRoot = false;
  const segs = [...raiz.querySelectorAll<HTMLElement>(".segs i")];

  function visitar(id: string) {
    if (visitados.has(id)) return;
    visitados.add(id);
    mapa.setVisitado(id);
    const n = primarios.filter((p) => visitados.has(p)).length;
    $("[data-n-vis]").textContent = String(n);
    segs.forEach((s, i) => s.classList.toggle("on", i < n));
    raiz.querySelectorAll(`[data-host="${id}"]`).forEach((b) => b.classList.add("vis"));
    if (primarios.includes(id)) sniff("PWN", `${hostPorId.get(id)!.ip} comprometido (${n}/${primarios.length})`, "ok");
    if (n === primarios.length && !esRoot) conseguirRoot();
  }

  function conseguirRoot() {
    esRoot = true;
    raiz.classList.add("root");
    $("[data-c-prompt]").textContent = promptTexto();
    sniff("ROOT", "acceso total concedido. has leído todo el portfolio.", "ok");
    toast("root obtenido — reconocimiento completo. ahora escríbeme →", "contacto");
  }

  /* ============================================================
     MAPA
     ============================================================ */
  const zoomN = $("[data-zoom-n]");
  const mapaCanvas = $<HTMLCanvasElement>("[data-mapa]");
  const mapa = crearMapa({
    canvas: mapaCanvas,
    nodos,
    enlaces,
    reducido,
    onAbrir: (abre) => abrir(abre),
    onZoom: (k) => { zoomN.textContent = `×${k.toFixed(1)}`; },
    onHover: (id) => {
      raiz.querySelectorAll(".obj.hover").forEach((b) => b.classList.remove("hover"));
      if (id) raiz.querySelector(`.obj[data-host="${id}"]`)?.classList.add("hover");
    },
  });

  /* ============================================================
     PANTALLA CRT (filtro WebGL sobre el mapa + capa CSS)
     ============================================================ */
  const crtGl = crearCRT(mapaCanvas, $<HTMLCanvasElement>("[data-crt]"), reducido);
  const crtBtn = $("[data-crt-toggle]");
  const crtEstado = $("[data-crt-estado]");
  let crtOn = false;

  function crt(b: boolean, avisar = true) {
    if (b === crtOn) return;
    crtOn = b;
    const gl = crtGl.activar(b);
    raiz.classList.toggle("crt-on", b);
    mapa.setDeformador(b && gl ? corregirPuntero : null);
    crtBtn.setAttribute("aria-pressed", String(b));
    crtEstado.textContent = b ? "on" : "off";
    if (b && !reducido) {
      raiz.classList.add("crt-enciende");
      setTimeout(() => raiz.classList.remove("crt-enciende"), 700);
    }
    try { localStorage.setItem("milodev-crt", b ? "1" : "0"); } catch {}
    if (avisar) sniff("SYS", b ? (gl ? "pantalla CRT encendida (WebGL)" : "pantalla CRT encendida (solo CSS: sin WebGL)") : "pantalla CRT apagada", b && !gl ? "alerta" : "");
  }
  crtBtn.addEventListener("click", () => crt(!crtOn));

  /* ============================================================
     EXPEDIENTES
     ============================================================ */
  const dossier = $("[data-dossier]");
  const dSsh = $("[data-d-ssh]");
  const dBarra = $("[data-d-hs-barra]");
  const dHsTxt = $("[data-d-hs-txt]");
  const dCuerpo = $("[data-d-cuerpo]");
  const dHs = $("[data-d-hs]");
  let abierto: string | null = null;
  let ficha = 0; // token para ignorar aperturas viejas
  let cancelarDescifrado: () => void = () => {};
  let disparador: HTMLElement | null = null;

  type Vista = { ip: string; hub: string; html: string };

  const etiquetasTec = (ts: string[]) => `<ul class="tags">${ts.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
  const botonAbrir = (k: string, txt: string, sec = false) =>
    `<button type="button" class="${sec ? "btn-sec" : "btn"}" data-abrir="${esc(k)}">${esc(txt)}</button>`;

  function vista(key: string): Vista | null {
    if (key.startsWith("proy:")) {
      const i = d.proyectos.findIndex((p) => p.slug === key.slice(5));
      const p = d.proyectos[i];
      if (!p) return null;
      return {
        ip: ipHoja("proyectos", i), hub: "proyectos",
        html: `<p class="d-eyebrow">// proyecto · ${esc(p.fecha)}</p>
          <h2 class="d-h">${esc(p.titulo)}</h2>
          <p class="d-sub">${esc(p.resumen)}</p>
          ${etiquetasTec(p.tecnologias)}
          <div class="d-acciones">
            <a class="btn" href="/proyectos/${esc(p.slug)}">abrir expediente completo →</a>
            ${p.demo ? `<a class="btn-sec" href="${esc(p.demo)}" target="_blank" rel="noopener">demo ↗</a>` : ""}
            ${p.repo ? `<a class="btn-sec" href="${esc(p.repo)}" target="_blank" rel="noopener">código ↗</a>` : ""}
            ${botonAbrir("proyectos", "← proyectos", true)}
          </div>`,
      };
    }
    if (key.startsWith("gar:")) {
      const i = d.intereses.findIndex((x) => x.archivo === key.slice(4));
      const it = d.intereses[i];
      if (!it) return null;
      return {
        ip: ipHoja("garaje", i), hub: "garaje",
        html: `<p class="d-eyebrow">// garaje/${esc(it.archivo)}</p>
          <h2 class="d-h">${esc(it.titulo)}</h2>
          <p class="d-sub">${esc(it.texto)}</p>
          <div class="d-acciones">${botonAbrir("garaje", "← garaje", true)}</div>`,
      };
    }
    const h = hostPorId.get(key);
    if (!h) return null;
    const base = { ip: h.ip, hub: key };

    switch (key) {
      case "core":
        return { ...base, html: `<p class="d-eyebrow">// perfil del objetivo</p>
          <h2 class="d-h">${esc(d.nombre)}</h2>
          <p class="d-rol">${esc(d.rol)} · backend</p>
          <p class="d-sub">${esc(d.frase)}</p>
          <dl class="kv">${d.ficha.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
          <div class="d-acciones">${botonAbrir("proyectos", "ver proyectos →")}${botonAbrir("contacto", "contacto", true)}</div>` };
      case "proyectos":
        return { ...base, html: `<p class="d-eyebrow">// ls ~/proyectos</p>
          <h2 class="d-h">Proyectos</h2>
          <p class="d-sub">${d.proyectos.length} servicios en producción. Elige uno para abrir su expediente.</p>
          <ul class="filas">${d.proyectos.map((p, i) => `
            <li><button type="button" class="fila" data-abrir="proy:${esc(p.slug)}">
              <span class="fila-n">0${i + 1}</span>
              <span class="fila-t"><b>${esc(p.titulo)}${p.destacado ? ' <em>destacado</em>' : ""}</b><small>${esc(p.resumen)}</small>${etiquetasTec(p.tecnologias)}</span>
              <span class="fila-f" aria-hidden="true">→</span>
            </button></li>`).join("")}</ul>` };
      case "stack":
        return { ...base, html: `<p class="d-eyebrow">// nmap -sV ${esc(d.host)}.local</p>
          <h2 class="d-h">Stack</h2>
          <p class="d-sub">Escaneo de puertos: lo que uso a diario aparece <b class="c-ok">open</b>; lo que estoy aprendiendo, <b class="c-amb">filtered</b>.</p>
          <div class="nmap" role="table" aria-label="Tecnologías">
            <div class="nmap-h" role="row"><span>PUERTO</span><span>ESTADO</span><span>SERVICIO</span><span>CAPA</span></div>
            ${d.tecnologias.map((t) => `<div class="nmap-f" role="row"><span>${t.puerto}/tcp</span><span class="${t.estado === "open" ? "c-ok" : "c-amb"}">${esc(t.estado)}</span><span>${esc(t.nombre)}</span><span>${esc(t.capa)}</span></div>`).join("")}
          </div>
          <p class="d-nota">Nmap hecho: ${d.tecnologias.length} puertos escaneados.</p>` };
      case "sobre-mi":
        return { ...base, html: `<p class="d-eyebrow">// cat ~/sobre_mi.md</p>
          <h2 class="d-h">Sobre mí</h2>
          ${d.sobreMi.map((t) => `<p class="d-p">${esc(t)}</p>`).join("")}
          <div class="d-acciones">${botonAbrir("stack", "ver stack →")}${botonAbrir("garaje", "garaje", true)}</div>` };
      case "garaje":
        return { ...base, html: `<p class="d-eyebrow">// ls ~/garaje</p>
          <h2 class="d-h">Garaje</h2>
          <p class="d-sub">Lo que pasa cuando no estoy frente a una pantalla.</p>
          <ul class="filas">${d.intereses.map((it, i) => `
            <li><button type="button" class="fila" data-abrir="gar:${esc(it.archivo)}">
              <span class="fila-n">0${i + 1}</span>
              <span class="fila-t"><b>${esc(it.archivo)}</b><small>${esc(it.texto)}</small></span>
              <span class="fila-f" aria-hidden="true">→</span>
            </button></li>`).join("")}</ul>` };
      case "contacto":
        return { ...base, html: `<p class="d-eyebrow">// canales abiertos</p>
          <h2 class="d-h">Contacto</h2>
          <p class="d-sub">${esRoot ? "Reconocimiento completo. Ya sabes con quién hablas." : "Un mensaje y abrimos canal."}</p>
          <ul class="canales">
            <li><span>mail</span><a href="mailto:${esc(d.email)}">${esc(d.email)}</a></li>
            <li><span>github</span><a href="${esc(d.github)}" target="_blank" rel="noopener">${esc(corto(d.github))}</a></li>
            <li><span>linkedin</span><a href="${esc(d.linkedin)}" target="_blank" rel="noopener">${esc(corto(d.linkedin))}</a></li>
          </ul>
          <div class="d-acciones"><a class="btn" href="mailto:${esc(d.email)}">sudo hire ${esc(d.usuario)}</a></div>` };
    }
    return null;
  }

  function abrir(key: string, desdeHash = false) {
    const v = vista(key);
    if (!v) return;
    const yo = ++ficha;
    cancelarDescifrado();
    if (!desdeHash || !disparador) disparador = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    abierto = key;
    mapa.setActivo(key);
    marcarActivo(key);

    dSsh.textContent = `ssh ${d.usuario}@${v.ip}`;
    dossier.dataset.abierto = "true";
    dossier.removeAttribute("inert");
    // en escritorio el expediente tapa la derecha: la red se centra en lo que queda visible
    const escritorio = matchMedia("(min-width: 860px)").matches;
    mapa.setMargenDer(escritorio ? Math.min(540, $(".stage").clientWidth * 0.45) : 0);
    dCuerpo.innerHTML = "";
    dCuerpo.scrollTop = 0;

    // apretón de manos (handshake) antes de mostrar el contenido
    const fase = (txt: string) => { dHsTxt.textContent = txt; };
    dHs.classList.remove("listo");
    (dBarra as HTMLElement).style.transition = "none";
    (dBarra as HTMLElement).style.width = "0%";
    void (dBarra as HTMLElement).offsetWidth;
    const espera = reducido ? 0 : 520;
    (dBarra as HTMLElement).style.transition = `width ${espera}ms cubic-bezier(.2,.7,.2,1)`;
    (dBarra as HTMLElement).style.width = "100%";
    fase("SYN →");
    if (!reducido) {
      setTimeout(() => yo === ficha && fase("SYN → SYN/ACK →"), espera * 0.35);
      setTimeout(() => yo === ficha && fase("SYN → SYN/ACK → ACK · autenticando"), espera * 0.7);
    }

    setTimeout(() => {
      if (yo !== ficha) return;
      fase(`conectado · ${v.ip}`);
      dHs.classList.add("listo");
      dCuerpo.innerHTML = v.html;
      cancelarDescifrado = descifrar(dCuerpo, 850);
      if (!desdeHash) dCuerpo.focus({ preventScroll: true });
      if (primarios.includes(key)) visitar(key);
      visitar(v.hub);
    }, espera);

    // el hash solo cambia para los hosts principales (se puede compartir /#proyectos)
    if (primarios.includes(key)) history.replaceState(null, "", key === "core" ? location.pathname : `#${key}`);
    sniff("HTTP", `GET /${key.replace(":", "/")} 200`, "");
  }

  function cerrar() {
    if (!abierto) return;
    abierto = null;
    ficha++;
    cancelarDescifrado();
    dossier.dataset.abierto = "false";
    dossier.setAttribute("inert", "");
    mapa.setActivo(null);
    mapa.setMargenDer(0);
    marcarActivo(null);
    history.replaceState(null, "", location.pathname);
    disparador?.isConnected && disparador.focus({ preventScroll: true });
    disparador = null;
  }

  function marcarActivo(key: string | null) {
    const hub = key ? (vista(key)?.hub ?? key) : null;
    raiz.querySelectorAll(".obj, .tab").forEach((b) => {
      const id = (b as HTMLElement).dataset.host ?? (b as HTMLElement).dataset.tab;
      b.classList.toggle("activa", !!hub && id === hub);
      if (b.classList.contains("tab")) b.setAttribute("aria-current", !!hub && id === hub ? "page" : "false");
    });
  }

  /* ============================================================
     TRÁFICO DE RED (decorativo + eventos reales)
     ============================================================ */
  const sniffer = $("[data-sniffer]");
  const ips = d.hosts.map((h) => h.ip);
  const rutas = ["proyectos", "stack", "sobre-mi", "garaje", ...d.proyectos.map((p) => `proyectos/${p.slug}`)];
  const hora = () => new Date().toTimeString().slice(0, 8);

  function sniff(proto: string, texto: string, clase = "") {
    const fila = document.createElement("div");
    fila.className = `sn ${clase}`;
    fila.innerHTML = `<span class="t">${hora()}</span> <b>${esc(proto)}</b> ${esc(texto)}`;
    sniffer.appendChild(fila);
    while (sniffer.childElementCount > 26) sniffer.firstElementChild!.remove();
  }

  const plantillas: (() => [string, string])[] = [
    () => ["SSH", `${rnd(ips)} → ${rnd(ips)} cifrado len=${64 + azar(200)}`],
    () => ["TCP", `${rnd(ips)}:${rnd([443, 80, 3306, 9000, 22])} [ACK] seq=${azar(9000)}`],
    () => ["DNS", `A ${d.host}.local → ${rnd(ips)}`],
    () => ["HTTP", `GET /${rnd(rutas)} 200 ${5 + azar(35)}ms`],
    () => ["SQL", `SELECT * FROM ${rnd(["posts", "usuarios", "sesiones"])} LIMIT ${1 + azar(20)}`],
    () => ["ARP", `¿quién tiene ${rnd(ips)}?`],
    () => ["TLS", `ClientHello → ${d.host}.local`],
  ];
  const ruidoDeFondo = () => {
    if (document.hidden) return;
    const [p, t] = rnd(plantillas)();
    sniff(p, t);
  };

  /* ============================================================
     RELOJ Y SESIÓN
     ============================================================ */
  $("[data-sesion]").textContent = "0x" + (0x1000 + azar(0xefff)).toString(16).toUpperCase();
  const reloj = $("[data-reloj]");
  const tic = () => { reloj.textContent = hora(); };
  tic();
  setInterval(tic, 1000);

  /* ============================================================
     AVISO (toast)
     ============================================================ */
  let toastEl: HTMLElement | null = null;
  function toast(msg: string, abre?: string) {
    toastEl?.remove();
    const el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.innerHTML = `<span>${esc(msg)}</span>${abre ? `<button type="button" data-abrir="${esc(abre)}">ir</button>` : ""}<button type="button" class="toast-x" aria-label="Cerrar aviso">✕</button>`;
    el.querySelector(".toast-x")!.addEventListener("click", () => el.remove());
    $(".stage").appendChild(el);
    toastEl = el;
    setTimeout(() => el.remove(), 12000);
  }

  /* ============================================================
     GLITCH GLOBAL
     ============================================================ */
  function glitch() {
    if (reducido) return;
    raiz.classList.add("glitcheando");
    setTimeout(() => raiz.classList.remove("glitcheando"), 900);
  }

  /* ============================================================
     CONSOLA
     ============================================================ */
  const consola = $("[data-consola]");
  const cSalida = $("[data-c-salida]");
  const cInput = $<HTMLInputElement>("[data-c-input]");
  const cPrompt = $("[data-c-prompt]");
  const historial: string[] = [];
  let hPos = 0;

  const promptTexto = () => (esRoot ? `root@${d.host}:~#` : `${d.usuario}@${d.host}:~$`);
  cPrompt.textContent = promptTexto();

  function ln(html: string, clase = "") {
    const el = document.createElement("div");
    el.className = `c-ln ${clase}`;
    el.innerHTML = html;
    cSalida.appendChild(el);
    cSalida.scrollTop = cSalida.scrollHeight;
  }

  function abrirConsola() {
    if (!consola.hidden) { cInput.focus(); return; }
    consola.hidden = false;
    raiz.classList.add("con-consola");
    // en móvil el expediente ocupa toda la pantalla: se cierra para ver la consola
    if (matchMedia("(max-width: 859px)").matches) cerrar();
    if (!cSalida.childElementCount) {
      ln(`<span class="c-ok">milodev shell</span> — escribe <b>help</b> para ver los comandos. <b>Tab</b> autocompleta.`);
    }
    cInput.focus();
  }
  function cerrarConsola() {
    consola.hidden = true;
    raiz.classList.remove("con-consola");
  }

  function buscarHost(q: string): string | null {
    const n = norm(q);
    if (/^\d$/.test(n)) return d.hosts[Number(n)]?.id ?? null;
    const h = d.hosts.find((x) => x.id === n || norm(x.nombre) === n || x.ip === q.trim());
    if (h) return h.id;
    const p = d.proyectos.find((x) => x.slug === n || `${x.slug}.md` === n);
    if (p) return `proy:${p.slug}`;
    const it = d.intereses.find((x) => x.archivo === n);
    if (it) return `gar:${it.archivo}`;
    return null;
  }

  const comandos: Record<string, (a: string[]) => void> = {
    help() {
      const f = (c: string, t: string) => `<span class="c-cmd">${c.padEnd(18, " ")}</span>${esc(t)}`;
      [
        f("scan", "lista los hosts de la red"),
        f("connect <host>", "abre su expediente (nombre, ip o número)"),
        f("whoami", "quién soy"),
        f("crt [on|off]", "pantalla de tubo catódico (tecla C)"),
        f("stack", "escaneo de puertos (tecnologías)"),
        f("contacto", "canales para escribirme"),
        f("sudo hire miller", "contratar (probablemente funcione)"),
        f("clear · exit", "limpiar · cerrar la consola"),
      ].forEach((l) => ln(l));
      ln(`<span class="c-dim">hay más… prueba cosas. y alguien dejó un flag.txt por ahí.</span>`);
    },
    scan() {
      ln(`<span class="c-dim">Starting scan 10.13.37.0/24 …</span>`);
      d.hosts.forEach((h, i) =>
        ln(`${i} ${h.ip.padEnd(12, " ")} ${h.nombre.padEnd(10, " ")} <span class="${visitados.has(h.id) ? "c-ok" : "c-alerta"}">${visitados.has(h.id) ? "comprometido" : "sin explorar"}</span>`),
      );
    },
    connect(a) {
      if (!a[0]) return ln("uso: connect &lt;host&gt;  (prueba <b>scan</b>)", "c-alerta");
      const k = buscarHost(a.join(" "));
      if (!k) return ln(`connect: ${esc(a.join(" "))}: host no encontrado`, "c-alerta");
      ln(`<span class="c-dim">conectando…</span>`);
      abrir(k);
    },
    whoami() {
      ln(`${esc(d.nombre)} — ${esc(d.rol.toLowerCase())}`);
      ln(`<span class="c-dim">${esc(d.frase)}</span>`);
    },
    stack() { abrir("stack"); },
    contacto() { abrir("contacto"); },
    crt(a) {
      const q = (a[0] ?? "").toLowerCase();
      const b = q === "on" ? true : q === "off" ? false : !crtOn;
      crt(b, false);
      ln(b ? `<span class="c-ok">CRT on</span> <span class="c-dim">${crtGl.soportado ? "shader WebGL: curvatura, bloom, aberración cromática, scanlines" : "WebGL no disponible: solo la capa CSS"}</span>` : `<span class="c-dim">CRT off</span>`);
    },
    ls() { comandos.scan([]); },
    cat(a) {
      const q = norm(a.join(" "));
      if (q === "flag.txt" || q === "flag") {
        return esRoot
          ? ln(`<span class="c-ok">flag{h3ll0_fr13nd}</span> — lo conseguiste. escríbeme y lo celebramos.`)
          : ln("cat: flag.txt: permiso denegado (necesitas ser root: comprométe los 6 hosts)", "c-alerta");
      }
      const k = q && buscarHost(q);
      if (k) return abrir(k);
      ln(`cat: ${esc(q || "?")}: no existe el archivo`, "c-alerta");
    },
    sudo(a) {
      const t = a.join(" ").toLowerCase();
      if (/^hire\b/.test(t)) {
        ln(`[sudo] contraseña para ${esc(d.usuario)}: ********`, "c-dim");
        ln("permiso concedido. abriendo canal de contacto…", "c-ok");
        return abrir("contacto");
      }
      ln(`${esc(d.usuario)} no está en el archivo sudoers. Este incidente será reportado.`, "c-alerta");
      sniff("IDS", "intento de elevación de privilegios", "alerta");
    },
    rm() {
      ln("rm: este sistema es de solo lectura. buen intento.", "c-alerta");
      glitch();
    },
    fsociety() { comandos.hack([]); },
    hack() {
      glitch();
      ln(`<span class="c-ok">Hello, friend.</span>`);
      ln(`<span class="c-dim">"Controlar la información es controlar el mundo." — alguien, en una serie que me encanta.</span>`);
      sniff("IDS", "anomalía: el visitante parece saber lo que hace", "alerta");
    },
    date() { ln(new Date().toString()); },
    uname() { ln(`milodev 6.1.0-astro #1 SMP x86_64 GNU/Linux`); },
    history() { historial.forEach((h, i) => ln(`${String(i + 1).padStart(3, " ")}  ${esc(h)}`)); },
    clear() { cSalida.innerHTML = ""; },
    exit() { cerrarConsola(); },
  };
  const alias: Record<string, string> = { ssh: "connect", open: "connect", cd: "connect", nmap: "stack", mail: "contacto", email: "contacto", cls: "clear", quit: "exit", q: "exit", "?": "help", ayuda: "help", neofetch: "whoami", id: "whoami" };

  function ejecutar(linea: string) {
    const txt = linea.trim();
    ln(`<span class="c-p">${esc(promptTexto())}</span> ${esc(txt)}`);
    if (!txt) return;
    historial.push(txt);
    hPos = historial.length;
    const [c0, ...args] = txt.split(/\s+/);
    const c = alias[c0.toLowerCase()] ?? c0.toLowerCase();
    const fn = Object.prototype.hasOwnProperty.call(comandos, c) ? comandos[c] : null;
    if (fn) fn(args);
    else ln(`bash: ${esc(c0)}: comando no encontrado — prueba <b>help</b>`, "c-alerta");
  }

  function autocompletar() {
    const partes = cInput.value.split(/\s+/);
    const ultimo = partes[partes.length - 1].toLowerCase();
    const candidatos =
      partes.length <= 1
        ? [...Object.keys(comandos), ...Object.keys(alias).filter((a) => /^[a-z]/.test(a))]
        : [...d.hosts.map((h) => h.nombre), ...d.proyectos.map((p) => p.slug), "flag.txt"];
    const hit = [...new Set(candidatos)].filter((c) => c.toLowerCase().startsWith(ultimo));
    if (hit.length === 1) { partes[partes.length - 1] = hit[0]; cInput.value = partes.join(" ") + " "; }
    else if (hit.length > 1) ln(`<span class="c-dim">${hit.map(esc).join("  ")}</span>`);
  }

  cInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { ejecutar(cInput.value); cInput.value = ""; }
    else if (e.key === "Tab") { e.preventDefault(); autocompletar(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); hPos = Math.max(0, hPos - 1); cInput.value = historial[hPos] ?? ""; }
    else if (e.key === "ArrowDown") { e.preventDefault(); hPos = Math.min(historial.length, hPos + 1); cInput.value = historial[hPos] ?? ""; }
    else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); comandos.clear([]); }
  });
  $("[data-consola-abrir]").addEventListener("click", abrirConsola);

  /* ============================================================
     EVENTOS GLOBALES
     ============================================================ */
  // Cualquier elemento con data-abrir abre ese expediente (lista, pestañas, botones del expediente)
  raiz.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-abrir]");
    if (!el || (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) return;
    e.preventDefault();
    if (el.dataset.abrir === abierto && el.closest(".obj, .tab")) return cerrar();
    abrir(el.dataset.abrir!);
  });
  $("[data-d-cerrar]").addEventListener("click", cerrar);

  // Botones de zoom (+ / − / restablecer)
  raiz.querySelectorAll<HTMLElement>("[data-zoom]").forEach((b) =>
    b.addEventListener("click", () => {
      const a = b.dataset.zoom;
      if (a === "in") mapa.zoom(1.3);
      else if (a === "out") mapa.zoom(1 / 1.3);
      else if (a === "rot") b.setAttribute("aria-pressed", String(mapa.autoGirar()));
      else mapa.reiniciarVista();
    }),
  );

  addEventListener("keydown", (e) => {
    const escribiendo = (e.target as HTMLElement)?.matches?.("input, textarea");
    if (e.key === "Escape") {
      if (!consola.hidden) cerrarConsola();
      else cerrar();
      return;
    }
    if (!escribiendo && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "`" || e.key === "/")) {
      e.preventDefault();
      abrirConsola();
    }
    // zoom con el teclado: + / − / 0
    if (!escribiendo && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === "+" || e.key === "=") mapa.zoom(1.3);
      else if (e.key === "-" || e.key === "_") mapa.zoom(1 / 1.3);
      else if (e.key === "0") mapa.reiniciarVista();
      else if (e.key === "r" || e.key === "R") $<HTMLElement>('[data-zoom="rot"]').click();
      else if (e.key === "c" || e.key === "C") crt(!crtOn);
    }
    // código Konami
    konami = e.key === KONAMI[konami] ? konami + 1 : e.key === KONAMI[0] ? 1 : 0;
    if (konami === KONAMI.length) {
      konami = 0;
      glitch();
      abrirConsola();
      ln(`<span class="c-ok">↑↑↓↓←→←→BA</span> — hola, viejo conocido. prueba <b>cat flag.txt</b>.`);
    }
  });
  const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  let konami = 0;

  addEventListener("hashchange", () => {
    const k = buscarHost(location.hash.slice(1));
    if (k && primarios.includes(k) && k !== abierto) abrir(k, true);
  });

  /* ============================================================
     INTRO: "Hello, friend."
     ============================================================ */
  async function intro() {
    const el = $("[data-intro]");
    const hola = $("[data-i-hola]");
    const log = $("[data-i-log]");
    const acceso = $("[data-i-acceso]");
    el.classList.add("on");
    raiz.classList.add("arrancando");

    let cancelado = false;
    const esperas: (() => void)[] = [];
    const saltar = () => { cancelado = true; esperas.splice(0).forEach((f) => f()); };
    const tecla = (e: KeyboardEvent) => { if (["Enter", "Escape", " "].includes(e.key)) { e.preventDefault(); saltar(); } };
    addEventListener("keydown", tecla);
    el.addEventListener("click", saltar);

    const dormir = (ms: number) =>
      new Promise<void>((r) => {
        if (cancelado) return r();
        const id = setTimeout(r, ms);
        esperas.push(() => { clearTimeout(id); r(); });
      });
    const teclear = async (dest: HTMLElement, txt: string, vel: number) => {
      for (const ch of txt) {
        if (cancelado) { dest.textContent = txt; return; }
        dest.textContent += ch;
        await dormir(vel);
      }
    };

    await teclear(hola, "Hello, friend.", 85);
    await dormir(650);

    const pasos: [string, string, boolean?][] = [
      ["resolviendo milodev.local", "OK"],
      ["escaneando 10.13.37.0/24", `${d.hosts.length} hosts`],
      ["evadiendo firewall", "OK"],
      ["descifrando acceso", "", true],
    ];
    for (const [txt, estado, barra] of pasos) {
      const p = document.createElement("p");
      p.innerHTML = `<span class="i-p">&gt;</span> <span data-t></span> <span data-e class="i-e"></span>`;
      log.appendChild(p);
      await teclear(p.querySelector("[data-t]")!, txt, 14);
      const e = p.querySelector<HTMLElement>("[data-e]")!;
      if (barra) {
        for (let i = 0; i <= 12; i++) {
          if (cancelado) i = 12;
          e.textContent = `[${"█".repeat(i)}${"░".repeat(12 - i)}] ${Math.round((i / 12) * 100)}%`;
          await dormir(55);
        }
      } else {
        await dormir(170);
        e.textContent = `[ ${estado} ]`;
      }
    }

    await dormir(260);
    acceso.hidden = false;
    acceso.classList.add("flash");
    await dormir(950);
    el.classList.add("fuera");
    raiz.classList.remove("arrancando");
    await dormir(550);
    el.classList.remove("on", "fuera");
    removeEventListener("keydown", tecla);
  }

  /* ============================================================
     ARRANQUE
     ============================================================ */
  const hash = location.hash.slice(1);
  let yaVisto = false;
  try { yaVisto = sessionStorage.getItem("milodev-intro") === "1"; } catch {}

  (async () => {
    if (!(reducido || yaVisto || hash)) {
      await intro();
      try { sessionStorage.setItem("milodev-intro", "1"); } catch {}
    }
    mapa.iniciar();
    try { if (localStorage.getItem("milodev-crt") === "1") crt(true, false); } catch {}
    sniff("SYS", `sesión iniciada · ${d.usuario}@${d.host}`, "ok");
    sniff("SYS", `${d.hosts.length} hosts detectados en 10.13.37.0/24`);
    for (let i = 0; i < 6; i++) ruidoDeFondo();
    setInterval(ruidoDeFondo, 900);
    const k = hash && buscarHost(hash);
    if (k && primarios.includes(k)) setTimeout(() => abrir(k, true), reducido ? 0 : 700);

    console.log(
      "%cHello, friend.%c\n¿Mirando el código? Me gusta. Prueba la consola de la página: pulsa ` (o /).",
      "color:#6ee7b7;font:700 16px monospace",
      "color:inherit;font:12px monospace",
    );
  })();
}
