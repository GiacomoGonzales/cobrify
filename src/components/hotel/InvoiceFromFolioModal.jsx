import { useState, useEffect } from 'react'
import { Loader2, Search, Receipt } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { formatCurrency } from '@/lib/utils'
import { getCompanySettings, getNextDocumentNumber, createInvoice, sendInvoiceToSunat } from '@/services/firestoreService'
import { consultarDNI, consultarRUC } from '@/services/documentLookupService'
import { calculateMixedInvoiceAmounts } from '@/utils/peruUtils'

const PAYMENT_METHODS = [
  { value: 'Efectivo', label: 'Efectivo' },
  { value: 'Tarjeta', label: 'Tarjeta' },
  { value: 'Transferencia', label: 'Transferencia' },
  { value: 'Yape', label: 'Yape' },
  { value: 'Plin', label: 'Plin' },
]

const CHARGE_TYPE_LABELS = {
  room_night: 'Noche',
  restaurant: 'Restaurante',
  pool: 'Piscina',
  minibar: 'Minibar',
  laundry: 'Lavandería',
  service: 'Servicio',
  other: 'Otro',
}

export default function InvoiceFromFolioModal({ isOpen, onClose, reservation, charges, total, onInvoiceCreated }) {
  const { user, isDemoMode, getBusinessId } = useAppContext()
  const toast = useToast()
  const businessId = getBusinessId()

  // State
  const [documentType, setDocumentType] = useState('boleta')
  const [customerDocType, setCustomerDocType] = useState('DNI')
  const [customerDocNumber, setCustomerDocNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerBusinessName, setCustomerBusinessName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Efectivo')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [taxConfig, setTaxConfig] = useState({ igvRate: 18, igvExempt: false, taxType: 'standard' })
  const [companySettings, setCompanySettings] = useState(null)

  // Pre-fill from reservation when modal opens
  useEffect(() => {
    if (isOpen && reservation) {
      setCustomerDocType(reservation.documentType || 'DNI')
      setCustomerDocNumber(reservation.documentNumber || '')
      setCustomerName(reservation.guestName || '')
      setCustomerEmail(reservation.email || '')
      setCustomerBusinessName('')
      setCustomerAddress('')
      // Default to factura if RUC
      if (reservation.documentType === 'RUC') {
        setDocumentType('factura')
      } else {
        setDocumentType('boleta')
      }
      setPaymentMethod('Efectivo')
      loadCompanySettings()
    }
  }, [isOpen, reservation])

  const loadCompanySettings = async () => {
    if (!businessId) return
    const result = await getCompanySettings(businessId)
    if (result.success && result.data) {
      setCompanySettings(result.data)
      const tc = result.data.emissionConfig?.taxConfig
      if (tc) {
        setTaxConfig({
          igvRate: tc.igvRate === 10 ? 10.5 : (tc.igvRate ?? 18),
          igvExempt: tc.igvExempt ?? false,
          exemptionReason: tc.exemptionReason ?? '',
          exemptionCode: tc.exemptionCode ?? '10',
          taxType: tc.taxType || (tc.igvExempt ? 'exempt' : 'standard'),
        })
      }
    }
  }

  // Convert charges to invoice items
  const getInvoiceItems = () => {
    const defaultAffectation = taxConfig.igvExempt ? '20' : '10'
    return charges.map(charge => ({
      price: charge.amount,
      quantity: 1,
      taxAffectation: defaultAffectation,
    }))
  }

  const amounts = calculateMixedInvoiceAmounts(getInvoiceItems(), taxConfig.igvRate)

  // Lookup DNI/RUC
  const handleLookup = async () => {
    if (!customerDocNumber) return
    setIsLookingUp(true)
    try {
      if (customerDocType === 'DNI' && customerDocNumber.length === 8) {
        const result = await consultarDNI(customerDocNumber)
        if (result.success && result.data) {
          const name = result.data.nombreCompleto
            || `${result.data.nombres || ''} ${result.data.apellidoPaterno || ''} ${result.data.apellidoMaterno || ''}`.trim()
          setCustomerName(name)
        } else {
          toast.error(result.error || 'No se encontró el DNI')
        }
      } else if (customerDocType === 'RUC' && customerDocNumber.length === 11) {
        const result = await consultarRUC(customerDocNumber)
        if (result.success && result.data) {
          const name = result.data.razonSocial || result.data.nombreComercial || ''
          setCustomerBusinessName(name)
          setCustomerName(name)
          setCustomerAddress(result.data.direccion || '')
        } else {
          toast.error(result.error || 'No se encontró el RUC')
        }
      } else {
        toast.error(customerDocType === 'DNI' ? 'DNI debe tener 8 dígitos' : 'RUC debe tener 11 dígitos')
      }
    } catch {
      toast.error('Error al consultar documento')
    } finally {
      setIsLookingUp(false)
    }
  }

  // Auto-switch doc type when document type changes
  const handleDocumentTypeChange = (newDocType) => {
    setDocumentType(newDocType)
    if (newDocType === 'factura') {
      setCustomerDocType('RUC')
    } else if (customerDocType === 'RUC' && newDocType !== 'factura') {
      setCustomerDocType('DNI')
    }
  }

  // Generate invoice
  const handleGenerate = async () => {
    // Validations
    if (documentType === 'factura') {
      if (customerDocType !== 'RUC' || !customerDocNumber || customerDocNumber.length !== 11) {
        toast.error('Para factura se requiere RUC de 11 dígitos')
        return
      }
      if (!customerBusinessName && !customerName) {
        toast.error('Ingrese la razón social del cliente')
        return
      }
    }

    if (!charges || charges.length === 0) {
      toast.error('No hay cargos para facturar')
      return
    }

    // Demo mode
    if (isDemoMode) {
      toast.success('Comprobante generado exitosamente (DEMO)')
      onInvoiceCreated?.('demo-invoice-id')
      return
    }

    setIsProcessing(true)
    try {
      // Get next document number
      const numberResult = await getNextDocumentNumber(businessId, documentType)
      if (!numberResult.success) {
        toast.error('Error al obtener número de documento: ' + (numberResult.error || ''))
        return
      }

      // Build items array
      const defaultAffectation = taxConfig.igvExempt ? '20' : '10'
      const items = charges.map(charge => ({
        productId: null,
        code: '',
        name: charge.description || `${CHARGE_TYPE_LABELS[charge.chargeType] || 'Servicio'} - ${charge.date || ''}`,
        quantity: 1,
        unit: 'ZZ',
        unitPrice: charge.amount,
        subtotal: charge.amount,
        taxAffectation: defaultAffectation,
      }))

      const emissionDate = new Date().toISOString().split('T')[0]

      const invoiceData = {
        number: numberResult.number,
        series: numberResult.series,
        correlativeNumber: numberResult.correlativeNumber,
        documentType,
        customer: {
          documentType: customerDocType,
          documentNumber: customerDocNumber || '00000000',
          name: documentType === 'factura'
            ? (customerBusinessName || customerName || 'Cliente')
            : (customerName || customerBusinessName || 'Cliente'),
          businessName: customerBusinessName || '',
          email: customerEmail || '',
          phone: reservation?.phone || '',
          address: customerAddress || '',
        },
        items,
        subtotal: amounts.subtotal,
        subtotalBeforeDiscount: amounts.subtotal,
        discount: 0,
        globalDiscount: 0,
        discountPercentage: 0,
        igv: amounts.igv,
        igvByRate: amounts.igvByRate || {},
        total: amounts.total,
        opGravadas: amounts.gravado?.total || 0,
        opExoneradas: amounts.exonerado?.total || 0,
        opInafectas: amounts.inafecto?.total || 0,
        taxConfig,
        recargoConsumo: 0,
        recargoConsumoRate: 0,
        payments: [{ method: paymentMethod, amount: amounts.total }],
        paymentMethod,
        status: 'paid',
        notes: `Reserva: ${reservation?.guestName || ''} - Hab. ${reservation?.roomNumber || ''}`,
        sunatStatus: (documentType === 'factura' || documentType === 'boleta') ? 'pending' : 'not_applicable',
        sunatResponse: null,
        sunatSentAt: null,
        emissionDate,
        createdBy: user?.uid || '',
        createdByName: user?.displayName || user?.email || 'Usuario',
        createdByEmail: user?.email || '',
        hotelReservationId: reservation?.id || null,
        // Factura fields
        ...(documentType === 'factura' && {
          paymentType: 'contado',
          paymentDueDate: null,
          paymentInstallments: [],
        }),
      }

      const result = await createInvoice(businessId, invoiceData)
      if (!result.success) {
        toast.error('Error al crear comprobante: ' + (result.error || ''))
        return
      }

      // Auto-send to SUNAT if enabled.
      // Lectura FRESH para evitar stale state si el toggle fue apagado tras
      // cargar la página.
      const canSendToSunat = documentType === 'factura' || documentType === 'boleta'
      let shouldAutoSend = false
      try {
        const freshSettings = await getCompanySettings(businessId)
        shouldAutoSend = freshSettings?.success === true && freshSettings.data?.autoSendToSunat === true
      } catch (settingsErr) {
        console.warn('No se pudo releer companySettings:', settingsErr)
        shouldAutoSend = companySettings?.autoSendToSunat === true
      }
      if (shouldAutoSend && canSendToSunat) {
        sendInvoiceToSunat(businessId, result.id)
          .then(() => toast.success('Comprobante aceptado por SUNAT', 4000))
          .catch(() => toast.warning('Error al enviar a SUNAT. Reenvíe desde Ventas.', 5000))
      }

      toast.success('Comprobante generado exitosamente')
      onInvoiceCreated?.(result.id)
    } catch (error) {
      console.error('Error generating invoice from folio:', error)
      toast.error('Error al generar comprobante')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Generar Comprobante" size="lg">
      <div className="space-y-4">
        {/* Document type selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de documento</label>
          <div className="flex gap-2">
            {[
              { value: 'boleta', label: 'Boleta' },
              { value: 'factura', label: 'Factura' },
              { value: 'nota_venta', label: 'Nota de Venta' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleDocumentTypeChange(opt.value)}
                className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg border transition-colors ${
                  documentType === opt.value
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Customer data */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">Datos del cliente</label>
          <div className="flex gap-2">
            <div className="w-28">
              <Select
                value={customerDocType}
                onChange={(e) => setCustomerDocType(e.target.value)}
              >
                <option value="DNI">DNI</option>
                <option value="RUC">RUC</option>
                <option value="CE">CE</option>
                <option value="Pasaporte">Pasaporte</option>
              </Select>
            </div>
            <div className="flex-1">
              <Input
                placeholder="Número de documento"
                value={customerDocNumber}
                onChange={(e) => setCustomerDocNumber(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLookup}
              disabled={isLookingUp}
              className="px-3"
            >
              {isLookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
          <Input
            placeholder={documentType === 'factura' ? 'Razón social' : 'Nombre del cliente'}
            value={documentType === 'factura' ? customerBusinessName : customerName}
            onChange={(e) => documentType === 'factura' ? setCustomerBusinessName(e.target.value) : setCustomerName(e.target.value)}
          />
          {documentType === 'factura' && (
            <Input
              placeholder="Dirección"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
            />
          )}
        </div>

        {/* Items summary */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Detalle de cargos ({charges.length})</label>
          <div className="max-h-[200px] overflow-y-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Descripción</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {charges.map((charge, idx) => (
                  <tr key={charge.id || idx}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{charge.description}</p>
                      <p className="text-xs text-gray-500">
                        {CHARGE_TYPE_LABELS[charge.chargeType] || charge.chargeType}
                        {charge.date && ` · ${charge.date}`}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(charge.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals */}
        <div className="bg-gray-50 rounded-lg p-3 space-y-1">
          {!taxConfig.igvExempt && (
            <>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span>{formatCurrency(amounts.gravado?.subtotal || amounts.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>IGV ({taxConfig.igvRate}%)</span>
                <span>{formatCurrency(amounts.igv)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between text-base font-bold border-t pt-1">
            <span>Total</span>
            <span>{formatCurrency(amounts.total)}</span>
          </div>
        </div>

        {/* Payment method */}
        <Select
          label="Método de pago"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
        >
          {PAYMENT_METHODS.map(pm => (
            <option key={pm.value} value={pm.value}>{pm.label}</option>
          ))}
        </Select>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={isProcessing}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handleGenerate} disabled={isProcessing}>
            {isProcessing ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Generando...</>
            ) : (
              <><Receipt className="w-4 h-4 mr-1" /> Generar Comprobante</>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
