import { useState, useEffect } from 'react'
import { X, AlertTriangle, RefreshCw, Check, Loader2, Search, FileText } from 'lucide-react'
import { collection, query, where, getDocs, doc, updateDoc, runTransaction, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { sendInvoiceToSunat } from '@/services/firestoreService'

/**
 * Modal de administración para renumerar documentos rechazados por SUNAT
 * Permite cambiar la serie y número de documentos rechazados y reenviarlos
 */
export default function RenumberInvoicesModal({ isOpen, onClose }) {
  const { user } = useAuth()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [step, setStep] = useState(1) // 1: Buscar, 2: Seleccionar, 3: Confirmar, 4: Procesar

  // Filtros de búsqueda
  const [filterSeries, setFilterSeries] = useState('')
  const [filterDocType, setFilterDocType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all_problematic') // Nuevo: buscar todos los problemáticos
  const [filterSunatCode, setFilterSunatCode] = useState('')

  // Documentos encontrados y seleccionados
  const [documents, setDocuments] = useState([])
  const [selectedDocs, setSelectedDocs] = useState([])

  // Nueva serie
  const [newSeries, setNewSeries] = useState('')
  const [previewNumbers, setPreviewNumbers] = useState([])

  // Progreso de procesamiento
  const [processProgress, setProcessProgress] = useState({ current: 0, total: 0, errors: [], results: [] })

  // Series disponibles del negocio
  const [availableSeries, setAvailableSeries] = useState({})

  useEffect(() => {
    if (isOpen && user?.uid) {
      loadAvailableSeries()
    }
  }, [isOpen, user?.uid])

  const loadAvailableSeries = async () => {
    try {
      const businessRef = doc(db, 'businesses', user.uid)
      const businessSnap = await getDoc(businessRef)
      if (businessSnap.exists()) {
        const data = businessSnap.data()
        setAvailableSeries(data.series || {})
      }
    } catch (error) {
      console.error('Error cargando series:', error)
    }
  }

  // Códigos de SUNAT que indican duplicado/ya existe
  const DUPLICATE_CODES = ['0100', '2033', '2800', '4000']
  const DUPLICATE_MESSAGES = ['ya fue enviado', 'ya existe', 'registrado anteriormente', 'duplicado', 'ya se encuentra']

  const searchDocuments = async () => {
    if (!user?.uid) return

    setSearching(true)
    try {
      const invoicesRef = collection(db, 'businesses', user.uid, 'invoices')

      // Obtener todos los documentos de la serie especificada
      const snapshot = await getDocs(invoicesRef)
      let docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      // Filtrar por serie si se especificó
      if (filterSeries) {
        docs = docs.filter(d => d.series === filterSeries || d.number?.startsWith(filterSeries))
      }

      // Filtrar por tipo de documento
      if (filterDocType !== 'all') {
        docs = docs.filter(d => d.documentType === filterDocType)
      }

      // Filtrar por estado y detectar duplicados "falsos aceptados"
      if (filterStatus === 'all') {
        // NO filtrar - mostrar TODOS los documentos de la serie
        // (ya está filtrado por serie arriba)
      } else if (filterStatus === 'all_problematic') {
        // Buscar rechazados Y aceptados que parecen ser duplicados
        docs = docs.filter(d => {
          // Documentos explícitamente rechazados
          if (d.sunatStatus === 'rejected') return true

          // Documentos pendientes o enviando (atascados)
          if (d.sunatStatus === 'pending' || d.sunatStatus === 'sending') return true

          // Documentos "aceptados" pero con códigos/mensajes de duplicado
          if (d.sunatStatus === 'accepted') {
            const code = d.sunatResponseCode || ''
            const desc = (d.sunatDescription || '').toLowerCase()

            // Verificar si tiene código de duplicado
            if (DUPLICATE_CODES.includes(code)) return true

            // Verificar si el mensaje indica duplicado
            if (DUPLICATE_MESSAGES.some(msg => desc.includes(msg))) return true
          }

          return false
        })
      } else if (filterStatus === 'accepted_duplicates') {
        // Solo "aceptados" que parecen duplicados
        docs = docs.filter(d => {
          if (d.sunatStatus !== 'accepted') return false

          const code = d.sunatResponseCode || ''
          const desc = (d.sunatDescription || '').toLowerCase()

          return DUPLICATE_CODES.includes(code) ||
                 DUPLICATE_MESSAGES.some(msg => desc.includes(msg))
        })
      } else if (filterStatus === 'accepted') {
        // Todos los marcados como aceptados (incluyendo los falsos)
        docs = docs.filter(d => d.sunatStatus === 'accepted')
      } else {
        // Filtro normal por estado específico (rejected, pending, sending)
        docs = docs.filter(d => d.sunatStatus === filterStatus)
      }

      // Filtrar por código SUNAT específico si se especificó
      if (filterSunatCode) {
        docs = docs.filter(d =>
          d.sunatResponseCode === filterSunatCode ||
          (d.sunatDescription || '').toLowerCase().includes(filterSunatCode.toLowerCase())
        )
      }

      // Ordenar por fecha de creación
      docs.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt)
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt)
        return dateA - dateB
      })

      setDocuments(docs)
      setSelectedDocs([])

      if (docs.length > 0) {
        setStep(2)
        toast.success(`Se encontraron ${docs.length} documentos`)
      } else {
        toast.error('No se encontraron documentos con los filtros especificados')
      }
    } catch (error) {
      console.error('Error buscando documentos:', error)
      toast.error('Error al buscar documentos')
    } finally {
      setSearching(false)
    }
  }

  const toggleSelectDoc = (docId) => {
    setSelectedDocs(prev => {
      if (prev.includes(docId)) {
        return prev.filter(id => id !== docId)
      } else {
        return [...prev, docId]
      }
    })
  }

  const selectAll = () => {
    if (selectedDocs.length === documents.length) {
      setSelectedDocs([])
    } else {
      setSelectedDocs(documents.map(d => d.id))
    }
  }

  const generatePreview = async () => {
    if (!newSeries || selectedDocs.length === 0) {
      toast.error('Selecciona documentos y una nueva serie')
      return
    }

    setLoading(true)
    try {
      // Obtener el último número de la nueva serie
      const businessRef = doc(db, 'businesses', user.uid)
      const businessSnap = await getDoc(businessRef)
      const businessData = businessSnap.data()

      // Determinar el tipo de documento para buscar la serie correcta
      const firstDoc = documents.find(d => selectedDocs.includes(d.id))
      const docType = firstDoc?.documentType || 'factura'

      // Buscar el último número usado en esa serie
      let lastNumber = 0

      // Buscar en series globales
      if (businessData.series?.[docType]?.serie === newSeries) {
        lastNumber = businessData.series[docType].lastNumber || 0
      }

      // También buscar el máximo número existente con esa serie en invoices
      const invoicesRef = collection(db, 'businesses', user.uid, 'invoices')
      const existingDocs = await getDocs(invoicesRef)
      existingDocs.docs.forEach(doc => {
        const data = doc.data()
        if (data.series === newSeries && data.correlativeNumber > lastNumber) {
          lastNumber = data.correlativeNumber
        }
      })

      // Generar preview de nuevos números
      const selectedDocuments = documents.filter(d => selectedDocs.includes(d.id))
      const preview = selectedDocuments.map((doc, index) => ({
        id: doc.id,
        oldNumber: doc.number,
        newNumber: `${newSeries}-${String(lastNumber + index + 1).padStart(8, '0')}`,
        newCorrelative: lastNumber + index + 1,
        documentType: doc.documentType,
        customer: doc.customer?.name || doc.customer?.businessName || 'Sin cliente',
        total: doc.total
      }))

      setPreviewNumbers(preview)
      setStep(3)
    } catch (error) {
      console.error('Error generando preview:', error)
      toast.error('Error al generar vista previa')
    } finally {
      setLoading(false)
    }
  }

  const processRenumbering = async () => {
    if (previewNumbers.length === 0) return

    setProcessing(true)
    setStep(4)
    setProcessProgress({ current: 0, total: previewNumbers.length, errors: [], results: [] })

    const errors = []

    for (let i = 0; i < previewNumbers.length; i++) {
      const item = previewNumbers[i]

      try {
        // Actualizar el documento con nueva numeración
        const invoiceRef = doc(db, 'businesses', user.uid, 'invoices', item.id)

        await updateDoc(invoiceRef, {
          series: newSeries,
          correlativeNumber: item.newCorrelative,
          number: item.newNumber,
          sunatStatus: 'pending',
          sunatResponseCode: null,
          sunatDescription: null,
          sunatHash: null,
          cdrHash: null,
          updatedAt: new Date(),
          _renumberedAt: new Date(),
          _previousNumber: item.oldNumber
        })

        setProcessProgress(prev => ({ ...prev, current: i + 1 }))
      } catch (error) {
        console.error(`Error procesando ${item.oldNumber}:`, error)
        errors.push({ number: item.oldNumber, error: error.message })
      }
    }

    // Actualizar el último número en la configuración del negocio
    try {
      const lastCorrelative = previewNumbers[previewNumbers.length - 1].newCorrelative
      const firstDoc = documents.find(d => selectedDocs.includes(d.id))
      const docType = firstDoc?.documentType || 'factura'

      const businessRef = doc(db, 'businesses', user.uid)
      await runTransaction(db, async (transaction) => {
        const businessSnap = await transaction.get(businessRef)
        const businessData = businessSnap.data()

        const currentSeries = businessData.series || {}

        // Actualizar o crear la entrada de serie
        if (currentSeries[docType]?.serie === newSeries) {
          // Si ya existe la serie, actualizar lastNumber si es mayor
          if (lastCorrelative > (currentSeries[docType].lastNumber || 0)) {
            currentSeries[docType].lastNumber = lastCorrelative
          }
        } else {
          // Si es una serie nueva para este tipo de documento
          // No modificamos la serie principal, solo actualizamos si coincide
        }

        transaction.update(businessRef, { series: currentSeries })
      })
    } catch (error) {
      console.error('Error actualizando series del negocio:', error)
    }

    setProcessProgress(prev => ({ ...prev, errors }))
    setProcessing(false)

    if (errors.length === 0) {
      toast.success(`¡${previewNumbers.length} documentos renumerados exitosamente!`)
    } else {
      toast.error(`Completado con ${errors.length} errores`)
    }
  }

  const sendToSunat = async () => {
    if (previewNumbers.length === 0) return

    setProcessing(true)
    setProcessProgress({ current: 0, total: previewNumbers.length, errors: [], results: [] })

    const errors = []
    const results = []

    for (let i = 0; i < previewNumbers.length; i++) {
      const item = previewNumbers[i]

      try {
        const result = await sendInvoiceToSunat(user.uid, item.id)
        console.log(`Resultado envío ${item.newNumber}:`, result)

        // Obtener el estado actualizado del documento en Firebase
        const invoiceRef = doc(db, 'businesses', user.uid, 'invoices', item.id)
        const invoiceSnap = await getDoc(invoiceRef)
        const updatedData = invoiceSnap.data()

        results.push({
          number: item.newNumber,
          success: result.success,
          status: updatedData?.sunatStatus || 'unknown',
          message: result.message || updatedData?.sunatDescription || ''
        })

        if (!result.success) {
          errors.push({ number: item.newNumber, error: result.error || result.message || 'Error desconocido' })
        }

        setProcessProgress(prev => ({ ...prev, current: i + 1, results: [...prev.results, results[results.length - 1]] }))

        // Pequeña pausa entre envíos para no sobrecargar
        await new Promise(resolve => setTimeout(resolve, 1000))
      } catch (error) {
        console.error(`Error enviando ${item.newNumber}:`, error)
        errors.push({ number: item.newNumber, error: error.message })
        results.push({
          number: item.newNumber,
          success: false,
          status: 'error',
          message: error.message
        })
      }
    }

    setProcessProgress(prev => ({ ...prev, errors, results }))
    setProcessing(false)

    const accepted = results.filter(r => r.status === 'accepted').length
    const rejected = results.filter(r => r.status === 'rejected').length

    if (accepted === previewNumbers.length) {
      toast.success(`¡${accepted} documentos aceptados por SUNAT!`)
    } else if (accepted > 0) {
      toast.success(`${accepted} aceptados, ${rejected} rechazados por SUNAT`)
    } else {
      toast.error(`${rejected} documentos rechazados por SUNAT`)
    }
  }

  const resetModal = () => {
    setStep(1)
    setDocuments([])
    setSelectedDocs([])
    setPreviewNumbers([])
    setProcessProgress({ current: 0, total: 0, errors: [], results: [] })
    setNewSeries('')
    setFilterSeries('')
  }

  const formatDate = (dateValue) => {
    if (!dateValue) return '-'
    const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue)
    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-red-500 p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6" />
            <div>
              <h2 className="text-lg font-bold">Herramienta de Renumeración</h2>
              <p className="text-sm text-white/80">Renumerar documentos rechazados por SUNAT</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-center gap-2">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= s ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {s}
              </div>
              {s < 4 && <div className={`w-12 h-1 mx-1 ${step > s ? 'bg-orange-500' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Step 1: Buscar */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="font-semibold text-yellow-800 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Advertencia
                </h3>
                <p className="text-sm text-yellow-700 mt-1">
                  Esta herramienta cambiará el número de serie y correlativo de los documentos seleccionados.
                  Use con precaución y solo para documentos que SUNAT haya rechazado por duplicidad de numeración.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Serie a buscar <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={filterSeries}
                    onChange={(e) => setFilterSeries(e.target.value.toUpperCase())}
                    placeholder="Ej: F001, B001"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de documento
                  </label>
                  <select
                    value={filterDocType}
                    onChange={(e) => setFilterDocType(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="all">Todos</option>
                    <option value="factura">Facturas</option>
                    <option value="boleta">Boletas</option>
                    <option value="nota_credito">Notas de Crédito</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Filtro de estado
                  </label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="all">📋 TODOS (para cambio masivo)</option>
                    <option value="all_problematic">🔍 Todos los problemáticos</option>
                    <option value="accepted">✅ Marcados como aceptados</option>
                    <option value="accepted_duplicates">⚠️ "Aceptados" que son duplicados</option>
                    <option value="rejected">❌ Solo rechazados</option>
                    <option value="pending">⏳ Solo pendientes</option>
                    <option value="sending">📤 Enviando (atascados)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Código/mensaje SUNAT (opcional)
                  </label>
                  <input
                    type="text"
                    value={filterSunatCode}
                    onChange={(e) => setFilterSunatCode(e.target.value)}
                    placeholder="Ej: 2033, ya existe..."
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
                <p className="text-sm text-blue-800">
                  <strong>💡 Tip:</strong> Usa <strong>"TODOS"</strong> para cambiar masivamente todos los documentos de una serie,
                  sin importar su estado actual. Útil cuando la mayoría aparecen como "aceptados" pero realmente
                  fueron rechazados por SUNAT por ser duplicados de otro sistema.
                </p>
              </div>

              <button
                onClick={searchDocuments}
                disabled={searching}
                className="w-full py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {searching ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Search className="w-5 h-5" />
                )}
                Buscar documentos
              </button>
            </div>
          )}

          {/* Step 2: Seleccionar documentos */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">
                  Documentos encontrados ({documents.length})
                </h3>
                <button
                  onClick={selectAll}
                  className="text-sm text-orange-600 hover:text-orange-700"
                >
                  {selectedDocs.length === documents.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                </button>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="p-2 text-left w-10">
                          <input
                            type="checkbox"
                            checked={selectedDocs.length === documents.length && documents.length > 0}
                            onChange={selectAll}
                            className="rounded"
                          />
                        </th>
                        <th className="p-2 text-left">Número</th>
                        <th className="p-2 text-left">Tipo</th>
                        <th className="p-2 text-left">Cliente</th>
                        <th className="p-2 text-left">Fecha</th>
                        <th className="p-2 text-right">Total</th>
                        <th className="p-2 text-left">Estado</th>
                        <th className="p-2 text-left">Respuesta SUNAT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map(doc => {
                        // Determinar si es un "falso aceptado" (duplicado)
                        const isFalseAccepted = doc.sunatStatus === 'accepted' && (
                          DUPLICATE_CODES.includes(doc.sunatResponseCode || '') ||
                          DUPLICATE_MESSAGES.some(msg => (doc.sunatDescription || '').toLowerCase().includes(msg))
                        )

                        return (
                          <tr
                            key={doc.id}
                            className={`border-t hover:bg-gray-50 cursor-pointer ${
                              selectedDocs.includes(doc.id) ? 'bg-orange-50' : ''
                            } ${isFalseAccepted ? 'bg-yellow-50' : ''}`}
                            onClick={() => toggleSelectDoc(doc.id)}
                          >
                            <td className="p-2">
                              <input
                                type="checkbox"
                                checked={selectedDocs.includes(doc.id)}
                                onChange={() => toggleSelectDoc(doc.id)}
                                className="rounded"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </td>
                            <td className="p-2 font-mono text-xs">{doc.number}</td>
                            <td className="p-2 capitalize text-xs">{doc.documentType}</td>
                            <td className="p-2 truncate max-w-[120px] text-xs">
                              {doc.customer?.name || doc.customer?.businessName || '-'}
                            </td>
                            <td className="p-2 text-xs">{formatDate(doc.createdAt)}</td>
                            <td className="p-2 text-right text-xs">S/ {doc.total?.toFixed(2)}</td>
                            <td className="p-2">
                              {isFalseAccepted ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                  ⚠️ Duplicado
                                </span>
                              ) : doc.sunatStatus === 'rejected' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                  ❌ Rechazado
                                </span>
                              ) : doc.sunatStatus === 'pending' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                  ⏳ Pendiente
                                </span>
                              ) : doc.sunatStatus === 'sending' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                  📤 Enviando
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                  ✓ {doc.sunatStatus}
                                </span>
                              )}
                            </td>
                            <td className="p-2 text-xs max-w-[180px]">
                              <div className="truncate text-gray-600" title={doc.sunatDescription || ''}>
                                {doc.sunatResponseCode && (
                                  <span className="font-mono text-red-600 mr-1">[{doc.sunatResponseCode}]</span>
                                )}
                                {doc.sunatDescription || '-'}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nueva serie para los documentos seleccionados
                </label>
                <input
                  type="text"
                  value={newSeries}
                  onChange={(e) => setNewSeries(e.target.value.toUpperCase())}
                  placeholder="Ej: F002, B002"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Los documentos se numerarán consecutivamente en esta nueva serie
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Volver
                </button>
                <button
                  onClick={generatePreview}
                  disabled={selectedDocs.length === 0 || !newSeries || loading}
                  className="flex-1 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <FileText className="w-5 h-5" />
                  )}
                  Vista previa ({selectedDocs.length} docs)
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Confirmar */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-800">Vista previa de cambios</h3>
                <p className="text-sm text-blue-700 mt-1">
                  Revisa los cambios antes de confirmar. Los números antiguos serán reemplazados por los nuevos.
                </p>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="p-2 text-left">Número Actual</th>
                        <th className="p-2 text-center">→</th>
                        <th className="p-2 text-left">Nuevo Número</th>
                        <th className="p-2 text-left">Cliente</th>
                        <th className="p-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewNumbers.map(item => (
                        <tr key={item.id} className="border-t">
                          <td className="p-2 font-mono text-red-600 line-through">{item.oldNumber}</td>
                          <td className="p-2 text-center text-gray-400">→</td>
                          <td className="p-2 font-mono text-green-600 font-semibold">{item.newNumber}</td>
                          <td className="p-2 truncate max-w-[150px]">{item.customer}</td>
                          <td className="p-2 text-right">S/ {item.total?.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800 font-medium">
                  ⚠️ Esta acción no se puede deshacer. ¿Estás seguro de continuar?
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Volver
                </button>
                <button
                  onClick={processRenumbering}
                  disabled={processing}
                  className="flex-1 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processing ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-5 h-5" />
                  )}
                  Confirmar y renumerar
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Procesando / Completado */}
          {step === 4 && (
            <div className="space-y-4">
              {processing ? (
                <div className="text-center py-8">
                  <Loader2 className="w-12 h-12 animate-spin text-orange-500 mx-auto mb-4" />
                  <p className="text-lg font-medium">Procesando documentos...</p>
                  <p className="text-gray-500">
                    {processProgress.current} de {processProgress.total}
                  </p>
                  <div className="w-full max-w-xs mx-auto mt-4 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-orange-500 h-2 rounded-full transition-all"
                      style={{ width: `${(processProgress.current / processProgress.total) * 100}%` }}
                    />
                  </div>

                  {/* Mostrar resultados en tiempo real durante envío a SUNAT */}
                  {processProgress.results?.length > 0 && (
                    <div className="mt-4 text-left max-h-40 overflow-y-auto border rounded-lg p-2">
                      {processProgress.results.map((r, i) => (
                        <div key={i} className={`text-xs p-1 flex items-center gap-2 ${
                          r.status === 'accepted' ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {r.status === 'accepted' ? '✅' : '❌'}
                          <span className="font-mono">{r.number}</span>
                          <span className="truncate">{r.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : processProgress.results?.length > 0 ? (
                // Mostrar resultados de envío a SUNAT
                <div className="py-4">
                  <div className="text-center mb-4">
                    {processProgress.results.filter(r => r.status === 'accepted').length === processProgress.total ? (
                      <>
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Check className="w-8 h-8 text-green-600" />
                        </div>
                        <p className="text-lg font-medium text-green-600">¡Todos aceptados por SUNAT!</p>
                      </>
                    ) : (
                      <>
                        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <AlertTriangle className="w-8 h-8 text-yellow-600" />
                        </div>
                        <p className="text-lg font-medium text-yellow-600">Envío completado con resultados mixtos</p>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-center mb-4">
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-2xl font-bold text-green-600">
                        {processProgress.results.filter(r => r.status === 'accepted').length}
                      </p>
                      <p className="text-xs text-green-700">Aceptados</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3">
                      <p className="text-2xl font-bold text-red-600">
                        {processProgress.results.filter(r => r.status === 'rejected').length}
                      </p>
                      <p className="text-xs text-red-700">Rechazados</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-2xl font-bold text-gray-600">
                        {processProgress.results.filter(r => r.status !== 'accepted' && r.status !== 'rejected').length}
                      </p>
                      <p className="text-xs text-gray-700">Otros</p>
                    </div>
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    <div className="max-h-48 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="p-2 text-left">Documento</th>
                            <th className="p-2 text-left">Estado SUNAT</th>
                            <th className="p-2 text-left">Mensaje</th>
                          </tr>
                        </thead>
                        <tbody>
                          {processProgress.results.map((result, i) => (
                            <tr key={i} className="border-t">
                              <td className="p-2 font-mono text-xs">{result.number}</td>
                              <td className="p-2">
                                {result.status === 'accepted' ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                    ✅ Aceptado
                                  </span>
                                ) : result.status === 'rejected' ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                    ❌ Rechazado
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                    ⚠️ {result.status}
                                  </span>
                                )}
                              </td>
                              <td className="p-2 text-xs text-gray-600 truncate max-w-[200px]" title={result.message}>
                                {result.message || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="mt-4">
                    <button
                      onClick={() => {
                        resetModal()
                        onClose()
                      }}
                      className="w-full py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              ) : (
                // Mostrar resultados de renumeración (antes de enviar a SUNAT)
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-green-600" />
                  </div>
                  <p className="text-lg font-medium text-green-600">¡Renumeración completada!</p>
                  <p className="text-gray-500 mt-2">
                    {processProgress.total - processProgress.errors.length} documentos actualizados correctamente
                  </p>

                  {processProgress.errors.length > 0 && (
                    <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-left">
                      <p className="font-medium text-red-800">Errores ({processProgress.errors.length}):</p>
                      <ul className="text-sm text-red-700 mt-2 space-y-1">
                        {processProgress.errors.map((err, i) => (
                          <li key={i}>• {err.number}: {err.error}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-6 space-y-3">
                    <button
                      onClick={sendToSunat}
                      disabled={processing}
                      className="w-full py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-5 h-5" />
                      Enviar todos a SUNAT
                    </button>
                    <button
                      onClick={() => {
                        resetModal()
                        onClose()
                      }}
                      className="w-full py-2 border rounded-lg hover:bg-gray-50"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
