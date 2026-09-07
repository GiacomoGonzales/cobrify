/**
 * CAMBIAR LA PROPIA CONTRASEÑA.
 *
 * Firebase exige reautenticar con la contraseña actual antes de escribir la
 * nueva: sin eso, quien se siente frente a una sesión abierta podría cambiarla
 * y quedarse con la cuenta.
 *
 * POR QUÉ ESTÁ ACÁ (pedido de Mandil, 6-set-2026): la pantalla "Cuenta y
 * seguridad" ya hacía esto, pero vive dentro de Configuración, y un sub-usuario
 * sin ese permiso no puede ni verla. En la práctica, la contraseña de un
 * empleado solo la podía cambiar el dueño desde la ficha del usuario — o sea,
 * una contraseña que su dueño no controla. Ahora hay una entrada propia para
 * cualquiera, y las dos pantallas usan estas mismas reglas.
 */
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth'

export const LARGO_MINIMO = 6

/**
 * Revisa la contraseña nueva antes de molestar al servidor.
 * @returns {string|null} el problema, o null si está bien
 */
export function problemaDeContrasena({ actual, nueva, repetida }) {
  if (!actual || !nueva || !repetida) return 'Completa los tres campos'
  if (nueva.length < LARGO_MINIMO) return `La nueva contraseña debe tener al menos ${LARGO_MINIMO} caracteres`
  if (nueva !== repetida) return 'La nueva contraseña y su repetición no coinciden'
  if (actual === nueva) return 'La nueva contraseña tiene que ser distinta de la actual'
  return null
}

/**
 * Traduce el error de Firebase a algo que se entienda.
 * Ojo: contraseña equivocada llega como `auth/wrong-password` o, en las
 * versiones nuevas del SDK, como `auth/invalid-credential` — que sin traducir
 * se le muestra al usuario como "credencial inválida" y no dice nada.
 */
export function mensajeDeErrorDeAuth(codigo) {
  switch (codigo) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'La contraseña actual no es correcta'
    case 'auth/weak-password':
      return 'La nueva contraseña es demasiado fácil de adivinar'
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera unos minutos y vuelve a probar'
    case 'auth/requires-recent-login':
      return 'Por seguridad, cierra sesión y vuelve a entrar antes de cambiar la contraseña'
    case 'auth/network-request-failed':
      return 'Sin conexión. Revisa tu internet y vuelve a intentar'
    default:
      return 'No se pudo cambiar la contraseña. Inténtalo nuevamente'
  }
}

/**
 * "Confirma que eres tú" pidiendo la contraseña.
 *
 * Se usa antes de algo grave —cambiar la clave, borrar datos en masa— porque
 * escribir ELIMINAR en una casilla lo puede hacer cualquiera que encuentre la
 * sesión abierta.
 *
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function confirmarConContrasena(auth, contrasena) {
  const usuario = auth?.currentUser
  if (!usuario?.email) return { ok: false, error: 'No hay una sesión abierta' }
  if (!contrasena) return { ok: false, error: 'Escribe tu contraseña para confirmar' }
  try {
    await reauthenticateWithCredential(usuario, EmailAuthProvider.credential(usuario.email, contrasena))
    return { ok: true }
  } catch (error) {
    console.error('Error al confirmar la contraseña:', error)
    return { ok: false, error: mensajeDeErrorDeAuth(error?.code) }
  }
}

/**
 * Cambia la contraseña del usuario que tiene la sesión abierta.
 *
 * @param {import('firebase/auth').Auth} auth
 * @param {{actual: string, nueva: string, repetida: string}} datos
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function cambiarMiContrasena(auth, { actual, nueva, repetida }) {
  const problema = problemaDeContrasena({ actual, nueva, repetida })
  if (problema) return { ok: false, error: problema }

  const usuario = auth?.currentUser
  if (!usuario?.email) {
    return { ok: false, error: 'No hay una sesión abierta' }
  }

  const confirmada = await confirmarConContrasena(auth, actual)
  if (!confirmada.ok) return confirmada

  try {
    await updatePassword(usuario, nueva)
    return { ok: true }
  } catch (error) {
    console.error('Error al cambiar la contraseña:', error)
    return { ok: false, error: mensajeDeErrorDeAuth(error?.code) }
  }
}
