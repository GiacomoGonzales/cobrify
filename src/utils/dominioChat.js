/**
 * EL SUBDOMINIO DEL CHAT (chat.cobrifyperu.com).
 *
 * Es la MISMA aplicacion servida por otra puerta: www, app y chat devuelven el
 * mismo archivo. Lo unico que cambia es como se comporta segun por donde
 * entraste, y ese criterio vive aca para que no se escriba distinto en cada
 * sitio (index.html y middleware.js tienen su propia copia: uno corre antes que
 * este bundle y el otro en el borde, asi que si cambias la lista, cambiala en
 * los tres).
 *
 * Entrar por el chat significa tres cosas:
 *  - la raiz "/" lleva al chat, no a la landing de marketing;
 *  - despues del login se cae en el chat, no en el panel de facturacion;
 *  - la pestana, el favicon y la app instalada son de Cobrify Chat.
 *
 * La sesion es por dominio: entrar aca NO te deja entrado en www, y al reves
 * tampoco. Es una consecuencia del navegador, no una decision del sistema.
 */

/** Marca de Cobrify Chat. El verde y el icono salen de la app de iOS. */
export const MARCA_CHAT = {
  nombre: 'Cobrify Chat',
  color: '#25BB6A',
  icono: '/chat/icon-512.png',
  favicon: '/chat/icon-64.png',
  iconoApple: '/chat/icon-180.png',
  manifiesto: '/chat/manifest.json',
}

/**
 * Hosts que SON el chat. Es una lista cerrada a proposito: con un "empieza por
 * chat." bastaba que un reseller pusiera chat.suempresa.com como dominio propio
 * para que su login apareciera con la marca de Cobrify Chat.
 */
export const HOSTS_DEL_CHAT = ['chat.cobrifyperu.com', 'chat.cobrify.com', 'chat.localhost']

/** ¿La peticion entro por el subdominio del chat? */
export const esDominioDelChat = (hostname = window.location.hostname) =>
  HOSTS_DEL_CHAT.includes(String(hostname || '').toLowerCase().split(':')[0])
