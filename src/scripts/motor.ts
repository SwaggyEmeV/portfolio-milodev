// Estado compartido entre la escena 3D y el HUD (tacómetro).
// Un "módulo" de JS se carga una sola vez: todos los que lo importan
// ven el MISMO objeto, así que sirve para compartir datos.
export const motor = {
  rpm: 1100,        // revoluciones: suben al hacer scroll rápido
  marcha: 0,        // 0 = N (neutral), 1..4 = sección actual
  velocidad: 0,     // velocidad del scroll suavizada (px por frame)
};

let ultimoScroll = typeof window !== "undefined" ? window.scrollY : 0;

/** Llamar una vez por frame: calcula velocidad y rpm a partir del scroll. */
export function actualizarMotor() {
  const delta = window.scrollY - ultimoScroll;
  ultimoScroll = window.scrollY;
  motor.velocidad += (Math.abs(delta) - motor.velocidad) * 0.12;
  const objetivo = 1100 + Math.min(motor.velocidad * 260, 10900) + Math.random() * 40; // ralentí con vibración
  motor.rpm += (objetivo - motor.rpm) * 0.15;
}
