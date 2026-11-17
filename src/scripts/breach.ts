// Minijuego opcional de intrusión ("breach"): una matriz de códigos hexadecimales.
// Eliges códigos alternando fila y columna (empiezas por la fila de arriba) y
// tienes que dejar en el buffer la secuencia pedida, seguida y en orden.
//
// Siempre tiene solución: la secuencia sale de un recorrido real de la matriz.
// Se juega con ratón, táctil o teclado (flechas + Enter) y el tiempo se puede quitar.

export type FinBreach = "ok" | "buffer" | "tiempo" | "abortado";

export type BreachOpts = {
  contenedor: HTMLElement;
  reducido: boolean;
  ip: string;
  nombre: string;
  dificil: boolean;
  onFin: (ganado: boolean, motivo: FinBreach) => void;
};

const CODIGOS = ["E9", "1C", "55", "BD", "7A"];
const N = 5;
const ri = (n: number) => (Math.random() * n) | 0;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function iniciarBreach(o: BreachOpts) {
  const B = o.dificil ? 7 : 6; // huecos del buffer
  const L = o.dificil ? 4 : 3; // largo de la secuencia
  const TIEMPO = o.dificil ? 40 : 32;

  let mat: string[][] = [];
  let seq: string[] = [];
  let usada: boolean[][] = [];
  let buf: string[] = [];
  let modo: "fila" | "col" = "fila";
  let linea = 0;
  let resta = TIEMPO * 1000;
  let conTiempo = !o.reducido; // con "menos movimiento" arranca sin cuenta atrás
  let terminado = false;
  let reloj = 0;
  let cerrado = false;
  let ultimo: FinBreach = "abortado";

  const el = document.createElement("div");
  el.className = "bz";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", `Protocolo de intrusión en ${o.ip}`);
  o.contenedor.appendChild(el);

  /* ---------- partida ---------- */
  function nueva() {
    mat = Array.from({ length: N }, () => Array.from({ length: N }, () => CODIGOS[ri(CODIGOS.length)]));
    // recorrido real: fila 0 → columna → fila → … sin repetir casilla
    const ruta: [number, number][] = [];
    const vistas = new Set<string>();
    let r = 0, c = ri(N);
    ruta.push([r, c]);
    vistas.add(`${r},${c}`);
    for (let i = 1; i < B; i++) {
      const libres: number[] = [];
      for (let k = 0; k < N; k++) if (!vistas.has(i % 2 ? `${k},${c}` : `${r},${k}`)) libres.push(k);
      const k = libres[ri(libres.length)];
      if (i % 2) r = k; else c = k;
      ruta.push([r, c]);
      vistas.add(`${r},${c}`);
    }
    const s = ri(B - L + 1);
    seq = ruta.slice(s, s + L).map(([a, b]) => mat[a][b]);
    usada = Array.from({ length: N }, () => Array(N).fill(false));
    buf = [];
    modo = "fila";
    linea = 0;
    resta = TIEMPO * 1000;
    terminado = false;
    pintar();
    enfocar();
  }

  /** Cuántos códigos de la secuencia lleva el final del buffer (progreso). */
  function progreso() {
    for (let k = Math.min(L, buf.length); k > 0; k--) {
      if (buf.slice(-k).every((x, i) => x === seq[i])) return k;
    }
    return 0;
  }
  const completa = () => buf.some((_, i) => i + L <= buf.length && seq.every((x, j) => buf[i + j] === x));
  const activa = (r: number, c: number) => !usada[r][c] && (modo === "fila" ? r === linea : c === linea);

  function elegir(r: number, c: number) {
    if (terminado || !activa(r, c)) return;
    buf.push(mat[r][c]);
    usada[r][c] = true;
    linea = modo === "fila" ? c : r;
    modo = modo === "fila" ? "col" : "fila";
    if (completa()) return fin("ok");
    const quedan = [...Array(N).keys()].some((k) => (modo === "fila" ? !usada[linea][k] : !usada[k][linea]));
    if (buf.length >= B || !quedan) return fin("buffer");
    pintar();
    enfocar();
  }

  function fin(motivo: FinBreach) {
    ultimo = motivo;
    if (terminado) return;
    terminado = true;
    clearInterval(reloj);
    pintar();
    const ok = motivo === "ok";
    const msg = ok ? "ACCESO CONCEDIDO" : motivo === "tiempo" ? "TIEMPO AGOTADO" : "BREACH FALLIDO";
    const cuerpo = el.querySelector<HTMLElement>(".bz-res")!;
    cuerpo.hidden = false;
    cuerpo.className = `bz-res ${ok ? "ok" : "mal"}`;
    cuerpo.innerHTML = `<p class="bz-res-t">${msg}</p>` + (ok ? "" : `<div class="bz-res-b"><button type="button" class="btn" data-bz="otra">reintentar</button><button type="button" class="btn-sec" data-bz="salir">salir</button></div>`);
    el.querySelector<HTMLElement>("[data-bz-vivo]")!.textContent = msg;
    if (ok) setTimeout(() => cerrar(true, "ok"), o.reducido ? 600 : 1200);
    else cuerpo.querySelector<HTMLElement>("button")?.focus();
  }

  function cerrar(ganado: boolean, motivo: FinBreach) {
    if (cerrado) return;
    cerrado = true;
    clearInterval(reloj);
    removeEventListener("keydown", teclas, true);
    el.remove();
    o.onFin(ganado, motivo);
  }

  /* ---------- pintura ---------- */
  el.innerHTML = `
    <div class="bz-caja">
      <header class="bz-cab">
        <span class="bz-tit">BREACH PROTOCOL <b>${esc(o.ip)}</b> · ${esc(o.nombre)}</span>
        <label class="bz-tiempo"><input type="checkbox" data-bz-t ${conTiempo ? "checked" : ""}> tiempo</label>
        <button type="button" class="bz-x" data-bz="salir" aria-label="Abortar intrusión">esc ✕</button>
      </header>
      <div class="bz-barra" aria-hidden="true"><i data-bz-barra></i></div>
      <div class="bz-cuerpo">
        <div class="bz-mat" data-bz-mat role="group" aria-label="Matriz de códigos"></div>
        <div class="bz-lado">
          <p class="bz-lbl">secuencia requerida</p>
          <div class="bz-seq" data-bz-seq></div>
          <p class="bz-lbl">buffer</p>
          <div class="bz-buf" data-bz-buf></div>
          <p class="bz-ayuda">Elige un código de la línea resaltada. Después, de la columna o fila que cruza ese código, y así alternando. Deja la secuencia en el buffer, seguida y en orden.</p>
        </div>
      </div>
      <p class="sr-only" role="status" aria-live="polite" data-bz-vivo></p>
      <div class="bz-res" data-bz-res hidden></div>
    </div>`;
  const $m = el.querySelector<HTMLElement>("[data-bz-mat]")!;
  const $seq = el.querySelector<HTMLElement>("[data-bz-seq]")!;
  const $buf = el.querySelector<HTMLElement>("[data-bz-buf]")!;
  const $barra = el.querySelector<HTMLElement>("[data-bz-barra]")!;
  const $vivo = el.querySelector<HTMLElement>("[data-bz-vivo]")!;

  function pintar() {
    $m.innerHTML = mat
      .map((fila, r) =>
        fila
          .map((cod, c) => {
            const on = !terminado && activa(r, c);
            const cls = `bz-c${on ? " on" : ""}${usada[r][c] ? " usada" : ""}${!terminado && !usada[r][c] && (modo === "fila" ? r === linea : c === linea) ? " linea" : ""}`;
            return `<button type="button" class="${cls}" data-r="${r}" data-c="${c}" ${on ? "" : "disabled"} aria-label="fila ${r + 1}, columna ${c + 1}: ${cod}">${cod}</button>`;
          })
          .join(""),
      )
      .join("");
    const p = progreso();
    $seq.innerHTML = seq.map((x, i) => `<span class="${i < p ? "hecho" : ""}">${x}</span>`).join("");
    $buf.innerHTML = Array.from({ length: B }, (_, i) => `<span class="${i < buf.length ? "lleno" : ""}">${buf[i] ?? ""}</span>`).join("");
    if (!terminado) $vivo.textContent = `buffer ${buf.length} de ${B}, secuencia ${p} de ${L}. ${modo === "fila" ? "Elige en la fila" : "Elige en la columna"} ${linea + 1}.`;
  }
  function enfocar() {
    const b = $m.querySelector<HTMLElement>(".bz-c.on");
    b?.focus({ preventScroll: true });
  }

  /* ---------- tiempo ---------- */
  function pintarTiempo() {
    $barra.style.width = conTiempo ? `${Math.max(0, (resta / (TIEMPO * 1000)) * 100)}%` : "100%";
    $barra.parentElement!.classList.toggle("sin", !conTiempo);
    $barra.parentElement!.classList.toggle("poco", conTiempo && resta < TIEMPO * 300);
  }
  reloj = window.setInterval(() => {
    if (terminado || !conTiempo) return;
    resta -= 100;
    pintarTiempo();
    if (resta <= 0) fin("tiempo");
  }, 100);
  el.querySelector<HTMLInputElement>("[data-bz-t]")!.addEventListener("change", (e) => {
    conTiempo = (e.target as HTMLInputElement).checked;
    pintarTiempo();
  });

  /* ---------- eventos ---------- */
  el.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const celda = t.closest<HTMLElement>(".bz-c");
    if (celda) return elegir(Number(celda.dataset.r), Number(celda.dataset.c));
    const acc = t.closest<HTMLElement>("[data-bz]")?.dataset.bz;
    if (acc === "salir") cerrar(false, terminado ? ultimo : "abortado");
    else if (acc === "otra") { el.querySelector<HTMLElement>("[data-bz-res]")!.hidden = true; nueva(); pintarTiempo(); }
  });

  function teclas(e: KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); cerrar(false, "abortado"); return; }
    if (e.key === "Tab") return;
    e.stopImmediatePropagation(); // mientras se juega, los atajos de la página no actúan
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir || terminado) return;
    e.preventDefault();
    const libres = [...$m.querySelectorAll<HTMLElement>(".bz-c.on")];
    if (!libres.length) return;
    const i = libres.indexOf(document.activeElement as HTMLElement);
    libres[(i + dir + libres.length) % libres.length].focus();
  }
  addEventListener("keydown", teclas, true);

  nueva();
  pintarTiempo();

  return { cerrar: () => cerrar(false, "abortado") };
}
