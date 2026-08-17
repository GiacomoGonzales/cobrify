import { GoogleAuth } from 'google-auth-library'
import jwt from 'jsonwebtoken'

/**
 * Cliente de la API de Google Wallet para las TARJETAS DE SELLOS.
 *
 * MODELO (importante para entender los IDs):
 *  - Una CLASE por NEGOCIO. Es la plantilla: logo, colores, nombre del programa.
 *    El emisor (issuer) es Cobrify; cada cliente de Cobrify es una clase suya,
 *    así el comprador ve "Pizzería El Bambú", no "Cobrify".
 *  - Un OBJETO por TARJETA de cliente. Lleva los sellos y el QR.
 *
 * Los IDs deben ser `{issuerId}.{sufijo}` y el sufijo solo admite letras,
 * números, punto, guion y guion bajo — por eso el teléfono se limpia.
 *
 * LA ACTUALIZACIÓN ES EL PUNTO CLAVE: al hacer PATCH del objeto, el teléfono
 * del cliente refleja los sellos nuevos SOLO — sin abrir nada, sin reinstalar
 * la tarjeta. Eso es lo que hace que valga la pena frente a una página web.
 */

const BASE = 'https://walletobjects.googleapis.com/walletobjects/v1'

// Logo de respaldo cuando el negocio no tiene uno o el suyo no carga. OJO: URL
// DIRECTA, sin redireccion — el dominio sin www responde 307 y Google lo
// rechaza (comprobado).
const LOGO_POR_DEFECTO = process.env.GOOGLE_WALLET_DEFAULT_LOGO
  || 'https://www.cobrifyperu.com/app-icon.png'
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer'

/** Credenciales desde el secreto GOOGLE_WALLET_SA_KEY (JSON de la cuenta de servicio). */
function credenciales() {
  const raw = process.env.GOOGLE_WALLET_SA_KEY
  if (!raw) throw new Error('Falta el secreto GOOGLE_WALLET_SA_KEY')
  return JSON.parse(raw)
}

function issuerId() {
  const id = process.env.GOOGLE_WALLET_ISSUER_ID
  if (!id) throw new Error('Falta GOOGLE_WALLET_ISSUER_ID')
  return id
}

let clienteAuth = null
async function apiClient() {
  if (!clienteAuth) {
    clienteAuth = new GoogleAuth({ credentials: credenciales(), scopes: [SCOPE] })
  }
  return clienteAuth.getClient()
}

/** Sufijo seguro para IDs de Wallet (solo [A-Za-z0-9._-]). */
export function sufijoSeguro(texto) {
  return String(texto || '').replace(/[^A-Za-z0-9._-]/g, '')
}

export const classIdDe = (businessId) => `${issuerId()}.biz_${sufijoSeguro(businessId)}`
export const objectIdDe = (businessId, phone) =>
  `${issuerId()}.card_${sufijoSeguro(businessId)}_${sufijoSeguro(phone)}`

/**
 * GET/PUT genérico: si el recurso existe se actualiza, si no se crea.
 * Wallet no tiene "upsert", así que se consulta primero.
 */
async function upsert(tipo, id, cuerpo) {
  const client = await apiClient()
  const url = `${BASE}/${tipo}/${encodeURIComponent(id)}`
  try {
    await client.request({ url, method: 'GET' })
    const res = await client.request({ url, method: 'PUT', data: cuerpo })
    return { creado: false, data: res.data }
  } catch (error) {
    if (error.response?.status !== 404) throw error
    const res = await client.request({ url: `${BASE}/${tipo}`, method: 'POST', data: cuerpo })
    return { creado: true, data: res.data }
  }
}

/**
 * Clase del negocio (su plantilla de tarjeta).
 * @param {Object} negocio - { businessId, nombre, logoUrl, portadaUrl,
 *   colorFondo, programa, enlaces, ubicaciones }
 */
export async function upsertLoyaltyClass({
  businessId, nombre, logoUrl, portadaUrl, colorFondo, programa,
  enlaces = [], ubicaciones = [],
}) {
  const id = classIdDe(businessId)
  const conLogo = async (logo) => {
    const cuerpo = construirClase(id, nombre, programa, colorFondo, logo, {
      portadaUrl, enlaces, ubicaciones,
    })
    return upsert('loyaltyClass', id, cuerpo)
  }
  try {
    return await conLogo(logoUrl || LOGO_POR_DEFECTO)
  } catch (error) {
    // DOS COSAS COMPROBADAS CONTRA LA API REAL:
    //  1. Google DESCARGA el logo y rechaza la clase entera si no carga. Ni
    //     siquiera sigue redirecciones (una URL que responde 307 falla).
    //  2. El logo es OBLIGATORIO: sin el, "LoyaltyClass cannot be created
    //     without a program logo".
    // Es decir, un negocio con el logo roto NO puede quedarse sin logo — hay
    // que darle uno. Se cae al generico para que igual tenga su tarjeta.
    const msg = JSON.stringify(error.response?.data || '')
    if (msg.includes('image') && logoUrl && logoUrl !== LOGO_POR_DEFECTO) {
      console.warn(`[Wallet] Logo rechazado para ${businessId}, se usa el generico:`, msg.slice(0, 160))
      return conLogo(LOGO_POR_DEFECTO)
    }
    throw error
  }
}

function construirClase(id, nombre, programa, colorFondo, logoUrl, extras = {}) {
  const { portadaUrl, enlaces = [], ubicaciones = [] } = extras
  return {
    id,
    issuerName: nombre || 'Comercio',
    programName: programa || 'Tarjeta de sellos',
    // UNDER_REVIEW es lo correcto mientras el emisor está en modo demostración;
    // Google lo pasa a APPROVED al conceder el acceso de publicación.
    //
    // OJO, COMPROBADO: al ACTUALIZAR una clase que Google ya aprobó hay que
    // mandar igual UNDER_REVIEW. Devolverle el APPROVED que él mismo puso da
    // 400: 'Invalid review status "APPROVED"'. Por eso la clase se arma
    // siempre desde cero y nunca se reenvía la que se acaba de leer.
    reviewStatus: 'UNDER_REVIEW',
    hexBackgroundColor: colorFondo || '#1e3a8a',
    ...(logoUrl ? {
      programLogo: { sourceUri: { uri: logoUrl }, contentDescription: { defaultValue: { language: 'es', value: nombre || 'Logo' } } },
    } : {}),
    // Franja ancha de portada. Solo llega si el logo del negocio es apaisado
    // (ver portadaDe): estirar uno cuadrado se vería peor que no poner nada.
    ...(portadaUrl ? {
      heroImage: { sourceUri: { uri: portadaUrl }, contentDescription: { defaultValue: { language: 'es', value: nombre || 'Portada' } } },
    } : {}),
    accountNameLabel: 'Cliente',
    accountIdLabel: 'Teléfono',
    ...(enlaces.length ? { linksModuleData: { uris: enlaces } } : {}),
    // Con esto la tarjeta asoma sola en la pantalla de bloqueo cuando el
    // cliente pasa cerca del local. Solo se manda con coordenadas PRECISAS
    // (ver geocodeService): un geocerco de distrito entero sería una molestia.
    ...(ubicaciones.length ? { locations: ubicaciones } : {}),
  }
}

/**
 * Contador grande de la tarjeta.
 *
 * Los símbolos y el tope NO son constantes de acá: llegan dentro de `tema`,
 * que el front guarda resuelto en `loyaltyConfig.walletTheme`. La tabla de
 * temas vive en `src/data/walletThemes.js` y es la única fuente de verdad;
 * esto solo la pinta.
 *
 * Los puntos (●●●○○○○○○○) son la cartulina de toda la vida: el cliente ve
 * cuánto le falta sin leer un número. Con metas altas dejan de distinguirse,
 * y ahí el propio tema manda usar el número.
 */
function textoDeSellos(sellos, meta, tema = {}) {
  const lleno = tema.selloLleno || '●'
  const vacio = tema.selloVacio || '○'
  const tope = tema.maxSellosEnPuntos || 20
  if (!tema.sellosComoPuntos || meta > tope) return `${sellos} de ${meta}`
  const llenos = Math.min(sellos, meta)
  const puntos = lleno.repeat(llenos) + vacio.repeat(Math.max(0, meta - llenos))
  // Pasada la meta (12 con meta 10) no se inventan puntos de más.
  return sellos > meta ? `${puntos}  +${sellos - meta}` : puntos
}

/**
 * Tarjeta de un cliente. `sellos`/`meta` pintan el progreso y `premio` el texto
 * de lo que gana. El QR lleva el teléfono: es lo que el cajero escanea.
 */
export async function upsertLoyaltyObject({
  businessId, phone, nombreCliente, sellos = 0, meta = 10, premio = '', tema = {},
  heroUrl = null, mensaje = '', nombreNegocio = '',
}) {
  const id = objectIdDe(businessId, phone)
  const faltan = Math.max(0, meta - sellos)
  // Con la cuadrícula de portada, el progreso YA está dibujado: el contador
  // baja a número simple. Puntos ●●●○○ + cuadrícula sería lo mismo dos veces.
  const conCuadricula = !!heroUrl

  const cuerpo = {
    id,
    classId: classIdDe(businessId),
    state: 'ACTIVE',
    accountId: phone,
    accountName: nombreCliente || 'Cliente',
    // El contador grande de la tarjeta.
    loyaltyPoints: {
      label: 'Tus sellos',
      balance: { string: conCuadricula ? `${sellos} de ${meta}` : textoDeSellos(sellos, meta, tema) },
    },
    // El QR que escanea el cajero para identificar al cliente.
    barcode: {
      type: 'QR_CODE',
      value: phone,
      alternateText: phone,
    },
    // Portada propia de ESTA tarjeta (la cuadrícula de sellos). Pisa la de la
    // clase — comprobado contra la API.
    ...(heroUrl ? {
      heroImage: { sourceUri: { uri: heroUrl }, contentDescription: { defaultValue: { language: 'es', value: 'Tus sellos' } } },
    } : {}),
    textModulesData: [
      faltan > 0
        ? { id: 'faltan', header: 'Te faltan', body: `${faltan} ${faltan === 1 ? 'sello' : 'sellos'} para tu premio` }
        : { id: 'faltan', header: 'Premio disponible', body: premio || 'Ya puedes canjear tu premio' },
      // Con el contador en puntos, el número exacto deja de estar a la vista.
      // Va acá para el que quiera confirmarlo. (Con cuadrícula el contador ya
      // es numérico: esta fila sería la tercera vez que se dice lo mismo.)
      ...(!conCuadricula && tema.sellosComoPuntos ? [{ id: 'progreso', header: 'Tu progreso', body: `${sellos} de ${meta} sellos` }] : []),
      ...(premio ? [{ id: 'premio', header: 'Tu premio', body: premio }] : []),
      // Mensaje libre del comercio ("Gracias por tu preferencia...").
      ...(mensaje ? [{ id: 'mensaje', header: nombreNegocio || 'Mensaje', body: mensaje }] : []),
    ],
  }
  return upsert('loyaltyObject', id, cuerpo)
}

// ============================================================================
// CUPONES (Offer) — 16-ago-2026
//
// Mismo modelo que la tarjeta de sellos pero con el tipo correcto de Google
// para descuentos: OfferClass/OfferObject. Una clase y UN objeto por cupón —
// compartido: el cupón es un código del negocio, no algo por cliente, así que
// todos los que lo agregan guardan el mismo objeto. El QR lleva el CÓDIGO,
// que es lo que valida el POS.
// ============================================================================

export const offerClassIdDe = (businessId, code) =>
  `${issuerId()}.cup_${sufijoSeguro(businessId)}_${sufijoSeguro(code)}`
export const offerObjectIdDe = (businessId, code) =>
  `${issuerId()}.cupobj_${sufijoSeguro(businessId)}_${sufijoSeguro(code)}`

/**
 * Clase del cupón. `titulo` es lo que se ve en grande ("10% de descuento").
 */
export async function upsertOfferClass({ businessId, code, nombre, logoUrl, colorFondo, titulo }) {
  const id = offerClassIdDe(businessId, code)
  const cuerpo = {
    id,
    issuerName: nombre || 'Comercio',
    provider: nombre || 'Comercio',
    title: titulo,
    redemptionChannel: 'INSTORE',
    // Mismo hallazgo que en LoyaltyClass: al ACTUALIZAR hay que mandar
    // UNDER_REVIEW aunque Google ya la haya aprobado.
    reviewStatus: 'UNDER_REVIEW',
    hexBackgroundColor: colorFondo || '#1e3a8a',
    ...(logoUrl ? {
      titleImage: { sourceUri: { uri: logoUrl }, contentDescription: { defaultValue: { language: 'es', value: nombre || 'Logo' } } },
    } : {}),
  }
  try {
    return await upsert('offerClass', id, cuerpo)
  } catch (error) {
    // Si Google rechaza la imagen (mismo problema conocido del logo), el cupón
    // sale sin imagen: a diferencia de LoyaltyClass, acá NO es obligatoria.
    const msg = JSON.stringify(error.response?.data || '')
    if (msg.includes('image') && logoUrl) {
      console.warn(`[Wallet] titleImage rechazada para cupon ${code}, va sin imagen:`, msg.slice(0, 160))
      delete cuerpo.titleImage
      return upsert('offerClass', id, cuerpo)
    }
    throw error
  }
}

/**
 * Objeto del cupón (compartido por todos los que lo agregan).
 * `expiraISO` (string ISO o null): con fecha, Google lo marca vencido solo.
 */
export async function upsertOfferObject({ businessId, code, expiraISO = null }) {
  const id = offerObjectIdDe(businessId, code)
  const cuerpo = {
    id,
    classId: offerClassIdDe(businessId, code),
    state: 'ACTIVE',
    barcode: { type: 'QR_CODE', value: String(code), alternateText: String(code) },
    ...(expiraISO ? { validTimeInterval: { end: { date: expiraISO } } } : {}),
  }
  return upsert('offerObject', id, cuerpo)
}

/** Link "Agregar a Google Wallet" del cupón: JWT igual al de la tarjeta. */
export function linkCuponAWallet({ businessId, code }) {
  const creds = credenciales()
  const payload = {
    iss: creds.client_email,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    payload: { offerObjects: [{ id: offerObjectIdDe(businessId, code) }] },
  }
  const token = jwt.sign(payload, creds.private_key, { algorithm: 'RS256' })
  return `https://pay.google.com/gp/v/save/${token}`
}

/**
 * Link del botón "Agregar a Google Wallet": un JWT firmado con la llave de la
 * cuenta de servicio. No requiere app ni SDK — es una URL que se puede mandar
 * por WhatsApp.
 */
export function linkAgregarAWallet({ businessId, phone }) {
  const creds = credenciales()
  const payload = {
    iss: creds.client_email,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    payload: { loyaltyObjects: [{ id: objectIdDe(businessId, phone) }] },
  }
  const token = jwt.sign(payload, creds.private_key, { algorithm: 'RS256' })
  return `https://pay.google.com/gp/v/save/${token}`
}

/**
 * Notificación push a la tarjeta: agrega un mensaje al objeto con
 * TEXT_AND_NOTIFY, que hace vibrar el celular del cliente con el aviso
 * ("Sumaste un sello: 5/10" / "¡Tu premio está listo!"). El mensaje además
 * queda visible en el detalle de la tarjeta.
 *
 * Google limita ~3 notificaciones por tarjeta cada 24h: las que exceden
 * llegan como mensaje silencioso, sin vibración. Para sellos alcanza.
 *
 * `idMensaje` debe ser único por evento (se usa el ID del trigger): si la
 * función reintenta, Google no duplica el mensaje.
 */
export async function notificarTarjeta({ businessId, phone, titulo, cuerpo, idMensaje }) {
  const client = await apiClient()
  const url = `${BASE}/loyaltyObject/${objectIdDe(businessId, phone)}/addMessage`
  await client.request({
    url,
    method: 'POST',
    data: {
      message: {
        id: idMensaje,
        header: titulo,
        body: cuerpo,
        messageType: 'TEXT_AND_NOTIFY',
      },
    },
  })
}
