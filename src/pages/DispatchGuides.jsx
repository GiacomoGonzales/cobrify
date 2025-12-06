import { useState, useEffect } from 'react'
import { Truck, Plus, FileText, Package, MapPin, User, Eye, Download, CheckCircle, Clock, XCircle, Send, Loader2, AlertCircle } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { getDispatchGuides, sendDispatchGuideToSunat } from '@/services/firestoreService'
import CreateDispatchGuideModal from '@/components/CreateDispatchGuideModal'

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
  const { getBusinessId, isDemoMode } = useAppContext()
  const toast = useToast()

  const [guides, setGuides] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [sendingToSunat, setSendingToSunat] = useState(null) // ID de guía siendo enviada

  // Cargar guías al montar el componente
  useEffect(() => {
    loadGuides()
  }, [])

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

  // Calcular estadísticas
  const stats = {
    total: guides.length,
    inTransit: guides.filter(g => g.status === 'in_transit').length,
    delivered: guides.filter(g => g.status === 'delivered').length,
    thisMonth: guides.filter(g => {
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
        <Button size="lg" className="w-full sm:w-auto" onClick={handleCreateGuide}>
          <Plus className="w-5 h-5 mr-2" />
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
          ) : guides.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                <Truck className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No hay guías de remisión registradas
              </h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                Comienza a emitir guías de remisión electrónicas para documentar el transporte de tus mercancías.
              </p>
              <Button onClick={handleCreateGuide}>
                <Plus className="w-5 h-5 mr-2" />
                Crear Primera Guía de Remisión
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
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
                  {guides.map((guide) => (
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
                          {new Date(guide.transferDate).toLocaleDateString('es-PE')}
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
                        <div className="flex items-center gap-2">
                          {/* Botón Enviar a SUNAT - Solo si está pendiente */}
                          {guide.sunatStatus !== 'accepted' && (
                            <button
                              onClick={() => handleSendToSunat(guide)}
                              disabled={sendingToSunat === guide.id}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors
                                ${sendingToSunat === guide.id
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                }`}
                              title="Enviar a SUNAT"
                            >
                              {sendingToSunat === guide.id ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>Enviando...</span>
                                </>
                              ) : (
                                <>
                                  <Send className="w-3 h-3" />
                                  <span>Enviar a SUNAT</span>
                                </>
                              )}
                            </button>
                          )}
                          <button
                            className="text-primary-600 hover:text-primary-900"
                            title="Ver detalles"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            className="text-green-600 hover:text-green-900"
                            title="Descargar XML"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
      />
    </div>
  )
}
