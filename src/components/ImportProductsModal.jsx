import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { Upload, Download, X, AlertCircle, CheckCircle, Loader2, Warehouse } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useAppContext } from '@/hooks/useAppContext'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { getWarehouses } from '@/services/warehouseService'

export default function ImportProductsModal({ isOpen, onClose, onImport }) {
  const { businessMode, getBusinessId } = useAppContext()
  const [file, setFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [previewData, setPreviewData] = useState([])
  const [errors, setErrors] = useState([])
  const [success, setSuccess] = useState(0)
  const [warehouses, setWarehouses] = useState([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')

  // Cargar almacenes al abrir el modal
  useEffect(() => {
    if (isOpen) {
      loadWarehouses()
    }
  }, [isOpen])

  const loadWarehouses = async () => {
    try {
      const businessId = getBusinessId()
      if (!businessId) return

      const result = await getWarehouses(businessId)
      if (result.success) {
        const activeWarehouses = (result.data || []).filter(w => w.isActive !== false)
        setWarehouses(activeWarehouses)
        // Seleccionar almacén por defecto automáticamente
        const defaultWarehouse = activeWarehouses.find(w => w.isDefault) || activeWarehouses[0]
        if (defaultWarehouse) {
          setSelectedWarehouseId(defaultWarehouse.id)
        }
      }
    } catch (error) {
      console.error('Error al cargar almacenes:', error)
    }
  }

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    if (!selectedFile) return

    // Validar tipo de archivo
    const validTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ]

    if (!validTypes.includes(selectedFile.type) &&
        !selectedFile.name.endsWith('.xlsx') &&
        !selectedFile.name.endsWith('.xls') &&
        !selectedFile.name.endsWith('.csv')) {
      setErrors(['El archivo debe ser Excel (.xlsx, .xls) o CSV (.csv)'])
      return
    }

    setFile(selectedFile)
    setErrors([])
    processFile(selectedFile)
  }

  const processFile = (file) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })

        // Leer la primera hoja
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]

        // Convertir a JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet)

        if (jsonData.length === 0) {
          setErrors(['El archivo está vacío'])
          setPreviewData([])
          return
        }

        // Validar y mapear datos
        const { validProducts, errors: validationErrors } = validateAndMapProducts(jsonData)

        setPreviewData(validProducts)
        setErrors(validationErrors)

      } catch (error) {
        console.error('Error al leer archivo:', error)
        setErrors(['Error al procesar el archivo. Verifica que sea un archivo Excel válido.'])
      }
    }

    reader.readAsArrayBuffer(file)
  }

  // Helpers para parseo
  const parseBool = (val, defaultVal = false) => {
    if (val === undefined || val === null || val === '') return defaultVal
    const s = String(val).toLowerCase().trim()
    if (['si', 'sí', 'yes', 'y', '1', 'true', 'verdadero'].includes(s)) return true
    if (['no', 'n', '0', 'false', 'falso'].includes(s)) return false
    return defaultVal
  }

  const parseExcelDate = (val) => {
    if (val === undefined || val === null || val === '') return null
    if (val instanceof Date) return val
    if (typeof val === 'number') {
      // Excel almacena fechas como número de días desde 1900-01-01.
      // 25569 = 1970-01-01. Conversión estándar XLSX.
      return new Date(Math.round((val - 25569) * 86400 * 1000))
    }
    const s = String(val).trim()
    // Acepta YYYY-MM-DD, DD/MM/YYYY, etc.
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
    if (isoMatch) return new Date(`${s}T00:00:00`)
    const dmyMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s)
    if (dmyMatch) {
      const [, d, m, y] = dmyMatch
      return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00`)
    }
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
  }

  const validateAndMapProducts = (data) => {
    const validProducts = []
    const errors = []

    data.forEach((row, index) => {
      const rowNum = index + 2 // +2 porque Excel empieza en 1 y tiene header

      // Validar campos requeridos (solo nombre es obligatorio).
      // El precio es obligatorio SOLO si la fila no tiene variantes (en filas de variantes
      // el precio va por variante: variante_precio / variante1_precio).
      if (!row.nombre && !row.Nombre && !row.NOMBRE && !row.name && !row.Name && !row.NAME) {
        errors.push(`Fila ${rowNum}: Falta el nombre del producto`)
        return
      }

      const hasRowPrice = !!(row.precio || row.Precio || row.PRECIO || row.price || row.Price || row.PRICE)
      // Detectar si la fila lleva alguna variante con precio válido
      let hasVariantPrice = false
      const unnumberedPrice = parseFloat(row.variante_precio || row.Variante_Precio || row.VARIANTE_PRECIO || 0)
      if (unnumberedPrice > 0) hasVariantPrice = true
      if (!hasVariantPrice) {
        for (let vi = 1; vi <= 50; vi++) {
          const vp = parseFloat(row[`variante${vi}_precio`] || row[`Variante${vi}_Precio`] || row[`VARIANTE${vi}_PRECIO`] || 0)
          if (vp > 0) { hasVariantPrice = true; break }
        }
      }

      if (!hasRowPrice && !hasVariantPrice) {
        errors.push(`Fila ${rowNum}: Falta el precio (a nivel de producto o de variante)`)
        return
      }

      // Determinar si debe controlar stock
      const trackStockValue = row.trackStock || row.controlarStock || row.ControlarStock || row.CONTROLAR_STOCK || row.track_stock || row.TRACK_STOCK
      let trackStock = true // Por defecto controla stock

      if (trackStockValue !== undefined && trackStockValue !== null && trackStockValue !== '') {
        const valueStr = String(trackStockValue).toLowerCase().trim()
        // Valores que indican NO controlar stock: no, false, 0, n
        if (valueStr === 'no' || valueStr === 'false' || valueStr === '0' || valueStr === 'n') {
          trackStock = false
        }
      }

      // Mapear campos (soportar diferentes nombres de columnas)
      // SKU / Código interno (nuevo campo)
      const sku = String(row.sku || row.SKU || row.Sku || row.codigo_interno || row.Codigo_Interno || row.CODIGO_INTERNO || row.codigoInterno || row.CodigoInterno || '').trim()

      // Código de barras (campo existente, ahora opcional)
      const code = String(row.codigo_barras || row.Codigo_Barras || row.CODIGO_BARRAS || row.codigoBarras || row.CodigoBarras || row.barcode || row.Barcode || row.BARCODE || row.codigo || row.Codigo || row.CODIGO || row.code || row.Code || row.CODE || '').trim()

      // Campos avanzados de inventario (parseados antes para poder usarlos en parsing de stock)
      const allowDecimalQuantity = parseBool(
        row.permitir_decimales || row.Permitir_Decimales || row.PERMITIR_DECIMALES ||
        row.permitirDecimales || row.allow_decimal || row.allowDecimal || row.allowDecimalQuantity,
        false
      )
      const trackExpiration = parseBool(
        row.control_vencimiento || row.Control_Vencimiento || row.CONTROL_VENCIMIENTO ||
        row.controlVencimiento || row.track_expiration || row.trackExpiration,
        false
      )
      const trackSerials = parseBool(
        row.control_series || row.Control_Series || row.CONTROL_SERIES ||
        row.controlSeries || row.track_serials || row.trackSerials,
        false
      )
      const expirationDate = trackExpiration ? parseExcelDate(
        row.fecha_vencimiento || row.Fecha_Vencimiento || row.FECHA_VENCIMIENTO ||
        row.fechaVencimiento || row.expiration_date || row.expirationDate
      ) : null
      const catalogVisible = parseBool(
        row.mostrar_en_catalogo || row.Mostrar_En_Catalogo || row.MOSTRAR_EN_CATALOGO ||
        row.mostrarEnCatalogo || row.catalogVisible || row.showInCatalog || row.show_in_catalog,
        true // Por defecto sí mostrar
      )
      const catalogComparePriceRaw = row.precio_comparacion || row.Precio_Comparacion || row.PRECIO_COMPARACION ||
        row.precioComparacion || row.compare_price || row.catalogComparePrice
      const catalogComparePrice = catalogComparePriceRaw !== undefined && catalogComparePriceRaw !== '' && catalogComparePriceRaw !== null
        ? parseFloat(catalogComparePriceRaw) || null
        : null
      const imageUrl = String(
        row.imagen_url || row.Imagen_Url || row.IMAGEN_URL || row.imagenUrl ||
        row.image_url || row.Image_Url || row.IMAGE_URL || row.imageUrl || ''
      ).trim() || null
      const weightRaw = row.peso || row.Peso || row.PESO || row.weight || row.Weight || row.WEIGHT
      const weight = weightRaw !== undefined && weightRaw !== '' && weightRaw !== null
        ? parseFloat(weightRaw) || null
        : null

      // Stock: si permite decimales, parseFloat; si no, parseInt
      const stockRaw = row.stock || row.Stock || row.STOCK || row.inventario || row.Inventario || row.INVENTARIO
      const stockValue = stockRaw !== undefined && stockRaw !== '' && stockRaw !== null
        ? (allowDecimalQuantity ? parseFloat(stockRaw) : parseInt(stockRaw))
        : null

      const product = {
        sku: sku,
        code: code,
        name: String(row.nombre || row.Nombre || row.NOMBRE || row.name || row.Name || row.NAME || '').trim(),
        description: String(row.descripcion || row.Descripcion || row.DESCRIPCION || row.description || row.Description || row.DESCRIPTION || '').trim(),
        cost: row.costo || row.Costo || row.COSTO || row.cost || row.Cost || row.COST || row.valor_unitario || row.valor_Unitario || row.VALOR_UNITARIO || row.precio_unitario || row.Precio_Unitario || row.PRECIO_UNITARIO || null,
        price: parseFloat(row.precio || row.Precio || row.PRECIO || row.price || row.Price || row.PRICE || row.precio_compra || row.Precio_Compra || row.PRECIO_COMPRA || 0),
        price2: row.precio2 || row.Precio2 || row.PRECIO2 || row.price2 || row.Price2 || row.PRICE2 || null,
        price3: row.precio3 || row.Precio3 || row.PRECIO3 || row.price3 || row.Price3 || row.PRICE3 || null,
        price4: row.precio4 || row.Precio4 || row.PRECIO4 || row.price4 || row.Price4 || row.PRICE4 || null,
        stock: stockValue,
        unit: String(row.unidad || row.Unidad || row.UNIDAD || row.unit || row.Unit || row.UNIT || 'UNIDAD').trim().toUpperCase(),
        category: String(row.categoria || row.Categoria || row.CATEGORIA || row.category || row.Category || row.CATEGORY || '').trim(),
        subcategory: String(row.subcategoria || row.Subcategoria || row.SUBCATEGORIA || row.subcategory || row.Subcategory || row.SUBCATEGORY || '').trim(),
        trackStock: trackStock,
        // Campos de inventario avanzado
        allowDecimalQuantity,
        trackExpiration,
        expirationDate,
        trackSerials,
        // Catálogo público
        catalogVisible,
        catalogComparePrice: catalogVisible ? catalogComparePrice : null,
        // Imagen y peso
        imageUrl,
        imageUrls: imageUrl ? [imageUrl] : [],
        weight,
        // Variantes (3 formatos soportados):
        //   A) variante1_atributo .. variante50_atributo  (multi en una fila, hasta 50)
        //   B) variante_atributo / variante_valor / variante_sku / variante_precio / variante_stock
        //      (UNA variante por fila — pensado para usar varias filas con mismo "nombre")
        //   C) En `atributo` y `valor` se aceptan listas separadas por coma para multi-atributo
        //      (ej. atributo="talla,color", valor="S,rojo" → variante con dos atributos)
        // SKU autogenerado si la celda viene vacía: BASE-VAL1-VAL2 slugificado.
        ...(() => {
          const variants = []
          const attributeNames = new Set()

          const slug = (s) => String(s || '')
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')

          const addVariant = (atributoRaw, valorRaw, skuRaw, precio, stockRaw) => {
            const atributo = String(atributoRaw || '').trim()
            const valor = String(valorRaw || '').trim()
            const sku = String(skuRaw || '').trim()
            if (!atributo || !valor || !(precio > 0)) return

            // Multi-atributo por coma
            const attrParts = atributo.split(/[,;|]/).map(s => s.trim().toLowerCase()).filter(Boolean)
            const valParts = valor.split(/[,;|]/).map(s => s.trim()).filter(Boolean)
            const attrs = {}
            const usedAttrs = []
            for (let k = 0; k < attrParts.length; k++) {
              const a = attrParts[k]
              const v = valParts[k] !== undefined ? valParts[k] : (valParts[0] || '')
              if (!a || !v) continue
              attrs[a] = v
              usedAttrs.push(a)
              attributeNames.add(a)
            }
            if (Object.keys(attrs).length === 0) return

            // SKU autogenerado si vacío
            const baseForSku = sku
              || slug(`${(row.sku || row.SKU || row.codigo_interno || row.codigo || row.code || row.nombre || 'PROD')}-${usedAttrs.map(a => attrs[a]).join('-')}`)

            variants.push({
              sku: baseForSku,
              attributes: attrs,
              price: precio,
              stock: stockRaw !== undefined && stockRaw !== '' && stockRaw !== null ? parseInt(stockRaw) : null,
            })
          }

          // A) Variantes numeradas variante1..variante50 en una sola fila
          for (let vi = 1; vi <= 50; vi++) {
            const atributo = row[`variante${vi}_atributo`] || row[`Variante${vi}_Atributo`] || row[`VARIANTE${vi}_ATRIBUTO`]
            const valor = row[`variante${vi}_valor`] || row[`Variante${vi}_Valor`] || row[`VARIANTE${vi}_VALOR`]
            const sku = row[`variante${vi}_sku`] || row[`Variante${vi}_Sku`] || row[`VARIANTE${vi}_SKU`]
            const precio = parseFloat(row[`variante${vi}_precio`] || row[`Variante${vi}_Precio`] || row[`VARIANTE${vi}_PRECIO`] || 0)
            const stock = row[`variante${vi}_stock`] || row[`Variante${vi}_Stock`] || row[`VARIANTE${vi}_STOCK`]
            if (atributo && valor && precio > 0) {
              addVariant(atributo, valor, sku, precio, stock)
            }
          }

          // B) Una variante por fila (sin número en las columnas)
          {
            const atributo = row.variante_atributo || row.Variante_Atributo || row.VARIANTE_ATRIBUTO
            const valor = row.variante_valor || row.Variante_Valor || row.VARIANTE_VALOR
            const sku = row.variante_sku || row.Variante_Sku || row.VARIANTE_SKU
            const precio = parseFloat(row.variante_precio || row.Variante_Precio || row.VARIANTE_PRECIO || 0)
            const stock = row.variante_stock || row.Variante_Stock || row.VARIANTE_STOCK
            if (atributo && valor && precio > 0) {
              addVariant(atributo, valor, sku, precio, stock)
            }
          }

          if (variants.length > 0) {
            // Cuando el producto tiene variantes NO usamos SKU/código padre:
            // cada variante tiene su propio SKU único. El SKU del padre solo se
            // usaba como base para el autogen (eso ya se aplicó arriba).
            return {
              hasVariants: true,
              variantAttributes: [...attributeNames],
              variants,
              sku: '',
              code: '',
            }
          }
          return { hasVariants: false, variantAttributes: [], variants: [] }
        })(),
        // Campos de farmacia
        genericName: String(row.nombre_generico || row.Nombre_Generico || row.NOMBRE_GENERICO || row.nombreGenerico || row.NombreGenerico || row.generic_name || '').trim() || null,
        concentration: String(row.concentracion || row.Concentracion || row.CONCENTRACION || row.concentration || '').trim() || null,
        presentation: String(row.presentacion || row.Presentacion || row.PRESENTACION || row.presentation || '').trim() || null,
        laboratoryName: String(row.laboratorio || row.Laboratorio || row.LABORATORIO || row.laboratory || '').trim() || null,
        marca: String(row.marca || row.Marca || row.MARCA || row.brand || '').trim() || null,
        activeIngredient: String(row.principio_activo || row.Principio_Activo || row.PRINCIPIO_ACTIVO || row.principioActivo || row.active_ingredient || '').trim() || null,
        therapeuticAction: String(row.accion_terapeutica || row.Accion_Terapeutica || row.ACCION_TERAPEUTICA || row.accionTerapeutica || row.therapeutic_action || '').trim() || null,
        saleCondition: String(row.condicion_venta || row.Condicion_Venta || row.CONDICION_VENTA || row.condicionVenta || row.sale_condition || '').trim().toLowerCase() || null,
        sanitaryRegistry: String(row.registro_sanitario || row.Registro_Sanitario || row.REGISTRO_SANITARIO || row.registroSanitario || row.sanitary_registry || '').trim() || null,
        location: String(row.ubicacion || row.Ubicacion || row.UBICACION || row.location || '').trim() || null,
        // Afectación IGV: GRAVADO (10), EXONERADO (20), INAFECTO (30)
        taxAffectation: (() => {
          const rawValue = String(row.afectacion_igv || row.Afectacion_Igv || row.AFECTACION_IGV || row.afectacionIgv || row.tax_affectation || row.taxAffectation || '').trim().toUpperCase()
          if (rawValue === 'EXONERADO' || rawValue === '20') return '20'
          if (rawValue === 'INAFECTO' || rawValue === '30') return '30'
          return '10' // Default: GRAVADO
        })(),
        igvRate: (() => {
          const rawValue = String(row.tasa_igv || row.Tasa_Igv || row.TASA_IGV || row.tasaIgv || row.igv_rate || row.Igv_Rate || row.IGV_RATE || row.igvRate || '').trim()
          if (!rawValue) return null // No set = hereda del negocio
          const parsed = parseFloat(rawValue)
          if (!isNaN(parsed) && (parsed === 18 || parsed === 10 || parsed === 10.5)) return parsed
          return null
        })(),
        // Presentaciones (hasta 3)
        presentations: (() => {
          const pres = []
          for (let pi = 1; pi <= 3; pi++) {
            const nombre = String(row[`presentacion${pi}_nombre`] || row[`Presentacion${pi}_Nombre`] || row[`PRESENTACION${pi}_NOMBRE`] || '').trim()
            const cantidad = parseFloat(row[`presentacion${pi}_cantidad`] || row[`Presentacion${pi}_Cantidad`] || row[`PRESENTACION${pi}_CANTIDAD`] || 0)
            const precio = parseFloat(row[`presentacion${pi}_precio`] || row[`Presentacion${pi}_Precio`] || row[`PRESENTACION${pi}_PRECIO`] || 0)
            if (nombre && cantidad > 0 && precio > 0) {
              pres.push({ name: nombre, factor: cantidad, price: precio })
            }
          }
          return pres.length > 0 ? pres : null
        })()
      }

      // Validar y convertir costo si existe
      if (product.cost !== null && product.cost !== '' && product.cost !== undefined) {
        const costNum = parseFloat(product.cost)
        if (isNaN(costNum) || costNum < 0) {
          errors.push(`Fila ${rowNum}: Costo inválido (${product.cost})`)
          return
        }
        product.cost = costNum
      } else {
        product.cost = null
      }

      // Validar precio
      if (isNaN(product.price) || product.price < 0) {
        errors.push(`Fila ${rowNum}: Precio inválido (${row.precio || row.price})`)
        return
      }

      // Parsear precio2, precio3 y precio4 (opcionales)
      if (product.price2 !== null && product.price2 !== '' && product.price2 !== undefined) {
        const price2Num = parseFloat(product.price2)
        product.price2 = isNaN(price2Num) || price2Num <= 0 ? null : price2Num
      } else {
        product.price2 = null
      }

      if (product.price3 !== null && product.price3 !== '' && product.price3 !== undefined) {
        const price3Num = parseFloat(product.price3)
        product.price3 = isNaN(price3Num) || price3Num <= 0 ? null : price3Num
      } else {
        product.price3 = null
      }

      if (product.price4 !== null && product.price4 !== '' && product.price4 !== undefined) {
        const price4Num = parseFloat(product.price4)
        product.price4 = isNaN(price4Num) || price4Num <= 0 ? null : price4Num
      } else {
        product.price4 = null
      }

      // Validar stock si existe
      if (product.stock !== null && product.stock !== '' && product.stock !== undefined) {
        const stockNum = parseInt(product.stock)
        if (isNaN(stockNum) || stockNum < 0) {
          errors.push(`Fila ${rowNum}: Stock inválido (${product.stock})`)
          return
        }
        product.stock = stockNum
      } else {
        product.stock = null
      }

      validProducts.push(product)
    })

    return { validProducts, errors }
  }

  const handleImport = async () => {
    if (previewData.length === 0) {
      setErrors(['No hay productos válidos para importar'])
      return
    }

    setImporting(true)
    setSuccess(0)

    try {
      // Pasar warehouseId seleccionado
      const warehouseId = selectedWarehouseId || null
      const result = await onImport(previewData, warehouseId)
      setSuccess(result.success || previewData.length)

      if (result.errors && result.errors.length > 0) {
        setErrors(result.errors)
      }

      // Cerrar modal después de 2 segundos si todo salió bien
      if (!result.errors || result.errors.length === 0) {
        setTimeout(() => {
          onClose()
          resetState()
        }, 2000)
      }
    } catch (error) {
      console.error('Error al importar:', error)
      setErrors(['Error al importar productos. Inténtalo nuevamente.'])
    } finally {
      setImporting(false)
    }
  }

  const resetState = () => {
    setFile(null)
    setPreviewData([])
    setErrors([])
    setSuccess(0)
    setSelectedWarehouseId('')
  }

  const handleClose = () => {
    resetState()
    onClose()
  }

  const downloadTemplate = async () => {
    // Crear plantilla de ejemplo según el modo de negocio
    let template = []

    if (businessMode === 'pharmacy') {
      // Plantilla para farmacias con campos específicos
      template = [
        {
          sku: 'MED-001',
          codigo_barras: '7501234567890',
          nombre: 'Panadol 500mg Tableta',
          descripcion: 'Analgésico y antipirético',
          nombre_generico: 'Paracetamol',
          concentracion: '500mg',
          presentacion: 'Tableta',
          laboratorio: 'GSK',
          marca: 'Panadol',
          principio_activo: 'Paracetamol',
          accion_terapeutica: 'Analgésico',
          condicion_venta: 'otc',
          registro_sanitario: 'RS-12345',
          ubicacion: 'Estante A-1',
          costo: 0.80,
          precio: 1.50,
          precio2: 1.30,
          precio3: 1.10,
          precio4: 0.95,
          stock: 500,
          trackStock: 'SI',
          mostrar_en_catalogo: 'SI',
          unidad: 'UNIDAD',
          categoria: 'Analgésicos',
          subcategoria: 'Tabletas',
          afectacion_igv: 'GRAVADO',
          presentacion1_nombre: 'Caja x30',
          presentacion1_cantidad: 30,
          presentacion1_precio: 40.00,
          presentacion2_nombre: '',
          presentacion2_cantidad: '',
          presentacion2_precio: '',
          presentacion3_nombre: '',
          presentacion3_cantidad: '',
          presentacion3_precio: '',
        },
        {
          sku: 'MED-002',
          codigo_barras: '7509876543210',
          nombre: 'Amoxicilina 500mg Cápsula',
          descripcion: 'Antibiótico de amplio espectro',
          nombre_generico: 'Amoxicilina',
          concentracion: '500mg',
          presentacion: 'Cápsula',
          laboratorio: 'Medifarma',
          marca: 'Amoxicilina Medifarma',
          principio_activo: 'Amoxicilina trihidrato',
          accion_terapeutica: 'Antibiótico',
          condicion_venta: 'prescription',
          registro_sanitario: 'RS-67890',
          ubicacion: 'Estante B-2',
          costo: 0.50,
          precio: 1.20,
          precio2: 1.00,
          precio3: 0.85,
          precio4: 0.70,
          stock: 200,
          trackStock: 'SI',
          mostrar_en_catalogo: 'SI',
          unidad: 'UNIDAD',
          categoria: 'Antibióticos',
          subcategoria: 'Cápsulas',
          afectacion_igv: 'GRAVADO',
          presentacion1_nombre: 'Caja x100',
          presentacion1_cantidad: 100,
          presentacion1_precio: 100.00,
          presentacion2_nombre: '',
          presentacion2_cantidad: '',
          presentacion2_precio: '',
          presentacion3_nombre: '',
          presentacion3_cantidad: '',
          presentacion3_precio: '',
        },
        {
          sku: 'MED-003',
          codigo_barras: '',
          nombre: 'Clonazepam 2mg Tableta',
          descripcion: 'Ansiolítico',
          nombre_generico: 'Clonazepam',
          concentracion: '2mg',
          presentacion: 'Tableta',
          laboratorio: 'AC Farma',
          marca: 'Rivotril',
          principio_activo: 'Clonazepam',
          accion_terapeutica: 'Ansiolítico',
          condicion_venta: 'retained',
          registro_sanitario: 'RS-11111',
          ubicacion: 'Estante C-1',
          costo: 0.30,
          precio: 0.80,
          precio2: '',
          precio3: '',
          precio4: '',
          stock: 100,
          trackStock: 'SI',
          mostrar_en_catalogo: 'NO',
          unidad: 'UNIDAD',
          categoria: 'Psicotrópicos',
          subcategoria: '',
          afectacion_igv: 'EXONERADO',
          presentacion1_nombre: '',
          presentacion1_cantidad: '',
          presentacion1_precio: '',
          presentacion2_nombre: '',
          presentacion2_cantidad: '',
          presentacion2_precio: '',
          presentacion3_nombre: '',
          presentacion3_cantidad: '',
          presentacion3_precio: '',
        }
      ]
    } else {
      // Plantilla estándar para retail
      template = [
        // ===================================================================
        // PLANTILLA RETAIL: cada ejemplo demuestra un caso de uso REAL.
        // El orden de columnas viene dado por las claves del primer objeto.
        // Las columnas vacías en filas posteriores muestran qué se omite.
        // ===================================================================

        // 1. PRODUCTO RETAIL CLÁSICO — barcode, costo/precio, multi-tier
        //    de precio (mayorista/distribuidor), stock, categoría.
        {
          sku: 'POLERON-CLASSIC',
          codigo_barras: '7501234567001',
          nombre: 'Polerón Classic con Capucha',
          descripcion: 'Polerón unisex de algodón felpado, talla única',
          marca: 'StreetWear',
          categoria: 'Ropa',
          subcategoria: 'Poleras',
          unidad: 'UNIDAD',
          costo: 35.00,
          precio: 65.00,
          precio2: 60.00,           // precio mayorista
          precio3: 55.00,           // precio distribuidor
          precio4: '',
          stock: 25,
          trackStock: 'SI',
          permitir_decimales: 'NO',
          control_vencimiento: 'NO',
          fecha_vencimiento: '',
          control_series: 'NO',
          mostrar_en_catalogo: 'SI',
          precio_comparacion: '',
          imagen_url: '',
          peso: 0.45,
          ubicacion: 'A-2-3',
          afectacion_igv: 'GRAVADO',
          tasa_igv: 18,
          presentacion1_nombre: '',
          presentacion1_cantidad: '',
          presentacion1_precio: '',
          presentacion2_nombre: '',
          presentacion2_cantidad: '',
          presentacion2_precio: '',
          presentacion3_nombre: '',
          presentacion3_cantidad: '',
          presentacion3_precio: '',
          variante1_atributo: '',
          variante1_valor: '',
          variante1_sku: '',
          variante1_precio: '',
          variante1_stock: '',
          variante_atributo: '',
          variante_valor: '',
          variante_sku: '',
          variante_precio: '',
          variante_stock: '',
        },

        // 2. SERVICIO SIN STOCK — trackStock=NO, no aparece en inventario.
        //    Útil para "Consultoría", "Instalación", "Asesoría legal", etc.
        {
          sku: 'SERV-CONSULTORIA-1H',
          codigo_barras: '',
          nombre: 'Consultoría 1 hora',
          descripcion: 'Sesión de asesoría individual (no requiere inventario)',
          marca: '',
          categoria: 'Servicios',
          subcategoria: '',
          unidad: 'HORA',
          costo: '',
          precio: 150.00,
          precio2: '',
          precio3: '',
          precio4: '',
          stock: '',
          trackStock: 'NO',          // NO controla inventario
          permitir_decimales: 'NO',
          control_vencimiento: 'NO',
          fecha_vencimiento: '',
          control_series: 'NO',
          mostrar_en_catalogo: 'NO',  // servicio interno, no en catálogo
          precio_comparacion: '',
          imagen_url: '',
          peso: '',
          ubicacion: '',
          afectacion_igv: 'GRAVADO',
          tasa_igv: '',
          presentacion1_nombre: '', presentacion1_cantidad: '', presentacion1_precio: '',
          presentacion2_nombre: '', presentacion2_cantidad: '', presentacion2_precio: '',
          presentacion3_nombre: '', presentacion3_cantidad: '', presentacion3_precio: '',
          variante1_atributo: '', variante1_valor: '', variante1_sku: '', variante1_precio: '', variante1_stock: '',
          variante_atributo: '', variante_valor: '', variante_sku: '', variante_precio: '', variante_stock: '',
        },

        // 3. VENTA POR PESO/VOLUMEN — permitir_decimales=SI permite vender 2.5 litros, 0.75 kg.
        //    Stock puede ir con decimales. Unidad típica: LITRO, KG, METRO.
        {
          sku: 'ACEITE-OLIVA-1L',
          codigo_barras: '7501234567003',
          nombre: 'Aceite de Oliva Extra Virgen (a granel)',
          descripcion: 'Venta por litros desde bidón industrial',
          marca: 'Italia',
          categoria: 'Comestibles',
          subcategoria: 'Aceites',
          unidad: 'LITRO',
          costo: 28.00,
          precio: 45.00,
          precio2: '',
          precio3: '',
          precio4: '',
          stock: 50.5,                // 50 litros y medio
          trackStock: 'SI',
          permitir_decimales: 'SI',   // CLAVE: permite cantidades fraccionarias
          control_vencimiento: 'NO',
          fecha_vencimiento: '',
          control_series: 'NO',
          mostrar_en_catalogo: 'SI',
          precio_comparacion: '',
          imagen_url: '',
          peso: '',
          ubicacion: 'B-1-2',
          afectacion_igv: 'GRAVADO',
          tasa_igv: '',
          presentacion1_nombre: '', presentacion1_cantidad: '', presentacion1_precio: '',
          presentacion2_nombre: '', presentacion2_cantidad: '', presentacion2_precio: '',
          presentacion3_nombre: '', presentacion3_cantidad: '', presentacion3_precio: '',
          variante1_atributo: '', variante1_valor: '', variante1_sku: '', variante1_precio: '', variante1_stock: '',
          variante_atributo: '', variante_valor: '', variante_sku: '', variante_precio: '', variante_stock: '',
        },

        // 4. PERECEDERO CON FECHA DE VENCIMIENTO — control_vencimiento=SI obliga a registrar fecha.
        //    Útil para alimentos, cosméticos, medicamentos. La fecha va en formato YYYY-MM-DD.
        {
          sku: 'YOGURT-NAT-1L',
          codigo_barras: '7501234567004',
          nombre: 'Yogurt Natural Bidón 1L',
          descripcion: 'Yogurt griego sin azúcar, conservar refrigerado',
          marca: 'Lácteos del Valle',
          categoria: 'Lácteos',
          subcategoria: '',
          unidad: 'UNIDAD',
          costo: 8.00,
          precio: 14.00,
          precio2: '',
          precio3: '',
          precio4: '',
          stock: 30,
          trackStock: 'SI',
          permitir_decimales: 'NO',
          control_vencimiento: 'SI',          // CLAVE: activa control de vencimiento
          fecha_vencimiento: '2026-08-30',    // formato YYYY-MM-DD
          control_series: 'NO',
          mostrar_en_catalogo: 'SI',
          precio_comparacion: '',
          imagen_url: '',
          peso: 1.05,
          ubicacion: 'Refri-1',
          afectacion_igv: 'GRAVADO',
          tasa_igv: '',
          presentacion1_nombre: '', presentacion1_cantidad: '', presentacion1_precio: '',
          presentacion2_nombre: '', presentacion2_cantidad: '', presentacion2_precio: '',
          presentacion3_nombre: '', presentacion3_cantidad: '', presentacion3_precio: '',
          variante1_atributo: '', variante1_valor: '', variante1_sku: '', variante1_precio: '', variante1_stock: '',
          variante_atributo: '', variante_valor: '', variante_sku: '', variante_precio: '', variante_stock: '',
        },

        // 5. PRODUCTO CON CONTROL DE SERIE — control_series=SI te permitirá
        //    registrar números de serie individuales al ingresar/vender (electrónica, equipos).
        {
          sku: 'LAPTOP-PRO-15',
          codigo_barras: '7501234567005',
          nombre: 'Laptop Pro 15"',
          descripcion: 'Laptop profesional, 16GB RAM, SSD 512GB',
          marca: 'TechBrand',
          categoria: 'Electrónica',
          subcategoria: 'Laptops',
          unidad: 'UNIDAD',
          costo: 2400.00,
          precio: 3200.00,
          precio2: 3000.00,
          precio3: '',
          precio4: '',
          stock: 5,
          trackStock: 'SI',
          permitir_decimales: 'NO',
          control_vencimiento: 'NO',
          fecha_vencimiento: '',
          control_series: 'SI',         // CLAVE: pedirá serial al ingresar/vender
          mostrar_en_catalogo: 'SI',
          precio_comparacion: 3500.00,  // se ve "antes 3500" tachado en catálogo
          imagen_url: '',
          peso: 1.85,
          ubicacion: 'Vitrina-1',
          afectacion_igv: 'GRAVADO',
          tasa_igv: '',
          presentacion1_nombre: '', presentacion1_cantidad: '', presentacion1_precio: '',
          presentacion2_nombre: '', presentacion2_cantidad: '', presentacion2_precio: '',
          presentacion3_nombre: '', presentacion3_cantidad: '', presentacion3_precio: '',
          variante1_atributo: '', variante1_valor: '', variante1_sku: '', variante1_precio: '', variante1_stock: '',
          variante_atributo: '', variante_valor: '', variante_sku: '', variante_precio: '', variante_stock: '',
        },

        // 6. PRODUCTO CON IMAGEN Y PRESENTACIONES (caja, six-pack, individual).
        //    presentacionX_* permite vender el mismo producto en múltiples formatos
        //    a precios distintos (cada presentación descuenta su factor del stock).
        {
          sku: 'GASEOSA-COLA-500',
          codigo_barras: '7501234567006',
          nombre: 'Gaseosa Cola 500ml',
          descripcion: 'Botella plástica, sabor cola',
          marca: 'RefrescoSA',
          categoria: 'Bebidas',
          subcategoria: 'Gaseosas',
          unidad: 'UNIDAD',
          costo: 1.50,
          precio: 3.00,                       // precio por unidad
          precio2: '',
          precio3: '',
          precio4: '',
          stock: 240,                          // 240 botellas individuales
          trackStock: 'SI',
          permitir_decimales: 'NO',
          control_vencimiento: 'NO',
          fecha_vencimiento: '',
          control_series: 'NO',
          mostrar_en_catalogo: 'SI',
          precio_comparacion: '',
          imagen_url: 'https://ejemplo.com/imagenes/gaseosa-cola-500.jpg',  // opcional
          peso: 0.55,
          ubicacion: 'B-3-1',
          afectacion_igv: 'GRAVADO',
          tasa_igv: '',
          // 3 presentaciones: unitaria (precio principal), six-pack y caja
          presentacion1_nombre: 'Six Pack',
          presentacion1_cantidad: 6,
          presentacion1_precio: 16.00,
          presentacion2_nombre: 'Caja x24',
          presentacion2_cantidad: 24,
          presentacion2_precio: 60.00,
          presentacion3_nombre: '',
          presentacion3_cantidad: '',
          presentacion3_precio: '',
          variante1_atributo: '', variante1_valor: '', variante1_sku: '', variante1_precio: '', variante1_stock: '',
          variante_atributo: '', variante_valor: '', variante_sku: '', variante_precio: '', variante_stock: '',
        },

        // 7. PRODUCTO CON UN SOLO EJE DE VARIANTES (sólo tallas) — formato compacto:
        //    todas las variantes en UNA sola fila usando variante1_*, variante2_*, etc.
        //    NO se llena sku/codigo_barras/precio del padre (cada variante tiene su SKU).
        {
          sku: '',
          codigo_barras: '',
          nombre: 'Polo Básico Algodón',
          descripcion: 'Polo unisex de algodón pima — 3 tallas',
          marca: 'Local',
          categoria: 'Ropa',
          subcategoria: 'Polos',
          unidad: 'UNIDAD',
          costo: 18.00,
          precio: '',                  // sin precio padre — el precio va por variante
          precio2: '',
          precio3: '',
          precio4: '',
          stock: '',                   // sin stock padre — va por variante
          trackStock: 'SI',
          permitir_decimales: 'NO',
          control_vencimiento: 'NO',
          fecha_vencimiento: '',
          control_series: 'NO',
          mostrar_en_catalogo: 'SI',
          precio_comparacion: '',
          imagen_url: '',
          peso: '',
          ubicacion: '',
          afectacion_igv: 'GRAVADO',
          tasa_igv: '',
          presentacion1_nombre: '', presentacion1_cantidad: '', presentacion1_precio: '',
          presentacion2_nombre: '', presentacion2_cantidad: '', presentacion2_precio: '',
          presentacion3_nombre: '', presentacion3_cantidad: '', presentacion3_precio: '',
          // 3 variantes en columnas numeradas
          variante1_atributo: 'talla',
          variante1_valor: 'S',
          variante1_sku: 'POLO-BAS-S',
          variante1_precio: 32.00,
          variante1_stock: 12,
          variante_atributo: '', variante_valor: '', variante_sku: '', variante_precio: '', variante_stock: '',
        },
        // (continúan las otras tallas del Polo Básico, en columnas variante2 y variante3
        // — se podría haber puesto todo en la fila anterior pero las muestro abajo en el
        // formato multi-fila para enseñar AMBAS opciones)

        // 8-13. PRODUCTO CON DOS EJES DE VARIANTES (talla × color) — formato MULTI-FILA:
        //       Una fila por cada combinación de variantes, todas con el MISMO nombre.
        //       En cada fila, variante_atributo y variante_valor llevan los dos atributos
        //       separados por coma. SKU se autogenera si lo dejas vacío.
        ...['S,negro', 'M,negro', 'L,negro', 'S,blanco', 'M,blanco', 'L,blanco'].map((combo, idx) => ({
          sku: '',                    // sin SKU padre cuando hay variantes
          codigo_barras: '',
          nombre: 'Polo Deportivo Dry-Fit',
          descripcion: idx === 0 ? 'Polo deportivo dry-fit, S a L en negro o blanco' : '',
          marca: idx === 0 ? 'SportPro' : '',
          categoria: idx === 0 ? 'Ropa' : '',
          subcategoria: idx === 0 ? 'Polos Deportivos' : '',
          unidad: 'UNIDAD',
          costo: idx === 0 ? 22.00 : '',
          precio: '',                  // precio va por variante
          precio2: '', precio3: '', precio4: '',
          stock: '',
          trackStock: 'SI',
          permitir_decimales: 'NO',
          control_vencimiento: 'NO',
          fecha_vencimiento: '',
          control_series: 'NO',
          mostrar_en_catalogo: idx === 0 ? 'SI' : '',
          precio_comparacion: '',
          imagen_url: '',
          peso: '',
          ubicacion: '',
          afectacion_igv: idx === 0 ? 'GRAVADO' : '',
          tasa_igv: '',
          presentacion1_nombre: '', presentacion1_cantidad: '', presentacion1_precio: '',
          presentacion2_nombre: '', presentacion2_cantidad: '', presentacion2_precio: '',
          presentacion3_nombre: '', presentacion3_cantidad: '', presentacion3_precio: '',
          variante1_atributo: '', variante1_valor: '', variante1_sku: '', variante1_precio: '', variante1_stock: '',
          // Variante por fila, multi-atributo separado por coma:
          variante_atributo: 'talla,color',
          variante_valor: combo,                 // ej: "S,negro"
          variante_sku: '',                      // se autogenera (POLO-DEPORTIVO-DRY-FIT-S-NEGRO, etc.)
          variante_precio: 45.00,
          variante_stock: 8,
        })),
      ]
    }

    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, businessMode === 'pharmacy' ? 'Medicamentos' : 'Productos')

    // Ajustar anchos de columna según modo
    if (businessMode === 'pharmacy') {
      ws['!cols'] = [
        { wch: 12 }, // sku
        { wch: 16 }, // codigo_barras
        { wch: 30 }, // nombre
        { wch: 30 }, // descripcion
        { wch: 18 }, // nombre_generico
        { wch: 12 }, // concentracion
        { wch: 12 }, // presentacion
        { wch: 15 }, // laboratorio
        { wch: 20 }, // principio_activo
        { wch: 15 }, // accion_terapeutica
        { wch: 15 }, // condicion_venta
        { wch: 15 }, // registro_sanitario
        { wch: 12 }, // ubicacion
        { wch: 8 },  // costo
        { wch: 8 },  // precio
        { wch: 8 },  // precio2
        { wch: 8 },  // precio3
        { wch: 8 },  // precio4
        { wch: 8 },  // stock
        { wch: 10 }, // trackStock
        { wch: 10 }, // unidad
        { wch: 15 }, // categoria
        { wch: 15 }, // subcategoria
        { wch: 20 }, // almacen
        { wch: 15 }  // afectacion_igv
      ]
    } else {
      ws['!cols'] = [
        { wch: 15 }, // sku
        { wch: 18 }, // codigo_barras
        { wch: 30 }, // nombre
        { wch: 40 }, // descripcion
        { wch: 15 }, // ubicacion
        { wch: 10 }, // costo
        { wch: 10 }, // precio
        { wch: 10 }, // precio2
        { wch: 10 }, // precio3
        { wch: 10 }, // precio4
        { wch: 10 }, // stock
        { wch: 12 }, // trackStock
        { wch: 12 }, // unidad
        { wch: 20 }, // categoria
        { wch: 20 }, // subcategoria
        { wch: 15 }, // afectacion_igv
        { wch: 18 }, // presentacion1_nombre
        { wch: 18 }, // presentacion1_cantidad
        { wch: 18 }, // presentacion1_precio
        { wch: 18 }, // presentacion2_nombre
        { wch: 18 }, // presentacion2_cantidad
        { wch: 18 }, // presentacion2_precio
        { wch: 18 }, // presentacion3_nombre
        { wch: 18 }, // presentacion3_cantidad
        { wch: 18 }, // presentacion3_precio
      ]
    }

    const fileName = businessMode === 'pharmacy' ? 'plantilla_medicamentos.xlsx' : 'plantilla_productos.xlsx'

    // Verificar si estamos en plataforma nativa (iOS/Android)
    if (Capacitor.isNativePlatform()) {
      try {
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' })

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
      } catch (error) {
        console.error('Error al descargar plantilla:', error)
      }
    } else {
      // En web: descargar directamente
      XLSX.writeFile(wb, fileName)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="2xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Importar Productos</h2>
            <p className="text-sm text-gray-600 mt-1">
              Sube un archivo Excel o CSV con tus productos
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Selector de Almacén o mensaje informativo */}
        {warehouses.length > 1 ? (
          <div className="mb-6 p-4 bg-cyan-50 border border-cyan-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Warehouse className="w-5 h-5 text-cyan-600" />
              <label className="text-sm font-medium text-gray-900">
                Almacén destino para los productos
              </label>
            </div>
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-sm"
            >
              {warehouses.map(warehouse => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-2">
              El stock de los productos importados se asignará a este almacén.
            </p>
          </div>
        ) : warehouses.length === 1 ? (
          <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-2">
              <Warehouse className="w-5 h-5 text-gray-500" />
              <p className="text-sm text-gray-600">
                El stock se asignará a: <span className="font-medium">{warehouses[0]?.name}</span>
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2">
              <Warehouse className="w-5 h-5 text-blue-500" />
              <p className="text-sm text-blue-700">
                Se creará automáticamente un <span className="font-medium">Almacén Principal</span> para tus productos.
              </p>
            </div>
          </div>
        )}

        {/* Descargar plantilla */}
        <div className="mb-6">
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 text-primary-600 hover:text-primary-700 text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Descargar plantilla de ejemplo
          </button>
          <p className="text-xs text-gray-500 mt-1">
            Columnas básicas: sku, codigo_barras, nombre, descripcion, costo, precio, precio2-4, stock, trackStock (SI/NO), mostrar_en_catalogo (SI/NO), unidad, categoria, afectacion_igv
          </p>
          <details className="mt-2 text-xs text-gray-600">
            <summary className="cursor-pointer text-primary-600 hover:text-primary-700 select-none">
              ¿Cómo importar productos con variantes (talla, color, etc.)?
            </summary>
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded space-y-2 text-blue-900">
              <p><strong>Opción 1 — Un solo eje (ej. solo tallas):</strong></p>
              <p>Usa una fila con las columnas <code>variante1_atributo</code>, <code>variante1_valor</code>, <code>variante1_sku</code>, <code>variante1_precio</code>, <code>variante1_stock</code>, repetidas para variante2, variante3... hasta 50.</p>
              <p><strong>Opción 2 — Varios ejes (ej. talla × color):</strong></p>
              <p>Usa varias filas con el <strong>mismo nombre de producto</strong>, una por cada combinación. En cada fila usa las columnas <code>variante_atributo</code>, <code>variante_valor</code>, <code>variante_sku</code>, <code>variante_precio</code>, <code>variante_stock</code>.</p>
              <p>Para múltiples atributos en la misma variante separa con coma: <code>variante_atributo: "talla,color"</code> y <code>variante_valor: "S,rojo"</code>.</p>
              <p>El <strong>SKU se autogenera</strong> si lo dejas en blanco (ej. <code>POLO-S-ROJO</code>).</p>
              <p className="italic">Mira la plantilla descargada — incluye un ejemplo de polo con 6 variantes (talla S/M/L × color rojo/azul).</p>
            </div>
          </details>
        </div>

        {/* Upload area */}
        <div className="mb-6">
          <label className="block">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-400 transition-colors cursor-pointer">
              <Upload className="w-12 h-12 mx-auto text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-700 mb-1">
                {file ? file.name : 'Haz clic para seleccionar un archivo'}
              </p>
              <p className="text-xs text-gray-500">
                Excel (.xlsx, .xls) o CSV (.csv)
              </p>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </label>
        </div>

        {/* Errores */}
        {errors.length > 0 && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-red-900 mb-2">
                  Se encontraron {errors.length} error(es):
                </h4>
                <ul className="text-sm text-red-700 space-y-1 max-h-40 overflow-y-auto">
                  {errors.slice(0, 10).map((error, index) => (
                    <li key={index}>• {error}</li>
                  ))}
                  {errors.length > 10 && (
                    <li className="font-medium">... y {errors.length - 10} errores más</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Success message */}
        {success > 0 && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <p className="text-sm font-medium text-green-900">
                {success} producto(s) importado(s) exitosamente
              </p>
            </div>
          </div>
        )}

        {/* Preview */}
        {previewData.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Vista previa ({previewData.length} productos)
            </h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">SKU</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Cód. Barras</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Nombre</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Precio</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Stock</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Control</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">IGV</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {previewData.slice(0, 50).map((product, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm text-gray-900">{product.sku || '-'}</td>
                      <td className="px-3 py-2 text-sm text-gray-600">{product.code || '-'}</td>
                      <td className="px-3 py-2 text-sm text-gray-900">{product.name}</td>
                      <td className="px-3 py-2 text-sm text-gray-900">S/ {product.price.toFixed(2)}</td>
                      <td className="px-3 py-2 text-sm text-gray-600">{product.stock ?? 'N/A'}</td>
                      <td className="px-3 py-2 text-sm">
                        {product.trackStock ? (
                          <span className="text-green-600 font-medium">SÍ</span>
                        ) : (
                          <span className="text-gray-400">NO</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm">
                        {product.taxAffectation === '20' ? (
                          <span className="text-blue-600 font-medium">EXO</span>
                        ) : product.taxAffectation === '30' ? (
                          <span className="text-orange-600 font-medium">INA</span>
                        ) : (
                          <span className="text-green-600 font-medium">GRA</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewData.length > 50 && (
                <div className="bg-gray-50 px-3 py-2 text-xs text-gray-500 text-center">
                  Mostrando 50 de {previewData.length} productos
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={importing}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={previewData.length === 0 || importing || errors.length > 0}
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Importar {previewData.length} producto(s)
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
