import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Loader2, FileText, AlertCircle, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import { getInvoices, createInvoice, updateInvoice, getDocumentSeries, updateDocumentSeries } from '@/services/firestoreService'
import { formatCurrency } from '@/lib/utils'

// Modos de creación de nota de crédito
const CREDIT_NOTE_MODES = {
  COBRIFY: 'cobrify',
  EXTERNAL: 'external'
}

// Catálogo 09 - Tipos de nota de crédito SUNAT (completo)
const CREDIT_NOTE_REASONS = [
  { code: '01', description: 'Anulación de la operación' },
  { code: '02', description: 'Anulación por error en el RUC' },
  { code: '03', description: 'Corrección por error en la descripción' },
  { code: '04', description: 'Descuento global' },
  { code: '05', description: 'Descuento por ítem' },
  { code: '06', description: 'Devolución total' },
  { code: '07', description: 'Devolución por ítem' },
  { code: '08', description: 'Bonificación' },
  { code: '09', description: 'Disminución en el valor' },
  { code: '10', description: 'Otros conceptos tributarios' },
  { code: '11', description: 'Ajustes de operaciones de exportación' },
  { code: '12', description: 'Ajustes - montos y/o fechas de pago' },
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

  // Modo de nota de crédito (Cobrify o Externa)
  const [mode, setMode] = useState(invoiceIdParam ? CREDIT_NOTE_MODES.COBRIFY : CREDIT_NOTE_MODES.COBRIFY)

  // Form data para factura de Cobrify
  const [formData, setFormData] = useState({
    referencedInvoiceId: invoiceIdParam || '',
    discrepancyCode: '01',
    discrepancyReason: '',
    items: [],
  })

  // Form data para factura externa
  const [externalData, setExternalData] = useState({
    documentNumber: '', // Serie-Correlativo (ej: F001-00001234)
    documentType: '01', // 01 = Factura, 03 = Boleta
    issueDate: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })(),
    customerDocType: '6', // 6 = RUC, 1 = DNI
    customerDocNumber: '',
    customerName: '',
    items: [{ description: '', quantity: 1, unitPrice: 0, subtotal: 0 }],
    discrepancyCode: '01',
    discrepancyReason: 'Anulación de la operación',
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

  // === Handlers para factura externa ===
  const handleExternalReasonChange = (code) => {
    const reason = CREDIT_NOTE_REASONS.find(r => r.code === code)
    setExternalData(prev => ({
      ...prev,
      discrepancyCode: code,
      discrepancyReason: reason?.description || ''
    }))
  }

  const handleExternalItemChange = (index, field, value) => {
    setExternalData(prev => {
      const newItems = [...prev.items]
      newItems[index] = { ...newItems[index], [field]: value }

      // Recalcular subtotal si cambia cantidad o precio
      if (field === 'quantity' || field === 'unitPrice') {
        const qty = field === 'quantity' ? parseFloat(value) || 0 : parseFloat(newItems[index].quantity) || 0
        const price = field === 'unitPrice' ? parseFloat(value) || 0 : parseFloat(newItems[index].unitPrice) || 0
        newItems[index].subtotal = qty * price
      }

      return { ...prev, items: newItems }
    })
  }

  const addExternalItem = () => {
    setExternalData(prev => ({
      ...prev,
      items: [...prev.items, { description: '', quantity: 1, unitPrice: 0, subtotal: 0 }]
    }))
  }

  const removeExternalItem = (index) => {
    setExternalData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }))
  }

  const calculateExternalTotals = () => {
    const totalConIgv = externalData.items.reduce((sum, item) => sum + (parseFloat(item.subtotal) || 0), 0)
    const subtotal = totalConIgv / 1.18 // Asumimos IGV 18%
    const igv = totalConIgv - subtotal
    return { subtotal, igv, total: totalConIgv }
  }

  const calculateTotals = () => {
    const selectedItems = formData.items.filter(item => item.selected)

    // item.subtotal YA INCLUYE IGV (es el precio final que pagó el cliente)
    const totalConIgv = selectedItems.reduce((sum, item) => sum + item.subtotal, 0)

    // Usar la tasa IGV del documento original (si está exonerado, IGV = 0)
    const igvRate = selectedInvoice?.taxConfig?.igvRate ?? 18
    const igvExempt = selectedInvoice?.taxConfig?.igvExempt ?? false

    // Extraer el IGV del total (no sumarlo)
    // Total = Subtotal + IGV = Subtotal * (1 + igvRate/100)
    // Subtotal = Total / (1 + igvRate/100)
    const subtotal = igvExempt ? totalConIgv : totalConIgv / (1 + igvRate / 100)
    const igv = igvExempt ? 0 : totalConIgv - subtotal
    const total = totalConIgv // El total es lo que el cliente pagó

    return { subtotal, igv, total, igvRate, igvExempt }
  }

  // Handler para factura externa
  const handleExternalSubmit = async (e) => {
    e.preventDefault()

    if (!user?.uid) return

    // Validaciones
    if (!externalData.documentNumber) {
      setMessage({ type: 'error', text: 'Debes ingresar el número del documento original' })
      return
    }

    // Validar formato de número de documento (Serie-Correlativo)
    const docNumberPattern = /^[FB]\d{3}-\d{1,8}$/i
    if (!docNumberPattern.test(externalData.documentNumber)) {
      setMessage({ type: 'error', text: 'El número de documento debe tener formato Serie-Correlativo (ej: F001-00001234)' })
      return
    }

    if (!externalData.customerDocNumber || !externalData.customerName) {
      setMessage({ type: 'error', text: 'Debes ingresar los datos del cliente' })
      return
    }

    const validItems = externalData.items.filter(item => item.description && item.subtotal > 0)
    if (validItems.length === 0) {
      setMessage({ type: 'error', text: 'Debes ingresar al menos un ítem con descripción y monto' })
      return
    }

    // Determinar qué serie usar según el tipo de documento referenciado
    const isFactura = externalData.documentType === '01'
    const seriesKey = isFactura ? 'nota_credito_factura' : 'nota_credito_boleta'
    const seriesName = isFactura ? 'Notas de Crédito de Facturas' : 'Notas de Crédito de Boletas'

    if (!series || !series[seriesKey]) {
      setMessage({
        type: 'error',
        text: `No se ha configurado la serie para ${seriesName}. Ve a Configuración.`
      })
      return
    }

    setIsSaving(true)

    try {
      const { subtotal, igv, total } = calculateExternalTotals()
      const nextNumber = series[seriesKey].lastNumber + 1
      const creditNoteSeries = series[seriesKey].serie
      const creditNoteNumber = `${creditNoteSeries}-${String(nextNumber).padStart(8, '0')}`

      const creditNoteData = {
        documentType: 'nota_credito',
        series: creditNoteSeries,
        correlativeNumber: nextNumber,
        number: creditNoteNumber,

        // Referencia al documento externo
        referencedDocumentId: externalData.documentNumber.toUpperCase(),
        referencedDocumentType: externalData.documentType,
        referencedInvoiceFirestoreId: null, // No hay ID de Firestore
        isExternalReference: true, // Marcar como referencia externa

        // Motivo
        discrepancyCode: externalData.discrepancyCode,
        discrepancyReason: externalData.discrepancyReason,

        // Cliente
        customer: {
          documentType: externalData.customerDocType,
          documentNumber: externalData.customerDocNumber,
          name: externalData.customerName,
        },

        // Items
        items: validItems.map((item, idx) => ({
          name: item.description,
          description: item.description,
          quantity: parseFloat(item.quantity) || 1,
          unitPrice: parseFloat(item.unitPrice) || 0,
          subtotal: parseFloat(item.subtotal) || 0,
          unit: 'NIU',
          productId: null,
        })),

        // Totales
        subtotal,
        igv,
        total,
        currency: 'PEN',

        // Configuración de impuestos
        taxConfig: {
          igvRate: 18,
          igvExempt: false,
          exemptionReason: ''
        },

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
        // Incrementar el número de serie
        const updatedSeries = {
          ...series,
          [seriesKey]: {
            ...series[seriesKey],
            lastNumber: nextNumber
          }
        }
        await updateDocumentSeries(user.uid, updatedSeries)

        setMessage({ type: 'success', text: 'Nota de Crédito creada exitosamente' })
        setTimeout(() => navigate('/app/facturas'), 2000)
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

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Si es modo externo, usar el handler de externo
    if (mode === CREDIT_NOTE_MODES.EXTERNAL) {
      return handleExternalSubmit(e)
    }

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

    // Determinar qué serie usar según el tipo de documento referenciado
    const isFactura = selectedInvoice.documentType === 'factura'
    const seriesKey = isFactura ? 'nota_credito_factura' : 'nota_credito_boleta'
    const seriesName = isFactura ? 'Notas de Crédito de Facturas' : 'Notas de Crédito de Boletas'

    // Verificar que existe la serie para notas de crédito
    if (!series || !series[seriesKey]) {
      setMessage({
        type: 'error',
        text: `No se ha configurado la serie para ${seriesName}. Ve a Configuración.`
      })
      return
    }

    setIsSaving(true)

    try {
      const { subtotal, igv, total, igvRate, igvExempt } = calculateTotals()
      const nextNumber = series[seriesKey].lastNumber + 1
      const creditNoteSeries = series[seriesKey].serie
      const creditNoteNumber = `${creditNoteSeries}-${String(nextNumber).padStart(8, '0')}`

      const creditNoteData = {
        documentType: 'nota_credito',
        series: creditNoteSeries,
        correlativeNumber: nextNumber,
        number: creditNoteNumber,

        // Referencia al documento modificado
        referencedDocumentId: selectedInvoice.number,
        referencedDocumentType: selectedInvoice.documentType === 'factura' ? '01' : '03',
        referencedInvoiceFirestoreId: selectedInvoice.id, // ID de Firestore para referencia

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

        // Configuración de impuestos (heredada del documento original)
        taxConfig: {
          igvRate: igvRate,
          igvExempt: igvExempt,
          exemptionReason: selectedInvoice?.taxConfig?.exemptionReason || ''
        },

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
        // Incrementar el número de serie después de crear exitosamente
        const updatedSeries = {
          ...series,
          [seriesKey]: {
            ...series[seriesKey],
            lastNumber: nextNumber
          }
        }
        await updateDocumentSeries(user.uid, updatedSeries)

        // Actualizar la boleta/factura original para marcarla como pendiente de anulación
        // Esto asegura que no se cuente en el Dashboard/Caja hasta que SUNAT procese la NC
        const isFullCancellation = Math.abs(selectedInvoice.total - total) < 0.01
        const newStatus = isFullCancellation ? 'pending_cancellation' : 'partial_refund_pending'

        await updateInvoice(user.uid, selectedInvoice.id, {
          status: newStatus,
          pendingCreditNoteId: result.id,
          pendingCreditNoteNumber: creditNoteNumber,
          pendingCreditNoteTotal: total
        })

        // Devolver stock si es una devolución o anulación (códigos 01, 06, 07)
        const stockReturnCodes = ['01', '06', '07']
        if (stockReturnCodes.includes(formData.discrepancyCode)) {
          try {
            const { updateWarehouseStock, createStockMovement } = await import('@/services/warehouseService')
            const { getProducts, updateProduct } = await import('@/services/firestoreService')

            const productsResult = await getProducts(user.uid)
            const products = productsResult.success ? productsResult.data : []
            const warehouseId = selectedInvoice.warehouseId || ''

            // Solo devolver los items seleccionados en la nota de crédito
            const itemsToReturn = formData.items.filter(item => item.selected)

            for (const item of itemsToReturn) {
              if (item.productId) {
                const productData = products.find(p => p.id === item.productId)
                if (!productData) continue
                if (productData.trackStock === false || productData.stock === null) continue

                const quantityToRestore = item.quantity * (item.presentationFactor || 1)

                const updatedProduct = updateWarehouseStock(
                  productData,
                  warehouseId,
                  quantityToRestore
                )

                await updateProduct(user.uid, item.productId, {
                  stock: updatedProduct.stock,
                  warehouseStocks: updatedProduct.warehouseStocks
                })

                await createStockMovement(user.uid, {
                  productId: item.productId,
                  warehouseId: warehouseId,
                  type: 'entry',
                  quantity: quantityToRestore,
                  reason: 'Nota de crédito',
                  referenceType: 'credit_note',
                  referenceId: result.id,
                  referenceNumber: creditNoteNumber,
                  userId: user.uid,
                  notes: `Stock devuelto por NC ${creditNoteNumber} - ${formData.discrepancyReason}`
                })

                console.log(`✅ Stock restaurado para ${item.name}: +${quantityToRestore}`)
              }
            }
          } catch (stockError) {
            console.warn('Error al devolver stock:', stockError)
            // No fallar la operación si hay error de stock
          }
        }

        setMessage({ type: 'success', text: 'Nota de Crédito creada exitosamente. Stock restaurado.' })
        setTimeout(() => navigate('/app/facturas'), 2000)
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
  const externalTotals = externalData.items.length > 0 ? calculateExternalTotals() : { subtotal: 0, igv: 0, total: 0 }

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

      {/* Tabs para elegir modo */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setMode(CREDIT_NOTE_MODES.COBRIFY)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            mode === CREDIT_NOTE_MODES.COBRIFY
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Factura de Cobrify
        </button>
        <button
          type="button"
          onClick={() => setMode(CREDIT_NOTE_MODES.EXTERNAL)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            mode === CREDIT_NOTE_MODES.EXTERNAL
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Factura Externa
        </button>
      </div>

      {/* Formulario según el modo */}
      {mode === CREDIT_NOTE_MODES.COBRIFY ? (
        <>
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
                              step="any"
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
        </>
      ) : (
        /* Formulario para Factura Externa */
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Info */}
          <Alert variant="info" title="Nota de Crédito para Factura Externa">
            Usa esta opción para crear una nota de crédito que haga referencia a una factura o boleta
            emitida en otro sistema (Efact, SUNAT, etc.). Ingresa los datos del documento original manualmente.
          </Alert>

          {/* Documento Original */}
          <Card>
            <CardHeader>
              <CardTitle>1. Documento Original a Modificar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tipo de Documento
                  </label>
                  <Select
                    value={externalData.documentType}
                    onChange={e => setExternalData(prev => ({ ...prev, documentType: e.target.value }))}
                    required
                  >
                    <option value="01">Factura</option>
                    <option value="03">Boleta de Venta</option>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Número de Documento
                  </label>
                  <Input
                    value={externalData.documentNumber}
                    onChange={e => setExternalData(prev => ({ ...prev, documentNumber: e.target.value.toUpperCase() }))}
                    placeholder="F001-00001234"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Formato: Serie-Correlativo (ej: F001-00001234)</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Datos del Cliente */}
          <Card>
            <CardHeader>
              <CardTitle>2. Datos del Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tipo de Documento
                  </label>
                  <Select
                    value={externalData.customerDocType}
                    onChange={e => setExternalData(prev => ({ ...prev, customerDocType: e.target.value }))}
                    required
                  >
                    <option value="6">RUC</option>
                    <option value="1">DNI</option>
                    <option value="4">Carnet de Extranjería</option>
                    <option value="7">Pasaporte</option>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Número de Documento
                  </label>
                  <Input
                    value={externalData.customerDocNumber}
                    onChange={e => setExternalData(prev => ({ ...prev, customerDocNumber: e.target.value }))}
                    placeholder={externalData.customerDocType === '6' ? '20123456789' : '12345678'}
                    required
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Razón Social / Nombre
                  </label>
                  <Input
                    value={externalData.customerName}
                    onChange={e => setExternalData(prev => ({ ...prev, customerName: e.target.value }))}
                    placeholder="Nombre o Razón Social"
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Motivo */}
          <Card>
            <CardHeader>
              <CardTitle>3. Motivo de la Nota de Crédito</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Modificación (Catálogo 09 SUNAT)
                </label>
                <Select
                  value={externalData.discrepancyCode}
                  onChange={e => handleExternalReasonChange(e.target.value)}
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
                  value={externalData.discrepancyReason}
                  onChange={e => setExternalData(prev => ({ ...prev, discrepancyReason: e.target.value }))}
                  placeholder="Ej: Anulación de factura emitida en Efact"
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>4. Items de la Nota de Crédito</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addExternalItem}
              >
                <Plus className="w-4 h-4 mr-1" />
                Agregar Item
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {externalData.items.map((item, index) => (
                  <div key={index} className="p-4 border rounded-lg bg-gray-50 space-y-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div className="sm:col-span-2">
                          <label className="block text-xs text-gray-600 mb-1">Descripción</label>
                          <Input
                            value={item.description}
                            onChange={e => handleExternalItemChange(index, 'description', e.target.value)}
                            placeholder="Descripción del item"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Cantidad</label>
                          <Input
                            type="number"
                            min="0.01"
                            step="any"
                            value={item.quantity}
                            onChange={e => handleExternalItemChange(index, 'quantity', e.target.value)}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Precio Unit. (c/IGV)</label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={e => handleExternalItemChange(index, 'unitPrice', e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      {externalData.items.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeExternalItem(index)}
                          className="text-red-500 hover:text-red-700 mt-5"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <div className="text-right text-sm">
                      <span className="text-gray-600">Subtotal: </span>
                      <span className="font-semibold">{formatCurrency(item.subtotal)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Totales */}
          <Card>
            <CardHeader>
              <CardTitle>5. Totales de la Nota de Crédito</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium">{formatCurrency(externalTotals.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">IGV (18%):</span>
                  <span className="font-medium">{formatCurrency(externalTotals.igv)}</span>
                </div>
                <div className="flex justify-between text-xl font-bold border-t pt-2">
                  <span>Total:</span>
                  <span className="text-primary-600">{formatCurrency(externalTotals.total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

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
              disabled={isSaving}
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
      )}
    </div>
  )
}
