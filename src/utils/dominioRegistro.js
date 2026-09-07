/**
 * El subdominio donde se activan las cuentas nuevas.
 *
 * `registro.cobrifyperu.com/9fe889a` es más corto y más creíble en un WhatsApp
 * que `cobrifyperu.com/activar/9fe889a`, y es lo primero que ve alguien que
 * acaba de pagar. Ahí el código va pelado en la raíz.
 *
 * La ruta larga sigue existiendo en el dominio de siempre, así que el enlace
 * funciona aunque el subdominio todavía no esté apuntado.
 */
const HOSTS_DE_REGISTRO = [
  'registro.cobrifyperu.com',
  'registro.cobrify.com',
]

export const esDominioDeRegistro = (hostname = window.location.hostname) =>
  HOSTS_DE_REGISTRO.includes(String(hostname || '').toLowerCase().split(':')[0])

/** Los códigos son 10 caracteres de un alfabeto sin letras que se confundan. */
export const pareceCodigoDeAlta = (v) => /^[a-hj-km-np-z2-9]{10}$/.test(String(v || ''))
