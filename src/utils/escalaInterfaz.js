/**
 * EL TAMAÑO DE TODA LA INTERFAZ.
 *
 * En el navegador esto lo resuelve el zoom de Chrome. En la app de Android no
 * hay zoom, así que quien no ve bien de cerca no tiene nada que hacer (pedido
 * de un usuario mayor, 03-sep-2026).
 *
 * ── Por qué alcanza con mover el tamaño de letra de la raíz ──────────────────
 * Tailwind expresa casi todo en `rem`: el texto, los paddings, los márgenes,
 * los altos de fila y hasta el tamaño de los iconos (`w-4 h-4` es 1rem). Un
 * `rem` es el tamaño de letra del elemento raíz, así que moverlo escala la
 * interfaz entera en proporción, sin tocar una sola pantalla.
 *
 * El sistema ya usaba ese mismo mecanismo con un valor fijo —`html { font-size:
 * 90% }`, y 85% en tablets— así que esto no inventa nada: le pone una perilla.
 * La escala MULTIPLICA a ese valor base en vez de reemplazarlo, para que la
 * tablet siga saliendo un poco más compacta que el teléfono.
 *
 * ── Por qué es por DISPOSITIVO y no por negocio ──────────────────────────────
 * Es la vista de UNA persona, no una preferencia de la empresa. El dueño que no
 * ve de cerca quiere su tablet en grande; la caja del mostrador, no. Por eso
 * vive en localStorage y no viaja a Firestore.
 */

const CLAVE = 'factuya_escalaInterfaz'
const VARIABLE = '--escala-ui'

/**
 * Los tamaños ofrecidos. Los saltos son de a ~15%: más chicos no se notan y
 * obligan a probar cuatro veces; más grandes se saltean el punto justo.
 */
export const ESCALAS = [
  { id: 'normal', nombre: 'Normal', factor: 1 },
  { id: 'grande', nombre: 'Grande', factor: 1.15 },
  { id: 'mayor', nombre: 'Muy grande', factor: 1.3 },
  { id: 'maximo', nombre: 'Máximo', factor: 1.5 },
]

export const ESCALA_POR_DEFECTO = 'normal'

/** La escala de un id, o la normal si el id no existe. */
export const escalaDe = (id) =>
  ESCALAS.find(e => e.id === id) || ESCALAS[0]

/** Qué tamaño eligió este dispositivo. */
export function leerEscala() {
  try {
    const guardada = localStorage.getItem(CLAVE)
    return ESCALAS.some(e => e.id === guardada) ? guardada : ESCALA_POR_DEFECTO
  } catch {
    // Modo privado o almacenamiento bloqueado: se ve en tamaño normal.
    return ESCALA_POR_DEFECTO
  }
}

/**
 * Deja la interfaz en ese tamaño, ya.
 *
 * Se aplica sobre el elemento raíz y no sobre `body` porque `rem` se mide
 * contra la raíz: ponerlo en body no escalaría nada.
 *
 * @param {string} id  uno de ESCALAS
 * @param {boolean} [persistir=true]  false para una vista previa que no guarda
 * @returns {string} el id que quedó aplicado
 */
export function aplicarEscala(id, persistir = true) {
  const escala = escalaDe(id)
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty(VARIABLE, String(escala.factor))
  }
  if (persistir) {
    try {
      localStorage.setItem(CLAVE, escala.id)
    } catch {
      // Sin almacenamiento el tamaño vale para esta sesión y nada más.
    }
  }
  return escala.id
}

/** Deja puesto lo que el dispositivo tenía elegido. Se llama al arrancar. */
export function restaurarEscala() {
  return aplicarEscala(leerEscala(), false)
}
