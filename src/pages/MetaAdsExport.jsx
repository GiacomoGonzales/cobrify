import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { Loader2, Download, Save, AlertCircle, Facebook } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Alert from '@/components/ui/Alert'
import { getInvoices, updateInvoice } from '@/services/firestoreService'

/**
 * Página de exportación para Meta Ads (Facebook Conversions API).
 * Permite editar manualmente la "hora del evento" de cada venta y exportar
 * en el formato exacto que Meta requiere:
 *   event_name | event_time | phone | value | currency | Order_id
 *
 * Activada por el toggle `metaAdsEnabled` en Configuración > Preferencias.
 */

// Formatea una fecha como "M/D/YY H:mm" (formato de Meta Ads)
const formatMetaDate = (date) => {
  if (!date) return ''
  const d = date.toDate ? date.toDate() : (date.seconds ? new Date(date.seconds * 1000) : new Date(date))
  if (isNaN(d.getTime())) return ''
  const month = d.getMonth() + 1
  const day = d.getDate()
  const year = String(d.getFullYear()).slice(-2)
  const hours = d.getHours()
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${month}/${day}/${year} ${hours}:${minutes}`
}

// Convierte un string "M/D/YY H:mm" de vuelta a Date (mejor-esfuerzo)
const parseMetaDate = (str) => {
  if (!str) return null
  // Acepta formatos: "3/19/26 10:17" | "3/19/2026 10:17" | "3/19/26 10:17:00"
  const match = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return null
  let [, m, d, y, h, min, s] = match
  y = parseInt(y, 10)
  if (y < 100) y += 2000
  const date = new Date(y, parseInt(m) - 1, parseInt(d), parseInt(h), parseInt(min), parseInt(s || '0'))
  return isNaN(date.getTime()) ? null : date
}

// Normaliza un teléfono añadiendo prefijo si hace falta
const normalizePhone = (phone, prefix) => {
  if (!phone) return ''
  const cleaned = String(phone).replace(/[\s\-()]/g, '').trim()
  if (!cleaned) return ''
  if (cleaned.startsWith('+')) return cleaned
  // Si el prefijo es "+51" y el teléfono ya empieza con "51" y es de 11 dígitos, asumimos que tiene código
  const prefixDigits = (prefix || '').replace(/[^\d]/g, '')
  if (prefixDigits && cleaned.startsWith(prefixDigits) && cleaned.length >= prefixDigits.length + 9) {
    return `+${cleaned}`
  }
  return `${prefix || ''}${cleaned}`
}

// Helper para guardar y compartir Excel (soporta móvil y web)
const saveExcel = async (workbook, fileName) => {
  if (Capacitor.isNativePlatform()) {
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' })
    const dir = 'Reportes'
    try {
      await Filesystem.mkdir({ path: dir, directory: Directory.Documents, recursive: true })
    } catch { /* existe */ }
    const result = await Filesystem.writeFile({
      path: `${dir}/${fileName}`,
      data: excelBuffer,
      directory: Directory.Documents,
      recursive: true
    })
    try {
      await Share.share({ title: fileName, text: fileName, url: result.uri, dialogTitle: 'Compartir Reporte' })
    } catch { /* usuario canceló */ }
  } else {
    XLSX.writeFile(workbook, fileName)
  }
}

// Obtener fecha de emisión del comprobante
const getInvoiceDate = (invoice) => {
  const raw = invoice.issueDate || invoice.createdAt || invoice.date
  if (!raw) return null
  if (raw.toDate) return raw.toDate()
  if (raw.seconds) return new Date(raw.seconds * 1000)
  return new Date(raw)
}

export default function MetaAdsExport() {
  const { user, getBusinessId, businessSettings, isDemoMode } = useAppContext()
  const toast = useToast()
  const navigate = useNavigate()

  const [invoices, setInvoices] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // Filtros
  const today = new Date()
  const weekAgo = new Date()
  weekAgo.setDate(today.getDate() - 7)
  const toInputDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const [startDate, setStartDate] = useState(toInputDate(weekAgo))
  const [endDate, setEndDate] = useState(toInputDate(today))
  const [onlyPaid, setOnlyPaid] = useState(true)

  // Mapa de ediciones locales: { invoiceId: "M/D/YY H:mm" }
  const [eventTimeEdits, setEventTimeEdits] = useState({})
  const [dirty, setDirty] = useState(false)

  const phonePrefix = businessSettings?.metaAdsPhonePrefix || '+51'
  const orderIdPrefix = businessSettings?.metaAdsOrderIdPrefix || ''

  // Guard: si la feature no está habilitada
  const enabled = businessSettings?.metaAdsEnabled === true

  useEffect(() => {
    if (!enabled) return
    loadInvoices()
  }, [enabled, user])

  const loadInvoices = async () => {
    if (!user?.uid) return
    setIsLoading(true)
    try {
      const result = await getInvoices(getBusinessId())
      if (result.success) {
        // Solo facturas/boletas/notas de venta (no notas de crédito/débito)
        const filtered = (result.data || []).filter(inv =>
          ['factura', 'boleta', 'nota_venta'].includes(inv.documentType)
        )
        setInvoices(filtered)
        // Inicializar los eventTimeEdits con los valores ya guardados
        const initial = {}
        filtered.forEach(inv => {
          if (inv.metaEventTime) {
            initial[inv.id] = formatMetaDate(inv.metaEventTime)
          } else {
            initial[inv.id] = formatMetaDate(getInvoiceDate(inv))
          }
        })
        setEventTimeEdits(initial)
      }
    } catch (error) {
      console.error('Error al cargar ventas:', error)
      toast.error('Error al cargar las ventas')
    } finally {
      setIsLoading(false)
    }
  }

  // Filtrado por rango de fechas + estado de pago
  const filteredInvoices = useMemo(() => {
    const start = startDate ? new Date(startDate + 'T00:00:00') : null
    const end = endDate ? new Date(endDate + 'T23:59:59') : null
    return invoices
      .filter(inv => {
        const d = getInvoiceDate(inv)
        if (!d) return false
        if (start && d < start) return false
        if (end && d > end) return false
        if (onlyPaid && inv.status !== 'paid') return false
        return true
      })
      .sort((a, b) => {
        const aT = parseMetaDate(eventTimeEdits[a.id]) || getInvoiceDate(a) || new Date(0)
        const bT = parseMetaDate(eventTimeEdits[b.id]) || getInvoiceDate(b) || new Date(0)
        return aT - bT
      })
  }, [invoices, startDate, endDate, onlyPaid, eventTimeEdits])

  const handleEventTimeChange = (invoiceId, value) => {
    setEventTimeEdits(prev => ({ ...prev, [invoiceId]: value }))
    setDirty(true)
  }

  const handleSaveChanges = async () => {
    if (isDemoMode) {
      toast.error('No se puede guardar en modo demo.')
      return
    }
    setIsSaving(true)
    try {
      const businessId = getBusinessId()
      const updates = []
      for (const inv of filteredInvoices) {
        const edited = eventTimeEdits[inv.id]
        const parsed = parseMetaDate(edited)
        const existing = inv.metaEventTime
          ? formatMetaDate(inv.metaEventTime)
          : null
        // Solo guardar si cambió respecto al valor persistido
        if (parsed && edited !== existing) {
          updates.push(updateInvoice(businessId, inv.id, { metaEventTime: parsed }))
        }
      }
      if (updates.length === 0) {
        toast.success('No hay cambios por guardar.')
        setDirty(false)
        return
      }
      await Promise.all(updates)
      toast.success(`${updates.length} venta(s) actualizada(s).`)
      setDirty(false)
      await loadInvoices()
    } catch (error) {
      console.error('Error al guardar:', error)
      toast.error('Error al guardar los cambios')
    } finally {
      setIsSaving(false)
    }
  }

  const handleExport = async () => {
    if (filteredInvoices.length === 0) {
      toast.error('No hay ventas para exportar con los filtros actuales.')
      return
    }
    setIsExporting(true)
    try {
      // Ordenar por hora del evento (ascendente) para numerar Order_id correctamente
      const sorted = [...filteredInvoices].sort((a, b) => {
        const aT = parseMetaDate(eventTimeEdits[a.id]) || getInvoiceDate(a) || new Date(0)
        const bT = parseMetaDate(eventTimeEdits[b.id]) || getInvoiceDate(b) || new Date(0)
        return aT - bT
      })

      // Contador por día (YYYYMMDD) para generar el Order_id con correlativo NN
      const dailyCounter = {}
      const rows = [['event_name', 'event_time', 'phone', 'value', 'currency', 'Order_id']]

      sorted.forEach(inv => {
        const eventStr = eventTimeEdits[inv.id] || formatMetaDate(getInvoiceDate(inv))
        const eventDate = parseMetaDate(eventStr) || getInvoiceDate(inv) || new Date()

        const y = eventDate.getFullYear()
        const m = String(eventDate.getMonth() + 1).padStart(2, '0')
        const d = String(eventDate.getDate()).padStart(2, '0')
        const dayKey = `${y}${m}${d}`
        dailyCounter[dayKey] = (dailyCounter[dayKey] || 0) + 1
        const nn = String(dailyCounter[dayKey]).padStart(2, '0')
        const orderId = orderIdPrefix
          ? `${orderIdPrefix}_${dayKey}_${nn}`
          : `${dayKey}_${nn}`

        const phone = normalizePhone(inv.customer?.phone || '', phonePrefix)
        const value = Number((inv.total || 0).toFixed(2))
        const currency = inv.currency || 'PEN'

        rows.push([
          'Purchase',
          eventStr,
          phone,
          value,
          currency,
          orderId
        ])
      })

      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 22 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Meta Ads')

      const fileName = `meta_ads_${startDate || 'todas'}_${endDate || ''}.xlsx`
      await saveExcel(wb, fileName)
      toast.success(`Exportadas ${sorted.length} ventas a Meta Ads.`)
    } catch (error) {
      console.error('Error al exportar:', error)
      toast.error('Error al generar el archivo')
    } finally {
      setIsExporting(false)
    }
  }

  // Feature gate
  if (!enabled) {
    return (
      <div className="max-w-2xl mx-auto">
        <Alert variant="warning" title="Funcionalidad no habilitada">
          La exportación para Meta Ads está deshabilitada. Ve a{' '}
          <button
            type="button"
            onClick={() => navigate('/app/configuracion')}
            className="underline font-medium hover:text-primary-700"
          >
            Configuración → Preferencias
          </button>{' '}
          y activa "Habilitar exportación para Meta Ads".
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Facebook className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Exportar a Meta Ads</h1>
          <p className="text-sm text-gray-600 mt-1">
            Ingresa manualmente la hora real de cada venta y descarga el archivo para el Administrador de Eventos de Meta.
          </p>
        </div>
      </div>

      {/* Info */}
      <Alert variant="info">
        <div className="text-sm space-y-1">
          <p>
            <strong>Prefijo de teléfono:</strong> <code className="bg-white px-1.5 py-0.5 rounded">{phonePrefix}</code>
            {' '}·{' '}
            <strong>Prefijo Order ID:</strong>{' '}
            <code className="bg-white px-1.5 py-0.5 rounded">{orderIdPrefix || '(ninguno)'}</code>
          </p>
          <p className="text-xs text-gray-600">
            Formato de hora: <code>M/D/YY H:mm</code> (ej: <code>3/19/26 10:17</code>).
            El <code>Order_id</code> se genera automáticamente como{' '}
            <code>{(orderIdPrefix || 'PREFIJO') + '_YYYYMMDD_NN'}</code>, numerado por día según la hora del evento.
          </p>
        </div>
      </Alert>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={onlyPaid}
                  onChange={e => setOnlyPaid(e.target.checked)}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                Solo ventas pagadas
              </label>
            </div>
            <div className="flex items-end justify-end">
              <span className="text-sm text-gray-600">
                {filteredInvoices.length} venta{filteredInvoices.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle>Ventas</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleSaveChanges}
                disabled={isSaving || !dirty}
              >
                {isSaving ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...</>
                ) : (
                  <><Save className="w-4 h-4 mr-2" /> Guardar cambios</>
                )}
              </Button>
              <Button
                onClick={handleExport}
                disabled={isExporting || filteredInvoices.length === 0}
              >
                {isExporting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generando...</>
                ) : (
                  <><Download className="w-4 h-4 mr-2" /> Descargar para Meta Ads</>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p>No hay ventas en el rango seleccionado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">#</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Cliente</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Teléfono</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">
                      Hora del evento
                      <span className="ml-1 text-xs font-normal text-gray-500">(editable)</span>
                    </th>
                    <th className="text-right px-3 py-2 font-medium text-gray-700">Monto</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Fecha emisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredInvoices.map(inv => {
                    const phone = inv.customer?.phone || ''
                    const normalizedPhone = normalizePhone(phone, phonePrefix)
                    const issueDate = getInvoiceDate(inv)
                    const currentEventStr = eventTimeEdits[inv.id] || ''
                    const isValidTime = !currentEventStr || parseMetaDate(currentEventStr)
                    return (
                      <tr key={inv.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-900">{inv.number}</td>
                        <td className="px-3 py-2 text-gray-700">{inv.customer?.name || 'Cliente General'}</td>
                        <td className="px-3 py-2 text-gray-700">
                          {normalizedPhone || <span className="text-gray-400 italic">sin teléfono</span>}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={currentEventStr}
                            onChange={e => handleEventTimeChange(inv.id, e.target.value)}
                            placeholder="M/D/YY H:mm"
                            className={`w-36 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 ${
                              isValidTime
                                ? 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
                                : 'border-red-400 focus:ring-red-500 focus:border-red-500'
                            }`}
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                          {(inv.total || 0).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-gray-500 text-xs">
                          {issueDate ? issueDate.toLocaleString('es-PE') : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
