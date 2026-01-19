import { useState, useEffect, useMemo } from 'react'
import {
  BookOpen,
  Search,
  Filter,
  Clock,
  AlertTriangle,
  CheckCircle,
  Eye,
  MessageSquare,
  Download,
  X,
  Calendar,
  User,
  Mail,
  Phone,
  FileText,
  Loader2,
  ChevronDown,
  RefreshCw,
  ExternalLink
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import {
  getComplaints,
  getComplaintById,
  respondComplaint,
  updateComplaintStatus,
  getComplaintsStats,
  COMPLAINT_STATUS,
  COMPLAINT_TYPES,
  getDaysRemaining,
  isComplaintExpired
} from '@/services/complaintService'
import { generateComplaintPDF, generateComplaintsReportPDF } from '@/utils/complaintPdfGenerator'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'

// Demo data for demo mode
const DEMO_COMPLAINTS = [
  {
    id: 'demo-1',
    complaintNumber: 'REC-2026-000001',
    trackingCode: 'ABC12XY9',
    type: 'reclamo',
    consumer: {
      fullName: 'Juan Pérez García',
      documentType: 'DNI',
      documentNumber: '12345678',
      email: 'juan@email.com',
      phone: '987654321',
      address: 'Av. Arequipa 123, Lima'
    },
    isMinor: false,
    guardian: null,
    productOrService: 'Servicio de delivery',
    amount: 150,
    description: 'El pedido llegó con 2 horas de retraso y los productos estaban en mal estado.',
    consumerRequest: 'Solicito la devolución del monto pagado y una compensación por las molestias.',
    status: 'pending',
    response: null,
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    dueDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
    business: { name: 'Mi Negocio Demo', ruc: '20123456789', address: 'Av. Principal 456' }
  },
  {
    id: 'demo-2',
    complaintNumber: 'REC-2026-000002',
    trackingCode: 'XYZ98765',
    type: 'queja',
    consumer: {
      fullName: 'María López Ruiz',
      documentType: 'DNI',
      documentNumber: '87654321',
      email: 'maria@email.com',
      phone: '912345678',
      address: 'Jr. Cusco 456, Lima'
    },
    isMinor: false,
    guardian: null,
    productOrService: 'Atención al cliente',
    amount: null,
    description: 'El personal de atención fue muy grosero y no me brindó información adecuada sobre mi pedido.',
    consumerRequest: 'Solicito una disculpa formal y mejor capacitación para el personal.',
    status: 'resolved',
    response: {
      text: 'Lamentamos mucho la mala experiencia. Hemos tomado medidas correctivas con el personal involucrado y le ofrecemos un descuento del 20% en su próxima compra.',
      respondedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      respondedBy: 'admin'
    },
    createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    business: { name: 'Mi Negocio Demo', ruc: '20123456789', address: 'Av. Principal 456' }
  },
  {
    id: 'demo-3',
    complaintNumber: 'REC-2026-000003',
    trackingCode: 'QWE45RTY',
    type: 'reclamo',
    consumer: {
      fullName: 'Carlos Mendoza Torres',
      documentType: 'DNI',
      documentNumber: '45678912',
      email: 'carlos@email.com',
      phone: '956789123',
      address: 'Av. Brasil 789, Lima'
    },
    isMinor: false,
    guardian: null,
    productOrService: 'Producto electrónico',
    amount: 599.90,
    description: 'El producto dejó de funcionar a los 15 días de la compra y está dentro del período de garantía.',
    consumerRequest: 'Solicito el cambio del producto por uno nuevo o la devolución del dinero.',
    status: 'in_progress',
    response: null,
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    dueDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    business: { name: 'Mi Negocio Demo', ruc: '20123456789', address: 'Av. Principal 456' }
  }
]

export default function ComplaintsList() {
  const { user, isDemoMode, getBusinessId, businessSettings } = useAppContext()
  const toast = useToast()

  const [complaints, setComplaints] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState(null)

  // Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showExpiredOnly, setShowExpiredOnly] = useState(false)

  // Modal de detalle
  const [selectedComplaint, setSelectedComplaint] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)

  // Modal de respuesta
  const [showResponseModal, setShowResponseModal] = useState(false)
  const [responseText, setResponseText] = useState('')
  const [isResponding, setIsResponding] = useState(false)

  // Cargar reclamos
  const loadComplaints = async () => {
    setIsLoading(true)
    try {
      if (isDemoMode) {
        setComplaints(DEMO_COMPLAINTS)
        setStats({
          total: DEMO_COMPLAINTS.length,
          pending: DEMO_COMPLAINTS.filter(c => c.status === 'pending').length,
          inProgress: DEMO_COMPLAINTS.filter(c => c.status === 'in_progress').length,
          resolved: DEMO_COMPLAINTS.filter(c => c.status === 'resolved').length,
          expired: DEMO_COMPLAINTS.filter(c => isComplaintExpired(c)).length,
          reclamos: DEMO_COMPLAINTS.filter(c => c.type === 'reclamo').length,
          quejas: DEMO_COMPLAINTS.filter(c => c.type === 'queja').length
        })
      } else {
        const businessId = getBusinessId()
        const data = await getComplaints(businessId)
        setComplaints(data)
        const statsData = await getComplaintsStats(businessId)
        setStats(statsData)
      }
    } catch (error) {
      console.error('Error loading complaints:', error)
      toast.error('Error al cargar los reclamos')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadComplaints()
  }, [user, isDemoMode])

  // Filtrar reclamos
  const filteredComplaints = useMemo(() => {
    let result = [...complaints]

    // Búsqueda
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      result = result.filter(c =>
        c.complaintNumber?.toLowerCase().includes(search) ||
        c.trackingCode?.toLowerCase().includes(search) ||
        c.consumer?.fullName?.toLowerCase().includes(search) ||
        c.consumer?.documentNumber?.includes(search) ||
        c.consumer?.email?.toLowerCase().includes(search)
      )
    }

    // Filtro por estado
    if (statusFilter !== 'all') {
      result = result.filter(c => c.status === statusFilter)
    }

    // Filtro por tipo
    if (typeFilter !== 'all') {
      result = result.filter(c => c.type === typeFilter)
    }

    // Solo vencidos
    if (showExpiredOnly) {
      result = result.filter(c => isComplaintExpired(c))
    }

    return result
  }, [complaints, searchTerm, statusFilter, typeFilter, showExpiredOnly])

  // Ver detalle
  const handleViewDetail = (complaint) => {
    setSelectedComplaint(complaint)
    setShowDetailModal(true)
  }

  // Abrir modal de respuesta
  const handleOpenResponseModal = (complaint) => {
    setSelectedComplaint(complaint)
    setResponseText('')
    setShowResponseModal(true)
  }

  // Enviar respuesta
  const handleSubmitResponse = async () => {
    if (!responseText.trim()) {
      toast.error('Ingrese una respuesta')
      return
    }

    if (isDemoMode) {
      toast.success('Respuesta enviada (modo demo)')
      setShowResponseModal(false)
      // Actualizar localmente para demo
      setComplaints(prev => prev.map(c =>
        c.id === selectedComplaint.id
          ? {
              ...c,
              status: 'resolved',
              response: {
                text: responseText,
                respondedAt: new Date(),
                respondedBy: 'demo-user'
              }
            }
          : c
      ))
      return
    }

    setIsResponding(true)
    try {
      const businessId = getBusinessId()
      await respondComplaint(businessId, selectedComplaint.id, responseText, user?.uid)
      toast.success('Respuesta enviada exitosamente')
      setShowResponseModal(false)
      loadComplaints()
    } catch (error) {
      console.error('Error responding:', error)
      toast.error('Error al enviar la respuesta')
    } finally {
      setIsResponding(false)
    }
  }

  // Descargar PDF
  const handleDownloadPDF = async (complaint) => {
    try {
      await generateComplaintPDF(complaint, businessSettings)
      toast.success('PDF generado')
    } catch (error) {
      console.error('Error generating PDF:', error)
      toast.error('Error al generar el PDF')
    }
  }

  // Exportar reporte
  const handleExportReport = async () => {
    try {
      await generateComplaintsReportPDF(filteredComplaints, businessSettings)
      toast.success('Reporte generado')
    } catch (error) {
      console.error('Error generating report:', error)
      toast.error('Error al generar el reporte')
    }
  }

  // Obtener el color del badge de estado
  const getStatusBadge = (status) => {
    const statusInfo = COMPLAINT_STATUS[status]
    const colorClasses = {
      pending: 'bg-yellow-100 text-yellow-800',
      in_progress: 'bg-blue-100 text-blue-800',
      resolved: 'bg-green-100 text-green-800'
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colorClasses[status] || 'bg-gray-100 text-gray-800'}`}>
        {statusInfo?.name || status}
      </span>
    )
  }

  // Obtener badge de días restantes
  const getDaysRemainingBadge = (complaint) => {
    if (complaint.status === 'resolved') return null

    const days = getDaysRemaining(complaint.dueDate)

    if (days < 0) {
      return (
        <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
          <AlertTriangle className="w-3 h-3" />
          Vencido
        </span>
      )
    }

    if (days <= 5) {
      return (
        <span className="flex items-center gap-1 text-xs text-yellow-600 font-medium">
          <Clock className="w-3 h-3" />
          {days} días
        </span>
      )
    }

    return (
      <span className="flex items-center gap-1 text-xs text-gray-500">
        <Clock className="w-3 h-3" />
        {days} días
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-red-600" />
            Libro de Reclamaciones
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Gestiona los reclamos y quejas de tus clientes
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={loadComplaints}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualizar
          </Button>
          <Button variant="outline" onClick={handleExportReport}>
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Estadísticas */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500">Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
              <p className="text-xs text-gray-500">Pendientes</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-2xl font-bold text-blue-600">{stats.inProgress}</p>
              <p className="text-xs text-gray-500">En Proceso</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-2xl font-bold text-green-600">{stats.resolved}</p>
              <p className="text-xs text-gray-500">Resueltos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
              <p className="text-xs text-gray-500">Vencidos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-2xl font-bold text-gray-700">{stats.reclamos}</p>
              <p className="text-xs text-gray-500">Reclamos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-2xl font-bold text-gray-700">{stats.quejas}</p>
              <p className="text-xs text-gray-500">Quejas</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
            {/* Búsqueda */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
                <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por N°, código, nombre, documento..."
                  className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
                />
              </div>
            </div>

            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-3 lg:gap-4 flex-wrap">
              {/* Filtro Estado */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`flex items-center gap-2 bg-white border rounded-lg px-3 py-2 shadow-sm text-sm cursor-pointer hover:border-primary-400 transition-colors ${statusFilter !== 'all' ? 'border-primary-500 bg-primary-50' : 'border-gray-300'}`}
              >
                <option value="all">Todos los estados</option>
                <option value="pending">Pendientes</option>
                <option value="in_progress">En Proceso</option>
                <option value="resolved">Resueltos</option>
              </select>

              {/* Filtro Tipo */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className={`flex items-center gap-2 bg-white border rounded-lg px-3 py-2 shadow-sm text-sm cursor-pointer hover:border-primary-400 transition-colors ${typeFilter !== 'all' ? 'border-primary-500 bg-primary-50' : 'border-gray-300'}`}
              >
                <option value="all">Todos los tipos</option>
                <option value="reclamo">Reclamos</option>
                <option value="queja">Quejas</option>
              </select>

              {/* Filtro Vencidos */}
              <label className={`flex items-center gap-2 bg-white border rounded-lg px-3 py-2 shadow-sm text-sm cursor-pointer hover:border-red-400 transition-colors ${showExpiredOnly ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}>
                <input
                  type="checkbox"
                  checked={showExpiredOnly}
                  onChange={(e) => setShowExpiredOnly(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-gray-700">Solo vencidos</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de reclamos */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : filteredComplaints.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No hay reclamos registrados</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredComplaints.map((complaint) => (
                <div
                  key={complaint.id}
                  className={`p-4 hover:bg-gray-50 transition-colors ${
                    isComplaintExpired(complaint) ? 'bg-red-50' : ''
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm">
                          {complaint.complaintNumber}
                        </span>
                        {getStatusBadge(complaint.status)}
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          complaint.type === 'reclamo' ? 'bg-red-100 text-red-700' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {complaint.type === 'reclamo' ? 'Reclamo' : 'Queja'}
                        </span>
                        {getDaysRemainingBadge(complaint)}
                      </div>
                      <p className="text-sm text-gray-900 mt-1 font-medium">
                        {complaint.consumer?.fullName}
                      </p>
                      <p className="text-sm text-gray-500 truncate">
                        {complaint.productOrService} - {complaint.description?.substring(0, 60)}...
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(complaint.createdAt).toLocaleDateString('es-PE')} •
                        Código: <span className="font-mono">{complaint.trackingCode}</span>
                      </p>
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDetail(complaint)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {complaint.status !== 'resolved' && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleOpenResponseModal(complaint)}
                        >
                          <MessageSquare className="w-4 h-4 mr-1" />
                          Responder
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadPDF(complaint)}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de detalle */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title={`Reclamo ${selectedComplaint?.complaintNumber || ''}`}
        size="lg"
      >
        {selectedComplaint && (
          <div className="space-y-6">
            {/* Estado y fechas */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              {getStatusBadge(selectedComplaint.status)}
              <div className="text-sm text-gray-500">
                <span>Registrado: {new Date(selectedComplaint.createdAt).toLocaleDateString('es-PE')}</span>
                <span className="mx-2">•</span>
                <span>Vence: {new Date(selectedComplaint.dueDate).toLocaleDateString('es-PE')}</span>
              </div>
            </div>

            {/* Días restantes */}
            {selectedComplaint.status !== 'resolved' && (
              <div className={`p-3 rounded-lg ${
                getDaysRemaining(selectedComplaint.dueDate) < 0 ? 'bg-red-50 border border-red-200' :
                getDaysRemaining(selectedComplaint.dueDate) <= 5 ? 'bg-yellow-50 border border-yellow-200' :
                'bg-blue-50 border border-blue-200'
              }`}>
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  <span className="font-medium">
                    {getDaysRemaining(selectedComplaint.dueDate) < 0 ? (
                      <span className="text-red-700">
                        Plazo vencido hace {Math.abs(getDaysRemaining(selectedComplaint.dueDate))} días
                      </span>
                    ) : (
                      <span className={getDaysRemaining(selectedComplaint.dueDate) <= 5 ? 'text-yellow-700' : 'text-blue-700'}>
                        {getDaysRemaining(selectedComplaint.dueDate)} días restantes
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Datos del consumidor */}
            <div className="border-t pt-4">
              <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                <User className="w-4 h-4" />
                Datos del Consumidor
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-500">Nombre</p>
                  <p className="font-medium">{selectedComplaint.consumer?.fullName}</p>
                </div>
                <div>
                  <p className="text-gray-500">Documento</p>
                  <p className="font-medium">
                    {selectedComplaint.consumer?.documentType} {selectedComplaint.consumer?.documentNumber}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Email</p>
                  <p className="font-medium">{selectedComplaint.consumer?.email}</p>
                </div>
                <div>
                  <p className="text-gray-500">Teléfono</p>
                  <p className="font-medium">{selectedComplaint.consumer?.phone || 'No especificado'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-gray-500">Dirección</p>
                  <p className="font-medium">{selectedComplaint.consumer?.address || 'No especificada'}</p>
                </div>
              </div>

              {selectedComplaint.isMinor && selectedComplaint.guardian && (
                <div className="mt-4 p-3 bg-gray-50 rounded">
                  <p className="text-sm font-medium text-gray-700 mb-2">Padre/Apoderado</p>
                  <p className="text-sm">
                    {selectedComplaint.guardian.fullName} -
                    {selectedComplaint.guardian.documentType} {selectedComplaint.guardian.documentNumber}
                  </p>
                </div>
              )}
            </div>

            {/* Detalle del reclamo */}
            <div className="border-t pt-4">
              <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Detalle del {selectedComplaint.type === 'reclamo' ? 'Reclamo' : 'Queja'}
              </h4>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Producto/Servicio:</span>
                  <span className="font-medium">{selectedComplaint.productOrService}</span>
                </div>
                {selectedComplaint.amount && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Monto:</span>
                    <span className="font-medium">S/ {parseFloat(selectedComplaint.amount).toFixed(2)}</span>
                  </div>
                )}
                <div>
                  <p className="text-gray-500 mb-1">Descripción:</p>
                  <p className="bg-gray-50 p-3 rounded text-gray-700">{selectedComplaint.description}</p>
                </div>
                <div>
                  <p className="text-gray-500 mb-1">Pedido del Consumidor:</p>
                  <p className="bg-gray-50 p-3 rounded text-gray-700">{selectedComplaint.consumerRequest}</p>
                </div>
              </div>
            </div>

            {/* Respuesta */}
            {selectedComplaint.response && (
              <div className="border-t pt-4">
                <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  Respuesta del Proveedor
                </h4>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-gray-700">{selectedComplaint.response.text}</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Respondido el: {new Date(selectedComplaint.response.respondedAt).toLocaleDateString('es-PE')}
                  </p>
                </div>
              </div>
            )}

            {/* Acciones */}
            <div className="border-t pt-4 flex justify-between">
              <Button
                variant="outline"
                onClick={() => handleDownloadPDF(selectedComplaint)}
              >
                <Download className="w-4 h-4 mr-2" />
                Descargar PDF
              </Button>
              {selectedComplaint.status !== 'resolved' && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setShowDetailModal(false)
                    handleOpenResponseModal(selectedComplaint)
                  }}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Responder
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de respuesta */}
      <Modal
        isOpen={showResponseModal}
        onClose={() => setShowResponseModal(false)}
        title="Responder al Reclamo"
      >
        {selectedComplaint && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm text-gray-500">Reclamo N°</p>
              <p className="font-mono font-bold">{selectedComplaint.complaintNumber}</p>
              <p className="text-sm text-gray-500 mt-2">Consumidor</p>
              <p className="font-medium">{selectedComplaint.consumer?.fullName}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Respuesta *
              </label>
              <textarea
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Escriba su respuesta al consumidor..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Esta respuesta será visible para el consumidor cuando consulte su reclamo
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setShowResponseModal(false)}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmitResponse}
                disabled={isResponding || !responseText.trim()}
              >
                {isResponding ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Enviar Respuesta
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
