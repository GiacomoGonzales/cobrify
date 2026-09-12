/**
 * ESTADO VIVO DEL DEMO.
 *
 * El demo mostraba datos fijos: se podía mirar, pero no hacer. Vender no
 * dejaba rastro en Ventas, el stock no bajaba y crear un producto no era
 * posible. Un lead que prueba y ve que "no hace nada" se va.
 *
 * Acá vive el estado del demo en memoria, con suscripción para que la pantalla
 * se entere de los cambios. Lo que el visitante hace se guarda además en SU
 * navegador (ver guardado.js), para que al recargar o volver otro día lo
 * encuentre donde lo dejó.
 *
 * Es un almacén EXTERNO a React a propósito: los servicios (que no son
 * componentes) tienen que poder escribir en él sin arrastrar el contexto.
 */

let datos = null
const oyentes = new Set()
// Estos se enteran solo de lo que HACE el visitante, no de que el demo
// arrancó: guardar en el navegador un demo recién abierto sería escribir
// 100 KB para nada en cada visita.
const oyentesDeCambios = new Set()

const avisar = (lista) => lista.forEach((fn) => { try { fn() } catch { /* un oyente roto no frena a los demás */ } })

/** ¿Estamos dentro de un demo con estado vivo? */
export const enDemo = () => datos !== null

/** Los datos actuales. Nunca mutar el objeto devuelto: usar `mutarDemo`. */
export const datosDemo = () => datos

export const iniciarDemo = (iniciales) => {
  datos = iniciales
  // Enganche de diagnóstico: permite inspeccionar el estado del demo desde la
  // consola sin tener que instrumentar cada vez.
  if (typeof window !== 'undefined') window.__DEMO_STORE__ = { datosDemo, enDemo }
  avisar(oyentes)
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
  avisar(oyentes)
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
  avisar(oyentes)
  avisar(oyentesDeCambios)
  return datos
}

/** Suscripción para useSyncExternalStore. Devuelve la baja. */
export const suscribirDemo = (fn) => {
  oyentes.add(fn)
  return () => oyentes.delete(fn)
}

/** Aviso cuando el visitante cambia algo (no cuando el demo arranca). Devuelve la baja. */
export const alCambiarDemo = (fn) => {
  oyentesDeCambios.add(fn)
  return () => oyentesDeCambios.delete(fn)
}
