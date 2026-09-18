import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { Capacitor } from '@capacitor/core'
import { db } from '@/lib/firebase'

/**
 * Los eventos del diagnóstico de la app (ver utils/diagnosticoApp.js), en
 * `businesses/{id}/diagnosticosApp`: dentro del negocio, así la ficha del
 * admin los lee de un tirón y las reglas los cierran igual que el resto.
 *
 * Nunca rompe nada: si no se puede escribir, se pierde el evento y listo. Y
 * con un tope por sesión, para que un equipo en un bucle raro no llene la base.
 */

const TOPE_POR_SESION = 25
let enviados = 0

const plataforma = () => {
  try { return Capacitor.getPlatform() } catch { return 'web' }
}

export async function registrarEventoDeDiagnostico(businessId, evento) {
  if (!businessId || enviados >= TOPE_POR_SESION) return
  enviados++
  try {
    await addDoc(collection(db, 'businesses', businessId, 'diagnosticosApp'), {
      ...evento,
      plataforma: plataforma(),
      // Qué código corría: en iOS la web va EMPAQUETADA en la app, así que el
      // commit dice si ese iPad ya tiene un arreglo o todavía no.
      version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null,
      commit: typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : null,
      equipo: String(globalThis.navigator?.userAgent || '').slice(0, 160),
      creadoEn: serverTimestamp(),
    })
  } catch (error) {
    console.warn('No se pudo guardar el diagnóstico:', error?.message)
  }
}

/** Los últimos eventos de una cuenta, para la ficha del admin. */
export async function ultimosDiagnosticos(businessId, cuantos = 40) {
  try {
    const snap = await getDocs(query(
      collection(db, 'businesses', businessId, 'diagnosticosApp'),
      orderBy('creadoEn', 'desc'),
      limit(cuantos)
    ))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (error) {
    console.warn('No se pudo leer el diagnóstico:', error?.message)
    return []
  }
}
