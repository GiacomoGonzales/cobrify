import { useState, useEffect, useRef } from 'react'
import { Truck, Plus, FileText, Package, MapPin, User, Eye, Download, CheckCircle, Clock, XCircle, Send, Loader2, AlertCircle, X, Calendar, Weight, Hash, Pencil, Store, Search, Code, Share2, Printer, MoreVertical, FileCheck, Receipt } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { getDispatchGuides, sendDispatchGuideToSunat, getCompanySettings, getProducts } from '@/services/firestoreService'
import CreateDispatchGuideModal from '@/components/CreateDispatchGuideModal'
import EditDispatchGuideModal from '@/components/EditDispatchGuideModal'
import DispatchGuideTicket from '@/components/DispatchGuideTicket'
import { generateDispatchGuidePDF, previewDispatchGuidePDF, shareDispatchGuidePDF } from '@/utils/dispatchGuidePdfGenerator'
import { getActiveBranches } from '@/services/branchService'
import { Capacitor } from '@capacitor/core'

const TRANSFER_REASONS = {
  '01': 'Venta',
  '02': 'Compra',
  '04': 'Traslado entre establecimientos',
  '08': 'Importación',
  '09': 'Exportación',
  '13': 'Otros',
}

const TRANSPORT_MODES = {
  '01': 'Transporte Público',
  '02': 'Transporte Privado',
}

// Helper para formatear fecha sin problemas de zona horaria
// Cuando se parsea "2024-12-14" con new Date(), JavaScript lo interpreta como UTC
// lo que causa que en Perú (UTC-5) se muestre el día anterior
const formatTransferDate = (dateString) => {
  if (!dateString) return '-'
  // Si es formato YYYY-MM-DD, formatear directamente sin pasar por Date
  if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-')
    return `${day}/${month}/${year}`
  }
  // Para otros formatos, usar el método tradicional con ajuste
  const date = new Date(dateString + 'T12:00:00')
  return date.toLocaleDateString('es-PE')
}

// Datos demo para guías de remisión
const DEMO_GUIDES = [
  {
    id: 'demo-guide-1',
    number: 'T001-00000001',
    transferDate: new Date().toISOString(),
    transferReason: '01',
    transportMode: '02',
    destination: { address: 'Av. Larco 1234, Miraflores, Lima' },
    items: [{ description: 'Producto Demo 1', quantity: 10 }, { description: 'Producto Demo 2', quantity: 5 }],
    status: 'in_transit',
    sunatStatus: 'accepted',
    createdAt: new Date(),
  },
  {
    id: 'demo-guide-2',
    number: 'T001-00000002',
    transferDate: new Date(Date.now() - 86400000).toISOString(), // Ayer
    transferReason: '04',
    transportMode: '01',
    destination: { address: 'Jr. de la Unión 456, Centro de Lima' },
    items: [{ description: 'Mercadería variada', quantity: 20 }],
    status: 'delivered',
    sunatStatus: 'accepted',
    createdAt: new Date(Date.now() - 86400000),
  },
  {
    id: 'demo-guide-3',
    number: 'T001-00000003',
    transferDate: new Date(Date.now() - 172800000).toISOString(), // Hace 2 días
    transferReason: '13',
    transportMode: '02',
    destination: { address: 'Calle Los Pinos 789, San Isidro, Lima' },
    items: [{ description: 'Equipos electrónicos', quantity: 3 }],
    status: 'pending',
    sunatStatus: 'pending',
    createdAt: new Date(Date.now() - 172800000),
  },
]

export default function DispatchGuides() {
  const { getBusinessId, isDemoMode, filterBranchesByAccess, user } = useAppContext()
  const toast = useToast()

  const [guides, setGuides] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [sendingToSunat, setSendingToSunat] = useState(null) // ID de guía siendo enviada
  const [downloadingPdf, setDownloadingPdf] = useState(null) // ID de guía descargándose
  const [previewingPdf, setPreviewingPdf] = useState(null) // ID de guía en vista previa
  const [sharingPdf, setSharingPdf] = useState(null) // ID de guía siendo compartida
  const [printingTicket, setPrintingTicket] = useState(null) // Guía para imprimir en ticket
  const ticketRef = useRef(null) // Ref para el componente de ticket
  const [companySettings, setCompanySettings] = useState(null) // Datos de la empresa
  const [selectedGuide, setSelectedGuide] = useState(null) // Guía seleccionada para ver detalles
  const [editingGuide, setEditingGuide] = useState(null) // Guía en edición
  const [branches, setBranches] = useState([])
  const [filterBranch, setFilterBranch] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Estado para dropdown menu de acciones
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0, openUpward: true })

  // Detectar si estamos en móvil
  const isNativePlatform = Capacitor.isNativePlatform()

  // Cargar guías y datos de empresa al montar el componente
  useEffect(() => {
    loadGuides()
    loadCompanySettings()
    loadBranches()
  }, [])

  // Cargar sucursales para filtro
  const loadBranches = async () => {
    if (!user?.uid || isDemoMode) return
    try {
      const result = await getActiveBranches(getBusinessId())
      if (result.success) {
        const branchList = filterBranchesByAccess ? filterBranchesByAccess(result.data || []) : (result.data || [])
        setBranches(branchList)
      }
    } catch (error) {
      console.error('Error al cargar sucursales:', error)
    }
  }

  const loadGuides = async () => {
    setIsLoading(true)
    try {
      // MODO DEMO: Usar datos simulados
      if (isDemoMode) {
        console.log('🎭 MODO DEMO: Cargando guías de remisión simuladas...')
        await new Promise(resolve => setTimeout(resolve, 500)) // Simular delay
        setGuides(DEMO_GUIDES)
        setIsLoading(false)
        return
      }

      const businessId = getBusinessId()
      const result = await getDispatchGuides(businessId)

      if (result.success) {
        setGuides(result.data)
      } else {
        throw new Error(result.error || 'Error al cargar las guías')
      }
    } catch (error) {
      console.error('Error al cargar guías:', error)
      toast.error('Error al cargar las guías de remisión')
    } finally {
      setIsLoading(false)
    }
  }

  const loadCompanySettings = async () => {
    try {
      // MODO DEMO: Usar datos simulados
      if (isDemoMode) {
        setCompanySettings({
          name: 'EMPRESA DEMO SAC',
          businessName: 'EMPRESA DEMO SOCIEDAD ANÓNIMA CERRADA',
          ruc: '20123456789',
          address: 'Av. Demo 123, Lima, Perú',
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
    loadGuides() // Recargar guías después de crear una
  }

  // Enviar guía a SUNAT
  const handleSendToSunat = async (guide) => {
    if (sendingToSunat) return // Evitar múltiples envíos simultáneos

    setSendingToSunat(guide.id)

    try {
      // MODO DEMO: Simular envío a SUNAT
      if (isDemoMode) {
        console.log('🎭 MODO DEMO: Simulando envío a SUNAT...')
        toast.info(`Enviando guía ${guide.number} a SUNAT...`)
        await new Promise(resolve => setTimeout(resolve, 1500)) // Simular delay

        // Actualizar estado de la guía demo
        setGuides(prev => prev.map(g =>
          g.id === guide.id
            ? { ...g, sunatStatus: 'accepted' }
            : g
        ))
        toast.success(`Guía ${guide.number} aceptada por SUNAT (Demo)`)
        setSendingToSunat(null)
        return
      }

      const businessId = getBusinessId()
      toast.info(`Enviando guía ${guide.number} a SUNAT...`)

      const result = await sendDispatchGuideToSunat(businessId, guide.id)

      if (result.success && result.accepted) {
        toast.success(`Guía ${guide.number} aceptada por SUNAT`)
      } else if (result.success && !result.accepted) {
        toast.warning(`Guía ${guide.number} rechazada: ${result.description || 'Error desconocido'}`)
      } else {
        toast.error(`Error al enviar guía: ${result.error || 'Error desconocido'}`)
      }

      // Recargar guías para mostrar el nuevo estado
      await loadGuides()

    } catch (error) {
      console.error('Error al enviar guía a SUNAT:', error)
      toast.error(`Error al enviar guía: ${error.message}`)
    } finally {
      setSendingToSunat(null)
    }
  }

  // Descargar PDF de guía de remisión
  const handleDownloadPdf = async (guide) => {
    if (downloadingPdf) return

    if (!companySettings) {
      toast.error('Cargando datos de empresa, intente de nuevo')
      return
    }

    setDownloadingPdf(guide.id)
    try {
      toast.info(`Generando PDF de ${guide.number}...`)
      // Cargar productos para obtener SKU actualizado
      let products = []
      const businessId = getBusinessId()
      if (businessId) {
        const productsResult = await getProducts(businessId)
        if (productsResult.success) {
          products = productsResult.data || []
        }
      }
      await generateDispatchGuidePDF(guide, companySettings, true, products)
      toast.success('PDF descargado correctamente')
    } catch (error) {
      console.error('Error al generar PDF:', error)
      toast.error('Error al generar el PDF')
    } finally {
      setDownloadingPdf(null)
    }
  }

  // Vista previa del PDF
  const handlePreviewPdf = async (guide) => {
    if (previewingPdf) return

    if (!companySettings) {
      toast.error('Cargando datos de empresa, intente de nuevo')
      return
    }

    setPreviewingPdf(guide.id)
    try {
      toast.info(`Generando vista previa de ${guide.number}...`)
      await previewDispatchGuidePDF(guide, companySettings)
    } catch (error) {
      console.error('Error al generar vista previa:', error)
      toast.error('Error al generar la vista previa')
    } finally {
      setPreviewingPdf(null)
    }
  }

  // Compartir PDF
  const handleSharePdf = async (guide, method = 'share') => {
    if (sharingPdf) return

    if (!companySettings) {
      toast.error('Cargando datos de empresa, intente de nuevo')
      return
    }

    setSharingPdf(guide.id)
    try {
      toast.info(`Preparando PDF para compartir...`)
      const result = await shareDispatchGuidePDF(guide, companySettings, method)
      if (result.success) {
        if (!isNativePlatform) {
          toast.success('PDF listo para compartir')
        }
      }
    } catch (error) {
      console.error('Error al compartir PDF:', error)
      toast.error('Error al compartir el PDF')
    } finally {
      setSharingPdf(null)
    }
  }

  // Imprimir en formato ticket (impresora térmica)
  const handlePrintTicket = (guide) => {
    if (!companySettings) {
      toast.error('Cargando datos de empresa, intente de nuevo')
      return
    }

    // Establecer la guía a imprimir
    setPrintingTicket(guide)

    // Esperar a que el componente se renderice y luego imprimir
    setTimeout(() => {
      window.print()
      // Limpiar después de imprimir
      setTimeout(() => {
        setPrintingTicket(null)
      }, 500)
    }, 100)
  }

  // Filtrar guías
  const filteredGuides = guides.filter(guide => {
    // Filtrar por búsqueda
    const search = searchTerm.toLowerCase()
    const matchesSearch = !searchTerm ||
      guide.number?.toLowerCase().includes(search) ||
      guide.destination?.address?.toLowerCase().includes(search)

    // Filtrar por sucursal
    let matchesBranch = true
    if (filterBranch !== 'all') {
      if (filterBranch === 'main') {
        matchesBranch = !guide.branchId
      } else {
        matchesBranch = guide.branchId === filterBranch
      }
    }

    return matchesSearch && matchesBranch
  })

  // Calcular estadísticas (sobre guías filtradas)
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
            <Truck className="w-8 h-8 text-primary-600" />
            Guías de Remisión Electrónicas
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Gestiona las guías de remisión para el transporte de mercancías
          </p>
        </div>
        <Button className="w-full sm:w-auto" onClick={handleCreateGuide}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Guía de Remisión
        </Button>
      </div>

      {/* Info Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-primary-50 border-l-4 border-primary-500 p-4 rounded-lg">
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-primary-900 mb-1">
              ¿Qué es una Guía de Remisión Electrónica (GRE)?
            </h3>
            <p className="text-sm text-primary-800 leading-relaxed">
              Es un documento electrónico obligatorio para el traslado de bienes, validado por SUNAT.
              Permite la trazabilidad del transporte y control fiscal. <strong>Obligatorio desde julio 2025.</strong>
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
              <div className="p-3 bg-primary-100 rounded-lg">
                <FileText className="w-6 h-6 text-primary-600" />
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
          <div className="space-y-4">
            {/* Barra de búsqueda */}
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
              <Search className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <input
                type="text"
                placeholder="Buscar por número o destino..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
              />
            </div>

            {/* Filtros */}
            {branches.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
                {/* Filtro de Sucursal */}
                <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
                  <Store className="w-4 h-4 text-gray-500" />
                  <select
                    value={filterBranch}
                    onChange={e => setFilterBranch(e.target.value)}
                    className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer"
                  >
                    <option value="all">Todas las sucursales</option>
                    <option value="main">Sucursal Principal</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Guides List */}
      <Card>
        <CardHeader>
          <CardTitle>Listado de Guías de Remisión</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Cargando guías de remisión...</p>
            </div>
          ) : filteredGuides.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                <Truck className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {searchTerm || filterBranch !== 'all'
                  ? 'No se encontraron guías de remisión'
                  : 'No hay guías de remisión registradas'}
              </h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                {searchTerm || filterBranch !== 'all'
                  ? 'Intenta con otros filtros de búsqueda'
                  : 'Comienza a emitir guías de remisión electrónicas para documentar el transporte de tus mercancías.'}
              </p>
              {!searchTerm && filterBranch === 'all' && (
                <Button onClick={handleCreateGuide}>
                  <Plus className="w-5 h-5 mr-2" />
                  Crear Primera Guía de Remisión
                </Button>
              )}
            </div>
          ) : (
            <>
            {/* Vista de tarjetas para móvil */}
            <div className="lg:hidden divide-y divide-gray-100">
              {filteredGuides.map((guide) => (
                <div key={guide.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                  {/* Fila 1: Número + fecha + acciones */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-primary-600 text-sm">{guide.number}</span>
                      <span className="text-xs text-gray-500">{formatTransferDate(guide.transferDate)}</span>
                    </div>
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
                      className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                      title="Acciones"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Fila 2: Destino (entidad principal) */}
                  <div className="flex items-start gap-1 mt-1 min-w-0">
                    <MapPin className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm font-medium truncate">{guide.destination?.address || 'Sin destino'}</p>
                  </div>

                  {/* Fila 3: Motivo + transporte + items + estado */}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span>{TRANSFER_REASONS[guide.transferReason] || guide.transferReason}</span>
                      <span className="flex items-center gap-1">
                        <Truck className="w-3 h-3 text-gray-400" />
                        {TRANSPORT_MODES[guide.transportMode] || guide.transportMode}
                      </span>
                      <span className="flex items-center gap-1">
                        <Package className="w-3 h-3 text-gray-400" />
                        {guide.items?.length || 0}
                      </span>
                    </div>
                    <div className="scale-90 origin-right">{getStatusBadge(guide.status, guide.sunatStatus)}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tabla para desktop */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Número
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fecha Traslado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Motivo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Transporte
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Destino
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Items
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredGuides.map((guide) => (
                    <tr key={guide.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900">
                            {guide.number}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatTransferDate(guide.transferDate)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {TRANSFER_REASONS[guide.transferReason] || guide.transferReason}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-sm text-gray-900">
                          <Truck className="w-3 h-3 text-gray-400" />
                          {TRANSPORT_MODES[guide.transportMode] || guide.transportMode}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-1 text-sm text-gray-600 max-w-xs">
                          <MapPin className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                          <span className="line-clamp-2">{guide.destination?.address}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-sm text-gray-900">
                          <Package className="w-3 h-3 text-gray-400" />
                          {guide.items?.length || 0}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(guide.status, guide.sunatStatus)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
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
            </>

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
                  {/* Ver detalles */}
                  <button
                    onClick={() => {
                      setOpenMenuId(null)
                      setSelectedGuide(guide)
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                  >
                    <Eye className="w-4 h-4 text-primary-600" />
                    <span>Ver detalles</span>
                  </button>

                  {/* Vista previa / Imprimir PDF */}
                  <button
                    onClick={() => {
                      setOpenMenuId(null)
                      handlePreviewPdf(guide)
                    }}
                    disabled={previewingPdf === guide.id}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3 disabled:opacity-50"
                  >
                    {previewingPdf === guide.id ? (
                      <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                    ) : (
                      <Printer className="w-4 h-4 text-purple-600" />
                    )}
                    <span>{previewingPdf === guide.id ? 'Generando...' : 'Imprimir PDF'}</span>
                  </button>

                  {/* Imprimir Ticket (impresora térmica) */}
                  <button
                    onClick={() => {
                      setOpenMenuId(null)
                      handlePrintTicket(guide)
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                  >
                    <Receipt className="w-4 h-4 text-orange-600" />
                    <span>Imprimir Ticket</span>
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

                  {/* Compartir PDF (solo móvil) */}
                  {isNativePlatform && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        handleSharePdf(guide)
                      }}
                      disabled={sharingPdf === guide.id}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3 disabled:opacity-50"
                    >
                      {sharingPdf === guide.id ? (
                        <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                      ) : (
                        <Share2 className="w-4 h-4 text-blue-600" />
                      )}
                      <span>{sharingPdf === guide.id ? 'Preparando...' : 'Compartir PDF'}</span>
                    </button>
                  )}

                  {/* XML SUNAT - Solo si fue aceptada */}
                  {guide.sunatStatus === 'accepted' && (guide.xmlStorageUrl || guide.xmlUrl || guide.sunatResponse?.xmlStorageUrl || guide.sunatResponse?.xmlUrl) && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        const xmlUrl = guide.xmlStorageUrl || guide.xmlUrl || guide.sunatResponse?.xmlStorageUrl || guide.sunatResponse?.xmlUrl
                        window.open(xmlUrl, '_blank')
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

                  {/* Separador antes de acciones de edición */}
                  {guide.sunatStatus !== 'accepted' && (
                    <div className="border-t border-gray-100 my-1" />
                  )}

                  {/* Editar - Solo si no está aceptada */}
                  {guide.sunatStatus !== 'accepted' && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        setEditingGuide(guide)
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-amber-50 flex items-center gap-3 text-amber-600"
                    >
                      <Pencil className="w-4 h-4" />
                      <span>Editar guía</span>
                    </button>
                  )}

                  {/* Enviar a SUNAT - Solo si no está aceptada */}
                  {guide.sunatStatus !== 'accepted' && (
                    <button
                      onClick={() => {
                        setOpenMenuId(null)
                        handleSendToSunat(guide)
                      }}
                      disabled={sendingToSunat === guide.id}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-3 text-blue-600 disabled:opacity-50"
                    >
                      {sendingToSunat === guide.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>{sendingToSunat === guide.id ? 'Enviando...' : 'Enviar a SUNAT'}</span>
                    </button>
                  )}
                </>
              )
            })()}
          </div>
        </>
      )}

      {/* Information Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-primary-500">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary-100 rounded-lg">
                <MapPin className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Origen y Destino</h4>
                <p className="text-sm text-gray-600">
                  Registra los puntos de partida y llegada con dirección completa y ubigeo.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Datos de Transporte</h4>
                <p className="text-sm text-gray-600">
                  Incluye información del conductor, vehículo y transportista según modalidad.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Package className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Bienes a Transportar</h4>
                <p className="text-sm text-gray-600">
                  Detalla los productos, cantidades, peso total y motivo del traslado.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Guide Modal */}
      <CreateDispatchGuideModal
        isOpen={showCreateModal}
        onClose={handleCloseModal}
        selectedBranch={filterBranch !== 'all' && filterBranch !== 'main' ? branches.find(b => b.id === filterBranch) : null}
      />

      {/* Edit Guide Modal */}
      <EditDispatchGuideModal
        isOpen={!!editingGuide}
        onClose={() => {
          setEditingGuide(null)
          loadGuides() // Recargar guías después de editar
        }}
        guide={editingGuide}
      />

      {/* Detail Guide Modal */}
      {selectedGuide && (() => {
        // Extraer datos de transporte de las diferentes ubicaciones posibles
        const driver = selectedGuide.transport?.driver || selectedGuide.driver || {}
        const vehicle = selectedGuide.transport?.vehicle || selectedGuide.vehicle || {}
        const carrier = selectedGuide.transport?.carrier || selectedGuide.carrier || {}
        const recipient = selectedGuide.recipient || selectedGuide.customer || {}
        const driverFullName = [driver.name, driver.lastName].filter(Boolean).join(' ') || '-'

        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Guía de Remisión</h2>
                  <p className="text-primary-100 text-sm">{selectedGuide.number}</p>
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

              {/* Documento de Referencia */}
              {selectedGuide.referencedInvoice && (
                <div className="bg-indigo-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    Documento de Referencia
                  </h3>
                  <div className="text-sm">
                    <span className="text-gray-500">Comprobante: </span>
                    <span className="font-medium">
                      {selectedGuide.referencedInvoice.documentType === '01' ? 'FACTURA' :
                       selectedGuide.referencedInvoice.documentType === '03' ? 'BOLETA' : 'COMPROBANTE'}{' '}
                      {selectedGuide.referencedInvoice.fullNumber ||
                       `${selectedGuide.referencedInvoice.series}-${selectedGuide.referencedInvoice.number}`}
                    </span>
                  </div>
                </div>
              )}

              {/* Datos del Traslado */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary-600" />
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
                    <span className="text-gray-500">Modalidad:</span>
                    <p className="font-medium">{TRANSPORT_MODES[selectedGuide.transportMode] || selectedGuide.transportMode}</p>
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
                    <p className="font-medium">{selectedGuide.origin?.address || companySettings?.address || '-'}</p>
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

              {/* Destinatario */}
              <div className="bg-green-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4 text-green-600" />
                  Destinatario
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Razón social:</span>
                    <p className="font-medium">{recipient.name || recipient.businessName || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">
                      {recipient.documentType === '6' || recipient.documentType === 'RUC' ? 'RUC' :
                       recipient.documentType === '1' || recipient.documentType === 'DNI' ? 'DNI' : 'RUC/DNI'}:
                    </span>
                    <p className="font-medium">{recipient.documentNumber || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Datos de Transporte - Privado */}
              {selectedGuide.transportMode === '02' && (
                <div className="bg-orange-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-orange-600" />
                    Vehículo y Conductor
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Placa:</span>
                      <p className="font-medium">{vehicle.plate || '-'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Conductor:</span>
                      <p className="font-medium">{driverFullName}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">DNI Conductor:</span>
                      <p className="font-medium">{driver.documentNumber || '-'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Licencia:</span>
                      <p className="font-medium">{driver.license || '-'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Datos de Transporte - Público */}
              {selectedGuide.transportMode === '01' && (
                <div className="bg-orange-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-orange-600" />
                    Transportista
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Razón social:</span>
                      <p className="font-medium">{carrier.businessName || carrier.name || '-'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">RUC:</span>
                      <p className="font-medium">{carrier.ruc || '-'}</p>
                    </div>
                  </div>
                </div>
              )}

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
            <div className="border-t px-6 py-4 bg-gray-50">
              <div className="flex flex-wrap justify-between gap-3">
                {/* Botones izquierda */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedGuide(null)}
                  >
                    Cerrar
                  </Button>

                  {/* Descargar XML - Solo si tiene XML guardado */}
                  {selectedGuide.sunatStatus === 'accepted' && (selectedGuide.xmlStorageUrl || selectedGuide.xmlUrl || selectedGuide.sunatResponse?.xmlStorageUrl || selectedGuide.sunatResponse?.xmlUrl) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const xmlUrl = selectedGuide.xmlStorageUrl || selectedGuide.xmlUrl || selectedGuide.sunatResponse?.xmlStorageUrl || selectedGuide.sunatResponse?.xmlUrl
                        window.open(xmlUrl, '_blank')
                      }}
                    >
                      <Code className="w-4 h-4 mr-1" />
                      XML
                    </Button>
                  )}

                  {/* Descargar CDR - Solo si fue aceptada y tiene CDR */}
                  {selectedGuide.sunatStatus === 'accepted' && (selectedGuide.cdrStorageUrl || selectedGuide.cdrUrl || selectedGuide.sunatResponse?.cdrStorageUrl || selectedGuide.sunatResponse?.cdrUrl || selectedGuide.cdrData || selectedGuide.sunatResponse?.cdrData) && (
                    <Button
                      variant="outline"
                      size="sm"
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
                      <FileText className="w-4 h-4 mr-1" />
                      CDR
                    </Button>
                  )}
                </div>

                {/* Botones derecha - PDF */}
                <div className="flex gap-2">
                  {/* Vista previa / Imprimir PDF */}
                  <Button
                    variant="outline"
                    onClick={() => handlePreviewPdf(selectedGuide)}
                    disabled={previewingPdf === selectedGuide.id}
                  >
                    {previewingPdf === selectedGuide.id ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Cargando...
                      </>
                    ) : (
                      <>
                        <Printer className="w-4 h-4 mr-2" />
                        PDF
                      </>
                    )}
                  </Button>

                  {/* Imprimir Ticket */}
                  <Button
                    variant="outline"
                    onClick={() => handlePrintTicket(selectedGuide)}
                  >
                    <Receipt className="w-4 h-4 mr-2" />
                    Ticket
                  </Button>

                  {/* Compartir (móvil) o Descargar (web) */}
                  {isNativePlatform ? (
                    <Button
                      onClick={() => handleSharePdf(selectedGuide)}
                      disabled={sharingPdf === selectedGuide.id}
                    >
                      {sharingPdf === selectedGuide.id ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Preparando...
                        </>
                      ) : (
                        <>
                          <Share2 className="w-4 h-4 mr-2" />
                          Compartir PDF
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleDownloadPdf(selectedGuide)}
                      disabled={downloadingPdf === selectedGuide.id}
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
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Componente de ticket para impresión */}
      {printingTicket && (
        <DispatchGuideTicket
          ref={ticketRef}
          guide={printingTicket}
          companySettings={companySettings}
          paperWidth={80}
        />
      )}
    </div>
  )
}
