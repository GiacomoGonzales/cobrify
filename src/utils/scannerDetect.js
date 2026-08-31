/**
 * ¿ESTO LO ESCRIBIÓ UNA PISTOLA LECTORA O UNA PERSONA?
 *
 * Las pistolas —USB, con dongle 2.4G o Bluetooth— se presentan al sistema como
 * un TECLADO (modo HID): al disparar "teclean" el código y un Enter al final.
 * No hay nada que conectar ni ningún protocolo que hablar; hay que reconocer
 * la ráfaga entre las teclas normales.
 *
 * El criterio vive acá y no dentro del POS porque lo usan el detector del
 * mostrador y la pantalla de prueba de Configuración: si la prueba dijera
 * "reconocido" con otro umbral que el del POS, no serviría para diagnosticar
 * nada.
 *
 * ── Por qué el umbral no es uno solo ─────────────────────────────────────────
 * Una pistola USB teclea a 5-15 ms por carácter. Una BLUETOOTH tiene la
 * latencia del enlace encima y se va a 30-60 ms según el equipo, que es el
 * rango donde el umbral fijo de 50 ms la descartaba EN SILENCIO: el cajero
 * disparaba, el aparato sonaba, y no pasaba nada.
 *
 * Se puede ser más permisivo sin abrir la puerta a falsos positivos porque el
 * detector solo mira cuando NO hay un campo de texto enfocado — o sea, cuando
 * el usuario no está escribiendo. Y porque se exige que la ráfaga PAREZCA un
 * código: 8 o más caracteres sin espacios, terminados en Enter. Nadie teclea
 * eso por accidente sobre un botón.
 */

/** Rápido sin discusión: ni la persona más veloz teclea así. */
export const MS_POR_CHAR_RAPIDO = 50

/** Tolerado cuando la ráfaga además PARECE un código de barras. */
export const MS_POR_CHAR_CODIGO = 100

/** Mínimo de caracteres para que valga la pena mirarlo. */
export const LARGO_MINIMO = 3

/** A partir de acá la ráfaga ya parece un código y no un tecleo suelto. */
export const LARGO_CODIGO = 8

/** ¿La cadena tiene pinta de código de barras? */
const pareceCodigo = (texto) =>
  texto.length >= LARGO_CODIGO && /^[A-Za-z0-9._/+-]+$/.test(texto)

/**
 * Analiza una ráfaga de teclas terminada en Enter.
 *
 * Devuelve también el POR QUÉ, que es lo que la pantalla de prueba le muestra
 * al usuario: sin eso, "no funciona" puede ser el umbral, la falta de Enter o
 * el modo del aparato, y no hay forma de saber cuál.
 *
 * @param {string} texto        lo que llegó antes del Enter
 * @param {number} msTotal      milisegundos entre la primera tecla y la última
 * @returns {{esEscaneo: boolean, msPorChar: number|null, pareceCodigo: boolean, motivo: string}}
 */
export const analizarRafaga = (texto = '', msTotal = 0) => {
  const t = String(texto)
  const largo = t.length

  if (largo < LARGO_MINIMO) {
    return { esEscaneo: false, msPorChar: null, pareceCodigo: false, motivo: 'corto' }
  }

  // Entre N caracteres hay N-1 intervalos.
  const msPorChar = largo > 1 ? msTotal / (largo - 1) : 0
  const codigo = pareceCodigo(t)
  const limite = codigo ? MS_POR_CHAR_CODIGO : MS_POR_CHAR_RAPIDO

  if (msPorChar < limite) {
    return { esEscaneo: true, msPorChar, pareceCodigo: codigo, motivo: 'ok' }
  }
  return { esEscaneo: false, msPorChar, pareceCodigo: codigo, motivo: 'lento' }
}

/**
 * Cuánto esperar sin teclas antes de dar la ráfaga por abandonada.
 *
 * Con Bluetooth el umbral por carácter subió, así que este también: a 100 ms
 * por carácter, 300 ms alcanzaban para tres teclas y el buffer se vaciaba a
 * media lectura.
 */
export const MS_ABANDONO = 600
