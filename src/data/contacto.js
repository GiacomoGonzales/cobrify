/**
 * POR DÓNDE SE CONTACTA A COBRIFY, en un solo sitio.
 *
 * El número estaba escrito a mano en quince archivos: la landing, los precios,
 * el banner de vencimiento, el modal de cuenta bloqueada, mantenimiento, las
 * dos pantallas de reseller y las páginas de eliminación de cuenta. Cambiarlo
 * significaba encontrarlos todos, y bastaba con que se escapara uno para dejar
 * a un cliente escribiéndole a un número que ya nadie mira.
 *
 * Ahora se cambia acá y cambia en todas partes.
 *
 * OJO: hay DOS sitios que no pueden leer este archivo, porque son HTML suelto
 * servido tal cual y no pasan por el compilador —`public/delete-account.html` y
 * `public/account-deletion.html`, las páginas de eliminación de cuenta que
 * exigen Apple y Google—. Ahí el número va escrito a mano y hay que cambiarlo
 * aparte. Están marcadas con un comentario que apunta a este archivo.
 *
 * Esto es SOLO el contacto de Cobrify. El cliente de un reseller ve el número
 * de SU reseller, que sale de su marca blanca y no de acá; el de Cobrify queda
 * de último recurso para cuando el reseller no configuró ninguno.
 */

/** El número de la bandeja del sistema, en el formato que pide wa.me. */
export const WHATSAPP_COBRIFY = '51955778215'

/** El mismo número como se lee en Perú, para mostrarlo en pantalla. */
export const WHATSAPP_COBRIFY_LEGIBLE = '+51 955 778 215'

/** El correo de soporte, que va de la mano con el número. */
export const EMAIL_SOPORTE = 'soporte@cobrifyperu.com'

/**
 * Un enlace de WhatsApp a Cobrify, con el mensaje ya escrito.
 *
 * El texto se codifica acá y no en cada llamada: escribirlo a mano con `%20` es
 * como se cuelan los acentos rotos en el mensaje que le llega al cliente.
 */
export function enlaceWhatsapp(texto = '') {
  const base = `https://wa.me/${WHATSAPP_COBRIFY}`
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base
}
