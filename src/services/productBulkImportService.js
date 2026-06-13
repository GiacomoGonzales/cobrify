/**
 * productBulkImportService.js
 *
 * Servicio PURO para importar productos parseados a un negocio NUEVO.
 *
 * Caso de uso: onboarding de creación de cuentas. Un super admin crea una
 * cuenta nueva e importa los productos del cliente desde un Excel ya parseado.
 *
 * Premisa clave: el negocio destino es NUEVO. No tiene productos, categorías,
 * marcas ni laboratorios previos, así que NO se deduplica contra existentes:
 * TODO item se trata como creación (la rama "PRODUCTO NO EXISTE - Crear nuevo"
 * de `handleImportProducts` en src/pages/Products.jsx).
 *
 * Diferencias vs. la función fuente (Products.jsx):
 *  - No usa getBusinessId() / useAppContext / user: recibe `businessId` y lo
 *    usa en TODAS las llamadas. Para `userId` de los movimientos de stock usa
 *    el propio `businessId` (el dueño del negocio nuevo es ese uid).
 *  - No hace setState ni toast: acumula y DEVUELVE un resumen.
 *  - No deduplica ni actualiza: solo crea.
 *
 * Lógica replicada 1:1 de la fuente:
 *  - Creación de categorías raíz + subcategorías y guardado con
 *    saveProductCategories.
 *  - Creación de marcas nuevas con saveProductBrands + inyección de brandId/marca.
 *  - Creación de laboratorios nuevos (solo modo pharmacy) en la subcolección
 *    businesses/{id}/laboratories + inyección de laboratoryId al producto.
 *  - Preparación de warehouseStocks/stock/initialStock/batches (con warehouseId)
 *    y variants (cada una con su warehouseStocks), createProduct, y registro de
 *    movimientos de stock (uno por variante con variantSku, o uno simple).
 *  - Resolución de categoría: el producto termina con `product.category = <id>`
 *    (id de la subcategoría si existe, si no de la categoría raíz). Exactamente
 *    igual que la fuente.
 */

import {
  createProduct,
  getProductCategories,
  saveProductCategories,
  getProductBrands,
  saveProductBrands,
} from '@/services/firestoreService'
import {
  getWarehouses,
  createWarehouse,
  createStockMovement,
} from '@/services/warehouseService'
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Importa una lista de productos parseados a un negocio nuevo.
 *
 * @param {string} businessId - uid/id del negocio destino (dueño nuevo).
 * @param {Array<object>} products - productos parseados (ej. desde el Excel).
 * @param {object} [opts]
 * @param {string|null} [opts.targetWarehouseId=null] - almacén destino explícito.
 * @param {string} [opts.businessMode='retail'] - modo del negocio (pharmacy habilita labs).
 * @returns {Promise<{ success: number, errors: string[], categoriesCreated: number, brandsCreated: number, labsCreated: number }>}
 *   success = nº de productos creados; errors = mensajes por producto fallido;
 *   *Created = conteos de cada entidad auxiliar creada.
 */
export async function importParsedProducts(
  businessId,
  products,
  { targetWarehouseId = null, businessMode = 'retail' } = {}
) {
  const errors = []
  let successCount = 0
  let categoriesCreated = 0
  let brandsCreated = 0
  let labsCreated = 0

  // Guard básico de entrada.
  if (!businessId) {
    return {
      success: 0,
      errors: ['businessId requerido'],
      categoriesCreated,
      brandsCreated,
      labsCreated,
    }
  }
  const productsToImport = Array.isArray(products) ? products : []
  if (productsToImport.length === 0) {
    return { success: 0, errors, categoriesCreated, brandsCreated, labsCreated }
  }

  try {
    // ============================================================
    // 1) ALMACÉN DESTINO
    // ============================================================
    // El onboarding ya crea "Almacén Principal" (isDefault). Buscamos el
    // almacén destino con el mismo patrón que la fuente.
    const warehousesResult = await getWarehouses(businessId)
    const existingWarehouses = warehousesResult.success ? warehousesResult.data : []

    let targetWarehouse = null

    if (targetWarehouseId) {
      targetWarehouse = existingWarehouses.find(wh => wh.id === targetWarehouseId)
    }

    // Si no se encontró por id, usar el almacén por defecto (o el primero).
    if (!targetWarehouse) {
      targetWarehouse = existingWarehouses.find(wh => wh.isDefault) || existingWarehouses[0]
    }

    // Si aún no hay almacén, crear uno automáticamente.
    if (!targetWarehouse && existingWarehouses.length === 0) {
      const newWarehouse = {
        name: 'Almacén Principal',
        location: 'Principal',
        description: 'Almacén creado automáticamente durante importación de productos',
        isDefault: true,
        isActive: true,
        branchId: null,
      }

      const createResult = await createWarehouse(businessId, newWarehouse)

      if (createResult.success && createResult.id) {
        targetWarehouse = { id: createResult.id, ...newWarehouse, isDefault: true }
      } else {
        // Sin almacén: los productos se crean sin stock asignado (no abortamos).
        errors.push(`No se pudo crear almacén automático: ${createResult.error || 'error desconocido'}`)
      }
    }

    // ============================================================
    // 2) CATEGORÍAS Y SUBCATEGORÍAS
    // ============================================================
    // Por robustez cargamos las existentes (en un negocio nuevo será []).
    const existingCategoriesResult = await getProductCategories(businessId)
    const updatedCategories = existingCategoriesResult.success
      ? [...(existingCategoriesResult.data || [])]
      : []

    // Identificar categorías raíz y subcategorías que no existen.
    const newCategoriesNeeded = new Set()
    const newSubcategoriesNeeded = new Map() // Map<`${padre}|||${sub}`, padre>

    for (const product of productsToImport) {
      if (product.category && product.category.trim() !== '') {
        const categoryName = product.category.trim()
        const categoryExists = updatedCategories.some(
          cat => cat.name.toLowerCase() === categoryName.toLowerCase() && !cat.parentId
        )
        if (!categoryExists) {
          newCategoriesNeeded.add(categoryName)
        }
      }

      if (
        product.subcategory &&
        product.subcategory.trim() !== '' &&
        product.category &&
        product.category.trim() !== ''
      ) {
        const subcategoryName = product.subcategory.trim()
        const parentCategoryName = product.category.trim()
        const parentCat = updatedCategories.find(
          cat => cat.name.toLowerCase() === parentCategoryName.toLowerCase() && !cat.parentId
        )
        if (parentCat) {
          const subExists = updatedCategories.some(
            cat =>
              cat.name.toLowerCase() === subcategoryName.toLowerCase() &&
              cat.parentId === parentCat.id
          )
          if (!subExists) {
            newSubcategoriesNeeded.set(`${parentCategoryName}|||${subcategoryName}`, parentCategoryName)
          }
        } else {
          // La categoría padre es nueva, la subcategoría se creará después.
          newSubcategoriesNeeded.set(`${parentCategoryName}|||${subcategoryName}`, parentCategoryName)
        }
      }
    }

    // Crear las categorías raíz nuevas.
    let categoriesChanged = false
    if (newCategoriesNeeded.size > 0) {
      for (const categoryName of newCategoriesNeeded) {
        const newCategory = {
          id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: categoryName,
          parentId: null,
        }
        updatedCategories.push(newCategory)
      }
      categoriesChanged = true
    }

    // Crear las subcategorías nuevas (sus padres ya están en updatedCategories).
    if (newSubcategoriesNeeded.size > 0) {
      for (const [key] of newSubcategoriesNeeded) {
        const [parentCategoryName, subcategoryName] = key.split('|||')
        const parentCat = updatedCategories.find(
          cat => cat.name.toLowerCase() === parentCategoryName.toLowerCase() && !cat.parentId
        )
        if (parentCat) {
          const subExists = updatedCategories.some(
            cat =>
              cat.name.toLowerCase() === subcategoryName.toLowerCase() &&
              cat.parentId === parentCat.id
          )
          if (!subExists) {
            const newSubcategory = {
              id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: subcategoryName,
              parentId: parentCat.id,
            }
            updatedCategories.push(newSubcategory)
          }
        }
      }
      categoriesChanged = true
    }

    // Guardar las categorías nuevas en Firestore.
    if (categoriesChanged) {
      const saveCategoriesResult = await saveProductCategories(businessId, updatedCategories)
      if (saveCategoriesResult.success) {
        categoriesCreated = newCategoriesNeeded.size + newSubcategoriesNeeded.size
      } else {
        errors.push(`No se pudieron guardar las categorías: ${saveCategoriesResult.error || 'error desconocido'}`)
      }
    }

    // ============================================================
    // 3) MARCAS (todos los modos)
    // ============================================================
    // Las marcas viven como array en el doc del business (no en colección),
    // así que un solo save al final. Detectamos las nuevas (texto sin brandId),
    // las creamos y reinyectamos brandId a cada producto.
    {
      const existingBrandsResult = await getProductBrands(businessId)
      const existingBrands = existingBrandsResult.success ? (existingBrandsResult.data || []) : []
      const brandNameToId = new Map()
      existingBrands.forEach(b => {
        if (b.name) brandNameToId.set(String(b.name).toLowerCase().trim(), b.id)
      })

      // Identificar marcas nuevas en el import (texto sin brandId).
      const newBrandNames = new Set()
      for (const product of productsToImport) {
        if (product.brandId) continue // ya viene linkeada por el parser
        const text = String(product.marca || '').trim()
        if (text && !brandNameToId.has(text.toLowerCase())) {
          newBrandNames.add(text)
        }
      }

      if (newBrandNames.size > 0) {
        const newBrandEntries = Array.from(newBrandNames).map(name => ({
          id: `brand-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name,
        }))
        const updatedBrands = [...existingBrands, ...newBrandEntries]
        const saveResult = await saveProductBrands(businessId, updatedBrands)
        if (saveResult.success) {
          newBrandEntries.forEach(b => brandNameToId.set(b.name.toLowerCase(), b.id))
          brandsCreated = newBrandNames.size
        } else {
          errors.push(`No se pudieron guardar las marcas: ${saveResult.error || 'error desconocido'}`)
        }
      }

      // Inyectar brandId a cada producto importado.
      for (const product of productsToImport) {
        if (product.brandId) continue
        const text = String(product.marca || '').trim()
        if (!text) continue
        const brandId = brandNameToId.get(text.toLowerCase())
        if (brandId) {
          product.brandId = brandId
          // Normalizar marca texto al nombre administrado por consistencia.
          const found =
            existingBrands.find(b => b.id === brandId) ||
            Array.from(newBrandNames)
              .map(n => ({ name: n }))
              .find(b => b.name.toLowerCase() === text.toLowerCase())
          if (found?.name) product.marca = found.name
        }
      }
    }

    // ============================================================
    // 4) LABORATORIOS (solo modo pharmacy)
    // ============================================================
    // Subcolección businesses/{id}/laboratories. Creamos los nuevos e inyectamos
    // laboratoryId al producto según el nombre.
    if (businessMode === 'pharmacy') {
      const labsRef = collection(db, 'businesses', businessId, 'laboratories')
      const labsSnapshot = await getDocs(labsRef)
      const existingLabs = labsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      const labNameToId = new Map()
      existingLabs.forEach(lab => {
        labNameToId.set(lab.name.toLowerCase().trim(), lab.id)
      })

      // Identificar laboratorios nuevos del Excel.
      const newLabNames = new Set()
      for (const product of productsToImport) {
        if (product.laboratoryName && product.laboratoryName.trim() !== '') {
          const labName = product.laboratoryName.trim()
          if (!labNameToId.has(labName.toLowerCase())) {
            newLabNames.add(labName)
          }
        }
      }

      // Crear laboratorios nuevos.
      if (newLabNames.size > 0) {
        for (const labName of newLabNames) {
          try {
            const newLabDoc = await addDoc(labsRef, {
              name: labName,
              country: '',
              website: '',
              notes: 'Creado automáticamente durante importación',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
            labNameToId.set(labName.toLowerCase(), newLabDoc.id)
            labsCreated++
          } catch (err) {
            errors.push(`Error al crear laboratorio "${labName}": ${err.message}`)
          }
        }
      }

      // Asignar laboratoryId a cada producto según el nombre.
      for (const product of productsToImport) {
        if (product.laboratoryName && product.laboratoryName.trim() !== '') {
          const labId = labNameToId.get(product.laboratoryName.trim().toLowerCase())
          if (labId) {
            product.laboratoryId = labId
          }
        }
      }
    }

    // ============================================================
    // 5) CREAR PRODUCTOS (todo es nuevo)
    // ============================================================
    for (let i = 0; i < productsToImport.length; i++) {
      const product = productsToImport[i]

      try {
        // --- Resolver categoría: nombre -> id ---
        // Tras esto, product.category queda con el ID (sub si existe, si no raíz).
        if (
          product.subcategory &&
          product.subcategory.trim() !== '' &&
          product.category &&
          product.category.trim() !== ''
        ) {
          const parentCategoryName = product.category.trim()
          const subcategoryName = product.subcategory.trim()
          const parentCat = updatedCategories.find(
            cat => cat.name.toLowerCase() === parentCategoryName.toLowerCase() && !cat.parentId
          )
          if (parentCat) {
            const subCat = updatedCategories.find(
              cat =>
                cat.name.toLowerCase() === subcategoryName.toLowerCase() &&
                cat.parentId === parentCat.id
            )
            product.category = subCat ? subCat.id : parentCat.id
          }
        } else if (product.category && product.category.trim() !== '') {
          const categoryName = product.category.trim()
          const foundCategory = updatedCategories.find(
            cat => cat.name.toLowerCase() === categoryName.toLowerCase() && !cat.parentId
          )
          if (foundCategory) {
            product.category = foundCategory.id
          }
        }
        delete product.subcategory

        // --- Preparar stock / warehouseStocks / batches / variants ---
        if (product.trackStock) {
          // Si tiene variantes, el stock total = suma de stocks de variantes.
          const variantStockSum = (product.variants || []).reduce(
            (sum, v) => sum + (parseInt(v.stock) || 0),
            0
          )
          const stockValue = product.hasVariants
            ? variantStockSum
            : (product.stock !== null && product.stock !== undefined ? product.stock : 0)

          if (targetWarehouse) {
            product.warehouseStocks = [
              {
                warehouseId: targetWarehouse.id,
                stock: stockValue,
                minStock: 0,
              },
            ]
            product.stock = stockValue

            // CRÍTICO: cada batch debe llevar warehouseId, o el sistema de
            // stock-por-almacén lo detecta como "lote sin almacén asignado".
            if (Array.isArray(product.batches) && product.batches.length > 0) {
              product.batches = product.batches.map(b => ({
                ...b,
                warehouseId: b.warehouseId || targetWarehouse.id,
              }))
            }

            // CRÍTICO: cada variante necesita su propio warehouseStocks o no
            // aparece en la vista por almacén del inventario.
            if (product.hasVariants && Array.isArray(product.variants)) {
              product.variants = product.variants.map(v => ({
                ...v,
                warehouseStocks: [
                  {
                    warehouseId: targetWarehouse.id,
                    stock: parseInt(v.stock) || 0,
                    minStock: 0,
                  },
                ],
              }))
            }
          } else {
            product.warehouseStocks = []
            product.stock = stockValue
          }
          product.initialStock = stockValue
        } else {
          product.warehouseStocks = []
          product.stock = null
          product.initialStock = null
        }

        // --- Crear el producto ---
        const result = await createProduct(businessId, product)

        if (result.success) {
          successCount++

          // --- Movimientos de stock inicial ---
          // Con variantes: un movimiento por variante con su variantSku
          // (necesario para recalculateStockFromMovements). Sin variantes: uno simple.
          if (product.trackStock && targetWarehouse) {
            if (product.hasVariants && Array.isArray(product.variants) && product.variants.length > 0) {
              for (const v of product.variants) {
                const qty = parseInt(v.stock) || 0
                if (qty <= 0) continue
                await createStockMovement(businessId, {
                  productId: result.id,
                  variantSku: v.sku,
                  warehouseId: targetWarehouse.id,
                  type: 'entry',
                  quantity: qty,
                  reason: 'Stock inicial',
                  referenceType: 'initial_stock',
                  referenceId: result.id,
                  userId: businessId,
                  notes: `Stock inicial variante ${v.sku} por importación masiva`,
                })
              }
            } else if (product.stock > 0) {
              await createStockMovement(businessId, {
                productId: result.id,
                warehouseId: targetWarehouse.id,
                type: 'entry',
                quantity: product.stock,
                reason: 'Stock inicial',
                referenceType: 'initial_stock',
                referenceId: result.id,
                userId: businessId,
                ...(product.batchNumber && { batchNumber: product.batchNumber }),
                ...(product.expirationDate && { expirationDate: product.expirationDate }),
                notes: `Ingreso de stock inicial por importación masiva${product.batchNumber ? ` - Lote: ${product.batchNumber}` : ''}`,
              })
            }
          }
        } else {
          errors.push(`Producto "${product.name}": ${result.error}`)
        }
      } catch (error) {
        // Un fallo en un producto no aborta el resto.
        errors.push(`Producto "${product.name}": ${error.message}`)
      }
    }

    return { success: successCount, errors, categoriesCreated, brandsCreated, labsCreated }
  } catch (error) {
    console.error('Error en importación masiva de productos:', error)
    return {
      success: successCount,
      errors: [...errors, `Error general en la importación: ${error.message}`],
      categoriesCreated,
      brandsCreated,
      labsCreated,
    }
  }
}
