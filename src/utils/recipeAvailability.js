/**
 * recipeAvailability.js
 *
 * Calcula el estado de los insumos de cada plato con receta, para avisarlo
 * en la grilla del POS y al tomar una orden ANTES de que el mozo arme la
 * venta y se entere al cobrar. Dos niveles:
 *
 *   - "Sin insumos": no alcanza para preparar ni 1 unidad. Bloquea.
 *   - "Stock bajo":  alcanza, pero algún insumo llegó a su mínimo. Sólo avisa.
 *
 * El segundo existe porque los platos normalmente no llevan stock propio: el
 * pollo se está acabando y en la carta no se nota hasta que ya no hay.
 *
 * Lazy por diseño: la carga se hace UNA vez en background después de pintar
 * la página. Si el negocio no tiene recetas configuradas, no se hace nada
 * (cero overhead para el 80% de las cuentas que no usan insumos).
 *
 * Sólo lectura — no muta nada.
 */
import { collection, getDocs, query, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { convertUnit, insumoEstaBajo } from '@/services/ingredientService'

/**
 * Lee la primera receta del negocio. Si no hay ninguna, devuelve false sin
 * cargar nada más — el caller usa esto para evitar el resto del trabajo.
 * @param {string} businessId
 * @returns {Promise<boolean>}
 */
export const hasAnyRecipe = async (businessId) => {
  if (!businessId) return false
  try {
    const recipesRef = collection(db, 'businesses', businessId, 'recipes')
    const snap = await getDocs(query(recipesRef, limit(1)))
    return !snap.empty
  } catch (e) {
    console.warn('No se pudo verificar recetas:', e)
    return false
  }
}

/**
 * Estado de insumos de todos los platos con receta. Lee recetas + insumos en
 * paralelo y hace el resto en memoria (sin queries por producto).
 *
 * @param {string} businessId
 * @param {string|null} warehouseId  Si se especifica, valida contra el stock de
 *                                   ESE almacén (`warehouseStocks` del insumo);
 *                                   si no, usa `currentStock`.
 * @returns {Promise<{sinInsumos: Set<string>, stockBajo: Set<string>, motivos: Map<string, string>}>}
 *          `motivos` trae el texto para el tooltip: qué insumo y cuánto queda.
 */
export const computeRecipeStockAlerts = async (businessId, warehouseId = null) => {
  const vacio = { sinInsumos: new Set(), stockBajo: new Set(), motivos: new Map() }
  if (!businessId) return vacio
  try {
    const [recipesSnap, ingredientsSnap] = await Promise.all([
      getDocs(collection(db, 'businesses', businessId, 'recipes')),
      getDocs(collection(db, 'businesses', businessId, 'ingredients')),
    ])

    if (recipesSnap.empty) return vacio

    // Mapa por id de insumo. Si hay warehouseId tomamos el stock SÓLO de ese
    // almacén; si no, `currentStock` (suma global). Guardamos la unidad de
    // compra para convertir la cantidad de la receta antes de comparar.
    const infoById = new Map()
    ingredientsSnap.forEach(d => {
      const data = d.data()
      if (data.trackStock === false) {
        // Insumos que no manejan stock no bloquean ni avisan nunca.
        infoById.set(d.id, { stock: Infinity, unit: null, minimo: 0, nombre: data.name || '' })
        return
      }
      let stock
      if (warehouseId && Array.isArray(data.warehouseStocks)) {
        const ws = data.warehouseStocks.find(w => w.warehouseId === warehouseId)
        stock = ws?.stock || 0
      } else {
        stock = data.currentStock || 0
      }
      infoById.set(d.id, {
        stock,
        unit: data.purchaseUnit || null,
        minimo: Number(data.minimumStock) || 0,
        nombre: data.name || '',
      })
    })

    // Para insumos de tipo "producto terminado", no precargamos porque sería
    // un query extra grande; los tratamos como "stock infinito" en el badge
    // (el bloqueo real al cobrar sigue siendo correcto). En la práctica las
    // recetas de restaurante usan ingredientes crudos, no productos.
    const sinInsumos = new Set()
    const stockBajo = new Set()
    const motivos = new Map()

    recipesSnap.forEach(d => {
      const recipe = d.data()
      if (!recipe.productId) return
      const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : []
      if (ingredients.length === 0) return

      const bajos = []
      let falta = false

      for (const ing of ingredients) {
        if (ing.ingredientType === 'product') continue // no se valida en badge
        const info = infoById.get(ing.ingredientId)
        const have = info ? info.stock : 0
        // La cantidad de la receta viene en `ing.unit` (p.ej. g) pero el stock
        // se guarda en la unidad de compra del insumo (p.ej. kg). Convertimos
        // antes de comparar, igual que checkRecipeStock al cobrar. Sin esto,
        // 150 g vs 5 kg se comparaba como 5 < 150 y marcaba "Sin insumos" mal.
        const need = convertUnit(Number(ing.quantity) || 0, ing.unit, info?.unit)
        if (!(need > 0)) continue
        if (have < need) {
          // No alcanza para 1 unidad: gana sobre cualquier aviso de mínimo.
          falta = true
          break
        }
        if (info && insumoEstaBajo(have, info.minimo)) bajos.push(info)
      }

      if (falta) {
        sinInsumos.add(recipe.productId)
        return
      }
      if (bajos.length > 0) {
        stockBajo.add(recipe.productId)
        motivos.set(recipe.productId, textoDeMotivos(bajos))
      }
    })

    return { sinInsumos, stockBajo, motivos }
  } catch (e) {
    console.warn('Error calculando disponibilidad de insumos:', e)
    return vacio
  }
}

/** "Pollo: quedan 6 kg (mínimo 8)" — hasta 3 insumos, el resto se resume. */
const textoDeMotivos = (bajos) => {
  const partes = bajos.slice(0, 3).map(i => {
    const queda = Number.isInteger(i.stock) ? i.stock : parseFloat(Number(i.stock).toFixed(2))
    const unidad = i.unit ? ` ${i.unit}` : ''
    return `${i.nombre}: quedan ${queda}${unidad} (mínimo ${i.minimo})`
  })
  if (bajos.length > 3) partes.push(`y ${bajos.length - 3} insumo(s) más`)
  return `Insumos por acabarse — ${partes.join(' · ')}`
}
