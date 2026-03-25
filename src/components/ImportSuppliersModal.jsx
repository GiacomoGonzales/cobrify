import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Upload, Download, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

export default function ImportSuppliersModal({ isOpen, onClose, onImport }) {
  const [file, setFile] = useState(null)
  const [parsedData, setParsedData] = useState([])
  const [errors, setErrors] = useState([])
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const fileInputRef = useRef(null)

  const resetState = () => {
    setFile(null)
    setParsedData([])
    setErrors([])
    setImportResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClose = () => {
    resetState()
    onClose()
  }

  const downloadTemplate = () => {
    const templateData = [
      {
        ruc: '20123456789',
        razon_social: 'DISTRIBUIDORA EJEMPLO S.A.C.',
        contacto: 'Juan Pérez',
        telefono: '01-234-5678',
        email: 'ventas@ejemplo.com',
        direccion: 'Av. Principal 123, Lima',
      },
      {
        ruc: '10987654321',
        razon_social: 'LABORATORIO SALUD E.I.R.L.',
        contacto: 'María López',
        telefono: '987654321',
        email: 'contacto@labsalud.com',
        direccion: 'Jr. Los Olivos 456, Arequipa',
      },
    ]

    const ws = XLSX.utils.json_to_sheet(templateData)
    ws['!cols'] = [
      { wch: 15 }, // ruc
      { wch: 35 }, // razon_social
      { wch: 25 }, // contacto
      { wch: 15 }, // telefono
      { wch: 30 }, // email
      { wch: 40 }, // direccion
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Proveedores')
    XLSX.writeFile(wb, 'plantilla_proveedores.xlsx')
  }

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setImportResult(null)

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const wb = XLSX.read(event.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rawData = XLSX.utils.sheet_to_json(ws, { defval: '' })

        const suppliers = []
        const parseErrors = []

        rawData.forEach((row, index) => {
          const rowNum = index + 2 // +2 por header + 0-index

          // Mapear columnas flexibles (soporta múltiples nombres)
          const ruc = String(row.ruc || row.RUC || row.Ruc || row.documentNumber || row['NUMERO DE DOCUMENTO'] || '').trim()
          const businessName = String(
            row.razon_social || row.RAZON_SOCIAL || row['Razón Social'] || row['razon social'] ||
            row.businessName || row['NOMBRE DE DISTRIBUIDOR'] || row.nombre || row.NOMBRE || row.name || ''
          ).trim()
          const contactName = String(row.contacto || row.CONTACTO || row.contactName || row.repvta || row.representante || '').trim()
          const phone = String(row.telefono || row.TELEFONO || row.phone || row.telef || row.celular || '').trim()
          const email = String(row.email || row.EMAIL || row.Email || row.correo || '').trim()
          const address = String(row.direccion || row.DIRECCION || row.address || row.direcc || row['Dirección'] || '').trim()

          if (!businessName) {
            parseErrors.push(`Fila ${rowNum}: Sin razón social, se omite`)
            return
          }

          // Detectar tipo de documento por longitud del RUC
          let documentType = ''
          if (ruc.length === 11) documentType = 'RUC'
          else if (ruc.length === 8) documentType = 'DNI'

          suppliers.push({
            documentType,
            documentNumber: ruc,
            businessName,
            contactName,
            phone,
            email,
            address,
          })
        })

        setParsedData(suppliers)
        setErrors(parseErrors)
      } catch (err) {
        console.error('Error parsing Excel:', err)
        setErrors(['Error al leer el archivo. Verifica que sea un Excel válido (.xlsx)'])
        setParsedData([])
      }
    }
    reader.readAsBinaryString(selectedFile)
  }

  const handleImport = async () => {
    if (parsedData.length === 0) return
    setIsImporting(true)
    try {
      const result = await onImport(parsedData)
      setImportResult(result)
    } catch (err) {
      setImportResult({ success: 0, failed: parsedData.length, error: err.message })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Importar Proveedores" size="lg">
      <div className="space-y-4">
        {/* Paso 1: Descargar plantilla */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 mb-2">Paso 1: Descargar plantilla</h3>
          <p className="text-xs text-blue-700 mb-3">
            Descarga la plantilla Excel, llénala con los datos de tus proveedores y súbela aquí.
            Las columnas son: ruc, razon_social, contacto, telefono, email, direccion.
          </p>
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="w-4 h-4 mr-2" />
            Descargar plantilla
          </Button>
        </div>

        {/* Paso 2: Subir archivo */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Paso 2: Subir archivo Excel</h3>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" />
            {file ? file.name : 'Seleccionar archivo'}
          </Button>
        </div>

        {/* Errores de parseo */}
        {errors.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-amber-800">Advertencias:</p>
                {errors.slice(0, 5).map((err, i) => (
                  <p key={i} className="text-xs text-amber-700">{err}</p>
                ))}
                {errors.length > 5 && <p className="text-xs text-amber-600">...y {errors.length - 5} más</p>}
              </div>
            </div>
          </div>
        )}

        {/* Vista previa */}
        {parsedData.length > 0 && !importResult && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Vista previa: {parsedData.length} proveedores encontrados
            </h3>
            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">RUC/DNI</th>
                    <th className="px-3 py-2 text-left">Razón Social</th>
                    <th className="px-3 py-2 text-left">Contacto</th>
                    <th className="px-3 py-2 text-left">Teléfono</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {parsedData.slice(0, 20).map((s, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5">{s.documentNumber || '-'}</td>
                      <td className="px-3 py-1.5 font-medium">{s.businessName}</td>
                      <td className="px-3 py-1.5">{s.contactName || '-'}</td>
                      <td className="px-3 py-1.5">{s.phone || '-'}</td>
                    </tr>
                  ))}
                  {parsedData.length > 20 && (
                    <tr><td colSpan={4} className="px-3 py-2 text-center text-gray-500">...y {parsedData.length - 20} más</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Resultado de importación */}
        {importResult && (
          <div className={`p-4 rounded-lg border ${importResult.success > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-start gap-2">
              <CheckCircle className={`w-5 h-5 mt-0.5 ${importResult.success > 0 ? 'text-green-600' : 'text-red-600'}`} />
              <div>
                <p className="text-sm font-medium">{importResult.success} proveedores importados</p>
                {importResult.failed > 0 && (
                  <p className="text-xs text-red-600">{importResult.failed} fallidos</p>
                )}
                {importResult.duplicates > 0 && (
                  <p className="text-xs text-amber-600">{importResult.duplicates} duplicados omitidos</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Botones */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose} disabled={isImporting}>
            {importResult ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!importResult && (
            <Button onClick={handleImport} disabled={parsedData.length === 0 || isImporting}>
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Importar {parsedData.length} proveedores
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
