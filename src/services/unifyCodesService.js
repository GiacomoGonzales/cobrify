import { collection, getDocs, doc, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getNextBarcodeNumbers } from './firestoreService'

/**
 * UNIFICAR CÓDIGOS INTERNOS de un negocio.
 *
 * POR QUÉ EXISTE (caso real, 12-ago-2026): un negocio (La S'Kim beauty, 443
 * productos) venía del formato viejo de SKU `PROD-0213` y quedó partido en dos
 * mundos tras el cambio al modelo unificado: 397 productos con SKU viejo y SIN
 * código de barras, y 44 con el número de 7 dígitos. Necesitaba comprar un
 * lector e imprimir etiquetas, y con dos sistemas de código conviviendo no
 * podía. Imprimir etiquetas no lo resolvía: ese flujo copia el SKU viejo sin
 * guiones (`PROD0213`) y perpetúa el formato que quería abandonar.
 *
 * ES OPCIONAL A PROPÓSITO — se dispara con un botón, nunca solo. Hay negocios
 * que escriben sus códigos a mano y tienen su propio orden; renumerarlos sin
 * pedirlo les rompería su sistema.
 *
 * QUÉ HACE
 *  - Ordena ALFABÉTICAMENTE por nombre y asigna correlativos de 7 dígitos del
 *    mismo contador del negocio (`counters/barcode`), así nunca choca con los
 *    códigos ya existentes.
 *  - Escribe el número en `sku` Y en `code` (modelo unificado: un número por
 *    cosa vendible). Cada variante recibe el suyo en `sku` y `barcode`.
 *  - Guarda el código anterior en `legacySku` (y `legacyBarcode` en variantes)
 *    para poder rastrear una factura vieja que lo mencione.
 *
 * QUÉ NO TOCA
 *  - Los productos que YA tienen el código unificado (7 dígitos en `sku` y el
 *    mismo valor en `code`): renumerarlos invalidaría etiquetas ya impresas.
 */

/** ¿Este texto es un código unificado (7 dígitos)? */
const esCodigoUnificado = (valor) => /^\d{7}$/.test(String(valor || '').trim())

/**
 * ¿Al producto le falta el código unificado?
 * Le falta si el SKU no es de 7 dígitos, o si el código de barras no coincide
 * con él (quedó a medias).
 */
const necesitaUnificar = (producto) => {
  const sku = String(producto?.sku || '').trim()
  const code = String(producto?.code || '').trim()
  if (!esCodigoUnificado(sku)) return true
  return code !== sku
}

/** ¿A esta variante le falta su propio número? */
const varianteNecesitaUnificar = (variante) => {
  const sku = String(variante?.sku || '').trim()
  const barcode = String(variante?.barcode || '').trim()
  if (!esCodigoUnificado(sku)) return true
  return barcode !== sku
}

/** Comparador alfabético en español, tolerante a tildes y mayúsculas. */
const porNombre = (a, b) =>
  String(a?.name || '').localeCompare(String(b?.name || ''), 'es', { sensitivity: 'base' })

/**
 * Previsualización: qué pasaría si se unifican los códigos. NO escribe nada.
 *
 * @returns {{ success, data?: { total, aCambiar, yaCorrectos, unidadesNuevas, ejemplos }, error? }}
 */
export const previewUnifyCodes = async (businessId) => {
  try {
    const snap = await getDocs(collection(db, 'businesses', businessId, 'products'))
    const productos = snap.docs.map(d => ({ id: d.id, ...d.data() }))

    const pendientes = []
    let unidadesNuevas = 0

    for (const p of [...productos].sort(porNombre)) {
      const tieneVariantes = p.hasVariants && Array.isArray(p.variants) && p.variants.length > 0
      if (tieneVariantes) {
        const faltan = p.variants.filter(varianteNecesitaUnificar).length
        if (faltan > 0) {
          pendientes.push({ id: p.id, name: p.name, skuActual: p.sku || '', variantes: faltan })
          unidadesNuevas += faltan
        }
      } else if (necesitaUnificar(p)) {
        pendientes.push({ id: p.id, name: p.name, skuActual: p.sku || '', variantes: 0 })
        unidadesNuevas += 1
      }
    }

    return {
      success: true,
      data: {
        total: productos.length,
        aCambiar: pendientes.length,
        yaCorrectos: productos.length - pendientes.length,
        unidadesNuevas,
        // Muestra para que el usuario reconozca sus productos antes de aceptar
        ejemplos: pendientes.slice(0, 5).map(p => ({ name: p.name, skuActual: p.skuActual })),
      },
    }
  } catch (error) {
    console.error('Error al previsualizar la unificación de códigos:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Aplica la unificación. Reserva de golpe todos los correlativos que hacen
 * falta (una sola transacción del contador) y escribe en lotes.
 *
 * @param {string} businessId
 * @param {(hechos:number, total:number) => void} [onProgress]
 * @returns {{ success, data?: { productosActualizados, codigosAsignados }, error? }}
 */
export const applyUnifyCodes = async (businessId, onProgress) => {
  try {
    const snap = await getDocs(collection(db, 'businesses', businessId, 'products'))
    const productos = snap.docs.map(d => ({ id: d.id, ...d.data() }))

    // Alfabético: es el orden que hace navegable una lista impresa.
    const ordenados = [...productos].sort(porNombre)

    // Primero se calcula CUÁNTOS números hacen falta, para pedirlos todos en
    // una sola transacción del contador en vez de una por producto.
    const plan = []
    let necesarios = 0
    for (const p of ordenados) {
      const tieneVariantes = p.hasVariants && Array.isArray(p.variants) && p.variants.length > 0
      if (tieneVariantes) {
        const indices = p.variants
          .map((v, i) => (varianteNecesitaUnificar(v) ? i : -1))
          .filter(i => i >= 0)
        if (indices.length > 0) {
          plan.push({ producto: p, variantIndices: indices })
          necesarios += indices.length
        }
      } else if (necesitaUnificar(p)) {
        plan.push({ producto: p, variantIndices: null })
        necesarios += 1
      }
    }

    if (necesarios === 0) {
      return { success: true, data: { productosActualizados: 0, codigosAsignados: 0 } }
    }

    const codigos = await getNextBarcodeNumbers(businessId, necesarios)
    let idx = 0

    // Firestore admite 500 operaciones por lote; 400 deja margen.
    const TAM_LOTE = 400
    let lote = writeBatch(db)
    let enLote = 0
    let hechos = 0

    for (const { producto, variantIndices } of plan) {
      const ref = doc(db, 'businesses', businessId, 'products', producto.id)

      if (variantIndices) {
        const variantes = producto.variants.map(v => ({ ...v }))
        for (const i of variantIndices) {
          const nuevo = codigos[idx++]
          const anterior = String(variantes[i].sku || variantes[i].barcode || '').trim()
          if (anterior && anterior !== nuevo) variantes[i].legacyBarcode = anterior
          variantes[i].sku = nuevo
          variantes[i].barcode = nuevo
        }
        lote.update(ref, { variants: variantes })
      } else {
        const nuevo = codigos[idx++]
        const anterior = String(producto.sku || producto.code || '').trim()
        const cambios = { sku: nuevo, code: nuevo }
        // El código viejo se conserva para poder rastrear un comprobante
        // antiguo que lo mencione. No se pisa si ya había uno guardado.
        if (anterior && anterior !== nuevo && !producto.legacySku) {
          cambios.legacySku = anterior
        }
        lote.update(ref, cambios)
      }

      enLote++
      hechos++
      if (enLote >= TAM_LOTE) {
        await lote.commit()
        if (onProgress) onProgress(hechos, plan.length)
        lote = writeBatch(db)
        enLote = 0
      }
    }

    if (enLote > 0) {
      await lote.commit()
      if (onProgress) onProgress(hechos, plan.length)
    }

    return {
      success: true,
      data: { productosActualizados: plan.length, codigosAsignados: necesarios },
    }
  } catch (error) {
    console.error('Error al unificar códigos:', error)
    return { success: false, error: error.message }
  }
}
