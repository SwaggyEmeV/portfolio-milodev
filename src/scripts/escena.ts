// =====================================================================
//  ESCENA 3D DE TODA LA PÁGINA
//  Un único <canvas> fijo detrás del contenido. Al hacer scroll, la cámara
//  viaja: portal (hero) -> túnel (proyectos, sobre mí) -> garaje con la
//  moto que se ensambla -> portal de salida (contacto).
// =====================================================================
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Shape, Path, ExtrudeGeometry,
  EdgesGeometry, LineSegments, LineBasicMaterial, Mesh, MeshBasicMaterial,
  BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial, AdditiveBlending,
  Color, Vector3, Vector2, Fog, LineLoop, IcosahedronGeometry, OctahedronGeometry,
  TorusGeometry, BoxGeometry, MathUtils,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { crearMoto, ensamblar } from "./moto";
import { motor } from "./motor";

const VERDE = new Color(0x4ade80);
const VERDE_CLARO = new Color(0xbbf7d0);
const NARANJA = new Color(0xfb923c);
const ASFALTO = 0x0a0f0c;

// Posiciones clave en el mundo (eje Z = profundidad)
const Z_TUNEL_INICIO = -6;
const Z_TUNEL_FIN = -85;
const Z_MOTO = -95;
const Z_SALIDA = -125;

// ---------------------------------------------------------------------
//  PARTÍCULAS con un "shader" propio (programa que corre en la GPU).
//  Cada partícula sabe su radio, ángulo y velocidad: la GPU calcula su
//  giro en cada frame, así movemos miles sin que el procesador sufra.
// ---------------------------------------------------------------------
const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aRadio;
  attribute float aAngulo;
  attribute float aVel;
  attribute float aTam;
  attribute float aTipo;     // 0 portal, 1 túnel, 2 salida, 3 polvo
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    if (aTipo < 2.5) {
      float a = aAngulo + uTime * aVel;
      p.x = cos(a) * aRadio;
      p.y = sin(a) * aRadio;
    }
    if (aTipo > 0.5 && aTipo < 1.5) {
      // el túnel "fluye" hacia la cámara y se repite en bucle
      float largo = ${(Z_TUNEL_INICIO - Z_TUNEL_FIN).toFixed(1)};
      p.z = ${Z_TUNEL_FIN.toFixed(1)} + mod(position.z - ${Z_TUNEL_FIN.toFixed(1)} + uTime * 4.0, largo);
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // tamaño según la distancia (perspectiva), con un máximo para que no tape el texto
    gl_PointSize = min(aTam * uPixelRatio * (55.0 / -mv.z), 14.0 * uPixelRatio);
    // se desvanece de lejos (niebla) y muy de cerca
    vAlpha = 0.75 * (1.0 - smoothstep(14.0, 38.0, -mv.z)) * smoothstep(0.5, 3.0, -mv.z);
    vColor = aColor;
  }
`;
const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float brillo = smoothstep(0.5, 0.0, d);   // punto redondo y difuminado
    gl_FragColor = vec4(vColor, brillo * vAlpha);
  }
`;

function crearParticulas(escala: number) {
  const pos: number[] = [], radio: number[] = [], ang: number[] = [], vel: number[] = [];
  const tam: number[] = [], tipo: number[] = [], col: number[] = [];
  const color = (c: Color) => col.push(c.r, c.g, c.b);
  const azarColor = (pNaranja: number) =>
    Math.random() < pNaranja ? NARANJA : Math.random() < 0.25 ? VERDE_CLARO : VERDE;

  const anillo = (n: number, z: number, rMin: number, rMax: number, t: number, velBase: number) => {
    for (let i = 0; i < n; i++) {
      const r = rMin + Math.pow(Math.random(), 1.4) * (rMax - rMin); // algo más denso por dentro
      pos.push(0, 0, z + (Math.random() - 0.5) * 0.8);
      radio.push(r);
      ang.push(Math.random() * Math.PI * 2);
      vel.push(velBase * (rMin / r) * (0.7 + Math.random() * 0.6)); // dentro gira más rápido
      tam.push(0.6 + Math.random() * 1.6);
      tipo.push(t);
      color(azarColor(0.1));
    }
  };

  anillo(Math.round(4000 * escala), 0, 2.3, 5.2, 0, 0.55);          // portal del hero
  anillo(Math.round(3500 * escala), Z_SALIDA, 2.8, 6.0, 2, -0.45);   // portal de salida

  // Túnel: cilindro largo
  for (let i = 0; i < Math.round(7000 * escala); i++) {
    pos.push(0, 0, MathUtils.randFloat(Z_TUNEL_FIN, Z_TUNEL_INICIO));
    radio.push(MathUtils.randFloat(4, 8));
    ang.push(Math.random() * Math.PI * 2);
    vel.push(0.05 + Math.random() * 0.08);
    tam.push(0.5 + Math.random() * 1.2);
    tipo.push(1);
    color(azarColor(0.06));
  }

  // Polvo flotando en todo el recorrido
  for (let i = 0; i < Math.round(2500 * escala); i++) {
    pos.push(MathUtils.randFloatSpread(40), MathUtils.randFloatSpread(26), MathUtils.randFloat(Z_SALIDA - 10, 12));
    radio.push(0); ang.push(0); vel.push(0);
    tam.push(0.3 + Math.random() * 0.6);
    tipo.push(3);
    color(Math.random() < 0.5 ? VERDE_CLARO : VERDE);
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("aRadio", new Float32BufferAttribute(radio, 1));
  geo.setAttribute("aAngulo", new Float32BufferAttribute(ang, 1));
  geo.setAttribute("aVel", new Float32BufferAttribute(vel, 1));
  geo.setAttribute("aTam", new Float32BufferAttribute(tam, 1));
  geo.setAttribute("aTipo", new Float32BufferAttribute(tipo, 1));
  geo.setAttribute("aColor", new Float32BufferAttribute(col, 3));

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: Math.min(devicePixelRatio, 2) } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const puntos = new Points(geo, material);
  puntos.frustumCulled = false; // el shader mueve los puntos: no dejamos que Three los "recorte"
  return { puntos, material };
}

// ---------------------------------------------------------------------
//  ENGRANAJES (mismo método de antes: perfil 2D extruido)
// ---------------------------------------------------------------------
function engranaje(dientes: number, radio: number, color: number) {
  const forma = new Shape();
  const pasos = dientes * 4;
  for (let i = 0; i <= pasos; i++) {
    const a = (i / pasos) * Math.PI * 2;
    const r = i % 4 === 1 || i % 4 === 2 ? radio * 1.18 : radio;
    i === 0 ? forma.moveTo(Math.cos(a) * r, Math.sin(a) * r) : forma.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const hueco = new Path();
  hueco.absarc(0, 0, radio * 0.35, 0, Math.PI * 2, true);
  forma.holes.push(hueco);
  const geo = new ExtrudeGeometry(forma, { depth: 0.35, bevelEnabled: false, curveSegments: 24 });
  geo.center();
  const g = new Group();
  g.add(new Mesh(geo, new MeshBasicMaterial({ color: ASFALTO, transparent: true, opacity: 0.85 })));
  g.add(new LineSegments(new EdgesGeometry(geo, 20), new LineBasicMaterial({ color })));
  return g;
}

/** Círculo de línea (para los aros de los portales). */
function aro(radio: number, color: Color, opacidad = 1) {
  const p: number[] = [];
  for (let i = 0; i < 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    p.push(Math.cos(a) * radio, Math.sin(a) * radio, 0);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(p, 3));
  return new LineLoop(geo, new LineBasicMaterial({ color, transparent: true, opacity: opacidad }));
}

// ---------------------------------------------------------------------
//  CÁMARA: un "fotograma clave" por sección. Entre dos secciones, la
//  cámara se interpola suavemente según el scroll.
// ---------------------------------------------------------------------
type Clave = { pos: Vector3; mira: Vector3 };
function claves(movil: boolean): Record<string, Clave> {
  const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
  return {
    hero:      movil ? { pos: v(0, -2.6, 15), mira: v(0, -2.6, 0) } : { pos: v(-3.6, 0, 10.5), mira: v(-3.6, 0, 0) },
    proyectos: { pos: v(0, 0.6, -24), mira: v(0, 0, -60) },
    "sobre-mi": { pos: v(0.4, -0.6, -56), mira: v(0.6, 0, -95) },
    garaje:    movil ? { pos: v(0, 1.4, -82.5), mira: v(0, 0.2, Z_MOTO) } : { pos: v(-3.8, 1.3, -84), mira: v(-3.8, 0.2, Z_MOTO) },
    contacto:  { pos: v(0, 0, -111), mira: v(0, 0, Z_SALIDA) },
  };
}

const suave = (t: number) => t * t * (3 - 2 * t); // "smoothstep": arranca y frena suave

export function iniciarEscena(canvas: HTMLCanvasElement) {
  const movilInicial = innerWidth < 768;
  const renderer = new WebGLRenderer({ canvas, antialias: !movilInicial, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, movilInicial ? 1.5 : 2));
  renderer.setClearColor(ASFALTO, 1);

  const escena = new Scene();
  escena.fog = new Fog(ASFALTO, 16, 60); // las líneas lejanas se funden con el fondo
  const camara = new PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);

  // --- Portal del hero con los engranajes dentro
  const hero = new Group();
  const grande = engranaje(14, 1.25, 0x4ade80);
  const chico = engranaje(9, 0.8, 0xfb923c);
  grande.position.set(-0.55, 0.3, 0);
  chico.position.set(1.3, -0.8, 0.05);
  hero.add(grande, chico);
  const arosHero = [aro(2.25, VERDE), aro(2.45, VERDE_CLARO, 0.4), aro(5.4, VERDE, 0.25)];
  hero.add(...arosHero);
  escena.add(hero);

  // --- Partículas (portal, túnel, salida y polvo)
  const escala = movilInicial ? 0.45 : 1;
  const { puntos, material } = crearParticulas(escala);
  escena.add(puntos);

  // --- Fragmentos geométricos flotando en el túnel
  const fragmentos: Group[] = [];
  const formas = [() => new IcosahedronGeometry(0.6, 0), () => new OctahedronGeometry(0.6), () => new BoxGeometry(0.8, 0.8, 0.8), () => new TorusGeometry(0.5, 0.15, 6, 12)];
  for (let i = 0; i < 18; i++) {
    const g = new Group();
    const geo = formas[i % formas.length]();
    g.add(new LineSegments(new EdgesGeometry(geo), new LineBasicMaterial({ color: i % 4 === 0 ? NARANJA : VERDE, transparent: true, opacity: 0.8 })));
    const a = Math.random() * Math.PI * 2;
    const r = MathUtils.randFloat(2.6, 4.2);
    g.position.set(Math.cos(a) * r, Math.sin(a) * r, MathUtils.randFloat(Z_TUNEL_FIN + 8, Z_TUNEL_INICIO - 8));
    g.userData.giro = new Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(0.8);
    escena.add(g);
    fragmentos.push(g);
  }

  // --- Líneas de velocidad ("warp") en el túnel: se alargan al hacer scroll rápido
  const N_ESTELAS = movilInicial ? 120 : 260;
  const estelas = new Float32Array(N_ESTELAS * 6); // 2 puntos (x,y,z) por línea
  const datosEstela = Array.from({ length: N_ESTELAS }, () => {
    const a = Math.random() * Math.PI * 2;
    const r = MathUtils.randFloat(2.5, 7);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, z: MathUtils.randFloat(Z_TUNEL_FIN, Z_TUNEL_INICIO) };
  });
  const geoEstelas = new BufferGeometry();
  geoEstelas.setAttribute("position", new Float32BufferAttribute(estelas, 3));
  const matEstelas = new LineBasicMaterial({ color: VERDE_CLARO, transparent: true, opacity: 0.5 });
  const lineasEstela = new LineSegments(geoEstelas, matEstelas);
  lineasEstela.frustumCulled = false;
  escena.add(lineasEstela);

  // --- La moto
  const { moto, piezas, ruedas } = crearMoto();
  const garaje = new Group();
  garaje.position.set(0, 0, Z_MOTO);
  garaje.rotation.y = -0.45; // vista de tres cuartos
  garaje.add(moto);
  // Suelo del garaje: rejilla de líneas
  const rejilla: number[] = [];
  for (let i = -6; i <= 6; i++) rejilla.push(i, -1.2, -6, i, -1.2, 6, -6, -1.2, i, 6, -1.2, i);
  const geoRejilla = new BufferGeometry();
  geoRejilla.setAttribute("position", new Float32BufferAttribute(rejilla, 3));
  const matRejilla = new LineBasicMaterial({ color: VERDE, transparent: true, opacity: 0.12 });
  garaje.add(new LineSegments(geoRejilla, matRejilla));
  escena.add(garaje);

  // --- Portal de salida (contacto): aros girando a distintas velocidades
  const salida = new Group();
  salida.position.z = Z_SALIDA;
  const arosSalida = [aro(2.7, VERDE), aro(3.1, NARANJA, 0.6), aro(4.2, VERDE_CLARO, 0.35), aro(6.2, VERDE, 0.2)];
  arosSalida.forEach((a, i) => { a.rotation.x = i * 0.25; salida.add(a); });
  escena.add(salida);

  // --- Post-procesado: "bloom" = resplandor de neón en lo que brilla
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(escena, camara));
  // (intensidad, radio, umbral): solo brilla lo que supera el umbral
  const bloom = new UnrealBloomPass(new Vector2(innerWidth, innerHeight), 0.7, 0.45, 0.2);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // --- Secciones de la página que marcan la ruta de la cámara
  let anclas: { nombre: string; scroll: number }[] = [];
  let mapaClaves = claves(movilInicial);
  function medir() {
    const max = document.documentElement.scrollHeight - innerHeight;
    const movil = innerWidth < 1024;
    anclas = [...document.querySelectorAll<HTMLElement>("[data-escena]")]
      .map((el) => {
        // En móvil una sección puede indicar otro elemento como parada (data-escena-movil)
        const destino = (movil && el.dataset.escenaMovil && document.querySelector(el.dataset.escenaMovil)) || el;
        const r = destino.getBoundingClientRect();
        const centro = r.top + scrollY + r.height / 2 - innerHeight / 2;
        return { nombre: el.dataset.escena!, scroll: MathUtils.clamp(centro, 0, max) };
      })
      .sort((a, b) => a.scroll - b.scroll);
    if (anclas[0]?.nombre === "hero") anclas[0].scroll = 0;
  }

  function redimensionar() {
    const movil = innerWidth < 768;
    mapaClaves = claves(movil);
    camara.aspect = innerWidth / innerHeight;
    camara.fov = movil ? 55 : 45;
    camara.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
    composer.setSize(innerWidth, innerHeight);
    bloom.strength = movil ? 0.6 : 0.7;
    medir();
  }
  addEventListener("resize", redimensionar);
  new ResizeObserver(medir).observe(document.body); // si cambia el alto de la página
  redimensionar();

  /** Devuelve la cámara objetivo y en qué tramo del recorrido estamos. */
  function calcularRuta() {
    const s = scrollY;
    if (anclas.length === 0) return { clave: mapaClaves.hero, actual: "hero", siguiente: "hero", t: 0 };
    if (anclas.length === 1 || s <= anclas[0].scroll) {
      const c = mapaClaves[anclas[0].nombre];
      return { clave: c, actual: anclas[0].nombre, siguiente: anclas[0].nombre, t: 0 };
    }
    for (let i = 0; i < anclas.length - 1; i++) {
      const a = anclas[i], b = anclas[i + 1];
      if (s <= b.scroll) {
        const t = suave(MathUtils.clamp((s - a.scroll) / Math.max(b.scroll - a.scroll, 1), 0, 1));
        const ca = mapaClaves[a.nombre], cb = mapaClaves[b.nombre];
        return {
          clave: { pos: ca.pos.clone().lerp(cb.pos, t), mira: ca.mira.clone().lerp(cb.mira, t) },
          actual: a.nombre, siguiente: b.nombre, t,
        };
      }
    }
    const ultima = anclas[anclas.length - 1];
    return { clave: mapaClaves[ultima.nombre], actual: ultima.nombre, siguiente: ultima.nombre, t: 1 };
  }

  // Progreso de ensamblaje de la moto: 0 al salir de "sobre mí", 1 al llegar al garaje
  function progresoMoto(ruta: ReturnType<typeof calcularRuta>) {
    if (!anclas.some((a) => a.nombre === "garaje")) return 1;
    if (ruta.actual === "sobre-mi" && ruta.siguiente === "garaje") return MathUtils.clamp((ruta.t - 0.15) / 0.8, 0, 1);
    const orden = anclas.map((a) => a.nombre);
    return orden.indexOf(ruta.actual) >= orden.indexOf("garaje") ? 1 : 0;
  }

  // Ratón: inclina un poco la cámara (parallax)
  const raton = new Vector2();
  addEventListener("pointermove", (e) => {
    raton.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  });

  const camPos = new Vector3().copy(mapaClaves.hero.pos);
  const camMira = new Vector3().copy(mapaClaves.hero.mira);
  const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let tiempo = 0;
  let anterior = performance.now();
  let pausado = false;

  function frame(ahora: number) {
    const dt = Math.min((ahora - anterior) / 1000, 0.05);
    anterior = ahora;
    if (!reducir) tiempo += dt * (1 + motor.velocidad * 0.04); // el scroll acelera todo
    material.uniforms.uTime.value = tiempo;

    const ruta = calcularRuta();
    // La cámara persigue su objetivo con retraso: movimiento cinematográfico
    camPos.lerp(ruta.clave.pos, reducir ? 1 : 0.07);
    camMira.lerp(ruta.clave.mira, reducir ? 1 : 0.07);
    camara.position.set(camPos.x + raton.x * 0.6, camPos.y - raton.y * 0.4, camPos.z);
    camara.lookAt(camMira);

    // Engranajes y aros
    grande.rotation.z += dt * 0.5;
    chico.rotation.z -= dt * 0.5 * (14 / 9);
    arosHero.forEach((a, i) => (a.rotation.z += dt * (i % 2 ? -0.2 : 0.3)));
    hero.rotation.y = raton.x * 0.25;
    hero.rotation.x = raton.y * 0.15;
    arosSalida.forEach((a, i) => { a.rotation.z += dt * (0.3 - i * 0.12); a.rotation.y += dt * 0.1 * (i + 1); });

    fragmentos.forEach((f) => {
      f.rotation.x += dt * f.userData.giro.x;
      f.rotation.y += dt * f.userData.giro.y;
    });

    // Estelas: avanzan hacia la cámara; más rápido y más largas con el scroll
    const avance = dt * (5 + motor.velocidad * 1.5);
    const largo = 0.4 + Math.min(motor.velocidad * 0.35, 7);
    const posE = geoEstelas.attributes.position.array as Float32Array;
    datosEstela.forEach((e, i) => {
      e.z += avance;
      if (e.z > Z_TUNEL_INICIO) e.z = Z_TUNEL_FIN;
      posE.set([e.x, e.y, e.z, e.x, e.y, e.z - largo], i * 6);
    });
    geoEstelas.attributes.position.needsUpdate = true;
    matEstelas.opacity = 0.25 + Math.min(motor.velocidad * 0.04, 0.6);

    // Moto: se ensambla con el scroll y las ruedas giran según las rpm
    ensamblar(piezas, progresoMoto(ruta));
    const giroRueda = dt * (motor.rpm / 1100) * 1.6;
    ruedas.forEach((r) => (r.rotation.z -= giroRueda));
    garaje.rotation.y = -0.45 + Math.sin(tiempo * 0.3) * 0.12;
    moto.position.y = -1.2 + Math.sin(tiempo * 30) * 0.004 * (motor.rpm / 1100); // vibración del motor

    composer.render(dt);
    if (!pausado) requestAnimationFrame(frame);
  }

  // Pausa cuando la pestaña no se ve (ahorra batería)
  document.addEventListener("visibilitychange", () => {
    pausado = document.hidden;
    if (!pausado) { anterior = performance.now(); requestAnimationFrame(frame); }
  });
  requestAnimationFrame(frame);
}
