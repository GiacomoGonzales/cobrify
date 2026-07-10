import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { ArrowLeft, Loader2, FileText, AlertCircle, Plus, Trash2, Search, Wallet, Banknote } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useLocationAccess } from '@/utils/locationAccess'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import { getInvoicesPage, createInvoice, updateInvoice, getDocumentSeries, updateDocumentSeries, updateProductStockTransaction, sendCreditNoteToSunat, getCompanySettings } from '@/services/firestoreService'
import { formatCurrency } from '@/lib/utils'
import { normalizeCurrency, convertToBase } from '@/utils/currency'
import { consultarRUC, consultarDNI } from '@/services/documentLookupService'

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

// Códigos de motivo que permiten "Descuento global por monto fijo".
// Cuando el usuario elige uno de estos, aparece la opción de ingresar un monto
// directo en S/ en vez de jugar con cantidades de items.
const GLOBAL_DISCOUNT_CODES = ['04', '05', '09']

// SUNAT prohíbe estos motivos sobre BOLETAS de venta (solo se permiten en
// facturas). Referencia: Guía de elaboración de Nota de Crédito Electrónica
// UBL 2.1, sección 8: "para el caso de boletas de venta, no es posible
// emitir Notas de crédito con motivos 04 (descuento global), 05 (descuento
// por ítem) ni 08 (bonificación)".
const BOLETA_DISALLOWED_CODES = ['04', '05', '08']

export default function CreateCreditNote() {
  const { user, getBusinessId } = useAuth()
  // Sanear por sucursal/almacén permitido: el sub-usuario solo puede referenciar
  // comprobantes de sus ubicaciones (mismo criterio que la página Ventas).
  const canAccessInvoice = useLocationAccess()
  const navigate = useNavigate()
  const appNavigate = useAppNavigate()
  const [searchParams] = useSearchParams()
  const invoiceIdParam = searchParams.get('invoiceId')

  const [isLoading, setIsLoading] = useState(true)
  // Guard síncrono contra doble click. `isSaving` solo deshabilita el botón
  // visualmente, pero hay un race window donde clicks consecutivos rápidos
  // disparan handleSubmit en paralelo y crean N notas de crédito duplicadas.
  // Este ref se actualiza sincrónicamente y bloquea desde el primer click.
  const submitGuardRef = useRef(false)
  const [isSaving, setIsSaving] = useState(false)
  const [invoices, setInvoices] = useState([])
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [series, setSeries] = useState(null)
  const [message, setMessage] = useState(null)
  const [companySettings, setCompanySettings] = useState(null)

  // Modo de nota de crédito (Cobrify o Externa)
  const [mode, setMode] = useState(invoiceIdParam ? CREDIT_NOTE_MODES.COBRIFY : CREDIT_NOTE_MODES.COBRIFY)

  // Form data para factura de Cobrify
  const [formData, setFormData] = useState({
    referencedInvoiceId: invoiceIdParam || '',
    discrepancyCode: '01',
    discrepancyReason: '',
    items: [],
  })

  // Modo descuento global (para motivos 04/05/09). Cuando está activo el
  // usuario ingresa un MONTO en S/ directamente y se ignora la selección
  // de items — se envía a SUNAT un solo item sintético "Descuento global"
  // con ese monto.
  const [globalDiscountMode, setGlobalDiscountMode] = useState(false)
  const [globalDiscountAmount, setGlobalDiscountAmount] = useState('')

  // Forma de compensación al cliente (OPCIONAL). Por defecto la NC solo corrige/anula
  // el comprobante sin ningún encuadre de dinero — cubre el caso más común (anulación
  // por error, factura a crédito no pagada). La compensación se muestra plegada y solo
  // aparece si el usuario la activa.
  //   - 'none'         → solo se emite la nota; sin devolución ni saldo (default).
  //   - 'refund'       → se le devuelve el efectivo al cliente (informativo; misma data
  //                      que 'none' — no registra caja ni altera el XML de la NC).
  //   - 'store_credit' → el cliente NO recibe dinero; la NC queda como saldo a favor
  //                      para usar en compras futuras (método de pago en el POS).
  const [compensationType, setCompensationType] = useState('none')
  // Controla si la sección de compensación (devolución / saldo a favor) está desplegada.
  const [showCompensation, setShowCompensation] = useState(false)

  // Form data para factura externa
  const [externalData, setExternalData] = useState({
    documentNumber: '', // Serie-Correlativo (ej: F001-00001234)
    documentType: '01', // 01 = Factura, 03 = Boleta
    issueDate: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })(),
    customerDocType: '6', // 6 = RUC, 1 = DNI
    customerDocNumber: '',
    customerName: '',
    customerAddress: '',
    items: [{ description: '', quantity: 1, unitPrice: 0, subtotal: 0 }],
    discrepancyCode: '01',
    discrepancyReason: 'Anulación de la operación',
  })

  const [isLookingUpDoc, setIsLookingUpDoc] = useState(false)

  const handleLookupDocument = async () => {
    const docNumber = externalData.customerDocNumber.trim()
    const docType = externalData.customerDocType
    if (!docNumber) return

    // Códigos SUNAT: '1'=DNI, '6'=RUC, '4'=CE, '7'=Pasaporte
    if (docType === '4' || docType === '7') {
      setMessage({ type: 'info', text: 'La búsqueda automática solo está disponible para DNI y RUC. Completa los datos manualmente.' })
      return
    }

    setIsLookingUpDoc(true)
    try {
      let result
      const isDNI = docType === '1' || (!docType && docNumber.length === 8)
      const isRUC = docType === '6' || (!docType && docNumber.length === 11)

      if (isDNI) {
        if (docNumber.length !== 8) {
          setMessage({ type: 'error', text: 'El DNI debe tener 8 dígitos' })
          return
        }
        result = await consultarDNI(docNumber)
      } else if (isRUC) {
        if (docNumber.length !== 11) {
          setMessage({ type: 'error', text: 'El RUC debe tener 11 dígitos' })
          return
        }
        result = await consultarRUC(docNumber)
      } else {
        setMessage({ type: 'error', text: 'El documento debe tener 8 dígitos (DNI) o 11 dígitos (RUC)' })
        return
      }

      if (result.success) {
        if (docNumber.length === 8) {
          setExternalData(prev => ({
            ...prev,
            customerDocType: '1',
            customerName: result.data.nombreCompleto || '',
            customerAddress: result.data.direccion || prev.customerAddress,
          }))
        } else {
          setExternalData(prev => ({
            ...prev,
            customerDocType: '6',
            customerName: result.data.razonSocial || '',
            customerAddress: result.data.direccion || '',
          }))
        }
      } else {
        setMessage({ type: 'error', text: result.error || 'No se encontraron datos para este documento' })
      }
    } catch (error) {
      console.error('Error al buscar documento:', error)
      setMessage({ type: 'error', text: 'Error al consultar el documento' })
    } finally {
      setIsLookingUpDoc(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  useEffect(() => {
    if (formData.referencedInvoiceId && invoices.length > 0) {
      const invoice = invoices.find(inv => inv.id === formData.referencedInvoiceId)
      if (invoice) {
        setSelectedInvoice(invoice)
        setFormData(prev => {
          // Si la factura referenciada es boleta y el motivo actual no es
          // permitido por SUNAT sobre boletas (04/05/08), resetear a '01'.
          const isBoletaRef = invoice.documentType === 'boleta'
          const codeIsInvalid = isBoletaRef && BOLETA_DISALLOWED_CODES.includes(prev.discrepancyCode)
          const newCode = codeIsInvalid ? '01' : prev.discrepancyCode
          // Si se reseteó y estaba en modo descuento global, desactivarlo.
          if (codeIsInvalid) {
            setGlobalDiscountMode(false)
            setGlobalDiscountAmount('')
          }
          return {
            ...prev,
            // Preservar la cantidad original como `originalQuantity` para que
            // el cap del input (Math.min(newQty, originalQuantity)) siempre
            // referencie el valor de la factura original — no la cantidad
            // actual ya editada. Sin esto, al bajar de 5 a 4, el usuario no
            // podía volver a subir a 5 porque el cap caía al valor actual.
            items: invoice.items.map(item => ({
              ...item,
              selected: true,
              originalQuantity: item.quantity,
            })),
            discrepancyCode: newCode,
            discrepancyReason: CREDIT_NOTE_REASONS.find(r => r.code === newCode)?.description || ''
          }
        })
      }
    }
  }, [formData.referencedInvoiceId, invoices])

  const loadData = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const [invoicesResult, seriesResult, settingsResult] = await Promise.all([
        // PERF: traer solo las 2000 facturas más recientes (no las 20k+ del
        // historial). La nota de crédito referencia comprobantes recientes; con
        // 2000 se cubre el caso real y se evita descargar todo el historial.
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
    const reason = CREDIT_NOTE_REASONS.find(r => r.code === code)
    setFormData(prev => ({
      ...prev,
      discrepancyCode: code,
      discrepancyReason: reason?.description || ''
    }))
    // Si el nuevo motivo NO admite "descuento global", desactivar ese modo
    // para volver al flujo de items.
    if (!GLOBAL_DISCOUNT_CODES.includes(code)) {
      setGlobalDiscountMode(false)
      setGlobalDiscountAmount('')
    }
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
    const igvRate = selectedInvoice?.taxConfig?.igvRate ?? 18
    const igvExempt = selectedInvoice?.taxConfig?.igvExempt ?? false

    // Modo descuento global: el usuario ingresó un MONTO directo en S/.
    if (globalDiscountMode) {
      const totalConIgv = parseFloat(globalDiscountAmount) || 0
      const subtotal = igvExempt ? totalConIgv : totalConIgv / (1 + igvRate / 100)
      const igv = igvExempt ? 0 : totalConIgv - subtotal
      return { subtotal, igv, total: totalConIgv, igvRate, igvExempt }
    }

    const selectedItems = formData.items.filter(item => item.selected)

    // item.subtotal YA INCLUYE IGV (es el precio final que pagó el cliente)
    const totalConIgv = selectedItems.reduce((sum, item) => sum + item.subtotal, 0)

    // Extraer el IGV del total (no sumarlo)
    // Total = Subtotal + IGV = Subtotal * (1 + igvRate/100)
    // Subtotal = Total / (1 + igvRate/100)
    const subtotal = igvExempt ? totalConIgv : totalConIgv / (1 + igvRate / 100)
    const igv = igvExempt ? 0 : totalConIgv - subtotal
    const total = totalConIgv // El total es lo que el cliente pagó

    return { subtotal, igv, total, igvRate, igvExempt }
  }

  // Multi-divisa: calcula los equivalentes PEN exactos para una NC USD.
  // Prioridad: 1) item.basePrice (PEN exacto guardado en cada item); si
  // no existe → 2) totalInBase proporcional de la factura padre; si tampoco
  // → 3) conversión directa TC × USD (último recurso, puede redondear).
  const calculatePENBaseTotals = () => {
    if (!selectedInvoice || normalizeCurrency(selectedInvoice.currency) !== 'USD') {
      const t = calculateTotals()
      return { subtotalInBase: t.subtotal, igvInBase: t.igv, totalInBase: t.total }
    }
    const selectedItems = formData.items.filter(item => item.selected)
    const igvRate = selectedInvoice?.taxConfig?.igvRate ?? 18
    const igvExempt = selectedInvoice?.taxConfig?.igvExempt ?? false

    // 1) Items con basePrice (PEN exacto guardado en venta nueva): suma exacta.
    const allHaveBase = selectedItems.length > 0 && selectedItems.every(it => Number(it.basePrice) > 0)
    if (allHaveBase) {
      const totalConIgvBase = selectedItems.reduce(
        (sum, item) => sum + (Number(item.basePrice) * Number(item.quantity)), 0
      )
      const subtotalBase = igvExempt ? totalConIgvBase : totalConIgvBase / (1 + igvRate / 100)
      const igvBase = igvExempt ? 0 : totalConIgvBase - subtotalBase
      return {
        subtotalInBase: Number(subtotalBase.toFixed(2)),
        igvInBase: Number(igvBase.toFixed(2)),
        totalInBase: Number(totalConIgvBase.toFixed(2)),
      }
    }

    // 2) Proporción del totalInBase original (facturas pre-fix de POS).
    const totalUSD = selectedItems.reduce((sum, item) => sum + item.subtotal, 0)
    const invTotal = Number(selectedInvoice.total) || 0
    const invTotBase = Number(selectedInvoice.totalInBase) || 0
    const invSubBase = Number(selectedInvoice.subtotalInBase) || 0
    const invIgvBase = Number(selectedInvoice.igvInBase) || 0
    if (invTotal > 0 && invTotBase > 0) {
      const ratio = totalUSD / invTotal
      return {
        subtotalInBase: Number((invSubBase * ratio).toFixed(2)),
        igvInBase: Number((invIgvBase * ratio).toFixed(2)),
        totalInBase: Number((invTotBase * ratio).toFixed(2)),
      }
    }

    // 3) Fallback: conversión directa.
    const rate = Number(selectedInvoice.exchangeRate) || 1
    const subtotalUSD = igvExempt ? totalUSD : totalUSD / (1 + igvRate / 100)
    const igvUSD = igvExempt ? 0 : totalUSD - subtotalUSD
    return {
      subtotalInBase: Number(convertToBase(subtotalUSD, 'USD', rate).toFixed(2)),
      igvInBase: Number(convertToBase(igvUSD, 'USD', rate).toFixed(2)),
      totalInBase: Number(convertToBase(totalUSD, 'USD', rate).toFixed(2)),
    }
  }

  // Handler para factura externa
  const handleExternalSubmit = async (e) => {
    e.preventDefault()

    // Guard contra doble click (síncrono)
    if (submitGuardRef.current) {
      console.warn('Submit bloqueado: ya hay una emisión en curso')
      return
    }

    if (!user?.uid) return

    // Validaciones
    if (!externalData.documentNumber) {
      setMessage({ type: 'error', text: 'Debes ingresar el número del documento original' })
      return
    }

    // Validar formato de número de documento (Serie-Correlativo)
    // Acepta series alfanuméricas de 4 caracteres: F001 (factura), B001 (boleta),
    // E001 (factura emitida desde portal SUNAT SEE-SOL), EB01 (boleta SEE-SOL), etc.
    const docNumberPattern = /^[A-Z0-9]{4}-\d{1,8}$/i
    if (!docNumberPattern.test(externalData.documentNumber)) {
      setMessage({ type: 'error', text: 'El número de documento debe tener formato Serie-Correlativo (ej: F001-00001234 o E001-746)' })
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

    submitGuardRef.current = true
    setIsSaving(true)

    try {
      const { subtotal, igv, total } = calculateExternalTotals()
      const nextNumber = series[seriesKey].lastNumber + 1
      const creditNoteSeries = series[seriesKey].serie
      const creditNoteNumber = `${creditNoteSeries}-${String(nextNumber).padStart(8, '0')}`

      // Lectura FRESH de autoSendToSunat para decidir el sunatStatus inicial:
      //   - true  → 'pending' (cron retryPendingInvoices puede reenviarlo)
      //   - false → 'not_sent' (invisible para crones, envío 100% manual)
      let shouldAutoSendToSunat = false
      try {
        const freshSettings = await getCompanySettings(getBusinessId())
        shouldAutoSendToSunat = freshSettings?.success === true && freshSettings.data?.autoSendToSunat === true
      } catch (settingsErr) {
        console.warn('No se pudo releer companySettings:', settingsErr)
        shouldAutoSendToSunat = companySettings?.autoSendToSunat === true
      }

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
          address: externalData.customerAddress || '',
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

        // Totales — NC externa siempre en PEN (es un comprobante manual
        // de un documento histórico, normalmente físico, en soles).
        subtotal,
        igv,
        total,
        currency: 'PEN',
        exchangeRate: 1,
        subtotalInBase: subtotal,
        igvInBase: igv,
        totalInBase: total,

        // Configuración de impuestos
        taxConfig: {
          igvRate: 18,
          igvExempt: false,
          exemptionReason: ''
        },

        // Estado
        status: 'pending',
        sunatStatus: shouldAutoSendToSunat ? 'pending' : 'not_sent',

        // Saldo a favor (store credit). Si el cliente no recibe efectivo, la NC
        // queda como saldo usable en ventas futuras. Disponible = creditTotal -
        // creditRedeemed. La redención se registra al cobrar en el POS (Fase 2).
        storeCredit: compensationType === 'store_credit',
        ...(compensationType === 'store_credit' && {
          creditTotal: total,
          creditRedeemed: 0,
          creditRedemptions: [],
        }),

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

      const result = await createInvoice(getBusinessId(), creditNoteData)

      if (result.success) {
        // Incrementar el número de serie
        const updatedSeries = {
          ...series,
          [seriesKey]: {
            ...series[seriesKey],
            lastNumber: nextNumber
          }
        }
        await updateDocumentSeries(getBusinessId(), updatedSeries)

        // Envío automático a SUNAT - reutiliza shouldAutoSendToSunat ya leído FRESH.
        if (shouldAutoSendToSunat) {
          console.log('🚀 Enviando Nota de Crédito (externa) automáticamente a SUNAT...')
          sendCreditNoteToSunat(getBusinessId(), result.id)
            .then((res) => {
              if (res?.success) {
                console.log('✅ Nota de Crédito enviada a SUNAT exitosamente')
              } else {
                console.error('❌ NC enviada pero SUNAT no aceptó:', res?.error || res?.message)
              }
            })
            .catch((sunatError) => {
              console.error('❌ Error al enviar NC a SUNAT:', sunatError)
            })
        }

        setMessage({ type: 'success', text: 'Nota de Crédito creada exitosamente' })
        setTimeout(() => appNavigate('facturas'), 2000)
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al crear nota de crédito:', error)
      setMessage({ type: 'error', text: error.message || 'Error al crear la nota de crédito' })
    } finally {
      setIsSaving(false)
      submitGuardRef.current = false
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Guard contra doble click (síncrono — actúa antes de cualquier setState)
    if (submitGuardRef.current) {
      console.warn('Submit bloqueado: ya hay una emisión en curso')
      return
    }

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

    // Declarar selectedItems aquí (vacío si globalDiscountMode) para que
    // esté disponible en todo el handler. Sin esto la línea que arma
    // creditNoteData.items lo encontraría como undefined.
    const selectedItems = globalDiscountMode
      ? []
      : formData.items.filter(item => item.selected)

    // Validaciones específicas del modo "descuento global"
    if (globalDiscountMode) {
      const amount = parseFloat(globalDiscountAmount) || 0
      if (amount <= 0) {
        setMessage({ type: 'error', text: 'Ingresa un monto de descuento mayor a 0' })
        return
      }
      if (amount > Number(selectedInvoice.total)) {
        setMessage({
          type: 'error',
          text: `El descuento no puede superar el total de la factura (${formatCurrency(selectedInvoice.total, selectedInvoice.currency)})`,
        })
        return
      }
    } else if (selectedItems.length === 0) {
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

    submitGuardRef.current = true
    setIsSaving(true)

    try {
      const { subtotal, igv, total, igvRate, igvExempt } = calculateTotals()
      const nextNumber = series[seriesKey].lastNumber + 1
      const creditNoteSeries = series[seriesKey].serie
      const creditNoteNumber = `${creditNoteSeries}-${String(nextNumber).padStart(8, '0')}`

      // Lectura FRESH de autoSendToSunat para decidir el sunatStatus inicial.
      let shouldAutoSendToSunat = false
      try {
        const freshSettings = await getCompanySettings(getBusinessId())
        shouldAutoSendToSunat = freshSettings?.success === true && freshSettings.data?.autoSendToSunat === true
      } catch (settingsErr) {
        console.warn('No se pudo releer companySettings:', settingsErr)
        shouldAutoSendToSunat = companySettings?.autoSendToSunat === true
      }

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

        // Items: en modo "descuento global" se envía un solo item sintético
        // que representa el descuento. En modo normal van los items seleccionados.
        // IMPORTANTE: la Cloud Function (xmlGenerator) asume que item.unitPrice
        // YA INCLUYE IGV (igual que los items del POS). Por eso unitPrice y
        // subtotal son el `total` (con IGV), no el `subtotal` sin IGV.
        items: globalDiscountMode
          ? [{
              productId: null,
              code: '',
              name: 'Descuento global',
              description: formData.discrepancyReason || 'Descuento aplicado a factura',
              quantity: 1,
              unit: 'NIU',
              unitPrice: Number(total.toFixed(2)),
              subtotal: Number(total.toFixed(2)),
              // Flag para identificar este item como descuento global
              isGlobalDiscount: true,
            }]
          : selectedItems.map(item => ({
              ...item,
              originalQuantity: item.quantity // Guardar cantidad original para referencia
            })),

        // Totales
        subtotal,
        igv,
        total,
        // Multi-divisa: SUNAT manda que la NC herede moneda y TC del
        // documento original. El usuario NO puede cambiarlos.
        currency: normalizeCurrency(selectedInvoice.currency),
        exchangeRate: Number(selectedInvoice.exchangeRate) > 0 ? Number(selectedInvoice.exchangeRate) : 1,
        // Equivalentes en PEN base — exactos cuando los items tienen
        // basePrice. Detalles en calculatePENBaseTotals().
        ...calculatePENBaseTotals(),

        // Configuración de impuestos (heredada del documento original)
        taxConfig: {
          igvRate: igvRate,
          igvExempt: igvExempt,
          exemptionReason: selectedInvoice?.taxConfig?.exemptionReason || ''
        },

        // Estado
        status: 'pending',
        sunatStatus: shouldAutoSendToSunat ? 'pending' : 'not_sent',

        // Saldo a favor (store credit). Si el cliente no recibe efectivo, la NC
        // queda como saldo usable en ventas futuras. Disponible = creditTotal -
        // creditRedeemed. La redención se registra al cobrar en el POS (Fase 2).
        storeCredit: compensationType === 'store_credit',
        ...(compensationType === 'store_credit' && {
          creditTotal: total,
          creditRedeemed: 0,
          creditRedemptions: [],
        }),

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

      const result = await createInvoice(getBusinessId(), creditNoteData)

      if (result.success) {
        // Incrementar el número de serie después de crear exitosamente
        const updatedSeries = {
          ...series,
          [seriesKey]: {
            ...series[seriesKey],
            lastNumber: nextNumber
          }
        }
        await updateDocumentSeries(getBusinessId(), updatedSeries)

        // Actualizar la boleta/factura original para marcarla como pendiente de anulación
        // Esto asegura que no se cuente en el Dashboard/Caja hasta que SUNAT procese la NC
        const isFullCancellation = Math.abs(selectedInvoice.total - total) < 0.01
        const newStatus = isFullCancellation ? 'pending_cancellation' : 'partial_refund_pending'

        await updateInvoice(getBusinessId(), selectedInvoice.id, {
          status: newStatus,
          pendingCreditNoteId: result.id,
          pendingCreditNoteNumber: creditNoteNumber,
          pendingCreditNoteTotal: total,
          // Idempotencia (Fase 2): si esta NC devuelve TODO el stock, marcar la factura
          // para que una anulación posterior no lo devuelva otra vez (doble restauración).
          ...((isFullCancellation && ['01', '06', '07'].includes(formData.discrepancyCode)) ? { stockRestored: true } : {})
        })

        // Si la NC es de ANULACIÓN TOTAL y la factura provino de Notas de Venta,
        // revertir esas notas (quitar convertedTo) para que el usuario pueda volver
        // a usarlas. Si la NC es parcial, NO se revierten porque la factura sigue
        // siendo válida por el monto restante.
        if (isFullCancellation && selectedInvoice.convertedFrom) {
          try {
            const { doc, updateDoc, deleteField } = await import('firebase/firestore')
            const { db } = await import('@/lib/firebase')
            const notaIds = selectedInvoice.convertedFrom.ids
              || (selectedInvoice.convertedFrom.id ? [selectedInvoice.convertedFrom.id] : [])
            for (const notaId of notaIds) {
              try {
                const notaRef = doc(db, 'businesses', user.uid, 'invoices', notaId)
                await updateDoc(notaRef, { convertedTo: deleteField(), updatedAt: new Date() })
                console.log(`✅ Nota de venta ${notaId} revertida tras NC ${creditNoteNumber}`)
              } catch (revertError) {
                console.warn(`No se pudo revertir nota ${notaId}:`, revertError)
              }
            }
          } catch (error) {
            console.warn('Error al revertir notas de venta tras NC:', error)
          }
        }

        // Devolver stock si es una devolución o anulación (códigos 01, 06, 07).
        // Idempotencia (Fase 2): si el stock ya se restauró antes (anulación previa),
        // NO volver a devolverlo.
        const stockReturnCodes = ['01', '06', '07']
        if (stockReturnCodes.includes(formData.discrepancyCode) && selectedInvoice.stockRestored !== true) {
          try {
            const { updateWarehouseStock, createStockMovement } = await import('@/services/warehouseService')
            const { getProducts, updateProduct } = await import('@/services/firestoreService')

            const productsResult = await getProducts(getBusinessId())
            const products = productsResult.success ? productsResult.data : []
            const warehouseId = selectedInvoice.warehouseId || ''

            // Solo devolver los items seleccionados en la nota de crédito
            const itemsToReturn = formData.items.filter(item => item.selected)

            for (const item of itemsToReturn) {
              if (item.productId) {
                const productData = products.find(p => p.id === item.productId)
                if (!productData) continue
                if (productData.trackStock === false) continue

                const quantityToRestore = item.quantity * (item.presentationFactor || 1)

                // Restaurar cantidad del lote si el item tenía lote
                const batchExtraUpdates = {}
                if (item.batchNumber && productData.batches?.length > 0) {
                  let matched = false
                  const updatedBatches = productData.batches.map(b => {
                    const bId = b.lotNumber || b.batchNumber || b.id
                    if (bId === item.batchNumber && (!b.warehouseId || b.warehouseId === warehouseId)) {
                      matched = true
                      return { ...b, quantity: (b.quantity || 0) + quantityToRestore }
                    }
                    return b
                  })
                  // Si el lote ya no existía (se vació y se eliminó del array), recrearlo
                  // para no descuadrar batches[] respecto al stock total devuelto.
                  if (!matched) {
                    updatedBatches.push({
                      id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                      batchNumber: item.batchNumber,
                      lotNumber: item.batchNumber,
                      quantity: quantityToRestore,
                      expirationDate: item.expirationDate || null,
                      warehouseId: warehouseId || null,
                    })
                  }
                  batchExtraUpdates.batches = updatedBatches

                  const activeBatches = updatedBatches.filter(b => b.quantity > 0 && (b.expirationDate || b.expiryDate))
                  if (activeBatches.length > 0) {
                    activeBatches.sort((a, b) => {
                      const dateA = (a.expirationDate || a.expiryDate)?.toDate?.() || new Date(a.expirationDate || a.expiryDate || '2099-12-31')
                      const dateB = (b.expirationDate || b.expiryDate)?.toDate?.() || new Date(b.expirationDate || b.expiryDate || '2099-12-31')
                      return dateA - dateB
                    })
                    batchExtraUpdates.expirationDate = activeBatches[0].expirationDate || activeBatches[0].expiryDate
                    batchExtraUpdates.batchNumber = activeBatches[0].lotNumber || activeBatches[0].batchNumber
                  }
                }

                // Si el item se vendió con número de serie, devolverlo a 'available'
                const serialsToRestore = item.serialNumber
                  ? [{ serialNumber: item.serialNumber, restore: true }]
                  : null

                const itemVariantSku = item.variantSku || null
                await updateProductStockTransaction(
                  user.uid,
                  item.productId,
                  warehouseId,
                  quantityToRestore,
                  batchExtraUpdates,
                  itemVariantSku,
                  serialsToRestore
                )

                await createStockMovement(getBusinessId(), {
                  productId: item.productId,
                  warehouseId: warehouseId,
                  type: 'entry',
                  quantity: quantityToRestore,
                  reason: 'Nota de crédito',
                  referenceType: 'credit_note',
                  referenceId: result.id,
                  referenceNumber: creditNoteNumber,
                  userId: user.uid,
                  ...(item.batchNumber && { batchNumber: item.batchNumber }),
                  ...(itemVariantSku && { variantSku: itemVariantSku }),
                  notes: `Stock devuelto por NC ${creditNoteNumber} - ${formData.discrepancyReason}${item.batchNumber ? ` (Lote: ${item.batchNumber})` : ''}`
                })

                console.log(`✅ Stock restaurado para ${item.name}: +${quantityToRestore}`)
              }
            }
          } catch (stockError) {
            console.warn('Error al devolver stock:', stockError)
            // No fallar la operación si hay error de stock
          }
        }

        // Envío automático a SUNAT - reutiliza shouldAutoSendToSunat ya leído FRESH.
        if (shouldAutoSendToSunat) {
          console.log('🚀 Enviando Nota de Crédito automáticamente a SUNAT...')
          sendCreditNoteToSunat(getBusinessId(), result.id)
            .then((res) => {
              if (res?.success) {
                console.log('✅ Nota de Crédito enviada a SUNAT exitosamente')
              } else {
                console.error('❌ NC enviada pero SUNAT no aceptó:', res?.error || res?.message)
              }
            })
            .catch((sunatError) => {
              console.error('❌ Error al enviar NC a SUNAT:', sunatError)
            })
        }

        setMessage({ type: 'success', text: 'Nota de Crédito creada exitosamente. Stock restaurado.' })
        setTimeout(() => appNavigate('facturas'), 2000)
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al crear nota de crédito:', error)
      setMessage({ type: 'error', text: error.message || 'Error al crear la nota de crédito' })
    } finally {
      setIsSaving(false)
      submitGuardRef.current = false
    }
  }

  // En modo descuento global usamos calculateTotals directamente (no depende
  // de items.length). En modo items, requerimos al menos 1 item cargado.
  const totals = (formData.items.length > 0 || globalDiscountMode)
    ? calculateTotals()
    : { subtotal: 0, igv: 0, total: 0 }
  const externalTotals = externalData.items.length > 0 ? calculateExternalTotals() : { subtotal: 0, igv: 0, total: 0 }

  // Total relevante según el modo activo (para el texto del selector de compensación)
  const activeTotal = mode === CREDIT_NOTE_MODES.EXTERNAL ? externalTotals.total : totals.total
  const activeCurrency = mode === CREDIT_NOTE_MODES.EXTERNAL ? 'PEN' : selectedInvoice?.currency

  // Sección "Compensación al cliente" — OPCIONAL y compartida por ambos formularios.
  // Por defecto la NC solo se emite (sin devolución ni saldo). El usuario puede activar
  // la compensación para elegir devolución de efectivo (informativa) o saldo a favor
  // (crea store credit). Al desactivarla vuelve a 'none'; al activarla arranca en 'refund'.
  const toggleCompensation = (enabled) => {
    setShowCompensation(enabled)
    setCompensationType(enabled ? 'refund' : 'none')
  }

  const compensationSelector = (
    <Card>
      <CardContent className="py-4">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showCompensation}
            onChange={e => toggleCompensation(e.target.checked)}
            className="mt-0.5 flex-shrink-0"
          />
          <div>
            <div className="font-medium text-gray-900 text-sm">Compensación al cliente (opcional)</div>
            <p className="text-xs text-gray-500 mt-0.5">
              {showCompensation
                ? 'Elige cómo se compensa al cliente.'
                : 'La nota solo corrige o anula el comprobante. Actívalo si además devuelves dinero o dejas saldo a favor.'}
            </p>
          </div>
        </label>

        {showCompensation && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <label className={`flex items-start gap-2.5 p-3 border rounded-lg cursor-pointer transition-colors ${compensationType === 'refund' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <input
                type="radio"
                name="compensationType"
                checked={compensationType === 'refund'}
                onChange={() => setCompensationType('refund')}
                className="mt-0.5 flex-shrink-0"
              />
              <div>
                <div className="flex items-center gap-1.5 font-medium text-gray-900 text-sm">
                  <Banknote className="w-4 h-4 text-gray-500" /> Devolución de efectivo
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Le devuelves el dinero al cliente. No queda saldo pendiente.</p>
              </div>
            </label>
            <label className={`flex items-start gap-2.5 p-3 border rounded-lg cursor-pointer transition-colors ${compensationType === 'store_credit' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <input
                type="radio"
                name="compensationType"
                checked={compensationType === 'store_credit'}
                onChange={() => setCompensationType('store_credit')}
                className="mt-0.5 flex-shrink-0"
              />
              <div>
                <div className="flex items-center gap-1.5 font-medium text-gray-900 text-sm">
                  <Wallet className="w-4 h-4 text-primary-600" /> Saldo a favor del cliente
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  El cliente conserva {activeTotal > 0 ? formatCurrency(activeTotal, activeCurrency) : 'el monto'} para usar en compras futuras.
                </p>
              </div>
            </label>
          </div>
        )}
      </CardContent>
    </Card>
  )

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
                        <span className="text-gray-600">Total:</span>
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
                            La nota de crédito heredará esta moneda y TC (SUNAT lo exige).
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
                {CREDIT_NOTE_REASONS
                  .filter(reason => {
                    // Sobre boletas, SUNAT no permite motivos 04/05/08.
                    if (selectedInvoice?.documentType === 'boleta' && BOLETA_DISALLOWED_CODES.includes(reason.code)) {
                      return false
                    }
                    return true
                  })
                  .map(reason => (
                    <option key={reason.code} value={reason.code}>
                      {reason.code} - {reason.description}
                    </option>
                  ))}
              </Select>
              {selectedInvoice?.documentType === 'boleta' && (
                <p className="text-xs text-gray-500 mt-1">
                  ℹ️ SUNAT no permite descuento global (04), descuento por ítem (05) ni bonificación (08) sobre boletas.
                  Para descontar sobre boleta usa el motivo <strong>09 - Disminución en el valor</strong>.
                </p>
              )}
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

            {/* Modo "descuento global" — visible solo para motivos 04/05/09.
                Permite ingresar un MONTO en S/ directamente en lugar de jugar
                con cantidades de items. Útil cuando el descuento no se
                corresponde con un item específico (ej. promoción al total). */}
            {selectedInvoice && GLOBAL_DISCOUNT_CODES.includes(formData.discrepancyCode) && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  Modo de aplicación
                </label>
                <div className="space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300">
                    <input
                      type="radio"
                      checked={!globalDiscountMode}
                      onChange={() => setGlobalDiscountMode(false)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">Por items (ajustar cantidades)</div>
                      <div className="text-xs text-gray-500">Selecciona qué items se acreditan y en qué cantidad. Útil cuando el descuento corresponde a productos específicos.</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300">
                    <input
                      type="radio"
                      checked={globalDiscountMode}
                      onChange={() => setGlobalDiscountMode(true)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">Descuento global por monto fijo</div>
                      <div className="text-xs text-gray-500">Ingresa un monto en {normalizeCurrency(selectedInvoice.currency) === 'USD' ? '$' : 'S/'} que se descuenta del total. SUNAT lo procesa con el código de motivo seleccionado.</div>
                    </div>
                  </label>
                </div>

                {globalDiscountMode && (
                  <div className="pt-3 border-t border-blue-200">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Monto a descontar (incluye IGV)
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600 font-medium">
                        {normalizeCurrency(selectedInvoice.currency) === 'USD' ? '$' : 'S/'}
                      </span>
                      <Input
                        type="number"
                        min="0.01"
                        max={selectedInvoice.total}
                        step="0.01"
                        value={globalDiscountAmount}
                        onChange={e => setGlobalDiscountAmount(e.target.value)}
                        placeholder="0.00"
                        className="flex-1"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Máximo: {formatCurrency(selectedInvoice.total, selectedInvoice.currency)} (total de la factura original)
                    </p>
                    {parseFloat(globalDiscountAmount) > 0 && (
                      <div className="mt-3 p-2 bg-white rounded border border-gray-200 text-xs text-gray-700 space-y-1">
                        <div className="flex justify-between">
                          <span>Subtotal sin IGV:</span>
                          <span className="font-medium">{formatCurrency(parseFloat(globalDiscountAmount) / (1 + (selectedInvoice?.taxConfig?.igvRate ?? 18) / 100), selectedInvoice.currency)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>IGV ({selectedInvoice?.taxConfig?.igvRate ?? 18}%):</span>
                          <span className="font-medium">{formatCurrency(parseFloat(globalDiscountAmount) - parseFloat(globalDiscountAmount) / (1 + (selectedInvoice?.taxConfig?.igvRate ?? 18) / 100), selectedInvoice.currency)}</span>
                        </div>
                        <div className="flex justify-between font-semibold border-t border-gray-100 pt-1">
                          <span>Total descuento:</span>
                          <span className="text-primary-600">{formatCurrency(parseFloat(globalDiscountAmount), selectedInvoice.currency)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Items — Solo visible cuando NO estás en modo descuento global.
            En descuento global el monto se toma del input directamente. */}
        {selectedInvoice && !globalDiscountMode && (
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
                              Precio unitario: {formatCurrency(item.unitPrice, selectedInvoice?.currency)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{formatCurrency(item.subtotal, selectedInvoice?.currency)}</p>
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
                  <span className="font-medium">{formatCurrency(totals.subtotal, selectedInvoice?.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">IGV (18%):</span>
                  <span className="font-medium">{formatCurrency(totals.igv, selectedInvoice?.currency)}</span>
                </div>
                <div className="flex justify-between text-xl font-bold border-t pt-2">
                  <span>Total:</span>
                  <span className="text-primary-600">{formatCurrency(totals.total, selectedInvoice?.currency)}</span>
                </div>
                {normalizeCurrency(selectedInvoice?.currency) === 'USD' && (
                  <div className="text-right text-xs text-gray-500 pt-1">
                    ≈ {formatCurrency(calculatePENBaseTotals().totalInBase, 'PEN')} (TC {selectedInvoice?.exchangeRate || 1})
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

            {/* Compensación al cliente (saldo a favor vs devolución) */}
            {selectedInvoice && compensationSelector}

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
                    placeholder="F001-00001234 o E001-746"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Formato: Serie-Correlativo (ej: F001-00001234, E001-746 para facturas del portal SUNAT)</p>
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
                  <div className="flex gap-2">
                    <Input
                      value={externalData.customerDocNumber}
                      onChange={e => setExternalData(prev => ({ ...prev, customerDocNumber: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && (externalData.customerDocNumber.length === 8 || externalData.customerDocNumber.length === 11) && handleLookupDocument()}
                      placeholder={externalData.customerDocType === '6' ? '20123456789' : '12345678'}
                      required
                    />
                    <button
                      type="button"
                      onClick={handleLookupDocument}
                      disabled={isLookingUpDoc}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                      title="Buscar datos del documento"
                    >
                      {isLookingUpDoc ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </button>
                  </div>
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
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Dirección
                  </label>
                  <Input
                    value={externalData.customerAddress}
                    onChange={e => setExternalData(prev => ({ ...prev, customerAddress: e.target.value }))}
                    placeholder="Dirección del cliente"
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

          {/* Compensación al cliente (saldo a favor vs devolución) */}
          {compensationSelector}

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
