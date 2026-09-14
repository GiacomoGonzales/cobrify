import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * QUÉ VERSIÓN DE LA APP HAY EN LAS TIENDAS — `appConfig/version`.
 *
 * Lo lee la app instalada al abrir (ActualizacionContext) y decide dos cosas:
 *  - `iosBuild` / `androidBuild`: la última publicada. Si la instalada es más
 *    vieja, sale la franja "Nueva versión disponible" con el botón a la tienda.
 *  - `iosMinBuild` / `androidMinBuild`: la mínima que se acepta. Por debajo, la
 *    app se cierra con "Actualiza para seguir" y no hay forma de saltárselo.
 *    Es el candado de los videojuegos ("debes actualizar para jugar"); vacío o
 *    0 = sin candado.
 *
 * Hasta setiembre de 2026 este documento se editaba a mano en la consola de
 * Firebase. Desde el cambio de número de WhatsApp se edita desde el admin
 * (Configuración › Sistema).
 *
 * Los "builds" son el número de compilación (74 en iPhone, 201 en Android),
 * no la versión 4.48.0: es lo que la app compara, porque siempre sube.
 */

const REF = () => doc(db, 'appConfig', 'version')

export const VERSION_VACIA = {
  iosBuild: '',
  androidBuild: '',
  iosMinBuild: '',
  androidMinBuild: '',
  iosUrl: '',
  androidUrl: '',
}

// Para el formulario: 0 o ausente se muestra vacío, no "0".
const comoTexto = v => (Number(v) > 0 ? String(Number(v)) : '')

export async function leerVersionPublicada() {
  try {
    const snap = await getDoc(REF())
    if (!snap.exists()) return VERSION_VACIA
    const d = snap.data()
    return {
      iosBuild: comoTexto(d.iosBuild),
      androidBuild: comoTexto(d.androidBuild),
      iosMinBuild: comoTexto(d.iosMinBuild),
      androidMinBuild: comoTexto(d.androidMinBuild),
      iosUrl: d.iosUrl || '',
      androidUrl: d.androidUrl || '',
    }
  } catch {
    return VERSION_VACIA
  }
}

/** Solo un admin puede escribir (reglas de Firestore). Vacío se guarda como 0 = sin efecto. */
export async function guardarVersionPublicada(v) {
  const n = x => Number(x) || 0
  await setDoc(
    REF(),
    {
      iosBuild: n(v.iosBuild),
      androidBuild: n(v.androidBuild),
      iosMinBuild: n(v.iosMinBuild),
      androidMinBuild: n(v.androidMinBuild),
      iosUrl: (v.iosUrl || '').trim(),
      androidUrl: (v.androidUrl || '').trim(),
      actualizadoEn: serverTimestamp(),
    },
    { merge: true }
  )
}
