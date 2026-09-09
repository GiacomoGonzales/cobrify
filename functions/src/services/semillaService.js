/**
 * La semilla: cómo nace una cuenta nueva, en un solo sitio.
 *
 * Antes cada camino que creaba cuentas —el registro del admin, el del
 * reseller— escribía lo suyo a su manera, y ninguno creaba la sucursal. El
 * resultado eran cuentas cojas: sin sucursal, sin almacén, con el nombre del
 * negocio guardado en campos distintos y con las opciones "apagadas" solo
 * porque el campo no existía.
 *
 * Esto lo escribe TODO de una vez y en el servidor. Los valores viven en
 * `../data/semilla.js`, que leen igual Node y la web.
 *
 * Es idempotente: si la cuenta ya tiene semilla, no la vuelve a sembrar. Así
 * un reintento por red no pisa lo que el cliente ya configuró.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { rubros } = require('../data/rubros.json')
import { origenDesdeLanding, limpiarOrigen } from '../data/origen.js'

import {
  OPCIONES_SEMILLA, VALORES_SEMILLA, SERIES_NEGOCIO, SUNAT_SEMILLA,
  opcionesDelRubro, modoDelRubro,
} from '../data/semilla.js'

/** Sube de número cuando cambie lo que siembra, para poder distinguir cuentas. */
export const VERSION_SEMILLA = 1

const texto = (v) => (typeof v === 'string' ? v.trim() : '')

/**
 * Deja una cuenta recién creada lista para usar.
 *
 * El usuario de Auth tiene que existir ya: esta función escribe documentos, no
 * crea sesiones. Así la puede usar igual el alta del admin (que crea el usuario
 * con la instancia secundaria), el reseller, el formulario del cliente y el
 * chat.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {Object} p
 * @param {string} p.uid            uid del usuario de Auth ya creado
 * @param {string} p.email
 * @param {Object} p.datos          ruc, businessName, tradeName, telefonos, direccion, rubro…
 * @param {Object} p.FieldValue     el FieldValue del Admin SDK (para serverTimestamp)
 * @returns {Promise<{sembrada: boolean, warehouseId?: string, businessMode?: string}>}
 */
export async function sembrarCuenta(db, { uid, email, datos = {}, FieldValue }) {
  if (!uid) throw new Error('Falta el uid')

  const negocioRef = db.collection('businesses').doc(uid)
  const yaEsta = await negocioRef.get()
  if (yaEsta.exists && yaEsta.data()?.semillaVersion) {
    return { sembrada: false, motivo: 'Esta cuenta ya tiene semilla' }
  }

  // El rubro manda: de él salen el motor (businessMode) y los ajustes que
  // cambian respecto a la semilla común.
  const rubro = texto(datos.rubro) || null
  const businessMode = modoDelRubro(rubro, rubros)
  const opciones = opcionesDelRubro(rubro, rubros)

  // UN solo juego de nombres. `businessName` (razón social) y `tradeName`
  // (nombre comercial) son los buenos. `name` y `razonSocial` van con el mismo
  // valor SOLO para que no se rompa lo que todavía los lee; cuando esos
  // lectores se unifiquen, se borran de aquí y de ningún sitio más.
  // De dónde vino el cliente, en la forma ÚNICA de `data/origen.js`.
  //
  // Puede llegar de dos maneras: ya traducido (lo hace `completarAlta` con el
  // anuncio de la conversación) o tal como lo capturó la landing, que es lo que
  // manda el navegador. Se acepta cualquiera de las dos y se guarda una sola.
  //
  // Lo que llega del navegador NO es de fiar: `limpiarOrigen` es la última
  // puerta y descarta todo lo que no sea el canal, el detalle, el id y la
  // fecha. Sin esto, quien llame al endpoint escribe lo que quiera dentro del
  // documento del negocio.
  const origen = limpiarOrigen(datos.origen) || origenDesdeLanding(datos.acquisition)

  const razonSocial = texto(datos.businessName)
  const nombreComercial = texto(datos.tradeName) || razonSocial

  // OJO: NO se crea documento de sucursal. La "Sucursal Principal" ES el
  // negocio y se identifica por `branchId === null` (ver
  // `src/utils/branchCatalog.js`); `branches` guarda solo las ADICIONALES.
  // Crear uno ahi le aparece al cliente una segunda sucursal en el selector.
  const warehouseRef = negocioRef.collection('warehouses').doc()
  const ahora = FieldValue.serverTimestamp()
  const lote = db.batch()

  // 1) Quién es. Sin esto no es dueño de nada.
  lote.set(db.collection('users').doc(uid), {
    uid,
    email,
    displayName: texto(datos.displayName) || razonSocial || email,
    isBusinessOwner: true,
    allowedPages: [], // el dueño ve todo; los permisos son para sub-usuarios
    isActive: true,
    createdAt: ahora,
  }, { merge: true })

  // 2) El negocio: datos, las opciones ya decididas, y sus series.
  lote.set(negocioRef, {
    ruc: texto(datos.ruc),
    businessName: razonSocial,
    tradeName: nombreComercial,
    name: nombreComercial,     // alias heredado
    razonSocial,               // alias heredado
    email,
    /** El del local: es el que se imprime en el ticket. */
    phone: texto(datos.phone),
    /** El del dueño: para escribirle. NO se imprime. */
    contactPhone: texto(datos.contactPhone) || texto(datos.phone),
    address: texto(datos.address),
    district: texto(datos.district),
    province: texto(datos.province),
    department: texto(datos.department),
    ubigeo: texto(datos.ubigeo),

    businessMode,
    ...(rubro ? { rubro, rubroConfirmadoEn: new Date() } : {}),

    // DE DÓNDE VINO ESTE CLIENTE. Lo detecta la landing en su PRIMERA visita
    // (`src/utils/attribution.js`: gclid, fbclid, UTM o el sitio de
    // procedencia) y lo guarda en el navegador hasta que se crea la cuenta.
    //
    // Hasta hoy ese viaje se cortaba: el único sitio que escribía el origen era
    // `registerUser`, que no lo llama nadie. Resultado, de 752 negocios el campo
    // estaba en CERO — la landing llevaba meses midiendo para nada. Ahora entra
    // por acá, que es por donde pasan los DOS caminos que crean cuentas:
    // `crearCuentaCompleta` y `completarAlta`.
    //
    // El campo se llama `origen` y no `acquisition` porque ahora hay una sola
    // forma para todos los canales (ver `data/origen.js`). El nombre viejo no
    // se conserva como alias: se comprobó que no lo tenía NI UNA de las 752
    // cuentas, así que no hay nada que respetar.
    ...(origen ? { origen } : {}),

    ...VALORES_SEMILLA,
    ...opciones,

    // Las series del negocio SON las de la Sucursal Principal. `branchSeries`
    // se queda vacio: solo lo llenan las sucursales adicionales.
    series: SERIES_NEGOCIO,
    sunat: SUNAT_SEMILLA,

    semillaVersion: VERSION_SEMILLA,
    createdAt: ahora,
    updatedAt: ahora,
  }, { merge: true })

  // 3) El almacén, en la Sucursal Principal: `branchId: null` es exactamente
  //    lo que significa "la principal". Es lo que hacia el alta de siempre.
  lote.set(warehouseRef, {
    name: 'Almacén Principal',
    branchId: null,
    isDefault: true,
    isActive: true,
    createdAt: ahora,
    updatedAt: ahora,
  })

  await lote.commit()

  return {
    sembrada: true,
    warehouseId: warehouseRef.id,
    businessMode,
    rubro,
    opciones: Object.keys(opciones).length,
  }
}

export { OPCIONES_SEMILLA }
