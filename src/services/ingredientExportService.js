import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/**
 * Guardar y compartir archivo Excel (iOS/Android) o descargar (web)
 */
const saveAndShareExcel = async (workbook, fileName) => {
  const isNativePlatform = Capacitor.isNativePlatform()

  if (isNativePlatform) {
    // En móvil: guardar y compartir
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' })

    const result = await Filesystem.writeFile({
      path: fileName,
      data: excelBuffer,
      directory: Directory.Documents,
      recursive: true
    })

    await Share.share({
      title: fileName,
      url: result.uri,
    })
  } else {
    // En web: descargar directamente
    XLSX.writeFile(workbook, fileName)
  }
}

/**
 * Generar reporte de ingredientes en Excel
 */
export const generateIngredientsExcel = async (ingredients, businessData) => {
  const workbook = XLSX.utils.book_new()

  // Preparar datos de los ingredientes
  const ingredientData = [
    ['LISTADO DE INGREDIENTES'],
    [''],
    ['Negocio:', businessData?.name || 'N/A'],
    ['RUC:', businessData?.ruc || 'N/A'],
    ['Fecha de Generación:', format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })],
    ['Total de Ingredientes:', ingredients.length],
    [''],
    ['INVENTARIO DE INGREDIENTES'],
    [''],
  ]

  // Encabezados de la tabla
  ingredientData.push([
    'Nombre',
    'Unidad de Compra',
    'Stock Actual',
    'Stock Mínimo',
    'Estado Stock',
    'Costo Promedio',
    'Último Precio de Compra',
    'Última Fecha de Compra',
    'Valor en Stock'
  ])

  // Agregar datos de cada ingrediente
  ingredients.forEach(ingredient => {
    // Determinar estado del stock
    let stockStatus = 'Normal'
    if (ingredient.currentStock === 0) {
      stockStatus = 'Sin stock'
    } else if (ingredient.minimumStock && ingredient.currentStock <= ingredient.minimumStock) {
      stockStatus = 'Stock bajo'
    }

    const lastPurchaseDate = ingredient.lastPurchaseDate
      ? (ingredient.lastPurchaseDate.toDate
          ? format(ingredient.lastPurchaseDate.toDate(), 'dd/MM/yyyy', { locale: es })
          : format(new Date(ingredient.lastPurchaseDate), 'dd/MM/yyyy', { locale: es }))
      : 'N/A'

    const stockValue = (ingredient.currentStock || 0) * (ingredient.averageCost || 0)

    ingredientData.push([
      ingredient.name || 'N/A',
      ingredient.purchaseUnit || 'N/A',
      ingredient.currentStock || 0,
      ingredient.minimumStock || 0,
      stockStatus,
      ingredient.averageCost || 0,
      ingredient.lastPurchasePrice || 0,
      lastPurchaseDate,
      stockValue
    ])
  })

  // Agregar estadísticas al final
  const totalStock = ingredients.reduce((sum, ing) => sum + (ing.currentStock || 0), 0)
  const totalValue = ingredients.reduce((sum, ing) => sum + ((ing.currentStock || 0) * (ing.averageCost || 0)), 0)
  const lowStockIngredients = ingredients.filter(i => i.minimumStock && i.currentStock <= i.minimumStock).length
  const outOfStockIngredients = ingredients.filter(i => i.currentStock === 0).length

  ingredientData.push([''])
  ingredientData.push(['ESTADÍSTICAS DE INVENTARIO'])
  ingredientData.push(['Total de Ingredientes:', ingredients.length])
  ingredientData.push(['Ingredientes sin Stock:', outOfStockIngredients])
  ingredientData.push(['Ingredientes con Stock Bajo:', lowStockIngredients])
  ingredientData.push(['Valor Total del Inventario:', totalValue.toFixed(2)])

  // Crear hoja de cálculo
  const worksheet = XLSX.utils.aoa_to_sheet(ingredientData)

  // Configurar anchos de columna
  worksheet['!cols'] = [
    { width: 30 },  // Nombre
    { width: 15 },  // Unidad de Compra
    { width: 12 },  // Stock Actual
    { width: 12 },  // Stock Mínimo
    { width: 15 },  // Estado Stock
    { width: 15 },  // Costo Promedio
    { width: 20 },  // Último Precio de Compra
    { width: 20 },  // Última Fecha de Compra
    { width: 15 },  // Valor en Stock
  ]

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Ingredientes')

  // Generar nombre de archivo
  const fileName = `Ingredientes_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`

  // Descargar/compartir archivo
  await saveAndShareExcel(workbook, fileName)
}

/**
 * Generar plantilla de ingredientes para importación
 */
export const generateIngredientsTemplate = async () => {
  const workbook = XLSX.utils.book_new()

  const templateData = [
    ['PLANTILLA DE INGREDIENTES'],
    [''],
    ['Instrucciones:'],
    ['1. Complete los datos en las columnas correspondientes'],
    ['2. No modifique los encabezados de las columnas'],
    ['3. Los campos marcados con (*) son obligatorios'],
    ['4. Las unidades permitidas son: kg, g, L, ml, unidades, cajas'],
    ['5. Use punto (.) para decimales en cantidades y precios'],
    [''],
    ['DATOS DE INGREDIENTES'],
    [''],
  ]

  // Encabezados
  templateData.push([
    'Nombre (*)',
    'Unidad de Compra (*)',
    'Stock Inicial',
    'Stock Mínimo',
    'Costo Inicial'
  ])

  // Ejemplos
  templateData.push([
    'Arroz',
    'kg',
    '25',
    '5',
    '4.50'
  ])
  templateData.push([
    'Aceite Vegetal',
    'L',
    '10',
    '2',
    '12.00'
  ])
  templateData.push([
    'Sal',
    'kg',
    '5',
    '1',
    '2.50'
  ])

  // Crear hoja
  const worksheet = XLSX.utils.aoa_to_sheet(templateData)

  // Configurar anchos de columna
  worksheet['!cols'] = [
    { width: 30 },  // Nombre
    { width: 20 },  // Unidad de Compra
    { width: 15 },  // Stock Inicial
    { width: 15 },  // Stock Mínimo
    { width: 15 },  // Costo Inicial
  ]

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla')

  // Generar nombre de archivo
  const fileName = `Plantilla_Ingredientes_${format(new Date(), 'yyyy-MM-dd')}.xlsx`

  // Descargar/compartir archivo
  await saveAndShareExcel(workbook, fileName)
}
