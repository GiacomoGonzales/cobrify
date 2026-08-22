import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit as fbLimit,
  serverTimestamp,
  updateDoc,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { updateProductStockTransaction } from './firestoreService'
import { createStockMovement } from './warehouseService'
import { getRecipeByProductId, shouldDeductIngredients } from './recipeService'
import { deductIngredients, restoreIngredients } from './ingredientService'

/**
 * CONSUMO INTERNO — salidas que descuentan stock SIN ser una venta.
 *
 * El almuerzo del personal, la merma, la cortesía al cliente. No emiten
 * comprobante, no suman a ingresos y no entran al cuadre de caja: son COSTO.
 *
 * El motivo no es decorativo. Al cierre del mes el dueño no quiere saber
 * "salieron 200 unidades", quiere saber cuánto comió el personal, cuánto se
 * echó a perder y cuánto regaló — tres decisiones distintas. Por eso se valúa
 * al COSTO y no al precio de venta: lo que el personal come no es una venta
 * perdida, es lo que costó reponerlo.
 *
 * Si un producto tiene receta (modo restaurante), descuenta los INSUMOS igual
 * que lo haría una venta: registrar "2 lomo saltado" baja la carne, la papa y
 * la cebolla, no un producto llamado "lomo saltado".
 */

export const MOTIVOS_CONSUMO = [
  { id: 'personal', nombre: 'Consumo del personal', pideEmpleado: true },
  { id: 'merma', nombre: 'Merma o desperdicio' },
  { id: 'cortesia', nombre: 'Cortesía al cliente' },
  { id: 'muestra', nombre: 'Muestra o degustación' },
  { id: 'rotura', nombre: 'Rotura o daño' },
  { id: 'uso_interno', nombre: 'Uso interno del local' },
]

export const motivoPorId = (id) => MOTIVOS_CONSUMO.find((m) => m.id === id) || null

const coleccion = (businessId) => collection(db, 'businesses', businessId, 'internalConsumptions')

/**
 * Registra un consumo interno: crea el documento, descuenta el stock (o los
 * insumos si hay receta) y deja un movimiento por cada línea.
 *
 * El documento se guarda PRIMERO para que exista a qué referenciar los
 * movimientos: si algo falla a mitad, queda el registro con lo que sí salió en
 * vez de stock descontado sin rastro de por qué.
 *
 * @param {Object} datos
 * @param {Array}  datos.items      [{ productId, nombre, cantidad, costoUnitario, variantSku?, unidad? }]
 * @param {string} datos.motivo     id de MOTIVOS_CONSUMO
 * @param {Date}   datos.fecha      cuándo se consumió (puede ser anterior a hoy)
 * @param {string} [datos.empleadoNombre]
 * @param {string} [datos.nota]
 * @param {string} datos.warehouseId
 * @param {string} [datos.branchId]
 * @param {Object} datos.usuario    { uid, email, nombre }
 * @param {boolean} [datos.permitirNegativo]
 * @param {string} [datos.businessMode]
 */
export const createInternalConsumption = async (businessId, datos) => {
  try {
    const items = (datos.items || []).filter((i) => i.productId && Number(i.cantidad) > 0)
    if (items.length === 0) return { success: false, error: 'No hay productos para registrar' }

    const total = items.reduce(
      (acc, i) => acc + (Number(i.costoUnitario) || 0) * Number(i.cantidad), 0,
    )
    const fecha = datos.fecha instanceof Date ? datos.fecha : new Date()

    const docRef = await addDoc(coleccion(businessId), {
      motivo: datos.motivo,
      motivoNombre: motivoPorId(datos.motivo)?.nombre || datos.motivo,
      fecha: Timestamp.fromDate(fecha),
      items: items.map((i) => ({
        productId: i.productId,
        nombre: i.nombre || '',
        cantidad: Number(i.cantidad),
        costoUnitario: Number(i.costoUnitario) || 0,
        subtotal: (Number(i.costoUnitario) || 0) * Number(i.cantidad),
        ...(i.variantSku ? { variantSku: i.variantSku } : {}),
        ...(i.unidad ? { unidad: i.unidad } : {}),
      })),
      total,
      empleadoNombre: datos.empleadoNombre || null,
      nota: datos.nota || null,
      warehouseId: datos.warehouseId || null,
      branchId: datos.branchId || null,
      estado: 'registrado',
      registradoPor: datos.usuario?.uid || '',
      registradoPorNombre: datos.usuario?.nombre || datos.usuario?.email || '',
      createdAt: serverTimestamp(),
    })

    const motivoNombre = motivoPorId(datos.motivo)?.nombre || 'Consumo interno'
    const errores = []

    for (const item of items) {
      try {
        // Con receta se descuentan los INSUMOS, no el producto terminado:
        // mismo criterio que una venta en el POS.
        const receta = await getRecipeByProductId(businessId, item.productId)
        if (receta && shouldDeductIngredients(receta, datos.businessMode)) {
          const insumos = (receta.ingredients || []).map((ing) => ({
            ...ing,
            quantity: (Number(ing.quantity) || 0) * Number(item.cantidad),
          }))
          await deductIngredients(
            businessId, insumos, docRef.id, `${motivoNombre}: ${item.nombre}`,
            datos.warehouseId || null, 'internal_use', !!datos.permitirNegativo,
          )
          continue
        }

        await updateProductStockTransaction(
          businessId, item.productId, datos.warehouseId || null,
          -Number(item.cantidad), {}, item.variantSku || null,
          null, !!datos.permitirNegativo,
        )

        await createStockMovement(businessId, {
          productId: item.productId,
          productName: item.nombre || '',
          warehouseId: datos.warehouseId || null,
          type: 'internal_use',
          quantity: -Number(item.cantidad),
          reason: `${motivoNombre}${datos.empleadoNombre ? ` — ${datos.empleadoNombre}` : ''}`,
          referenceType: 'internal_consumption',
          referenceId: docRef.id,
          motivo: datos.motivo,
          costoUnitario: Number(item.costoUnitario) || 0,
          userId: datos.usuario?.uid || '',
          ...(item.variantSku ? { variantSku: item.variantSku } : {}),
        })
      } catch (e) {
        console.error(`Error descontando ${item.nombre}:`, e)
        errores.push(`${item.nombre}: ${e.message}`)
      }
    }

    if (errores.length > 0) {
      await updateDoc(doc(db, 'businesses', businessId, 'internalConsumptions', docRef.id), {
        erroresDescuento: errores,
      })
      return { success: true, id: docRef.id, total, advertencias: errores }
    }

    return { success: true, id: docRef.id, total }
  } catch (error) {
    console.error('Error al registrar el consumo interno:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Anula un consumo interno y DEVUELVE el stock.
 *
 * Se marca el documento antes de devolver nada, y se corta si ya estaba
 * anulado: dos clics seguidos no pueden devolver el stock dos veces.
 */
export const voidInternalConsumption = async (businessId, consumoId, usuario) => {
  try {
    const ref = doc(db, 'businesses', businessId, 'internalConsumptions', consumoId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return { success: false, error: 'El registro no existe' }

    const consumo = snap.data()
    if (consumo.estado === 'anulado') {
      return { success: false, error: 'Este consumo ya estaba anulado' }
    }

    await updateDoc(ref, {
      estado: 'anulado',
      anuladoPor: usuario?.uid || '',
      anuladoPorNombre: usuario?.nombre || usuario?.email || '',
      anuladoAt: serverTimestamp(),
    })

    const motivoNombre = consumo.motivoNombre || 'Consumo interno'
    for (const item of consumo.items || []) {
      try {
        const receta = await getRecipeByProductId(businessId, item.productId)
        if (receta && shouldDeductIngredients(receta, consumo.businessMode)) {
          const insumos = (receta.ingredients || []).map((ing) => ({
            ...ing,
            quantity: (Number(ing.quantity) || 0) * Number(item.cantidad),
          }))
          // Firma real: (businessId, ingredients, warehouseId). No recibe
          // referencia ni descripción como deductIngredients.
          await restoreIngredients(businessId, insumos, consumo.warehouseId || null)
          continue
        }

        await updateProductStockTransaction(
          businessId, item.productId, consumo.warehouseId || null,
          Number(item.cantidad), {}, item.variantSku || null,
        )

        await createStockMovement(businessId, {
          productId: item.productId,
          productName: item.nombre || '',
          warehouseId: consumo.warehouseId || null,
          type: 'entry',
          quantity: Number(item.cantidad),
          reason: `Anulación de ${motivoNombre}`,
          referenceType: 'internal_consumption_void',
          referenceId: consumoId,
          userId: usuario?.uid || '',
          ...(item.variantSku ? { variantSku: item.variantSku } : {}),
        })
      } catch (e) {
        console.error(`Error devolviendo ${item.nombre}:`, e)
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Error al anular el consumo interno:', error)
    return { success: false, error: error.message }
  }
}

/** Historial, del más reciente al más viejo. */
export const getInternalConsumptions = async (businessId, { max = 300 } = {}) => {
  try {
    const q = query(coleccion(businessId), orderBy('fecha', 'desc'), fbLimit(max))
    const snap = await getDocs(q)
    return { success: true, data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) }
  } catch (error) {
    console.error('Error al leer los consumos internos:', error)
    return { success: false, error: error.message, data: [] }
  }
}

/** Totales por motivo, para el resumen del período. */
export const resumirPorMotivo = (consumos) => {
  const porMotivo = {}
  let total = 0
  for (const c of consumos) {
    if (c.estado === 'anulado') continue
    const id = c.motivo || 'uso_interno'
    porMotivo[id] = (porMotivo[id] || 0) + (Number(c.total) || 0)
    total += Number(c.total) || 0
  }
  return {
    total,
    lineas: MOTIVOS_CONSUMO
      .map((m) => ({ id: m.id, nombre: m.nombre, monto: porMotivo[m.id] || 0 }))
      .filter((l) => l.monto > 0)
      .sort((a, b) => b.monto - a.monto),
  }
}
