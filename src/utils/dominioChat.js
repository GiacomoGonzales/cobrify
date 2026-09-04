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
  // Cada medida donde se usa de verdad: el de 512 pesa 400 KB y ponerlo en la
  // cabecera, que lo pinta a 24 px, era bajar eso para nada.
  icono: '/chat/icon-192.png',       // login (se ve a ~64 px)
  iconoChico: '/chat/icon-64.png',   // cabecera de la bandeja (24 px)
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

const LOCALES = ['localhost', '127.0.0.1']

/**
 * Probar el chat en desarrollo SIN inventar un host nuevo.
 *
 * `chat.localhost` no sirve para probar de verdad: la llave de Firebase acepta
 * peticiones solo desde una lista de direcciones, y ese host no esta en ella —
 * el login devuelve "requests-from-referer ... are-blocked". Agregarlo a la
 * consola de Google es posible, pero no vale la pena por un host de pruebas.
 *
 * Entonces en local se entra por `localhost:3000/?chat=1` y queda anotado en la
 * pestana. Solo funciona en localhost: en produccion manda el dominio y nada mas.
 */
const enModoPruebaDelChat = () => {
  try {
    if (!LOCALES.includes(window.location.hostname)) return false
    if (new URLSearchParams(window.location.search).get('chat') === '1') {
      sessionStorage.setItem('modoChat', '1')
    }
    return sessionStorage.getItem('modoChat') === '1'
  } catch {
    return false
  }
}

/** ¿La peticion entro por el subdominio del chat? */
export const esDominioDelChat = (hostname = window.location.hostname) =>
  HOSTS_DEL_CHAT.includes(String(hostname || '').toLowerCase().split(':')[0])
  || enModoPruebaDelChat()

/**
 * Hosts que son de Cobrify. Un reseller sirve la misma app desde su propio
 * dominio con su propia marca, y ahi la bandeja NO debe decir "Cobrify Chat".
 */
const HOSTS_PROPIOS = [
  'cobrifyperu.com', 'www.cobrifyperu.com', 'app.cobrifyperu.com',
  'cobrify.com', 'www.cobrify.com', 'app.cobrify.com',
  ...LOCALES,
]

/**
 * ¿Se esta VIENDO la bandeja del chat, sin importar por donde se entro?
 *
 * `esDominioDelChat` responde por el host, y con eso alcanzaba mientras el chat
 * vivia solo en chat.cobrifyperu.com. Pero la ruta /chat existe en cualquier
 * host, asi que entrando por cobrifyperu.com/chat la pestana quedaba con el
 * favicon y el titulo del sistema de facturacion.
 *
 * La ruta sola no basta como regla: en el dominio de un reseller mandaria su
 * marca, no la nuestra. Por eso se exige ademas que el host sea de Cobrify.
 */
export const estaEnElChat = () => {
  if (esDominioDelChat()) return true
  try {
    const host = String(window.location.hostname || '').toLowerCase()
    if (!HOSTS_PROPIOS.includes(host)) return false
    if (window.location.pathname.replace(/\/+$/, '').startsWith('/chat')) {
      // Se anota para el resto de la pestana: al entrar sin sesion la app
      // manda a /login, y ahi la ruta ya no dice /chat. Sin esto, el login de
      // la bandeja aparecia con el favicon del sistema de facturacion.
      sessionStorage.setItem('modoChat', '1')
      return true
    }
    return sessionStorage.getItem('modoChat') === '1'
  } catch {
    return false
  }
}
