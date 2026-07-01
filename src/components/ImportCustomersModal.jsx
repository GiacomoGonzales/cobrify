import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, Download, FileSpreadsheet, Loader2, CheckCircle, AlertTriangle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { createCustomer } from '@/services/firestoreService'
import { ID_TYPES } from '@/utils/peruUtils'

// Normaliza un texto de encabezado/valor para comparar sin tildes, espacios ni signos.
const norm = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[\s/._-]/g, '')
  .trim()

// Lee un campo de la fila (ya normalizada) probando varios nombres de columna posibles.
const rowGet = (normalizedRow, candidates) => {
  for (const c of candidates) {
    const v = normalizedRow[norm(c)]
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

const mapDocType = (raw, docNumber) => {
  const t = norm(raw)
  if (t.includes('ruc')) return ID_TYPES.RUC
  if (t === 'dni') return ID_TYPES.DNI
  if (t === 'ce' || t.includes('carnet') || t.includes('extranjeria')) return ID_TYPES.CE
  if (t.includes('pasaporte') || t.includes('passport')) return ID_TYPES.PASSPORT
  // Sin tipo: inferir por longitud
  if (docNumber && docNumber.length === 11) return ID_TYPES.RUC
  return ID_TYPES.DNI
}

export default function ImportCustomersModal({ isOpen, onClose, onImported, existingCustomers = [] }) {
  const { getBusinessId, isDemoMode } = useAppContext()
  const toast = useToast()
  const [parsed, setParsed] = useState([]) // clientes válidos parseados
  const [skipped, setSkipped] = useState(0) // filas vacías/duplicadas descartadas
  const [fileName, setFileName] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState(null) // { created, failed }

  const reset = () => { setParsed([]); setSkipped(0); setFileName(''); setResult(null) }
  const handleClose = () => { reset(); onClose() }

  const downloadTemplate = () => {
    const template = [
      { 'Tipo Documento': 'DNI', 'Numero Documento': '12345678', 'Nombre / Razon Social': 'Juan Perez', 'Email': 'juan@correo.com', 'Telefono': '987654321', 'Direccion': 'Av. Ejemplo 123' },
      { 'Tipo Documento': 'RUC', 'Numero Documento': '20123456789', 'Nombre / Razon Social': 'Mi Empresa S.A.C.', 'Email': 'ventas@miempresa.com', 'Telefono': '01 4567890', 'Direccion': 'Jr. Comercio 456' },
    ]
    const ws = XLSX.utils.json_to_sheet(template)
    ws['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 30 }, { wch: 24 }, { wch: 16 }, { wch: 30 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
    XLSX.writeFile(wb, 'plantilla_clientes.xlsx')
  }

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResult(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

        const seen = new Set(existingCustomers.map(c => String(c.documentNumber || '').trim()).filter(Boolean))
        const valid = []
        let dropped = 0
        for (const raw of rows) {
          const r = {}
          for (const k of Object.keys(raw)) r[norm(k)] = raw[k]

          const docNumber = rowGet(r, ['Numero Documento', 'numero', 'documento', 'nro documento', 'dni', 'ruc', 'documentnumber']).replace(/\s+/g, '')
          const nameVal = rowGet(r, ['Nombre / Razon Social', 'nombre', 'razon social', 'cliente', 'name', 'businessname'])
          if (!docNumber && !nameVal) continue // fila vacía → ignorar (no cuenta como omitida)

          const documentType = mapDocType(rowGet(r, ['Tipo Documento', 'tipo', 'tipodoc', 'documenttype']), docNumber)
          const isRuc = documentType === ID_TYPES.RUC

          // Duplicado (contra los ya existentes o dentro del mismo archivo)
          if (docNumber && seen.has(docNumber)) { dropped++; continue }
          if (docNumber) seen.add(docNumber)

          valid.push({
            documentType,
            documentNumber: docNumber,
            name: nameVal,
            businessName: isRuc ? nameVal : '',
            email: rowGet(r, ['Email', 'correo']),
            phone: rowGet(r, ['Telefono', 'celular', 'phone', 'tel']),
            address: rowGet(r, ['Direccion', 'address']),
          })
        }
        setParsed(valid)
        setSkipped(dropped)
        if (valid.length === 0) toast.error('No se detectaron clientes válidos en el archivo')
      } catch (err) {
        console.error('Error al leer el Excel:', err)
        toast.error('No se pudo leer el archivo. Verifica que sea un Excel válido.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleImport = async () => {
    if (isDemoMode) { toast.info('La importación no está disponible en modo demo'); return }
    if (parsed.length === 0) return
    setIsImporting(true)
    const businessId = getBusinessId()
    let created = 0, failed = 0
    for (const c of parsed) {
      try {
        const res = await createCustomer(businessId, c)
        if (res.success) created++
        else failed++
      } catch (e) {
        failed++
      }
    }
    setIsImporting(false)
    setResult({ created, failed })
    if (created > 0) {
      toast.success(`${created} cliente(s) importado(s)${failed ? `, ${failed} con error` : ''}`)
      onImported?.()
    } else {
      toast.error('No se pudo importar ningún cliente')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Importar clientes desde Excel" size="lg">
      <div className="space-y-5">
        {/* Paso 1: plantilla */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900">1. Descarga la plantilla</p>
              <p className="text-xs text-blue-800 mt-0.5">
                Columnas: Tipo Documento (DNI/RUC/CE/Pasaporte), Número Documento, Nombre / Razón Social, Email, Teléfono, Dirección. Llénala y guárdala.
              </p>
              <Button variant="outline" size="sm" onClick={downloadTemplate} className="mt-3">
                <Download className="w-4 h-4 mr-2" />
                Descargar plantilla
              </Button>
            </div>
          </div>
        </div>

        {/* Paso 2: subir */}
        <div>
          <p className="text-sm font-medium text-gray-800 mb-2">2. Sube tu archivo (.xlsx / .xls / .csv)</p>
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg py-8 cursor-pointer hover:border-primary-400 hover:bg-primary-50/40 transition-colors">
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
            <Upload className="w-6 h-6 text-gray-400" />
            <span className="text-sm text-gray-600">{fileName || 'Haz clic para elegir el Excel'}</span>
          </label>
        </div>

        {/* Preview */}
        {parsed.length > 0 && !result && (
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                {parsed.length} cliente(s) detectado(s)
                {skipped > 0 && <span className="text-gray-400 font-normal"> · {skipped} omitido(s) (duplicados)</span>}
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto divide-y">
              {parsed.slice(0, 50).map((c, i) => (
                <div key={i} className="px-4 py-2 text-sm flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{c.name || c.businessName || '(sin nombre)'}</p>
                    <p className="text-xs text-gray-500">{c.documentType} {c.documentNumber || '—'}{c.phone ? ` · ${c.phone}` : ''}</p>
                  </div>
                </div>
              ))}
              {parsed.length > 50 && (
                <div className="px-4 py-2 text-xs text-gray-400 text-center">…y {parsed.length - 50} más</div>
              )}
            </div>
          </div>
        )}

        {/* Resultado */}
        {result && (
          <div className={`rounded-lg p-4 flex items-center gap-3 ${result.created > 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            {result.created > 0 ? <CheckCircle className="w-5 h-5 text-green-600" /> : <AlertTriangle className="w-5 h-5 text-red-600" />}
            <p className="text-sm text-gray-800">
              {result.created} cliente(s) importado(s){result.failed ? ` · ${result.failed} con error` : ''}.
            </p>
          </div>
        )}

        {/* Acciones */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={handleClose} disabled={isImporting}>
            {result ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!result && (
            <Button onClick={handleImport} disabled={isImporting || parsed.length === 0}>
              {isImporting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importando...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" /> Importar {parsed.length > 0 ? `${parsed.length} cliente(s)` : ''}</>
              )}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
