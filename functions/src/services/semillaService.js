/**
 * La semilla: cómo nace una cuenta nueva, en un solo sitio.
 *
 * Antes cada camino que creaba cuentas —el registro del admin, el del
 * reseller— escribía lo suyo a su manera, y ninguno creaba la sucursal. El
 * resultado eran cuentas cojas: sin sucursal, sin almacén, con el nombre del
 * negocio guardado en campos distintos y con 40 opciones "apagadas" solo
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

import {
  OPCIONES_SEMILLA, VALORES_SEMILLA, SERIES_NEGOCIO, SUNAT_SEMILLA,
  seriesDeSucursal, opcionesDelRubro, modoDelRubro,
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
 * @returns {Promise<{sembrada: boolean, branchId?: string, warehouseId?: string, businessMode?: string}>}
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
  const razonSocial = texto(datos.businessName)
  const nombreComercial = texto(datos.tradeName) || razonSocial

  const branchRef = negocioRef.collection('branches').doc()
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

  // 2) El negocio: datos, las 40 opciones ya decididas, y sus series.
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

    ...VALORES_SEMILLA,
    ...opciones,

    series: SERIES_NEGOCIO,
    branchSeries: { [branchRef.id]: seriesDeSucursal(1) },
    sunat: SUNAT_SEMILLA,

    semillaVersion: VERSION_SEMILLA,
    createdAt: ahora,
    updatedAt: ahora,
  }, { merge: true })

  // 3) La sucursal. Sin sucursal no puede existir un almacén, y hasta hoy no
  //    la creaba nadie.
  lote.set(branchRef, {
    name: 'Principal',
    tradeName: '',
    logoUrl: '',
    address: texto(datos.address),
    phone: texto(datos.phone),
    email,
    location: '',
    department: texto(datos.department),
    province: texto(datos.province),
    district: texto(datos.district),
    ubigeo: texto(datos.ubigeo),
    businessMode: null, // hereda el del negocio
    isDefault: true,
    isActive: true,
    createdAt: ahora,
    updatedAt: ahora,
    createdBy: 'semilla',
  })

  // 4) El almacén, dentro de esa sucursal.
  lote.set(warehouseRef, {
    name: 'Almacén Principal',
    branchId: branchRef.id,
    isDefault: true,
    isActive: true,
    createdAt: ahora,
    updatedAt: ahora,
  })

  await lote.commit()

  return {
    sembrada: true,
    branchId: branchRef.id,
    warehouseId: warehouseRef.id,
    businessMode,
    rubro,
    opciones: Object.keys(opciones).length,
  }
}

export { OPCIONES_SEMILLA }
