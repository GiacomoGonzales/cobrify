/**
 * EL MÉTODO DE PAGO DE UNA SUSCRIPCIÓN, DICHO DE UNA SOLA MANERA.
 *
 * El mismo Yape está guardado como "yape" y como "Yape" según por dónde entró
 * el pago: el formulario de alta manda la clave y el cuadro de convertir una
 * prueba mandaba la etiqueta. Encima hay valores que no son un método de pago:
 * "manual" (alta sin método), "flow" (la pasarela que se quitó el 11-set-2026)
 * y "Admin - Renovación rápida". En Admin › Pagos eso partía el desglose en
 * dos "Plin", dos "Transferencia" y dos "Yape" (reporte del 16-set-2026), y
 * además el filtro por método dejaba fuera la mitad.
 *
 * Se normaliza al LEER: los pagos viejos se ven bien sin tocar un solo
 * documento, y lo que se escriba de ahora en adelante usa estas claves.
 */

export const METODOS_DE_PAGO = {
  yape: 'Yape',
  plin: 'Plin',
  transferencia: 'Transferencia',
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  recarga: 'Recarga',
  otro: 'Otro',
}

/** Lo que no es un método de pago de verdad cuenta como "Otro". */
const RESTOS = new Set([
  'manual',
  'flow',
  'n/a',
  'admin - renovación rápida',
  'admin - renovacion rapida',
])

/** La clave canónica de un método guardado como sea. Siempre devuelve una. */
export function claveDelMetodo(valor) {
  const limpio = String(valor ?? '').trim().toLowerCase()
  if (!limpio || RESTOS.has(limpio)) return 'otro'
  if (METODOS_DE_PAGO[limpio]) return limpio
  // Variantes escritas a mano: "Transferencia BCP", "yape.", "Plin Giacomo".
  return Object.keys(METODOS_DE_PAGO).find((k) => limpio.startsWith(k)) || 'otro'
}

/** Cómo se muestra, venga como venga. */
export const etiquetaDelMetodo = (valor) => METODOS_DE_PAGO[claveDelMetodo(valor)]
