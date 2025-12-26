import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { Upload, Download, X, AlertCircle, CheckCircle, Loader2, Store } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useAppContext } from '@/hooks/useAppContext'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { getActiveBranches } from '@/services/branchService'

export default function ImportProductsModal({ isOpen, onClose, onImport }) {
  const { businessMode, getBusinessId } = useAppContext()
  const [file, setFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [previewData, setPreviewData] = useState([])
  const [errors, setErrors] = useState([])
  const [success, setSuccess] = useState(0)
  const [branches, setBranches] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('') // '' = Sucursal Principal

  // Cargar sucursales al abrir el modal
  useEffect(() => {
    if (isOpen) {
      loadBranches()
    }
  }, [isOpen])

  const loadBranches = async () => {
    try {
      const businessId = getBusinessId()
      if (!businessId) return

      const result = await getActiveBranches(businessId)
      if (result.success) {
        setBranches(result.data || [])
      }
    } catch (error) {
      console.error('Error al cargar sucursales:', error)
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

  const validateAndMapProducts = (data) => {
    const validProducts = []
    const errors = []

    data.forEach((row, index) => {
      const rowNum = index + 2 // +2 porque Excel empieza en 1 y tiene header

      // Validar campos requeridos (solo nombre y precio son obligatorios)
      if (!row.nombre && !row.Nombre && !row.NOMBRE && !row.name && !row.Name && !row.NAME) {
        errors.push(`Fila ${rowNum}: Falta el nombre del producto`)
        return
      }

      if (!row.precio && !row.Precio && !row.PRECIO && !row.price && !row.Price && !row.PRICE) {
        errors.push(`Fila ${rowNum}: Falta el precio del producto`)
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
        stock: row.stock || row.Stock || row.STOCK || row.inventario || row.Inventario || row.INVENTARIO || null,
        unit: String(row.unidad || row.Unidad || row.UNIDAD || row.unit || row.Unit || row.UNIT || 'UNIDAD').trim().toUpperCase(),
        category: String(row.categoria || row.Categoria || row.CATEGORIA || row.category || row.Category || row.CATEGORY || '').trim(),
        warehouse: String(row.almacen || row.Almacen || row.ALMACEN || row.warehouse || row.Warehouse || row.WAREHOUSE || row.bodega || row.Bodega || row.BODEGA || '').trim(),
        trackStock: trackStock,
        hasVariants: false,
        variantAttributes: [],
        variants: [],
        // Campos de farmacia
        genericName: String(row.nombre_generico || row.Nombre_Generico || row.NOMBRE_GENERICO || row.nombreGenerico || row.NombreGenerico || row.generic_name || '').trim() || null,
        concentration: String(row.concentracion || row.Concentracion || row.CONCENTRACION || row.concentration || '').trim() || null,
        presentation: String(row.presentacion || row.Presentacion || row.PRESENTACION || row.presentation || '').trim() || null,
        laboratoryName: String(row.laboratorio || row.Laboratorio || row.LABORATORIO || row.laboratory || '').trim() || null,
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
      // Pasar branchId seleccionado (null para Sucursal Principal)
      const branchId = selectedBranchId || null
      const result = await onImport(previewData, branchId)
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
    setSelectedBranchId('')
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
          principio_activo: 'Paracetamol',
          accion_terapeutica: 'Analgésico',
          condicion_venta: 'otc',
          registro_sanitario: 'RS-12345',
          ubicacion: 'Estante A-1',
          costo: 0.80,
          precio: 1.50,
          precio2: 1.30,
          precio3: 1.10,
          stock: 500,
          trackStock: 'SI',
          unidad: 'UNIDAD',
          categoria: 'Analgésicos',
          almacen: 'Almacén Principal',
          afectacion_igv: 'GRAVADO'
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
          principio_activo: 'Amoxicilina trihidrato',
          accion_terapeutica: 'Antibiótico',
          condicion_venta: 'prescription',
          registro_sanitario: 'RS-67890',
          ubicacion: 'Estante B-2',
          costo: 0.50,
          precio: 1.20,
          precio2: 1.00,
          precio3: 0.85,
          stock: 200,
          trackStock: 'SI',
          unidad: 'UNIDAD',
          categoria: 'Antibióticos',
          almacen: 'Almacén Principal',
          afectacion_igv: 'GRAVADO'
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
          principio_activo: 'Clonazepam',
          accion_terapeutica: 'Ansiolítico',
          condicion_venta: 'retained',
          registro_sanitario: 'RS-11111',
          ubicacion: 'Estante C-1',
          costo: 0.30,
          precio: 0.80,
          precio2: '',
          precio3: '',
          stock: 100,
          trackStock: 'SI',
          unidad: 'UNIDAD',
          categoria: 'Psicotrópicos',
          almacen: 'Almacén Principal',
          afectacion_igv: 'EXONERADO'
        }
      ]
    } else {
      // Plantilla estándar para retail
      template = [
        {
          sku: 'SKU-001',
          codigo_barras: '7501234567890',
          nombre: 'Producto con Stock',
          descripcion: 'Descripción del producto',
          costo: 8.50,
          precio: 10.50,
          precio2: 9.50,
          precio3: 8.80,
          stock: 100,
          trackStock: 'SI',
          unidad: 'UNIDAD',
          categoria: 'Categoría Ejemplo',
          almacen: 'Almacén Principal',
          afectacion_igv: 'GRAVADO'
        },
        {
          sku: 'SKU-002',
          codigo_barras: '',
          nombre: 'Servicio (Sin Stock)',
          descripcion: 'No controla inventario',
          costo: 20.00,
          precio: 25.00,
          precio2: '',
          precio3: '',
          stock: '',
          trackStock: 'NO',
          unidad: 'SERVICIO',
          categoria: 'Servicios',
          almacen: '',
          afectacion_igv: 'EXONERADO'
        },
        {
          sku: '',
          codigo_barras: '7509876543210',
          nombre: 'Producto Solo con Barras',
          descripcion: 'Sin código interno',
          costo: 12.00,
          precio: 15.00,
          precio2: 13.50,
          precio3: 12.00,
          stock: 50,
          trackStock: 'SI',
          unidad: 'UNIDAD',
          categoria: '',
          almacen: 'Almacén Sucursal 2',
          afectacion_igv: 'INAFECTO'
        }
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
        { wch: 8 },  // stock
        { wch: 10 }, // trackStock
        { wch: 10 }, // unidad
        { wch: 15 }, // categoria
        { wch: 20 }, // almacen
        { wch: 15 }  // afectacion_igv
      ]
    } else {
      ws['!cols'] = [
        { wch: 15 }, // sku
        { wch: 18 }, // codigo_barras
        { wch: 30 }, // nombre
        { wch: 40 }, // descripcion
        { wch: 10 }, // costo
        { wch: 10 }, // precio
        { wch: 10 }, // stock
        { wch: 15 }, // trackStock
        { wch: 15 }, // unidad
        { wch: 20 }, // categoria
        { wch: 25 }, // almacen
        { wch: 15 }  // afectacion_igv
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

        {/* Selector de Sucursal */}
        {branches.length > 0 && (
          <div className="mb-6 p-4 bg-cyan-50 border border-cyan-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Store className="w-5 h-5 text-cyan-600" />
              <label className="text-sm font-medium text-gray-900">
                Sucursal destino para los productos
              </label>
            </div>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-sm"
            >
              <option value="">Sucursal Principal</option>
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-2">
              Los almacenes se crearán/asociarán a esta sucursal. Si el producto ya existe, se actualizará el stock en el almacén de esta sucursal.
            </p>
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
            Columnas: sku, codigo_barras, nombre, descripcion, costo, precio, stock, trackStock (SI/NO), unidad, categoria, almacen, afectacion_igv (GRAVADO/EXONERADO/INAFECTO)
          </p>
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
