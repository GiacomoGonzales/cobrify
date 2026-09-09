/**
 * DÓNDE SE DESCARGA COBRIFY, y desde qué aparato está entrando la persona.
 *
 * Las dos direcciones estaban escritas a mano en dos sitios —el formulario de
 * alta y el botón del header— y la detección del sistema operativo, en tres.
 * El día que cambie el identificador de una ficha (pasó con el de iOS al
 * publicarla), la mitad de los enlaces quedan apuntando a una página que ya no
 * existe y nadie se entera hasta que un cliente avisa.
 *
 * Acá está una sola vez.
 */

export const URL_PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.factuya.cobrify'
export const URL_APP_STORE = 'https://apps.apple.com/pe/app/cobrify-peru/id6756195760'

/** Cómo se llama cada tienda cuando hay que escribirlo. */
export const NOMBRE_DE_TIENDA = {
  android: 'Google Play',
  ios: 'App Store',
}

/**
 * Desde qué aparato entró: 'android' | 'ios' | 'web'.
 *
 * Sirve para enseñarle solo lo que le sirve. En escritorio no hay tienda que
 * ofrecer, así que devuelve 'web'.
 */
export function aparato() {
  if (typeof navigator === 'undefined') return 'web'
  const ua = navigator.userAgent || ''
  if (/android/i.test(ua)) return 'android'
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return 'ios'
  return 'web'
}

/** La ficha de la tienda que le corresponde, o null si está en computadora. */
export function urlDeTienda(cual = aparato()) {
  if (cual === 'android') return URL_PLAY_STORE
  if (cual === 'ios') return URL_APP_STORE
  return null
}
