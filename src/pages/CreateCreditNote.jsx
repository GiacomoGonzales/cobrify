import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Loader2, FileText, AlertCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import { getInvoices, createInvoice, getDocumentSeries } from '@/services/firestoreService'
import { formatCurrency } from '@/lib/utils'

// Catálogo 09 - Tipos de nota de crédito SUNAT
const CREDIT_NOTE_REASONS = [
  { code: '01', description: 'Anulación de la operación' },
  { code: '02', description: 'Anulación por error en el RUC' },
  { code: '03', description: 'Corrección por error en la descripción' },
  { code: '06', description: 'Devolución total' },
  { code: '07', description: 'Devolución por ítem' },
  { code: '13', description: 'Otros conceptos' },
]

export default function CreateCreditNote() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const invoiceIdParam = searchParams.get('invoiceId')

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [invoices, setInvoices] = useState([])
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [series, setSeries] = useState(null)
  const [message, setMessage] = useState(null)

  // Form data
  const [formData, setFormData] = useState({
    referencedInvoiceId: invoiceIdParam || '',
    discrepancyCode: '01',
    discrepancyReason: '',
    items: [],
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
          items: invoice.items.map(item => ({ ...item, selected: true })),
          discrepancyReason: CREDIT_NOTE_REASONS.find(r => r.code === prev.discrepancyCode)?.description || ''
        }))
      }
    }
  }, [formData.referencedInvoiceId, invoices])

  const loadData = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const [invoicesResult, seriesResult] = await Promise.all([
        getInvoices(user.uid),
        getDocumentSeries(user.uid)
      ])

      if (invoicesResult.success) {
        // Solo facturas y boletas ACEPTADAS por SUNAT
        const acceptedInvoices = (invoicesResult.data || []).filter(
          inv => (inv.documentType === 'factura' || inv.documentType === 'boleta') &&
                 inv.sunatStatus === 'accepted'
        )
        setInvoices(acceptedInvoices)
      }

      if (seriesResult.success && seriesResult.data) {
        setSeries(seriesResult.data)
      }
    } catch (error) {
      console.error('Error:', error)
      setMessage({ type: 'error', text: 'Error al cargar datos' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleReasonChange = (code) => {
    const reason = CREDIT_NOTE_REASONS.find(r => r.code === code)
    setFormData(prev => ({
      ...prev,
      discrepancyCode: code,
      discrepancyReason: reason?.description || ''
    }))
  }

  const handleItemToggle = (index) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, selected: !item.selected } : item
      )
    }))
  }

  const handleItemQuantityChange = (index, newQuantity) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => {
        if (i !== index) return item
        const quantity = Math.max(0, Math.min(newQuantity, item.originalQuantity || item.quantity))
        const subtotal = quantity * item.unitPrice
        return {
          ...item,
          quantity,
          subtotal
        }
      })
    }))
  }

  const calculateTotals = () => {
    const selectedItems = formData.items.filter(item => item.selected)
    const subtotal = selectedItems.reduce((sum, item) => sum + item.subtotal, 0)
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

    const selectedItems = formData.items.filter(item => item.selected)
    if (selectedItems.length === 0) {
      setMessage({ type: 'error', text: 'Debes seleccionar al menos un ítem' })
      return
    }

    // Verificar que existe la serie para notas de crédito
    if (!series || !series.nota_credito) {
      setMessage({
        type: 'error',
        text: 'No se ha configurado la serie para Notas de Crédito. Ve a Configuración.'
      })
      return
    }

    setIsSaving(true)

    try {
      const { subtotal, igv, total } = calculateTotals()
      const nextNumber = series.nota_credito.lastNumber + 1
      const creditNoteSeries = series.nota_credito.serie
      const creditNoteNumber = `${creditNoteSeries}-${String(nextNumber).padStart(8, '0')}`

      const creditNoteData = {
        documentType: 'nota_credito',
        series: creditNoteSeries,
        correlativeNumber: nextNumber,
        number: creditNoteNumber,

        // Referencia al documento modificado
        referencedDocumentId: selectedInvoice.number,
        referencedDocumentType: selectedInvoice.documentType === 'factura' ? '01' : '03',

        // Motivo
        discrepancyCode: formData.discrepancyCode,
        discrepancyReason: formData.discrepancyReason,

        // Cliente (mismo que el documento original)
        customer: selectedInvoice.customer,

        // Items seleccionados
        items: selectedItems.map(item => ({
          ...item,
          originalQuantity: item.quantity // Guardar cantidad original para referencia
        })),

        // Totales
        subtotal,
        igv,
        total,
        currency: selectedInvoice.currency || 'PEN',

        // Estado
        status: 'pending',
        sunatStatus: 'pending',

        // Metadata
        userId: user.uid,
        issueDate: new Date(),

        // Información del vendedor
        createdBy: user.uid,
        createdByName: user.displayName || user.email || 'Usuario',
        createdByEmail: user.email || '',
      }

      const result = await createInvoice(user.uid, creditNoteData)

      if (result.success) {
        setMessage({ type: 'success', text: 'Nota de Crédito creada exitosamente' })
        setTimeout(() => navigate('/facturas'), 2000)
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al crear nota de crédito:', error)
      setMessage({ type: 'error', text: error.message || 'Error al crear la nota de crédito' })
    } finally {
      setIsSaving(false)
    }
  }

  const totals = formData.items.length > 0 ? calculateTotals() : { subtotal: 0, igv: 0, total: 0 }

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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Nueva Nota de Crédito</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Crear nota de crédito para anular o corregir una factura/boleta
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
          No hay facturas o boletas aceptadas por SUNAT. Solo puedes crear notas de crédito
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
                    {inv.number} - {inv.customer?.name} - {formatCurrency(inv.total)}
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
                    <span className="text-gray-600">Total:</span>
                    <span className="ml-2 font-medium">{formatCurrency(selectedInvoice.total)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Estado SUNAT:</span>
                    <span className="ml-2 font-medium text-green-600">Aceptado</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Motivo */}
        <Card>
          <CardHeader>
            <CardTitle>2. Motivo de la Nota de Crédito</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de Modificación (Catálogo 09 SUNAT)
              </label>
              <Select
                value={formData.discrepancyCode}
                onChange={e => handleReasonChange(e.target.value)}
                required
              >
                {CREDIT_NOTE_REASONS.map(reason => (
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
                placeholder="Ej: Devolución de mercadería defectuosa"
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Items */}
        {selectedInvoice && (
          <Card>
            <CardHeader>
              <CardTitle>3. Items a Incluir en la Nota</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {formData.items.map((item, index) => (
                  <div
                    key={index}
                    className={`p-4 border rounded-lg ${
                      item.selected ? 'border-primary-500 bg-primary-50' : 'border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => handleItemToggle(index)}
                        className="mt-1"
                      />
                      <div className="flex-1 space-y-2">
                        <div className="flex justify-between">
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-sm text-gray-600">
                              Precio unitario: {formatCurrency(item.unitPrice)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{formatCurrency(item.subtotal)}</p>
                          </div>
                        </div>

                        {item.selected && (
                          <div className="flex items-center gap-2">
                            <label className="text-sm text-gray-600">Cantidad:</label>
                            <Input
                              type="number"
                              min="0"
                              max={item.originalQuantity || item.quantity}
                              value={item.quantity}
                              onChange={e => handleItemQuantityChange(index, parseFloat(e.target.value) || 0)}
                              className="w-24"
                            />
                            <span className="text-sm text-gray-500">
                              / {item.originalQuantity || item.quantity}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Totales */}
        {selectedInvoice && (
          <Card>
            <CardHeader>
              <CardTitle>4. Totales de la Nota de Crédito</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">IGV (18%):</span>
                  <span className="font-medium">{formatCurrency(totals.igv)}</span>
                </div>
                <div className="flex justify-between text-xl font-bold border-t pt-2">
                  <span>Total:</span>
                  <span className="text-primary-600">{formatCurrency(totals.total)}</span>
                </div>
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
                Creando...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-2" />
                Crear Nota de Crédito
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
