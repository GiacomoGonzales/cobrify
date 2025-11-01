import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, Download, X, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

export default function ImportProductsModal({ isOpen, onClose, onImport }) {
  const [file, setFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [previewData, setPreviewData] = useState([])
  const [errors, setErrors] = useState([])
  const [success, setSuccess] = useState(0)

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

      // Validar campos requeridos
      if (!row.codigo && !row.Codigo && !row.CODIGO && !row.code && !row.Code && !row.CODE) {
        errors.push(`Fila ${rowNum}: Falta el código del producto`)
        return
      }

      if (!row.nombre && !row.Nombre && !row.NOMBRE && !row.name && !row.Name && !row.NAME) {
        errors.push(`Fila ${rowNum}: Falta el nombre del producto`)
        return
      }

      if (!row.precio && !row.Precio && !row.PRECIO && !row.price && !row.Price && !row.PRICE) {
        errors.push(`Fila ${rowNum}: Falta el precio del producto`)
        return
      }

      // Mapear campos (soportar diferentes nombres de columnas)
      const product = {
        code: String(row.codigo || row.Codigo || row.CODIGO || row.code || row.Code || row.CODE || '').trim(),
        name: String(row.nombre || row.Nombre || row.NOMBRE || row.name || row.Name || row.NAME || '').trim(),
        description: String(row.descripcion || row.Descripcion || row.DESCRIPCION || row.description || row.Description || row.DESCRIPTION || '').trim(),
        price: parseFloat(row.precio || row.Precio || row.PRECIO || row.price || row.Price || row.PRICE || 0),
        stock: row.stock || row.Stock || row.STOCK || row.inventario || row.Inventario || row.INVENTARIO || null,
        unit: String(row.unidad || row.Unidad || row.UNIDAD || row.unit || row.Unit || row.UNIT || 'UNIDAD').trim().toUpperCase(),
        category: String(row.categoria || row.Categoria || row.CATEGORIA || row.category || row.Category || row.CATEGORY || '').trim(),
        hasVariants: false,
        variantAttributes: [],
        variants: []
      }

      // Validar precio
      if (isNaN(product.price) || product.price < 0) {
        errors.push(`Fila ${rowNum}: Precio inválido (${row.precio || row.price})`)
        return
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
      const result = await onImport(previewData)
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
  }

  const handleClose = () => {
    resetState()
    onClose()
  }

  const downloadTemplate = () => {
    // Crear plantilla de ejemplo
    const template = [
      {
        codigo: 'PROD001',
        nombre: 'Producto Ejemplo',
        descripcion: 'Descripción del producto',
        precio: 10.50,
        stock: 100,
        unidad: 'UNIDAD',
        categoria: 'Categoría Ejemplo'
      },
      {
        codigo: 'PROD002',
        nombre: 'Otro Producto',
        descripcion: '',
        precio: 25.00,
        stock: 50,
        unidad: 'KILOGRAMO',
        categoria: ''
      }
    ]

    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Productos')

    // Ajustar anchos de columna
    ws['!cols'] = [
      { wch: 12 }, // codigo
      { wch: 30 }, // nombre
      { wch: 40 }, // descripcion
      { wch: 10 }, // precio
      { wch: 10 }, // stock
      { wch: 15 }, // unidad
      { wch: 20 }  // categoria
    ]

    XLSX.writeFile(wb, 'plantilla_productos.xlsx')
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
            Columnas: codigo, nombre, descripcion, precio, stock, unidad, categoria
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
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Código</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Nombre</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Precio</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Stock</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Unidad</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {previewData.slice(0, 50).map((product, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm text-gray-900">{product.code}</td>
                      <td className="px-3 py-2 text-sm text-gray-900">{product.name}</td>
                      <td className="px-3 py-2 text-sm text-gray-900">S/ {product.price.toFixed(2)}</td>
                      <td className="px-3 py-2 text-sm text-gray-600">{product.stock ?? 'N/A'}</td>
                      <td className="px-3 py-2 text-sm text-gray-600">{product.unit}</td>
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
