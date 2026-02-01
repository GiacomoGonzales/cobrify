import { useState, useEffect } from 'react'
import { Truck, Plus, FileText, Package, MapPin, User, Eye, Download, CheckCircle, Clock, XCircle, Send, Loader2, X, Calendar, Weight, Hash, Pencil, Search, Building2, CreditCard, Car, Code, Edit3, MoreVertical, Printer, FileCheck, Trash2, PlayCircle } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { getCarrierDispatchGuides, sendCarrierDispatchGuideToSunat, getCompanySettings, updateCarrierDispatchGuide, deleteCarrierDispatchGuide } from '@/services/firestoreService'
import CreateCarrierDispatchGuideModal from '@/components/CreateCarrierDispatchGuideModal'
import { generateCarrierDispatchGuidePDF, previewCarrierDispatchGuidePDF } from '@/utils/carrierDispatchGuidePdfGenerator'

const TRANSFER_REASONS = {
  '01': 'Venta',
  '02': 'Compra',
  '04': 'Traslado entre establecimientos',
  '08': 'Importación',
  '09': 'Exportación',
  '13': 'Otros',
}

// Helper para formatear fecha sin problemas de zona horaria
const formatTransferDate = (dateString) => {
  if (!dateString) return '-'
  if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-')
    return `${day}/${month}/${year}`
  }
  const date = new Date(dateString + 'T12:00:00')
  return date.toLocaleDateString('es-PE')
}

export default function CarrierDispatchGuides() {
  const { getBusinessId, isDemoMode } = useAppContext()
  const toast = useToast()

  const [guides, setGuides] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [sendingToSunat, setSendingToSunat] = useState(null)
  const [downloadingPdf, setDownloadingPdf] = useState(null)
  const [companySettings, setCompanySettings] = useState(null)
  const [selectedGuide, setSelectedGuide] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Estado para editar número de guía rechazada
  const [editingGuide, setEditingGuide] = useState(null)
  const [newCorrelative, setNewCorrelative] = useState('')
  const [isUpdatingNumber, setIsUpdatingNumber] = useState(false)

  // Estado para borrador que se está editando
  const [editingDraftGuide, setEditingDraftGuide] = useState(null)

  // Estado para dropdown menu de acciones
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0, openUpward: true })

  useEffect(() => {
    loadGuides()
    loadCompanySettings()
  }, [])

  const loadGuides = async () => {
    setIsLoading(true)
    try {
      if (isDemoMode) {
        console.log('🎭 MODO DEMO: Cargando guías de remisión transportista simuladas...')
        await new Promise(resolve => setTimeout(resolve, 500))
        setGuides([])
        setIsLoading(false)
        return
      }

      const businessId = getBusinessId()
      const result = await getCarrierDispatchGuides(businessId)

      if (result.success) {
        setGuides(result.data || [])
      } else {
        throw new Error(result.error || 'Error al cargar las guías')
      }
    } catch (error) {
      console.error('Error al cargar guías transportista:', error)
      toast.error('Error al cargar las guías de remisión transportista')
    } finally {
      setIsLoading(false)
    }
  }

  const loadCompanySettings = async () => {
    try {
      if (isDemoMode) {
        setCompanySettings({
          name: 'TRANSPORTES DEMO SAC',
          businessName: 'TRANSPORTES DEMO SOCIEDAD ANÓNIMA CERRADA',
          ruc: '20123456789',
          address: 'Av. Demo 123, Lima, Perú',
          mtcRegistration: 'MTC-12345',
          logoUrl: null
        })
        return
      }

      const businessId = getBusinessId()
      const result = await getCompanySettings(businessId)

      if (result.success && result.data) {
        setCompanySettings(result.data)
      }
    } catch (error) {
      console.error('Error al cargar datos de empresa:', error)
    }
  }

  const handleCreateGuide = () => {
    setShowCreateModal(true)
  }

  const handleCloseModal = () => {
    setShowCreateModal(false)
    setEditingDraftGuide(null)
    loadGuides()
  }

  const handleSendToSunat = async (guide) => {
    if (sendingToSunat) return

    setSendingToSunat(guide.id)

    try {
      if (isDemoMode) {
        console.log('🎭 MODO DEMO: Simulando envío a SUNAT...')
        toast.info(`Enviando guía ${guide.number} a SUNAT...`)
        await new Promise(resolve => setTimeout(resolve, 1500))
        setGuides(prev => prev.map(g =>
          g.id === guide.id ? { ...g, sunatStatus: 'accepted' } : g
        ))
        toast.success(`Guía ${guide.number} aceptada por SUNAT (Demo)`)
        setSendingToSunat(null)
        return
      }

      const businessId = getBusinessId()
      toast.info(`Enviando guía ${guide.number} a SUNAT...`)

      const result = await sendCarrierDispatchGuideToSunat(businessId, guide.id)

      if (result.success && result.accepted) {
        toast.success(`Guía ${guide.number} aceptada por SUNAT`)
      } else if (result.success && !result.accepted) {
        toast.warning(`Guía ${guide.number} rechazada: ${result.description || 'Error desconocido'}`)
      } else {
        toast.error(`Error al enviar guía: ${result.error || 'Error desconocido'}`)
      }

      await loadGuides()

    } catch (error) {
      console.error('Error al enviar guía a SUNAT:', error)
      toast.error(`Error al enviar guía: ${error.message}`)
    } finally {
      setSendingToSunat(null)
    }
  }

  // Abrir modal para editar número de guía rechazada
  const handleEditNumber = (guide) => {
    setEditingGuide(guide)
    // Extraer solo el correlativo del número (V001-00000302 -> 302)
    const currentCorrelative = guide.correlative || parseInt(guide.number?.split('-')[1]) || 0
    setNewCorrelative(String(currentCorrelative))
  }

  // Guardar nuevo número de guía
  const handleSaveNewNumber = async () => {
    if (!editingGuide || !newCorrelative) return

    const correlative = parseInt(newCorrelative)
    if (isNaN(correlative) || correlative <= 0) {
      toast.error('Ingrese un número correlativo válido')
      return
    }

    setIsUpdatingNumber(true)
    try {
      const businessId = getBusinessId()
      const series = editingGuide.series || 'V001'
      const newNumber = `${series}-${String(correlative).padStart(8, '0')}`

      // Verificar si el número ya existe
      const existingGuide = guides.find(g => g.number === newNumber && g.id !== editingGuide.id)
      if (existingGuide) {
        toast.error(`El número ${newNumber} ya existe`)
        return
      }

      const result = await updateCarrierDispatchGuide(businessId, editingGuide.id, {
        correlative: correlative,
        number: newNumber,
        sunatStatus: 'pending', // Resetear estado para permitir reenvío
        sunatResponseCode: null,
        sunatDescription: null,
      })

      if (result.success) {
        toast.success(`Número actualizado a ${newNumber}`)
        // Actualizar la lista local
        setGuides(prev => prev.map(g =>
          g.id === editingGuide.id
            ? { ...g, correlative, number: newNumber, sunatStatus: 'pending', sunatResponseCode: null, sunatDescription: null }
            : g
        ))
        setEditingGuide(null)
        setNewCorrelative('')
      } else {
        throw new Error(result.error || 'Error al actualizar')
      }
    } catch (error) {
      console.error('Error al actualizar número de guía:', error)
      toast.error(error.message || 'Error al actualizar el número')
    } finally {
      setIsUpdatingNumber(false)
    }
  }

  const handleDownloadPdf = async (guide) => {
    if (downloadingPdf) return

    if (!companySettings) {
      toast.error('Cargando datos de empresa, intente de nuevo')
      return
    }

    setDownloadingPdf(guide.id)
    try {
      toast.info(`Generando PDF de ${guide.number}...`)
      await generateCarrierDispatchGuidePDF(guide, companySettings)
      toast.success('PDF descargado correctamente')
    } catch (error) {
      console.error('Error al generar PDF:', error)
      toast.error('Error al generar el PDF')
    } finally {
      setDownloadingPdf(null)
    }
  }

  // Vista previa del PDF (abre en nueva pestaña)
  const handlePreviewPdf = async (guide) => {
    if (!companySettings) {
      toast.error('Cargando datos de empresa, intente de nuevo')
      return
    }

    try {
      toast.info(`Generando vista previa...`)
      await previewCarrierDispatchGuidePDF(guide, companySettings)
    } catch (error) {
      console.error('Error al generar vista previa:', error)
      toast.error('Error al generar vista previa')
    }
  }

  // Eliminar borrador
  const handleDeleteDraft = async (guide) => {
    if (!confirm('¿Estás seguro de eliminar este borrador? Esta acción no se puede deshacer.')) return

    try {
      const businessId = getBusinessId()
      const result = await deleteCarrierDispatchGuide(businessId, guide.id)
      if (result.success) {
        toast.success('Borrador eliminado')
        setGuides(prev => prev.filter(g => g.id !== guide.id))
      } else {
        throw new Error(result.error || 'Error al eliminar')
      }
    } catch (error) {
      console.error('Error al eliminar borrador:', error)
      toast.error(error.message || 'Error al eliminar el borrador')
    }
  }

  // Continuar emisión de borrador
  const handleContinueDraft = (guide) => {
    setEditingDraftGuide(guide)
    setShowCreateModal(true)
  }

  // Filtrar guías
  const filteredGuides = guides.filter(guide => {
    const search = searchTerm.toLowerCase()
    return !searchTerm ||
      guide.number?.toLowerCase().includes(search) ||
      guide.destination?.address?.toLowerCase().includes(search) ||
      guide.vehicle?.plate?.toLowerCase().includes(search) ||
      guide.shipper?.businessName?.toLowerCase().includes(search)
  })

  // Estadísticas
  const stats = {
    total: filteredGuides.length,
    inTransit: filteredGuides.filter(g => g.status === 'in_transit').length,
    delivered: filteredGuides.filter(g => g.status === 'delivered').length,
    thisMonth: filteredGuides.filter(g => {
      if (!g.createdAt) return false
      const guideDate = g.createdAt.toDate ? g.createdAt.toDate() : new Date(g.createdAt)
      const now = new Date()
      return guideDate.getMonth() === now.getMonth() && guideDate.getFullYear() === now.getFullYear()
    }).length,
  }

  const getStatusBadge = (status, sunatStatus) => {
    if (status === 'draft') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
          <FileText className="w-3 h-3" />
          Borrador
        </span>
      )
    }

    if (sunatStatus === 'accepted') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3" />
          Aceptada por SUNAT
        </span>
      )
    }

    if (sunatStatus === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
          <XCircle className="w-3 h-3" />
          Rechazada
        </span>
      )
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
        <Clock className="w-3 h-3" />
        Pendiente
      </span>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Truck className="w-8 h-8 text-orange-600" />
            Guías de Remisión - Transportista
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Emite guías de remisión como empresa transportista
          </p>
        </div>
        <Button className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700 border-orange-700" onClick={handleCreateGuide}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva GRE Transportista
        </Button>
      </div>

      {/* Info Banner */}
      <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-l-4 border-orange-500 p-4 rounded-lg">
        <div className="flex items-start gap-3">
          <Truck className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-orange-900 mb-1">
              ¿Qué es la GRE Transportista?
            </h3>
            <p className="text-sm text-orange-800 leading-relaxed">
              Es el documento electrónico emitido por la <strong>empresa de transporte</strong> para sustentar
              el traslado de bienes. Requiere datos del vehículo, conductor y referencia a la GRE Remitente.
              <strong> Serie: V001</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Guías</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
              </div>
              <div className="p-3 bg-orange-100 rounded-lg">
                <FileText className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">En Tránsito</p>
                <p className="text-2xl font-bold text-blue-600 mt-1">{stats.inTransit}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Truck className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Entregadas</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{stats.delivered}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <Package className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Este Mes</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats.thisMonth}</p>
              </div>
              <div className="p-3 bg-gray-100 rounded-lg">
                <FileText className="w-6 h-6 text-gray-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
            <Search className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <input
              type="text"
              placeholder="Buscar por número, destino, placa o remitente..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
            />
          </div>
        </CardContent>
      </Card>

      {/* Guides List */}
      <Card>
        <CardHeader>
          <CardTitle>Listado de Guías de Remisión Transportista</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Cargando guías de remisión transportista...</p>
            </div>
          ) : filteredGuides.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-100 rounded-full mb-4">
                <Truck className="w-8 h-8 text-orange-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {searchTerm ? 'No se encontraron guías' : 'No hay guías de remisión transportista'}
              </h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                {searchTerm
                  ? 'Intenta con otros términos de búsqueda'
                  : 'Emite tu primera guía de remisión como transportista para documentar el servicio de transporte.'}
              </p>
              {!searchTerm && (
                <Button onClick={handleCreateGuide} className="bg-orange-600 hover:bg-orange-700">
                  <Plus className="w-5 h-5 mr-2" />
                  Crear Primera GRE Transportista
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Número
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fecha
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Remitente
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Vehículo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Destino
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredGuides.map((guide) => (
                    <tr key={guide.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-orange-400" />
                          <span className={`text-sm font-medium ${guide.status === 'draft' ? 'text-gray-400 italic' : 'text-gray-900'}`}>
                            {guide.number || 'Sin número'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatTransferDate(guide.transferDate)}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-sm text-gray-900">
                          <Building2 className="w-3 h-3 text-gray-400" />
                          <span className="truncate max-w-[150px]">
                            {guide.shipper?.businessName || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-sm text-gray-900">
                          <Car className="w-3 h-3 text-gray-400" />
                          {guide.vehicle?.plate || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-1 text-sm text-gray-600 max-w-xs">
                          <MapPin className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                          <span className="line-clamp-2">{guide.destination?.address || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {getStatusBadge(guide.status, guide.sunatStatus)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {/* Botón de menú */}
                        <button
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            const menuHeight = 350
                            const spaceBelow = window.innerHeight - rect.bottom
                            const openUpward = spaceBelow < menuHeight

                            setMenuPosition({
                              top: openUpward ? rect.top - 10 : rect.bottom + 10,
                              right: window.innerWidth - rect.right,
                              openUpward
                            })
                            setOpenMenuId(openMenuId === guide.id ? null : guide.id)
                          }}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Acciones"
                        >
                          <MoreVertical className="w-5 h-5 text-gray-500" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dropdown Menu (fuera del contenedor, con position fixed) */}
      {openMenuId && (
        <>
          {/* Backdrop para cerrar al hacer clic fuera */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpenMenuId(null)}
          />

          {/* Menu */}
          <div
            className="fixed w-52 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50"
            style={{
              top: `${menuPosition.top}px`,
              right: `${menuPosition.right}px`,
              transform: menuPosition.openUpward ? 'translateY(-100%)' : 'translateY(0)',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}
          >
            {(() => {
              const guide = filteredGuides.find(g => g.id === openMenuId)
              if (!guide) return null

              return (
                <>
                  {/* Continuar Emisión - Solo para borradores */}
                  {guide.status === 'draft' && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        handleContinueDraft(guide)
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-3 text-blue-600"
                    >
                      <PlayCircle className="w-4 h-4" />
                      <span>Continuar Emisión</span>
                    </button>
                  )}

                  {/* Ver detalles */}
                  <button
                    onClick={() => {
                      setOpenMenuId(null)
                      setSelectedGuide(guide)
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                  >
                    <Eye className="w-4 h-4 text-orange-600" />
                    <span>Ver detalles</span>
                  </button>

                  {/* Vista previa / Imprimir */}
                  <button
                    onClick={() => {
                      setOpenMenuId(null)
                      handlePreviewPdf(guide)
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                  >
                    <Printer className="w-4 h-4 text-purple-600" />
                    <span>Vista previa / Imprimir</span>
                  </button>

                  {/* Descargar PDF */}
                  <button
                    onClick={() => {
                      setOpenMenuId(null)
                      handleDownloadPdf(guide)
                    }}
                    disabled={downloadingPdf === guide.id}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3 disabled:opacity-50"
                  >
                    {downloadingPdf === guide.id ? (
                      <Loader2 className="w-4 h-4 text-green-600 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 text-green-600" />
                    )}
                    <span>{downloadingPdf === guide.id ? 'Generando...' : 'Descargar PDF'}</span>
                  </button>

                  {/* XML SUNAT - Solo si fue aceptada */}
                  {guide.sunatStatus === 'accepted' && (guide.xmlStorageUrl || guide.xmlUrl || guide.sunatResponse?.xmlStorageUrl || guide.sunatResponse?.xmlUrl || guide.xmlData || guide.sunatResponse?.xmlData) && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        if (guide.xmlStorageUrl) {
                          window.open(guide.xmlStorageUrl, '_blank')
                        } else if (guide.xmlUrl) {
                          window.open(guide.xmlUrl, '_blank')
                        } else if (guide.sunatResponse?.xmlStorageUrl) {
                          window.open(guide.sunatResponse.xmlStorageUrl, '_blank')
                        } else if (guide.sunatResponse?.xmlUrl) {
                          window.open(guide.sunatResponse.xmlUrl, '_blank')
                        } else if (guide.xmlData || guide.sunatResponse?.xmlData) {
                          const xmlData = guide.xmlData || guide.sunatResponse.xmlData
                          const blob = new Blob([xmlData], { type: 'application/xml' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `${guide.number}.xml`
                          document.body.appendChild(a)
                          a.click()
                          document.body.removeChild(a)
                          URL.revokeObjectURL(url)
                        }
                        toast.success('Descargando XML de SUNAT')
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                    >
                      <Code className="w-4 h-4 text-indigo-600" />
                      <span>XML SUNAT</span>
                    </button>
                  )}

                  {/* CDR SUNAT - Solo si fue aceptada */}
                  {guide.sunatStatus === 'accepted' && (guide.cdrStorageUrl || guide.cdrUrl || guide.sunatResponse?.cdrStorageUrl || guide.sunatResponse?.cdrUrl || guide.cdrData || guide.sunatResponse?.cdrData) && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        if (guide.cdrStorageUrl) {
                          window.open(guide.cdrStorageUrl, '_blank')
                        } else if (guide.cdrUrl) {
                          window.open(guide.cdrUrl, '_blank')
                        } else if (guide.sunatResponse?.cdrStorageUrl) {
                          window.open(guide.sunatResponse.cdrStorageUrl, '_blank')
                        } else if (guide.sunatResponse?.cdrUrl) {
                          window.open(guide.sunatResponse.cdrUrl, '_blank')
                        } else if (guide.cdrData || guide.sunatResponse?.cdrData) {
                          const cdrData = guide.cdrData || guide.sunatResponse.cdrData
                          const blob = new Blob([cdrData], { type: 'application/xml' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `CDR-${guide.number}.xml`
                          document.body.appendChild(a)
                          a.click()
                          document.body.removeChild(a)
                          URL.revokeObjectURL(url)
                        }
                        toast.success('Descargando CDR de SUNAT')
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                    >
                      <FileCheck className="w-4 h-4 text-green-600" />
                      <span>CDR SUNAT</span>
                    </button>
                  )}

                  {/* Separador antes de acciones SUNAT */}
                  {guide.sunatStatus !== 'accepted' && guide.status !== 'draft' && (
                    <div className="border-t border-gray-100 my-1" />
                  )}

                  {/* Enviar a SUNAT - Solo si no está aceptada y no es borrador */}
                  {guide.sunatStatus !== 'accepted' && guide.status !== 'draft' && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        handleSendToSunat(guide)
                      }}
                      disabled={sendingToSunat === guide.id}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-orange-50 flex items-center gap-3 text-orange-600 disabled:opacity-50"
                    >
                      {sendingToSunat === guide.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>{sendingToSunat === guide.id ? 'Enviando...' : 'Enviar a SUNAT'}</span>
                    </button>
                  )}

                  {/* Cambiar número - Solo si rechazada o error */}
                  {(guide.sunatStatus === 'rejected' || guide.sunatStatus === 'error') && guide.number && (
                    <>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => {
                          setOpenMenuId(null)
                          handleEditNumber(guide)
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-3 text-blue-600"
                      >
                        <Edit3 className="w-4 h-4" />
                        <span>Cambiar número</span>
                      </button>
                    </>
                  )}

                  {/* Eliminar borrador */}
                  {guide.status === 'draft' && (
                    <>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => {
                          setOpenMenuId(null)
                          handleDeleteDraft(guide)
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 flex items-center gap-3 text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Eliminar borrador</span>
                      </button>
                    </>
                  )}
                </>
              )
            })()}
          </div>
        </>
      )}

      {/* Information Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Car className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Vehículo y Conductor</h4>
                <p className="text-sm text-gray-600">
                  Datos obligatorios: placa del vehículo, licencia de conducir y DNI del conductor.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">GRE Remitente</h4>
                <p className="text-sm text-gray-600">
                  Referencia a la guía del remitente que origina el servicio de transporte.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CreditCard className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Registro MTC</h4>
                <p className="text-sm text-gray-600">
                  Requerido si el vehículo tiene capacidad mayor a 2 toneladas métricas.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Guide Modal */}
      <CreateCarrierDispatchGuideModal
        isOpen={showCreateModal}
        onClose={handleCloseModal}
        draftGuide={editingDraftGuide}
      />

      {/* Edit Number Modal */}
      {editingGuide && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Edit3 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Cambiar Número</h2>
                  <p className="text-blue-100 text-sm">{editingGuide.number}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setEditingGuide(null)
                  setNewCorrelative('')
                }}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                <p className="font-medium">Esta guía fue rechazada por SUNAT</p>
                <p className="mt-1">El número {editingGuide.number} ya no puede ser usado. Asigne un nuevo número para reintentar el envío.</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="bg-gray-100 px-4 py-2 rounded-lg font-mono text-lg">
                  {editingGuide.series || 'V001'}-
                </div>
                <Input
                  type="number"
                  value={newCorrelative}
                  onChange={(e) => setNewCorrelative(e.target.value)}
                  placeholder="Nuevo correlativo"
                  className="font-mono text-lg"
                  min="1"
                />
              </div>

              <p className="text-sm text-gray-500">
                Nuevo número: <span className="font-mono font-medium">
                  {editingGuide.series || 'V001'}-{String(parseInt(newCorrelative) || 0).padStart(8, '0')}
                </span>
              </p>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setEditingGuide(null)
                  setNewCorrelative('')
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveNewNumber}
                disabled={isUpdatingNumber || !newCorrelative}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isUpdatingNumber ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar y Reenviar'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Guide Modal */}
      {selectedGuide && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-600 to-orange-700 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Truck className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">GRE Transportista</h2>
                  <p className="text-orange-100 text-sm">{selectedGuide.number}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedGuide(null)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)] space-y-6">
              {/* Estado */}
              <div className="flex justify-center">
                {getStatusBadge(selectedGuide.status, selectedGuide.sunatStatus)}
              </div>

              {/* GRE Remitente Relacionada */}
              {selectedGuide.relatedGuides && selectedGuide.relatedGuides.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    GRE Remitente Relacionada(s)
                  </h3>
                  <div className="space-y-2">
                    {selectedGuide.relatedGuides.map((related, idx) => (
                      <div key={idx} className="text-sm">
                        <span className="font-medium">{related.number}</span>
                        {related.ruc && <span className="text-gray-500 ml-2">RUC: {related.ruc}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Datos del Traslado */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-orange-600" />
                  Datos del Traslado
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Fecha de traslado:</span>
                    <p className="font-medium">{formatTransferDate(selectedGuide.transferDate)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Motivo:</span>
                    <p className="font-medium">{TRANSFER_REASONS[selectedGuide.transferReason] || selectedGuide.transferReason}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Peso total:</span>
                    <p className="font-medium">{selectedGuide.totalWeight || '0'} KG</p>
                  </div>
                </div>
              </div>

              {/* Puntos de Traslado */}
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  Puntos de Traslado
                </h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-gray-500">Punto de partida:</span>
                    <p className="font-medium">{selectedGuide.origin?.address || '-'}</p>
                    {selectedGuide.origin?.ubigeo && (
                      <p className="text-xs text-gray-400">Ubigeo: {selectedGuide.origin.ubigeo}</p>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-500">Punto de llegada:</span>
                    <p className="font-medium">{selectedGuide.destination?.address || '-'}</p>
                    {selectedGuide.destination?.ubigeo && (
                      <p className="text-xs text-gray-400">Ubigeo: {selectedGuide.destination.ubigeo}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Remitente */}
              <div className="bg-indigo-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  Remitente
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Razón social:</span>
                    <p className="font-medium">{selectedGuide.shipper?.businessName || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">RUC:</span>
                    <p className="font-medium">{selectedGuide.shipper?.ruc || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Destinatario */}
              <div className="bg-green-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4 text-green-600" />
                  Destinatario
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Razón social:</span>
                    <p className="font-medium">{selectedGuide.recipient?.name || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">RUC/DNI:</span>
                    <p className="font-medium">{selectedGuide.recipient?.documentNumber || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Vehículo y Conductor */}
              <div className="bg-orange-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Car className="w-4 h-4 text-orange-600" />
                  Vehículo y Conductor
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Placa:</span>
                    <p className="font-medium">{selectedGuide.vehicle?.plate || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Registro MTC:</span>
                    <p className="font-medium">{selectedGuide.vehicle?.mtcRegistration || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Conductor:</span>
                    <p className="font-medium">
                      {[selectedGuide.driver?.name, selectedGuide.driver?.lastName].filter(Boolean).join(' ') || '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">DNI Conductor:</span>
                    <p className="font-medium">{selectedGuide.driver?.documentNumber || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Licencia:</span>
                    <p className="font-medium">{selectedGuide.driver?.license || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Bienes */}
              <div className="bg-purple-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4 text-purple-600" />
                  Bienes a Transportar ({selectedGuide.items?.length || 0})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-purple-200">
                        <th className="text-left py-2 px-2 text-gray-600">#</th>
                        <th className="text-left py-2 px-2 text-gray-600">Descripción</th>
                        <th className="text-center py-2 px-2 text-gray-600">Cantidad</th>
                        <th className="text-center py-2 px-2 text-gray-600">Unidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedGuide.items || []).map((item, index) => (
                        <tr key={index} className="border-b border-purple-100">
                          <td className="py-2 px-2 text-gray-500">{index + 1}</td>
                          <td className="py-2 px-2 font-medium">{item.description || item.name || '-'}</td>
                          <td className="py-2 px-2 text-center">{item.quantity || 1}</td>
                          <td className="py-2 px-2 text-center">{item.unit || 'UNIDAD'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Hash SUNAT */}
              {selectedGuide.sunatHash && (
                <div className="bg-gray-100 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <Hash className="w-4 h-4 text-gray-600" />
                    Hash SUNAT
                  </h3>
                  <p className="text-sm font-mono text-gray-600 break-all">{selectedGuide.sunatHash}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t px-6 py-4 bg-gray-50 flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={() => setSelectedGuide(null)}>
                Cerrar
              </Button>

              {/* Descargar XML - Solo si tiene XML guardado */}
              {selectedGuide.sunatStatus === 'accepted' && (selectedGuide.xmlStorageUrl || selectedGuide.xmlUrl || selectedGuide.sunatResponse?.xmlStorageUrl || selectedGuide.sunatResponse?.xmlUrl || selectedGuide.xmlData || selectedGuide.sunatResponse?.xmlData) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (selectedGuide.xmlStorageUrl) {
                      window.open(selectedGuide.xmlStorageUrl, '_blank')
                    } else if (selectedGuide.xmlUrl) {
                      window.open(selectedGuide.xmlUrl, '_blank')
                    } else if (selectedGuide.sunatResponse?.xmlStorageUrl) {
                      window.open(selectedGuide.sunatResponse.xmlStorageUrl, '_blank')
                    } else if (selectedGuide.sunatResponse?.xmlUrl) {
                      window.open(selectedGuide.sunatResponse.xmlUrl, '_blank')
                    } else if (selectedGuide.xmlData || selectedGuide.sunatResponse?.xmlData) {
                      const xmlData = selectedGuide.xmlData || selectedGuide.sunatResponse.xmlData
                      const blob = new Blob([xmlData], { type: 'application/xml' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `${selectedGuide.number}.xml`
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                      URL.revokeObjectURL(url)
                    }
                  }}
                >
                  <Code className="w-4 h-4 mr-2" />
                  XML SUNAT
                </Button>
              )}

              {/* Descargar CDR - Solo si fue aceptada y tiene CDR */}
              {selectedGuide.sunatStatus === 'accepted' && (selectedGuide.cdrStorageUrl || selectedGuide.cdrUrl || selectedGuide.sunatResponse?.cdrStorageUrl || selectedGuide.sunatResponse?.cdrUrl || selectedGuide.cdrData || selectedGuide.sunatResponse?.cdrData) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (selectedGuide.cdrStorageUrl) {
                      window.open(selectedGuide.cdrStorageUrl, '_blank')
                    } else if (selectedGuide.cdrUrl) {
                      window.open(selectedGuide.cdrUrl, '_blank')
                    } else if (selectedGuide.sunatResponse?.cdrStorageUrl) {
                      window.open(selectedGuide.sunatResponse.cdrStorageUrl, '_blank')
                    } else if (selectedGuide.sunatResponse?.cdrUrl) {
                      window.open(selectedGuide.sunatResponse.cdrUrl, '_blank')
                    } else if (selectedGuide.cdrData || selectedGuide.sunatResponse?.cdrData) {
                      const cdrData = selectedGuide.cdrData || selectedGuide.sunatResponse.cdrData
                      const blob = new Blob([cdrData], { type: 'application/xml' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `CDR-${selectedGuide.number}.xml`
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                      URL.revokeObjectURL(url)
                    }
                  }}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  CDR SUNAT
                </Button>
              )}

              <Button
                onClick={() => handleDownloadPdf(selectedGuide)}
                disabled={downloadingPdf === selectedGuide.id}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {downloadingPdf === selectedGuide.id ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Descargar PDF
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
