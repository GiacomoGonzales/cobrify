/**
 * La marca de un reseller, leída de su propio panel.
 *
 * Existe porque la cáscara se compilaba pasando el logo a mano y, si nadie lo
 * pasaba, salía con el ícono de Cobrify: la app se instalaba con la marca
 * equivocada en el cajón del teléfono y el reseller se enteraba antes que
 * nosotros. La marca ya está guardada en `resellers/{id}.branding`, así que el
 * build la busca solo en vez de esperar que se la dicten.
 *
 * Va por la API REST y SIN credenciales a propósito: es la misma lectura que
 * hace el login del reseller antes de que nadie se autentique, así que
 * funciona igual en CI que en una máquina con la sesión de gcloud vencida.
 */
const PROYECTO = 'cobrify-395fe'
const REST = `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/(default)/documents:runQuery`

/** Mismo criterio que `normalizeCustomDomain` del front: sin protocolo, sin www. */
export function normalizarDominio(valor) {
  let s = String(valor || '').trim().toLowerCase()
  if (!s) return ''
  s = s.replace(/^https?:\/\//, '')
  s = s.split('/')[0].split('?')[0].split('#')[0]
  if (s.startsWith('www.')) s = s.substring(4)
  return s
}

/** Aplana el JSON de Firestore REST ({stringValue: 'x'}) a valores planos. */
function plano(campos) {
  const salida = {}
  for (const [k, v] of Object.entries(campos || {})) {
    if (v.stringValue !== undefined) salida[k] = v.stringValue
    else if (v.doubleValue !== undefined) salida[k] = v.doubleValue
    else if (v.integerValue !== undefined) salida[k] = Number(v.integerValue)
    else if (v.booleanValue !== undefined) salida[k] = v.booleanValue
    else if (v.mapValue !== undefined) salida[k] = plano(v.mapValue.fields)
  }
  return salida
}

/**
 * @param {string} dominio  dominio propio del reseller (con o sin www/protocolo)
 * @returns {Promise<{resellerId, nombre, logoUrl, primaryColor, secondaryColor}|null>}
 */
export async function marcaDeDominio(dominio) {
  const buscado = normalizarDominio(dominio)
  if (!buscado) return null

  const res = await fetch(REST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'resellers' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'customDomain' },
            op: 'EQUAL',
            value: { stringValue: buscado },
          },
        },
        limit: 1,
      },
    }),
  })
  if (!res.ok) throw new Error(`Firestore respondió ${res.status} buscando ${buscado}`)

  const filas = await res.json()
  const doc = filas.find(f => f.document)?.document
  if (!doc) return null

  const datos = plano(doc.fields)
  const marca = datos.branding || {}
  return {
    resellerId: doc.name.split('/').pop(),
    nombre: marca.companyName || datos.companyName || '',
    logoUrl: marca.logoUrl || '',
    primaryColor: marca.primaryColor || '',
    secondaryColor: marca.secondaryColor || '',
  }
}

/** Descarga el logo a disco y devuelve la ruta. */
export async function bajarLogo(url, destino) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`el logo respondió ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const { writeFileSync } = await import('node:fs')
  writeFileSync(destino, buf)
  return destino
}

/**
 * Deja el logo listo para ser ícono: cuadrado y de 1024 px como mínimo.
 *
 * Los resellers suben el logo pensando en la cabecera de la web, así que
 * varios son tiras horizontales (FACTUVIP es 500x140). Metido tal cual en un
 * ícono cuadrado, el texto queda del tamaño de un grano de arroz. Acá se
 * centra sobre un lienzo cuadrado transparente, que es lo que Android espera,
 * y se avisa cuando el logo no da para ícono aunque se acomode.
 *
 * Devuelve los avisos; no falla: un ícono flojo con SU marca sigue siendo
 * mucho mejor que uno impecable con la marca de otro.
 */
export async function acomodarParaIcono(ruta, { lado = 1024 } = {}) {
  const avisos = []
  let sharp
  try {
    sharp = (await import('sharp')).default
  } catch {
    return ['no se pudo cargar sharp: el logo va tal cual, sin acomodar']
  }

  const meta = await sharp(ruta).metadata()
  const mayor = Math.max(meta.width, meta.height)
  const proporcion = mayor / Math.min(meta.width, meta.height)

  if (proporcion > 2) {
    avisos.push(`el logo es alargado (${meta.width}x${meta.height}): como ícono se verá muy chico, conviene pedirle uno cuadrado`)
  }
  if (mayor < 512) {
    avisos.push(`el logo es de baja resolución (${meta.width}x${meta.height}): el ícono saldrá borroso`)
  }
  if (meta.width === meta.height && mayor >= lado) return avisos

  // El logo ocupa el 90% del lienzo: el resto es aire, que es lo que evita que
  // Android lo recorte al aplicar la máscara del ícono adaptativo.
  const dentro = Math.round(lado * 0.9)
  const encogido = await sharp(ruta)
    .resize(dentro, dentro, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  const salida = await sharp({
    create: { width: lado, height: lado, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: encogido, gravity: 'center' }])
    .png()
    .toBuffer()

  const { writeFileSync } = await import('node:fs')
  writeFileSync(ruta, salida)
  return avisos
}
