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
 * @param {Object} negocio - { businessId, nombre, logoUrl, colorFondo, programa }
 */
export async function upsertLoyaltyClass({ businessId, nombre, logoUrl, colorFondo, programa }) {
  const id = classIdDe(businessId)
  const conLogo = async (logo) => {
    const cuerpo = construirClase(id, nombre, programa, colorFondo, logo)
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

function construirClase(id, nombre, programa, colorFondo, logoUrl) {
  return {
    id,
    issuerName: nombre || 'Comercio',
    programName: programa || 'Tarjeta de sellos',
    // UNDER_REVIEW es lo correcto mientras el emisor está en modo demostración;
    // Google lo pasa a APPROVED al conceder el acceso de publicación.
    reviewStatus: 'UNDER_REVIEW',
    hexBackgroundColor: colorFondo || '#1e3a8a',
    ...(logoUrl ? {
      programLogo: { sourceUri: { uri: logoUrl }, contentDescription: { defaultValue: { language: 'es', value: nombre || 'Logo' } } },
    } : {}),
  }
}

/**
 * Tarjeta de un cliente. `sellos`/`meta` pintan el progreso y `premio` el texto
 * de lo que gana. El QR lleva el teléfono: es lo que el cajero escanea.
 */
export async function upsertLoyaltyObject({
  businessId, phone, nombreCliente, sellos = 0, meta = 10, premio = '',
}) {
  const id = objectIdDe(businessId, phone)
  const faltan = Math.max(0, meta - sellos)

  const cuerpo = {
    id,
    classId: classIdDe(businessId),
    state: 'ACTIVE',
    accountId: phone,
    accountName: nombreCliente || 'Cliente',
    // El contador grande de la tarjeta.
    loyaltyPoints: {
      label: 'Sellos',
      balance: { string: `${sellos} de ${meta}` },
    },
    // El QR que escanea el cajero para identificar al cliente.
    barcode: {
      type: 'QR_CODE',
      value: phone,
      alternateText: phone,
    },
    textModulesData: [
      faltan > 0
        ? { id: 'faltan', header: 'Te faltan', body: `${faltan} ${faltan === 1 ? 'sello' : 'sellos'} para tu premio` }
        : { id: 'faltan', header: 'Premio disponible', body: premio || 'Ya puedes canjear tu premio' },
      ...(premio ? [{ id: 'premio', header: 'Tu premio', body: premio }] : []),
    ],
  }
  return upsert('loyaltyObject', id, cuerpo)
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
