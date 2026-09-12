/**
 * EL DEMO SE QUEDA EN EL NAVEGADOR DE QUIEN LO PRUEBA.
 *
 * El demo vivía solo en memoria: un lead abría una mesa, pedía un ceviche,
 * recargaba la página y todo volvía a cero. Parecía un sistema que no guarda
 * nada, que es justo lo contrario de lo que se le quiere mostrar.
 *
 * Se guarda en el localStorage del visitante y NO en Firestore a propósito:
 * cada lead ve solo lo suyo, no quedan cuentas de prueba que limpiar y la base
 * real no se toca. Dura DIAS días y se borra con "Empezar de nuevo".
 *
 * Al volver, las fechas se CORREN lo que el visitante estuvo afuera: la mesa
 * que abrió "hace 10 minutos" sigue abierta hace 10 minutos y las ventas de
 * hoy siguen siendo de hoy. Sin eso, quien vuelve al día siguiente encuentra
 * mesas abiertas desde ayer y el tablero del día en cero.
 */

/** Subir cuando cambie la FORMA de los datos: lo guardado con otra forma se descarta. */
const VERSION = 1

/** Cuánto se guarda lo que hizo el visitante. */
const DIAS = 7

const clave = (rubro) => `cobrify:demo:${rubro || 'general'}`

/**
 * JSON no conoce las fechas: las escribe como texto y al leer vuelven como
 * texto, y el demo compara y resta fechas por todas partes. Se marcan al
 * guardar y se reconstruyen al leer.
 */
function aTexto(valor) {
  return JSON.stringify(valor, function marcarFechas(k, v) {
    const original = this[k]
    if (original instanceof Date) {
      const t = original.getTime()
      return Number.isNaN(t) ? null : { $fecha: t }
    }
    return v
  })
}

function deTexto(texto, desfase) {
  return JSON.parse(texto, (k, v) => (
    v && typeof v === 'object' && typeof v.$fecha === 'number' && Object.keys(v).length === 1
      ? new Date(v.$fecha + desfase)
      : v
  ))
}

/**
 * Lo que el visitante dejó la última vez en este demo, con las fechas ya
 * corridas a hoy. `null` si no hay nada, si venció o si es de otra versión.
 */
export function leerDemoGuardado(rubro) {
  try {
    const texto = localStorage.getItem(clave(rubro))
    if (!texto) return null
    const { v, en } = JSON.parse(texto)
    const afuera = Date.now() - Number(en)
    if (v !== VERSION || !(afuera >= 0) || afuera > DIAS * 86400000) {
      localStorage.removeItem(clave(rubro))
      return null
    }
    return deTexto(texto, afuera).datos || null
  } catch {
    // Un guardado roto no puede dejar el demo en blanco: se arranca de cero.
    return null
  }
}

export function guardarDemo(rubro, datos) {
  try {
    localStorage.setItem(clave(rubro), aTexto({ v: VERSION, en: Date.now(), datos }))
  } catch {
    // Navegador sin espacio o que bloquea el almacenamiento: el demo sigue
    // andando, solo que no sobrevive a una recarga.
  }
}

export function borrarDemoGuardado(rubro) {
  try {
    localStorage.removeItem(clave(rubro))
  } catch { /* nada que borrar */ }
}
