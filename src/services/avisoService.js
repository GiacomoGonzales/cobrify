import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * AVISO PARA TODOS LOS CLIENTES — una tarjeta arriba de la app que se prende
 * y se apaga desde el admin, sin desplegar nada.
 *
 * Nació el día que se bloqueó el número de WhatsApp (13-set-2026): había que
 * decirle a todo el mundo "escríbenos al número nuevo" y no había por dónde.
 * Vive en `appConfig`, como el mantenimiento y por la misma razón: lo lee
 * cualquier usuario con sesión y lo escribe solo un admin.
 *
 * Cada versión del aviso lleva un `id`. Quien lo cierra guarda ese id en su
 * navegador y no lo vuelve a ver — hasta que se publique un texto nuevo, que
 * trae otro id. Así "cerrar" es cerrar ESTE aviso, no todos los que vengan.
 */

const REF = () => doc(db, 'appConfig', 'aviso')

export const AVISO_APAGADO = {
  activo: false,
  id: '',
  titulo: '',
  mensaje: '',
  whatsapp: '',
  enlace: '',
  paraResellers: false,
}

const normalizar = snap => {
  if (!snap.exists()) return AVISO_APAGADO
  const d = snap.data()
  return {
    activo: d.activo === true,
    id: String(d.id || ''),
    titulo: d.titulo || '',
    mensaje: d.mensaje || '',
    whatsapp: d.whatsapp || '',
    enlace: d.enlace || '',
    paraResellers: d.paraResellers === true,
  }
}

/**
 * El número como lo pide wa.me: solo dígitos y con código de país. Un celular
 * peruano escrito a secas ("955 778 215") se completa con 51.
 */
const numeroParaWaMe = texto => {
  const digitos = String(texto || '').replace(/\D/g, '')
  return /^9\d{8}$/.test(digitos) ? `51${digitos}` : digitos
}

/** Estado actual, una sola vez. */
export async function leerAviso() {
  try {
    return normalizar(await getDoc(REF()))
  } catch {
    return AVISO_APAGADO
  }
}

/** Escucha en vivo. Devuelve la función para dejar de escuchar. */
export function escucharAviso(alCambiar) {
  return onSnapshot(
    REF(),
    snap => alCambiar(normalizar(snap)),
    () => alCambiar(AVISO_APAGADO)
  )
}

/**
 * Guarda el aviso. Solo un admin puede escribir acá (reglas de Firestore).
 *
 * `renovar` le da un id nuevo: lo vuelven a ver quienes ya habían cerrado el
 * anterior. Se renueva cuando cambia el texto, no al apagarlo.
 */
export async function guardarAviso({
  activo, titulo = '', mensaje = '', whatsapp = '', enlace = '', paraResellers = false, renovar = false,
}) {
  await setDoc(
    REF(),
    {
      activo: !!activo,
      titulo: titulo.trim(),
      mensaje: mensaje.trim(),
      whatsapp: numeroParaWaMe(whatsapp),
      enlace: enlace.trim(),
      paraResellers: !!paraResellers,
      ...(renovar ? { id: String(Date.now()) } : {}),
      actualizadoEn: serverTimestamp(),
    },
    { merge: true }
  )
}
