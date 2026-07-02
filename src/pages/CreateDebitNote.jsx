import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { ArrowLeft, Loader2, FileText, AlertCircle, Send } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useLocationAccess } from '@/utils/locationAccess'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import { getInvoicesPage, createInvoice, getDocumentSeries, sendInvoiceToSunat, getCompanySettings } from '@/services/firestoreService'
import { formatCurrency } from '@/lib/utils'
import { normalizeCurrency, convertToBase } from '@/utils/currency'
import { getAuth } from 'firebase/auth'

// URL de la Cloud Function
const SEND_DEBIT_NOTE_URL = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL
  ? `${import.meta.env.VITE_FIREBASE_FUNCTIONS_URL}/sendDebitNoteToSunat`
  : 'https://us-central1-cobrify-395fe.cloudfunctions.net/sendDebitNoteToSunat'

// Catálogo 10 - Tipos de nota de débito SUNAT
const DEBIT_NOTE_REASONS = [
  { code: '01', description: 'Intereses por mora' },
  { code: '02', description: 'Aumento en el valor' },
  { code: '03', description: 'Penalidades/ otros conceptos' },
]

export default function CreateDebitNote() {
  const { user, getBusinessId } = useAuth()
  // Sanear por sucursal/almacén permitido: el sub-usuario solo puede referenciar
  // comprobantes de sus ubicaciones (mismo criterio que la página Ventas).
  const canAccessInvoice = useLocationAccess()
  const navigate = useNavigate()
  const appNavigate = useAppNavigate()
  const [searchParams] = useSearchParams()
  const invoiceIdParam = searchParams.get('invoiceId')

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [invoices, setInvoices] = useState([])
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [series, setSeries] = useState(null)
  const [message, setMessage] = useState(null)
  const [companySettings, setCompanySettings] = useState(null)

  // Form data
  const [formData, setFormData] = useState({
    referencedInvoiceId: invoiceIdParam || '',
    discrepancyCode: '02',
    discrepancyReason: '',
    additionalAmount: 0,
    additionalDescription: '',
  })

  useEffect(() => {
    loadData()
  }, [user])

  useEffect(() => {
    if (formData.referencedInvoiceId && invoices.length > 0) {
      const invoice = invoices.find(inv => inv.id === formData.referencedInvoiceId)
      if (invoice) {
        setSelectedInvoice(invoice)
        setFormData(prev => ({
          ...prev,
          discrepancyReason: DEBIT_NOTE_REASONS.find(r => r.code === prev.discrepancyCode)?.description || ''
        }))
      }
    }
  }, [formData.referencedInvoiceId, invoices])

  const loadData = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const [invoicesResult, seriesResult, settingsResult] = await Promise.all([
        // PERF: solo las 2000 facturas más recientes (no las 20k+ del historial).
        getInvoicesPage(getBusinessId(), { pageSize: 2000 }),
        getDocumentSeries(getBusinessId()),
        getCompanySettings(getBusinessId())
      ])

      if (invoicesResult.success) {
        // Solo facturas y boletas ACEPTADAS por SUNAT, de las ubicaciones permitidas
        const acceptedInvoices = (invoicesResult.data || []).filter(
          inv => (inv.documentType === 'factura' || inv.documentType === 'boleta') &&
                 inv.sunatStatus === 'accepted' &&
                 canAccessInvoice(inv)
        )
        setInvoices(acceptedInvoices)
      }

      if (seriesResult.success && seriesResult.data) {
        setSeries(seriesResult.data)
      }

      if (settingsResult.success && settingsResult.data) {
        setCompanySettings(settingsResult.data)
      }
    } catch (error) {
      console.error('Error:', error)
      setMessage({ type: 'error', text: 'Error al cargar datos' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleReasonChange = (code) => {
    const reason = DEBIT_NOTE_REASONS.find(r => r.code === code)
    setFormData(prev => ({
      ...prev,
      discrepancyCode: code,
      discrepancyReason: reason?.description || ''
    }))
  }

  const calculateTotals = () => {
    const additionalAmount = parseFloat(formData.additionalAmount) || 0
    const subtotal = additionalAmount
    const igv = subtotal * 0.18
    const total = subtotal + igv

    return { subtotal, igv, total }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!user?.uid || !selectedInvoice) return

    // Validaciones
    if (!formData.referencedInvoiceId) {
      setMessage({ type: 'error', text: 'Debes seleccionar una factura o boleta' })
      return
    }

    const additionalAmount = parseFloat(formData.additionalAmount) || 0
    if (additionalAmount <= 0) {
      setMessage({ type: 'error', text: 'El monto adicional debe ser mayor a 0' })
      return
    }

    if (!formData.additionalDescription || formData.additionalDescription.trim() === '') {
      setMessage({ type: 'error', text: 'Debes ingresar una descripción del concepto adicional' })
      return
    }

    // Determinar qué serie usar según el tipo de documento referenciado
    const isFactura = selectedInvoice.documentType === 'factura'
    const seriesKey = isFactura ? 'nota_debito_factura' : 'nota_debito_boleta'
    const seriesName = isFactura ? 'Notas de Débito de Facturas' : 'Notas de Débito de Boletas'

    // Verificar que existe la serie para notas de débito
    if (!series || !series[seriesKey]) {
      setMessage({
        type: 'error',
        text: `No se ha configurado la serie para ${seriesName}. Ve a Configuración.`
      })
      return
    }

    setIsSaving(true)
    setMessage(null)

    try {
      const { subtotal, igv, total } = calculateTotals()
      const nextNumber = series[seriesKey].lastNumber + 1
      const debitNoteSeries = series[seriesKey].serie
      const debitNoteNumber = `${debitNoteSeries}-${String(nextNumber).padStart(8, '0')}`

      // Lectura FRESH de autoSendToSunat para decidir sunatStatus inicial.
      let shouldAutoSendToSunat = false
      try {
        const freshSettings = await getCompanySettings(getBusinessId())
        shouldAutoSendToSunat = freshSettings?.success === true && freshSettings.data?.autoSendToSunat === true
      } catch (settingsErr) {
        console.warn('No se pudo releer companySettings:', settingsErr)
        shouldAutoSendToSunat = companySettings?.autoSendToSunat === true
      }

      // Crear item con el cargo adicional
      // unitPrice debe ser el precio CON IGV (el XML generator espera priceWithIGV)
      const additionalItem = {
        name: formData.additionalDescription,
        quantity: 1,
        unitPrice: total,
        subtotal: subtotal,
        taxAffectation: '10' // Gravado con IGV
      }

      const debitNoteData = {
        documentType: 'nota_debito',
        series: debitNoteSeries,
        correlativeNumber: nextNumber,
        number: debitNoteNumber,

        // Referencia al documento modificado
        referencedDocumentId: selectedInvoice.number,
        referencedDocumentType: selectedInvoice.documentType === 'factura' ? '01' : '03',
        referencedInvoiceFirestoreId: selectedInvoice.id, // ID de Firestore para actualizar

        // Motivo
        discrepancyCode: formData.discrepancyCode,
        discrepancyReason: formData.discrepancyReason,

        // Cliente (mismo que el documento original)
        customer: selectedInvoice.customer,

        // Item con el cargo adicional
        items: [additionalItem],

        // Totales
        subtotal,
        igv,
        total,
        // Multi-divisa: la ND hereda moneda y TC de la factura original
        // (regla SUNAT). El usuario no puede cambiarlos.
        currency: normalizeCurrency(selectedInvoice.currency),
        exchangeRate: Number(selectedInvoice.exchangeRate) > 0 ? Number(selectedInvoice.exchangeRate) : 1,
        subtotalInBase: convertToBase(subtotal, selectedInvoice.currency, selectedInvoice.exchangeRate),
        igvInBase: convertToBase(igv, selectedInvoice.currency, selectedInvoice.exchangeRate),
        totalInBase: convertToBase(total, selectedInvoice.currency, selectedInvoice.exchangeRate),

        // Estado
        status: 'pending',
        sunatStatus: shouldAutoSendToSunat ? 'pending' : 'not_sent',

        // Metadata
        userId: user.uid,
        issueDate: new Date(),
        // Fecha de emisión como string YYYY-MM-DD en hora local (Perú). El backend la usa
        // directamente para SUNAT, evitando que toISOString()/UTC ruede al día siguiente de noche.
        emissionDate: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })(),

        // Información del vendedor
        createdBy: user.uid,
        createdByName: user.displayName || user.email || 'Usuario',
        createdByEmail: user.email || '',
      }

      // 1. Crear el documento en Firestore
      setMessage({ type: 'info', text: 'Creando nota de débito...' })
      const result = await createInvoice(getBusinessId(), debitNoteData)

      if (!result.success) {
        throw new Error(result.error || 'Error al crear la nota de débito')
      }

      const debitNoteId = result.id

      // 2. Enviar a SUNAT - reutiliza shouldAutoSendToSunat ya leído FRESH arriba.
      if (shouldAutoSendToSunat) {
        setMessage({ type: 'info', text: 'Enviando a SUNAT...' })

        const auth = getAuth()
        const currentUser = auth.currentUser
        if (!currentUser) {
          throw new Error('Usuario no autenticado')
        }

        const idToken = await currentUser.getIdToken()

        const sunatResponse = await fetch(SEND_DEBIT_NOTE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            userId: user.uid,
            debitNoteId: debitNoteId
          })
        })

        const sunatResult = await sunatResponse.json()

        if (sunatResponse.ok && sunatResult.success) {
          setMessage({
            type: 'success',
            text: `Nota de Débito ${debitNoteNumber} aceptada por SUNAT`
          })
          setTimeout(() => appNavigate('facturas'), 2000)
        } else if (sunatResponse.ok && sunatResult.status === 'signed') {
          setMessage({
            type: 'warning',
            text: `Nota de Débito ${debitNoteNumber} firmada pero pendiente de envío a SUNAT. ${sunatResult.message || ''}`
          })
          setTimeout(() => appNavigate('facturas'), 3000)
        } else {
          // El documento fue creado pero rechazado por SUNAT
          setMessage({
            type: 'error',
            text: sunatResult.error || sunatResult.message || 'Error al enviar a SUNAT. La nota de débito fue creada pero no aceptada.'
          })
        }
      } else {
        // Sin envío automático - solo crear el documento
        setMessage({
          type: 'success',
          text: `Nota de Débito ${debitNoteNumber} creada. Envíala a SUNAT desde la lista de comprobantes.`
        })
        setTimeout(() => appNavigate('facturas'), 2000)
      }

    } catch (error) {
      console.error('Error al crear nota de débito:', error)
      setMessage({ type: 'error', text: error.message || 'Error al crear la nota de débito' })
    } finally {
      setIsSaving(false)
    }
  }

  const totals = formData.additionalAmount > 0 ? calculateTotals() : { subtotal: 0, igv: 0, total: 0 }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Nueva Nota de Débito</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Crear nota de débito para aumentar el valor de una factura/boleta
          </p>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <Alert
          variant={message.type === 'success' ? 'success' : 'danger'}
          title={message.type === 'success' ? 'Éxito' : 'Error'}
        >
          {message.text}
        </Alert>
      )}

      {/* Warning si no hay facturas */}
      {invoices.length === 0 && (
        <Alert variant="warning" title="Sin facturas disponibles">
          No hay facturas o boletas aceptadas por SUNAT. Solo puedes crear notas de débito
          para documentos que hayan sido aceptados por SUNAT.
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Seleccionar factura original */}
        <Card>
          <CardHeader>
            <CardTitle>1. Documento a Modificar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Factura o Boleta Original
              </label>
              <Select
                value={formData.referencedInvoiceId}
                onChange={e => setFormData(prev => ({ ...prev, referencedInvoiceId: e.target.value }))}
                required
                disabled={invoices.length === 0}
              >
                <option value="">Seleccionar documento...</option>
                {invoices.map(inv => (
                  <option key={inv.id} value={inv.id}>
                    {inv.number} - {inv.customer?.name} - {formatCurrency(inv.total, inv.currency)}
                  </option>
                ))}
              </Select>
            </div>

            {selectedInvoice && (
              <div className="p-4 bg-blue-50 rounded-lg space-y-2">
                <h4 className="font-semibold text-gray-900">Documento Seleccionado</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-600">Número:</span>
                    <span className="ml-2 font-medium">{selectedInvoice.number}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Cliente:</span>
                    <span className="ml-2 font-medium">{selectedInvoice.customer?.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Total Original:</span>
                    <span className="ml-2 font-medium">{formatCurrency(selectedInvoice.total, selectedInvoice.currency)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Estado SUNAT:</span>
                    <span className="ml-2 font-medium text-green-600">Aceptado</span>
                  </div>
                  {normalizeCurrency(selectedInvoice.currency) === 'USD' && (
                    <div className="col-span-2 mt-1 pt-1 border-t border-blue-200">
                      <span className="text-[11px] text-blue-700 font-medium">
                        Moneda: USD · TC congelado: {selectedInvoice.exchangeRate || 1}
                      </span>
                      <span className="block text-[10px] text-gray-500 italic">
                        La nota de débito heredará esta moneda y TC (SUNAT lo exige).
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Motivo */}
        <Card>
          <CardHeader>
            <CardTitle>2. Motivo de la Nota de Débito</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de Cargo (Catálogo 10 SUNAT)
              </label>
              <Select
                value={formData.discrepancyCode}
                onChange={e => handleReasonChange(e.target.value)}
                required
              >
                {DEBIT_NOTE_REASONS.map(reason => (
                  <option key={reason.code} value={reason.code}>
                    {reason.code} - {reason.description}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Descripción del Motivo
              </label>
              <Input
                value={formData.discrepancyReason}
                onChange={e => setFormData(prev => ({ ...prev, discrepancyReason: e.target.value }))}
                placeholder="Ej: Intereses por pago fuera de plazo"
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Monto Adicional */}
        {selectedInvoice && (
          <Card>
            <CardHeader>
              <CardTitle>3. Monto del Cargo Adicional</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Monto Adicional (sin IGV)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.additionalAmount}
                  onChange={e => setFormData(prev => ({ ...prev, additionalAmount: e.target.value }))}
                  placeholder="0.00"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Ingresa el monto sin IGV. El IGV (18%) se calculará automáticamente.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descripción del Concepto
                </label>
                <Input
                  value={formData.additionalDescription}
                  onChange={e => setFormData(prev => ({ ...prev, additionalDescription: e.target.value }))}
                  placeholder="Ej: Intereses por mora del periodo 01/01/2025 - 15/01/2025"
                  required
                />
              </div>

              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>Nota:</strong> La Nota de Débito aumentará el monto total adeudado.
                  El nuevo total será: {formatCurrency(selectedInvoice.total, selectedInvoice.currency)} + {formatCurrency(totals.total, selectedInvoice.currency)} =
                  <strong className="ml-1">{formatCurrency(selectedInvoice.total + totals.total, selectedInvoice.currency)}</strong>
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Totales */}
        {selectedInvoice && formData.additionalAmount > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>4. Totales de la Nota de Débito</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium">{formatCurrency(totals.subtotal, selectedInvoice?.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">IGV (18%):</span>
                  <span className="font-medium">{formatCurrency(totals.igv, selectedInvoice?.currency)}</span>
                </div>
                <div className="flex justify-between text-xl font-bold border-t pt-2">
                  <span>Total a Aumentar:</span>
                  <span className="text-primary-600">{formatCurrency(totals.total, selectedInvoice?.currency)}</span>
                </div>
                {normalizeCurrency(selectedInvoice?.currency) === 'USD' && (
                  <div className="text-right text-xs text-gray-500 pt-1">
                    ≈ {formatCurrency(convertToBase(totals.total, 'USD', selectedInvoice?.exchangeRate), 'PEN')} (TC {selectedInvoice?.exchangeRate || 1})
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={isSaving || !selectedInvoice || invoices.length === 0}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando a SUNAT...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Crear y Enviar a SUNAT
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
