/**
 * ESTADO VIVO DEL DEMO.
 *
 * El demo mostraba datos fijos: se podía mirar, pero no hacer. Vender no
 * dejaba rastro en Ventas, el stock no bajaba y crear un producto no era
 * posible. Un lead que prueba y ve que "no hace nada" se va.
 *
 * Acá vive el estado del demo en memoria, con suscripción para que la pantalla
 * se entere de los cambios. Todo se pierde al recargar, y está bien: es una
 * prueba, no una cuenta.
 *
 * Es un almacén EXTERNO a React a propósito: los servicios (que no son
 * componentes) tienen que poder escribir en él sin arrastrar el contexto.
 */

let datos = null
const oyentes = new Set()

const avisar = () => oyentes.forEach((fn) => { try { fn() } catch { /* un oyente roto no frena a los demás */ } })

/** ¿Estamos dentro de un demo con estado vivo? */
export const enDemo = () => datos !== null

/** Los datos actuales. Nunca mutar el objeto devuelto: usar `mutarDemo`. */
export const datosDemo = () => datos

export const iniciarDemo = (iniciales) => {
  datos = iniciales
  // Enganche de diagnóstico: permite inspeccionar el estado del demo desde la
  // consola sin tener que instrumentar cada vez.
  if (typeof window !== 'undefined') window.__DEMO_STORE__ = { datosDemo, enDemo }
  avisar()
}

/**
 * Borra los datos, NO los oyentes.
 *
 * En StrictMode React monta el efecto, lo limpia y lo vuelve a montar. Si acá
 * se vaciaban los suscriptores, la suscripción del provider moría en ese
 * segundo montaje y la pantalla dejaba de enterarse de los cambios: se vendía
 * y no pasaba nada.
 */
export const limpiarDemo = () => {
  datos = null
  avisar()
}

/**
 * Aplica un cambio. El mutador recibe los datos y devuelve SOLO las claves que
 * cambian; se arma un objeto nuevo para que React vea una referencia distinta.
 */
export const mutarDemo = (mutador) => {
  if (!datos) return null
  const cambios = mutador(datos)
  if (!cambios) return datos
  datos = { ...datos, ...cambios }
  avisar()
  return datos
}

/** Suscripción para useSyncExternalStore. Devuelve la baja. */
export const suscribirDemo = (fn) => {
  oyentes.add(fn)
  return () => oyentes.delete(fn)
}
