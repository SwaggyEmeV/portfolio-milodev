// Efecto "descifrado": el texto aparece como basura (0, #, {, ...) y se va
// resolviendo letra por letra, de izquierda a derecha con un poco de azar.
// Solo toca los nodos de texto, así que los enlaces y botones siguen funcionando.
const GLIFOS = "01<>/\\{}[]#$%&*+=?!;:~";

export const prefiereMenosMovimiento = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

type Trozo = { nodo: Text; orig: string; desde: number };

/** Descifra el texto de `raiz`. Devuelve una función para cancelarlo (deja el texto final). */
export function descifrar(raiz: HTMLElement, duracion = 900): () => void {
  if (prefiereMenosMovimiento()) return () => {};

  const trozos: Trozo[] = [];
  let total = 0;
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const nodo = n as Text;
    const orig = nodo.data;
    if (!orig.trim()) continue;
    trozos.push({ nodo, orig, desde: total });
    total += orig.length;
  }
  if (!total) return () => {};

  // Umbral aleatorio por carácter: cuándo "se resuelve" (0 = al inicio, 1 = al final)
  const umbral = Float32Array.from({ length: total }, (_, i) => (i / total) * 0.78 + Math.random() * 0.22);
  const inicio = performance.now();
  let vivo = true;

  const fijar = () => trozos.forEach((t) => (t.nodo.data = t.orig));

  const cuadro = (ahora: number) => {
    if (!vivo) return;
    const p = Math.min(1, (ahora - inicio) / duracion);
    if (p >= 1) return fijar();
    for (const t of trozos) {
      let s = "";
      for (let k = 0; k < t.orig.length; k++) {
        const c = t.orig[k];
        s += /\s/.test(c) || p >= umbral[t.desde + k] ? c : GLIFOS[(Math.random() * GLIFOS.length) | 0];
      }
      t.nodo.data = s;
    }
    requestAnimationFrame(cuadro);
  };
  requestAnimationFrame(cuadro);

  return () => {
    vivo = false;
    fijar();
  };
}
