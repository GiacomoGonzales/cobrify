import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * MODO MANTENIMIENTO — cierra la app a los clientes mientras se trabaja.
 *
 * POR QUÉ VIVE EN `appConfig` Y NO EN `config`:
 * hubo un interruptor de mantenimiento guardado en `config/adminSettings`, y
 * nunca funcionó. Las reglas de Firestore dan `config/*` SOLO a los admins, así
 * que el cliente al que había que bloquear era justamente el único que no podía
 * leer el interruptor. `appConfig/*` es lo contrario: lo lee cualquier usuario
 * logueado y lo escribe solo un admin, que es exactamente lo que hace falta.
 *
 * SE ESCUCHA EN VIVO, no se lee una vez: al prender el modo, las sesiones que ya
 * estaban abiertas se bloquean solas, y al apagarlo vuelven solas. Nadie tiene
 * que recargar nada — ni tus clientes ni tú.
 *
 * A LOS ADMINS NO LOS BLOQUEA. El panel va por otro layout y además el candado
 * deja pasar a los admins: si el modo te encerrara a ti, no podrías apagarlo.
 */

const REF = () => doc(db, 'appConfig', 'mantenimiento')

export const MANTENIMIENTO_APAGADO = { activo: false, mensaje: '' }

const normalizar = snap => {
  if (!snap.exists()) return MANTENIMIENTO_APAGADO
  const d = snap.data()
  return { activo: d.activo === true, mensaje: d.mensaje || '' }
}

/** Estado actual, una sola vez. */
export async function leerMantenimiento() {
  try {
    return normalizar(await getDoc(REF()))
  } catch {
    // Ante la duda, la app sigue abierta: es peor cerrarle la puerta a todos
    // por un error de red que dejar entrar a alguien durante un mantenimiento.
    return MANTENIMIENTO_APAGADO
  }
}

/** Escucha en vivo. Devuelve la función para dejar de escuchar. */
export function escucharMantenimiento(alCambiar) {
  return onSnapshot(
    REF(),
    snap => alCambiar(normalizar(snap)),
    () => alCambiar(MANTENIMIENTO_APAGADO)
  )
}

/** Prender o apagar. Solo un admin puede escribir acá (reglas de Firestore). */
export async function guardarMantenimiento({ activo, mensaje = '' }) {
  await setDoc(
    REF(),
    { activo: !!activo, mensaje: mensaje.trim(), actualizadoEn: serverTimestamp() },
    { merge: true }
  )
}
