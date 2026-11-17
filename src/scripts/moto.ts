// Moto en "wireframe" hecha con piezas geométricas simples.
// Cada pieza guarda su posición final y una posición "desarmada"; la escena
// mezcla ambas según el scroll y así la moto se ensambla sola.
import {
  Group, Object3D, Vector3, Euler, Quaternion, BufferGeometry, Float32BufferAttribute,
  LineSegments, LineBasicMaterial, EdgesGeometry, TorusGeometry, CylinderGeometry,
  BoxGeometry, IcosahedronGeometry, Mesh, MeshBasicMaterial,
} from "three";

export interface Pieza {
  obj: Object3D;
  final: { pos: Vector3; rot: Quaternion };
  inicio: { pos: Vector3; rot: Quaternion };
  retraso: number; // 0..1: cuándo empieza a colocarse esta pieza
}

const VERDE = 0x4ade80;
const VERDE_CLARO = 0xbbf7d0;
const NARANJA = 0xfb923c;
const ASFALTO = 0x0a0f0c;

/** Convierte una geometría en "solo aristas" de un color, con un cuerpo oscuro opcional. */
function alambre(geo: BufferGeometry, color: number, cuerpo = false, angulo = 25) {
  const g = new Group();
  if (cuerpo) g.add(new Mesh(geo, new MeshBasicMaterial({ color: ASFALTO, transparent: true, opacity: 0.6 })));
  g.add(new LineSegments(new EdgesGeometry(geo, angulo), new LineBasicMaterial({ color, transparent: true })));
  return g;
}

/** Líneas sueltas a partir de pares de puntos [x,y,z, x,y,z, ...]. */
function lineas(puntos: number[], color: number) {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(puntos, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color, transparent: true }));
}

/** Rueda: neumático + llanta + radios + buje. */
function rueda() {
  const g = new Group();
  g.add(alambre(new TorusGeometry(1, 0.13, 8, 40), VERDE));
  g.add(alambre(new TorusGeometry(0.78, 0.03, 4, 40), VERDE_CLARO));
  const radios: number[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const z = i % 2 ? 0.08 : -0.08; // radios cruzados como en una llanta real
    radios.push(0, 0, z, Math.cos(a) * 0.78, Math.sin(a) * 0.78, 0);
  }
  g.add(lineas(radios, VERDE));
  const buje = alambre(new CylinderGeometry(0.12, 0.12, 0.3, 10), NARANJA);
  buje.rotation.x = Math.PI / 2;
  g.add(buje);
  return g;
}

export function crearMoto() {
  const moto = new Group();
  const piezas: Pieza[] = [];
  const ruedas: Object3D[] = [];

  // Añade una pieza en su posición final y le inventa una posición de "desarmada"
  const agregar = (obj: Object3D, pos: [number, number, number], rotZ = 0, retraso = 0) => {
    obj.position.set(...pos);
    obj.rotation.z = rotZ;
    moto.add(obj);
    const dir = new Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize();
    piezas.push({
      obj,
      final: { pos: obj.position.clone(), rot: obj.quaternion.clone() },
      inicio: {
        pos: obj.position.clone().add(dir.multiplyScalar(5 + Math.random() * 4)),
        rot: new Quaternion().setFromEuler(new Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
      },
      retraso,
    });
    return obj;
  };

  // Ruedas
  const trasera = agregar(rueda(), [-2.1, 0, 0], 0, 0.0);
  const delantera = agregar(rueda(), [2.15, 0, 0], 0, 0.05);
  ruedas.push(trasera, delantera);

  // Chasis (doble: a cada lado en z)
  const chasis: number[] = [];
  for (const z of [-0.22, 0.22]) {
    const p = (x: number, y: number) => [x, y, z];
    const tramo = (a: number[], b: number[]) => chasis.push(...a, ...b);
    tramo(p(-2.1, 0), p(-0.55, 0.5));      // basculante
    tramo(p(-0.55, 0.5), p(1.25, 2.0));     // tubo principal
    tramo(p(1.25, 2.0), p(-0.35, 1.7));     // tubo superior
    tramo(p(-0.35, 1.7), p(-1.95, 1.8));    // subchasis
    tramo(p(-1.95, 1.8), p(-0.55, 0.5));
    tramo(p(-2.1, 0), p(-1.3, 1.75));       // amortiguador
  }
  // travesaños entre lados
  for (const [x, y] of [[-0.55, 0.5], [1.25, 2.0], [-1.95, 1.8]]) chasis.push(x, y, -0.22, x, y, 0.22);
  agregar(lineas(chasis, VERDE), [0, 0, 0], 0, 0.15);

  // Horquilla delantera
  const horquilla: number[] = [];
  for (const z of [-0.28, 0.28]) horquilla.push(1.3, 2.05, z, 2.15, 0, z);
  horquilla.push(1.3, 2.05, -0.28, 1.3, 2.05, 0.28);
  agregar(lineas(horquilla, VERDE_CLARO), [0, 0, 0], 0, 0.2);

  // Motor (naranja: el corazón) + cilindro inclinado
  agregar(alambre(new BoxGeometry(1.1, 0.85, 0.7), NARANJA, true), [-0.15, 0.75, 0], 0, 0.3);
  const cilindro = agregar(alambre(new BoxGeometry(0.55, 0.7, 0.6, 1, 4, 1), NARANJA, true), [0.35, 1.3, 0], -0.5, 0.35);
  cilindro.scale.setScalar(1);

  // Tanque: icosaedro aplastado (queda con aspecto "low-poly")
  const tanque = alambre(new IcosahedronGeometry(1, 1), VERDE, true, 1);
  tanque.scale.set(0.95, 0.42, 0.5);
  agregar(tanque, [0.35, 2.05, 0], -0.12, 0.45);

  // Asiento
  agregar(alambre(new BoxGeometry(1.5, 0.16, 0.5), VERDE_CLARO, true), [-1.05, 1.95, 0], 0.04, 0.55);

  // Escape
  const escape = alambre(new CylinderGeometry(0.11, 0.14, 2.4, 10, 1, true), NARANJA);
  agregar(escape, [-1.25, 0.65, 0.42], Math.PI / 2 - 0.25, 0.6);

  // Manillar + faro
  agregar(lineas([1.15, 2.5, -0.75, 1.15, 2.5, 0.75, 1.3, 2.05, 0, 1.15, 2.5, 0], VERDE_CLARO), [0, 0, 0], 0, 0.7);
  const faro = alambre(new TorusGeometry(0.2, 0.05, 6, 16), NARANJA);
  faro.rotation.y = Math.PI / 2;
  const grupoFaro = new Group();
  grupoFaro.add(faro);
  agregar(grupoFaro, [1.62, 2.05, 0], 0, 0.75);

  // Centramos la moto verticalmente (las ruedas tocan y = -1.2)
  moto.position.y = -1.2;

  return { moto, piezas, ruedas };
}

/** Coloca cada pieza según el progreso de ensamblaje (0 = desarmada, 1 = lista). */
export function ensamblar(piezas: Pieza[], progreso: number) {
  for (const p of piezas) {
    // cada pieza tiene su propio tramo del progreso -> se colocan en cascada
    const t = Math.min(Math.max((progreso - p.retraso * 0.6) / 0.4, 0), 1);
    const e = 1 - Math.pow(1 - t, 3); // "ease out": frena al llegar
    p.obj.position.lerpVectors(p.inicio.pos, p.final.pos, e);
    p.obj.quaternion.slerpQuaternions(p.inicio.rot, p.final.rot, e);
    // las piezas sin colocar se ven más tenues
    p.obj.traverse((o) => {
      const m = (o as Mesh).material as MeshBasicMaterial | undefined;
      if (m && "opacity" in m) m.opacity = (m.color.getHex() === ASFALTO ? 0.6 : 1) * (0.25 + 0.75 * e);
    });
  }
}
