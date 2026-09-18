/**
 * SOLTAR EL SERVICE WORKER Y SUS COPIAS.
 *
 * El equivalente a "desinstalar y volver a instalar" la PWA, sin desinstalar
 * nada: se desregistra el service worker y se borran todas sus cachés. Quien
 * llama decide después si recarga — y casi siempre va a querer.
 *
 * POR QUÉ VIVE ACÁ. Esto estaba escrito TRES veces, distinto cada vez:
 * el plan B a los 8 segundos de `ActualizacionContext`, la limpieza de la app
 * nativa del mismo archivo, y una copia en `EmitirComprobante` cuyo propio
 * comentario ya admitía ser "lo mismo que el plan B de ActualizacionContext".
 * Al agregar la recuperación de `RecuperacionDeCarga` iban a ser cuatro. Tres
 * copias de una operación destructiva es una que alguien va a arreglar en un
 * sitio y no en los otros.
 *
 * NUNCA LANZA. Se usa en caminos de recuperación, donde ya hay algo roto: si
 * el navegador no tiene service worker, o niega el acceso a las cachés (modo
 * privado), lo que corresponde es seguir adelante y recargar igual, no apilar
 * un segundo error encima del primero.
 */
export async function soltarServiceWorkerYCaches() {
  try {
    const registros = (await navigator.serviceWorker?.getRegistrations?.()) || []
    await Promise.all(registros.map((r) => r.unregister()))
  } catch { /* navegador sin service worker, o sin permiso */ }
  try {
    if (window.caches?.keys) {
      const claves = await caches.keys()
      await Promise.all(claves.map((c) => caches.delete(c)))
    }
  } catch { /* cachés no disponibles: se recarga igual */ }
}

/** Soltar todo y recargar. El "sácame de acá" completo. */
export async function reinicioDuro() {
  await soltarServiceWorkerYCaches()
  window.location.reload()
}
