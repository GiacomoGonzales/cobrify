import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, Download, X, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { generateIngredientsTemplate } from '@/services/ingredientExportService'

export default function ImportIngredientsModal({ isOpen, onClose, onImport }) {
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
        const { validIngredients, errors: validationErrors } = validateAndMapIngredients(jsonData)

        setPreviewData(validIngredients)
        setErrors(validationErrors)

      } catch (error) {
        console.error('Error al leer archivo:', error)
        setErrors(['Error al procesar el archivo. Verifica que sea un archivo Excel válido.'])
      }
    }

    reader.readAsArrayBuffer(file)
  }

  const validateAndMapIngredients = (data) => {
    const validIngredients = []
    const errors = []

    const validUnits = ['kg', 'g', 'L', 'l', 'ml', 'unidades', 'cajas']

    data.forEach((row, index) => {
      const rowNum = index + 2 // +2 porque Excel empieza en 1 y tiene header

      // Validar campos requeridos - nombre
      const name = row['Nombre (*)'] || row.Nombre || row.nombre || row.name || row.Name || row.NAME
      if (!name || String(name).trim() === '') {
        errors.push(`Fila ${rowNum}: Falta el nombre del ingrediente`)
        return
      }

      // Validar campos requeridos - unidad
      const unit = row['Unidad de Compra (*)'] || row['Unidad de Compra'] || row.unidad || row.Unidad || row.unit || row.Unit
      if (!unit || String(unit).trim() === '') {
        errors.push(`Fila ${rowNum}: Falta la unidad de compra`)
        return
      }

      const unitLower = String(unit).trim().toLowerCase()
      if (!validUnits.includes(unitLower) && unitLower !== 'l') {
        errors.push(`Fila ${rowNum}: Unidad inválida "${unit}". Usa: kg, g, L, ml, unidades, cajas`)
        return
      }

      // Mapear campos
      const ingredient = {
        name: String(name).trim(),
        purchaseUnit: unitLower === 'l' ? 'L' : unitLower,
        currentStock: parseFloat(row['Stock Inicial'] || row.stock || row.Stock || 0),
        minimumStock: parseFloat(row['Stock Mínimo'] || row['Stock Minimo'] || row.stockMinimo || row.minStock || 0),
        averageCost: parseFloat(row['Costo Inicial'] || row.costo || row.Costo || row.cost || 0)
      }

      // Validar números
      if (isNaN(ingredient.currentStock) || ingredient.currentStock < 0) {
        errors.push(`Fila ${rowNum}: Stock inicial inválido`)
        return
      }

      if (isNaN(ingredient.minimumStock) || ingredient.minimumStock < 0) {
        errors.push(`Fila ${rowNum}: Stock mínimo inválido`)
        return
      }

      if (isNaN(ingredient.averageCost) || ingredient.averageCost < 0) {
        errors.push(`Fila ${rowNum}: Costo inicial inválido`)
        return
      }

      validIngredients.push(ingredient)
    })

    return { validIngredients, errors }
  }

  const handleImport = async () => {
    if (previewData.length === 0) {
      setErrors(['No hay ingredientes válidos para importar'])
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

      // Si todo salió bien, cerrar después de 2 segundos
      if (!result.errors || result.errors.length === 0) {
        setTimeout(() => {
          handleClose()
        }, 2000)
      }

    } catch (error) {
      console.error('Error al importar:', error)
      setErrors(['Error al importar ingredientes. Intenta de nuevo.'])
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    setFile(null)
    setPreviewData([])
    setErrors([])
    setSuccess(0)
    setImporting(false)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Importar Ingredientes">
      <div className="space-y-4">
        {/* Instrucciones */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-2">Instrucciones:</h4>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Descarga la plantilla de Excel haciendo clic en el botón de abajo</li>
            <li>Completa los datos de los ingredientes en la plantilla</li>
            <li>Sube el archivo completado usando el botón "Seleccionar archivo"</li>
            <li>Revisa la vista previa y haz clic en "Importar"</li>
          </ol>
        </div>

        {/* Botón descargar plantilla */}
        <Button
          variant="outline"
          onClick={generateIngredientsTemplate}
          className="w-full"
        >
          <Download className="w-4 h-4 mr-2" />
          Descargar Plantilla de Excel
        </Button>

        {/* Seleccionar archivo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Archivo de Excel
          </label>
          <div className="flex items-center gap-3">
            <label className="flex-1 flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary-500 transition-colors">
              <Upload className="w-5 h-5 mr-2 text-gray-400" />
              <span className="text-sm text-gray-600">
                {file ? file.name : 'Seleccionar archivo Excel'}
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Errores */}
        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-red-900 mb-1">Errores encontrados:</h4>
                <ul className="text-sm text-red-700 space-y-1 max-h-40 overflow-y-auto">
                  {errors.map((error, idx) => (
                    <li key={idx}>• {error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Success */}
        {success > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <p className="text-sm text-green-800">
                {success} ingrediente(s) importado(s) correctamente
              </p>
            </div>
          </div>
        )}

        {/* Vista previa */}
        {previewData.length > 0 && (
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">
              Vista previa ({previewData.length} ingrediente{previewData.length !== 1 ? 's' : ''})
            </h4>
            <div className="border rounded-lg max-h-60 overflow-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unidad</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Stock Mín.</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Costo</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {previewData.slice(0, 10).map((ingredient, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm text-gray-900">{ingredient.name}</td>
                      <td className="px-3 py-2 text-sm text-gray-600">{ingredient.purchaseUnit}</td>
                      <td className="px-3 py-2 text-sm text-gray-600">{ingredient.currentStock}</td>
                      <td className="px-3 py-2 text-sm text-gray-600">{ingredient.minimumStock}</td>
                      <td className="px-3 py-2 text-sm text-gray-600">S/ {ingredient.averageCost.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewData.length > 10 && (
                <div className="bg-gray-50 px-3 py-2 text-sm text-gray-600 text-center border-t">
                  ... y {previewData.length - 10} ingrediente(s) más
                </div>
              )}
            </div>
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex gap-3 pt-4">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={importing}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={previewData.length === 0 || importing || errors.length > 0}
            className="flex-1"
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Importar {previewData.length > 0 && `(${previewData.length})`}
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
