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
import { getRecipeByProductId } from './recipeService'
import { recetaParaDescontar, insumosDeReceta, viaDeDevolucion, resultadoDeDescuento } from '@/utils/recetas'
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
 *
 * OJO: `getRecipeByProductId` devuelve un SOBRE { success, data }, no la
 * receta. Se abre con `recetaParaDescontar` (utils/recetas). Del 21-ago al
 * 8-set-2026 el sobre se trató como receta y en TODOS los restaurantes el
 * consumo entraba al camino de la receta con una lista vacía: no bajaba nada,
 * sin movimiento y sin error. Cada línea guarda ahora en `descuento` por qué
 * camino salió ('insumos' | 'producto' | 'nada') y, si fueron insumos, cuáles
 * y de qué almacén — la anulación devuelve exactamente eso.
 *
 * Un producto con variantes se descuenta POR VARIANTE, nunca como padre. Si
 * llega una línea sin `variantSku` para un producto que las tiene, se rechaza
 * acá y no se crea movimiento: la transacción no la rechazaría —caería a la
 * rama de producto simple y tocaría el total del padre—, y la siguiente venta
 * de cualquier variante recalcula ese total desde las variantes y deshace el
 * descuento sin dejar rastro. Pasó en un restaurante con "Cerveza personal /
 * 610 ml" (7-set-2026): no bajaba el stock y no quedaba historial.
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
 * @param {Array}  datos.items      [{ productId, nombre, cantidad, costoUnitario, variantSku?, variantLabel?, unidad?, controlaStock? }]
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

    const itemsDoc = items.map((i) => ({
      productId: i.productId,
      nombre: i.nombre || '',
      cantidad: Number(i.cantidad),
      costoUnitario: Number(i.costoUnitario) || 0,
      subtotal: (Number(i.costoUnitario) || 0) * Number(i.cantidad),
      ...(i.variantSku ? { variantSku: i.variantSku } : {}),
      ...(i.variantLabel ? { variantLabel: i.variantLabel } : {}),
      ...(i.unidad ? { unidad: i.unidad } : {}),
      ...(i.controlaStock === false ? { controlaStock: false } : {}),
    }))

    const docRef = await addDoc(coleccion(businessId), {
      motivo: datos.motivo,
      motivoNombre: motivoPorId(datos.motivo)?.nombre || datos.motivo,
      fecha: Timestamp.fromDate(fecha),
      items: itemsDoc,
      // La anulación necesita saber con qué regla se descontó.
      businessMode: datos.businessMode || null,
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
    // Por dónde salió cada línea, y qué insumos si fueron insumos. Es lo que
    // la anulación devuelve; sin esto habría que adivinar, y adivinar mal
    // infla el stock.
    const vias = items.map(() => null)
    const insumosPorLinea = items.map(() => null)

    for (const [idx, item] of items.entries()) {
      try {
        // Con receta se descuentan los INSUMOS, no el producto terminado:
        // mismo criterio que una venta en el POS. El sobre se abre en
        // recetaParaDescontar (ver cabecera).
        const receta = recetaParaDescontar(
          await getRecipeByProductId(businessId, item.productId), datos.businessMode,
        )
        if (receta) {
          const insumos = insumosDeReceta(receta, item.cantidad)
          const r = await deductIngredients(
            businessId, insumos, docRef.id, `${motivoNombre}: ${item.nombre}`,
            datos.warehouseId || null, 'internal_use', !!datos.permitirNegativo,
          )
          if (r && r.success === false) throw new Error(r.error || 'No se pudieron descontar los insumos')
          // Se anota lo que deductIngredients APLICÓ (cantidad y almacén), no lo
          // pedido: un plato sin stock propio puesto como insumo de un combo no
          // sale, y si solo había 3 de 6 salieron 3. Es lo que la anulación
          // devuelve. Lo que faltó se avisa, no se calla.
          const { aplicados, faltantes } = resultadoDeDescuento(insumos, r?.deductions || [])
          vias[idx] = aplicados.length > 0 ? 'insumos' : 'nada'
          if (aplicados.length > 0) insumosPorLinea[idx] = aplicados
          if (faltantes.length > 0) {
            errores.push(`${item.nombre}: ${faltantes.map((f) => f.aplicado > 0
              ? `solo había ${f.aplicado} de ${f.pedido} de ${f.nombre}`
              : `no se descontó ${f.nombre}`).join(', ')}`)
          }
          continue
        }

        // Sin receta y sin control de stock (un plato del menú, un servicio):
        // no hay nada que descontar. Queda en el documento como registro de lo
        // consumido, pero NO se crea un movimiento: anotar una salida de stock
        // que nunca ocurrió es peor que no anotar nada — después nadie entiende
        // por qué el historial no cuadra con las existencias.
        if (item.controlaStock === false) { vias[idx] = 'nada'; continue }

        // Con variantes, sin variante no hay qué descontar (ver cabecera).
        const prodSnap = await getDoc(doc(db, 'businesses', businessId, 'products', item.productId))
        const prod = prodSnap.exists() ? prodSnap.data() : null
        if (prod?.hasVariants && prod.variants?.length > 0 && !item.variantSku) {
          throw new Error('Elige la variante (talla, tamaño, presentación) que salió')
        }

        // La transacción devuelve { success:false } en vez de lanzar. Si no se
        // mira, se anota un movimiento por stock que nunca se movió.
        const descuento = await updateProductStockTransaction(
          businessId, item.productId, datos.warehouseId || null,
          -Number(item.cantidad), {}, item.variantSku || null,
          null, !!datos.permitirNegativo,
        )
        if (!descuento?.success) throw new Error(descuento?.error || 'No se pudo descontar el stock')
        vias[idx] = 'producto'

        const mov = await createStockMovement(businessId, {
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
          ...(item.variantLabel ? { variantLabel: item.variantLabel } : {}),
        })
        if (mov && mov.success === false) throw new Error(mov.error || 'No se pudo registrar el movimiento')
      } catch (e) {
        console.error(`Error descontando ${item.nombre}:`, e)
        errores.push(`${item.nombre}: ${e.message}`)
      }
    }

    await updateDoc(docRef, {
      items: itemsDoc.map((it, i) => ({
        ...it,
        descuento: vias[i] || 'nada',
        ...(insumosPorLinea[i] ? { insumosDescontados: insumosPorLinea[i] } : {}),
      })),
      ...(errores.length > 0 ? { erroresDescuento: errores } : {}),
    })

    if (errores.length > 0) return { success: true, id: docRef.id, total, advertencias: errores }
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
 *
 * Una línea de un producto con variantes que no trae `variantSku` (consumos
 * anteriores a la guarda del alta) NO devuelve stock: nunca se descontó de
 * una variante, y sumárselo al padre sería otro movimiento huérfano que la
 * siguiente venta borra. Se anula igual y se avisa, para que lo cuadren con
 * un recuento de esa variante.
 *
 * Igual que el alta: lo que no se pudo devolver queda en el documento y se
 * devuelve como `advertencias`, no se pierde en la consola.
 *
 * Cada línea vuelve por donde salió (`viaDeDevolucion`, utils/recetas): los
 * insumos anotados al almacén del que se descontaron, el producto, o nada.
 * Las líneas de restaurante anteriores al 8-set-2026 no descontaron nada y no
 * devuelven nada — se avisa.
 *
 * @param {{ businessMode?: string }} [opciones]  el modo actual del negocio,
 *   para las líneas viejas que no guardaron el suyo.
 */
export const voidInternalConsumption = async (businessId, consumoId, usuario, opciones = {}) => {
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
    const errores = []
    for (const item of consumo.items || []) {
      try {
        const via = viaDeDevolucion(item, opciones.businessMode ?? consumo.businessMode)
        if (via === 'nada') {
          // Línea vieja de restaurante que sí "debía" descontar: nunca lo hizo.
          if (!item.descuento && item.controlaStock !== false) {
            throw new Error('se registró cuando el sistema no descontaba en restaurantes; no hay stock que devolver')
          }
          continue
        }
        if (via === 'insumos') {
          // Firma real: (businessId, ingredients, warehouseId). Cada insumo
          // anotado trae su almacén; el del consumo es el respaldo.
          const r = await restoreIngredients(businessId, item.insumosDescontados || [], consumo.warehouseId || null)
          if (r && r.success === false) throw new Error(r.error || 'No se pudieron devolver los insumos')
          continue
        }

        // Nunca se descontó: tampoco hay nada que devolver.
        if (item.controlaStock === false) continue

        // Ver cabecera: sin variante no hay a quién devolverle.
        if (!item.variantSku) {
          const prodSnap = await getDoc(doc(db, 'businesses', businessId, 'products', item.productId))
          const prod = prodSnap.exists() ? prodSnap.data() : null
          if (prod?.hasVariants && prod.variants?.length > 0) {
            throw new Error('el consumo no indicaba la variante; el stock no se devolvió')
          }
        }

        const devolucion = await updateProductStockTransaction(
          businessId, item.productId, consumo.warehouseId || null,
          Number(item.cantidad), {}, item.variantSku || null,
        )
        if (!devolucion?.success) throw new Error(devolucion?.error || 'No se pudo devolver el stock')

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
          ...(item.variantLabel ? { variantLabel: item.variantLabel } : {}),
        })
      } catch (e) {
        console.error(`Error devolviendo ${item.nombre}:`, e)
        errores.push(`${item.nombre}: ${e.message}`)
      }
    }

    if (errores.length > 0) {
      await updateDoc(ref, { erroresDevolucion: errores })
      return { success: true, advertencias: errores }
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
