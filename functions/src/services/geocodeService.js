import crypto from 'crypto'
import { getFirestore } from 'firebase-admin/firestore'

/**
 * GEOCODIFICACIÓN DE LA DIRECCIÓN DEL NEGOCIO — 15-ago-2026.
 *
 * Para qué: que la tarjeta de sellos aparezca sola en la pantalla de bloqueo
 * del cliente cuando pasa cerca del local. Google Wallet necesita coordenadas;
 * el negocio solo tiene una dirección escrita a mano.
 *
 * SE USA OpenStreetMap (Nominatim), no Google Maps: no exige clave ni
 * facturación, y como el resultado se guarda en caché el volumen es mínimo —
 * una consulta por negocio, no una por sello.
 *
 * DECISIÓN IMPORTANTE — SOLO ACIERTOS PRECISOS:
 * Nominatim casi siempre "encuentra" algo: si la calle no existe igual devuelve
 * el distrito. Un geocerco de distrito entero le haría saltar la tarjeta al
 * cliente a veinte cuadras del local, y una notificación que aparece donde no
 * corresponde molesta más de lo que fideliza. Por eso se descarta todo lo que
 * huela a límite administrativo: sin acierto preciso, no hay geocerco, y al
 * comercio se le avisa que revise su dirección.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
// Nominatim exige identificarse; sin User-Agent propio responde 403.
const USER_AGENT = 'Cobrify/1.0 (soporte@cobrifyperu.com)'
const COLECCION_CACHE = 'geocodeCache'

/**
 * Tipos que representan una zona, no un punto. Si el mejor resultado es uno de
 * estos, es que no encontró la dirección y devolvió el área que la contiene.
 */
const TIPOS_IMPRECISOS = new Set([
  'administrative', 'boundary', 'postcode', 'city', 'town',
  'village', 'suburb', 'neighbourhood', 'state', 'county',
])

const huella = (texto) => crypto.createHash('sha1').update(String(texto)).digest('hex').slice(0, 20)

const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * OSM Perú suele tener las vías SIN el tipo: la dirección real "Jirón Junín
 * 1310, Surquillo" no devuelve nada, pero "Junín 1310, Surquillo" sí
 * (comprobado con Nominatim). Por eso, si la consulta literal falla, se
 * reintenta quitando el prefijo de vía.
 */
const PREFIJOS_DE_VIA = /^\s*(jir[oó]n|jr\.?|avenida|av\.?|calle|ca\.?|pasaje|psje\.?|psj\.?|prolongaci[oó]n|prol\.?|malec[oó]n|alameda|carretera|urb\.?|urbanizaci[oó]n)\s+/i

/** Arma las consultas a intentar, de lo más fiel a lo más flexible. */
export function consultasDeNegocio(negocio = {}) {
  const direccion = String(negocio.address || '').trim()
  const distrito = String(negocio.district || negocio.distrito || '').trim()
  const provincia = String(negocio.province || negocio.provincia || '').trim()
  const departamento = String(negocio.department || negocio.departamento || '').trim()
  // Sin calle no hay nada preciso que buscar: solo devolvería el distrito, que
  // es justo lo que no queremos.
  if (!direccion || !distrito) return { consultas: [], distrito: '' }

  const cola = [...new Set([distrito, provincia, departamento].filter(Boolean))].join(', ')
  const consultas = [`${direccion}, ${cola}`]
  const sinVia = direccion.replace(PREFIJOS_DE_VIA, '')
  if (sinVia !== direccion) consultas.push(`${sinVia}, ${cola}`)
  return { consultas, distrito }
}

/** Una consulta a Nominatim. Devuelve el mejor resultado crudo o null. */
async function consultarNominatim(consulta) {
  const url = `${NOMINATIM}?format=json&limit=1&countrycodes=pe&q=${encodeURIComponent(consulta)}`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`Nominatim respondió ${res.status}`)
  const datos = await res.json()
  return datos[0] || null
}

/**
 * Dirección -> coordenadas, con caché en Firestore.
 *
 * Acepta un resultado solo si (a) es un punto y no una zona, y (b) menciona el
 * distrito del negocio. Lo segundo protege del homónimo: media docena de
 * ciudades del país tienen una "Junín" o una "Grau", y clavar el geocerco en
 * la de otro distrito sería peor que no ponerlo.
 *
 * @returns {Promise<{lat:number, lng:number}|null>} null si no hay acierto
 *          preciso. El llamador simplemente no pone geocerco.
 */
export async function geocodificar(consultas, distrito) {
  if (!consultas?.length) return null
  const db = getFirestore()
  // La huella cubre TODAS las variantes: si mañana se agrega un escalón de
  // reintento, las direcciones ya cacheadas se reevalúan solas.
  const ref = db.collection(COLECCION_CACHE).doc(huella(consultas.join('|')))

  // La caché guarda TAMBIÉN los fracasos. Sin eso, una dirección que no existe
  // se volvería a consultar en cada sincronización, para siempre.
  try {
    const snap = await ref.get()
    if (snap.exists) {
      const c = snap.data()
      return c.preciso ? { lat: c.lat, lng: c.lng } : null
    }
  } catch (error) {
    console.warn('[Geo] No se pudo leer la caché:', error.message)
  }

  const distritoPlano = sinTildes(distrito).toLowerCase()
  let resultado = null
  try {
    for (const consulta of consultas) {
      const mejor = await consultarNominatim(consulta)
      if (!mejor) continue
      if (TIPOS_IMPRECISOS.has(mejor.type) || TIPOS_IMPRECISOS.has(mejor.class)) continue
      if (distritoPlano && !sinTildes(mejor.display_name).toLowerCase().includes(distritoPlano)) continue
      const lat = Number(mejor.lat)
      const lng = Number(mejor.lon)
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        resultado = { lat, lng }
        break
      }
    }
  } catch (error) {
    console.warn('[Geo] Error al consultar:', error.message)
    return null // no se cachea un fallo del servicio: puede ser pasajero
  }

  try {
    await ref.set({
      consulta: consultas[0],
      preciso: !!resultado,
      ...(resultado || {}),
      consultadoEn: new Date(),
    })
  } catch (error) {
    console.warn('[Geo] No se pudo guardar la caché:', error.message)
  }

  return resultado
}

/** Atajo: negocio -> coordenadas (o null). */
export async function ubicacionDeNegocio(negocio) {
  const { consultas, distrito } = consultasDeNegocio(negocio)
  return geocodificar(consultas, distrito)
}
