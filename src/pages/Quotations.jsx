import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus,
  Search,
  Download,
  Eye,
  Edit,
  Trash2,
  Loader2,
  FileText,
  AlertTriangle,
  Send,
  CheckCircle,
  Clock,
  XCircle,
  FileCheck,
  MoreVertical,
  Receipt,
  Store,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  getQuotations,
  deleteQuotation,
  updateQuotationStatus,
  markQuotationAsSent,
  convertToInvoice,
  markQuotationAsConverted,
} from '@/services/quotationService'
import { createInvoice, getCompanySettings, getNextDocumentNumber } from '@/services/firestoreService'
import { generateQuotationPDF, previewQuotationPDF } from '@/utils/quotationPdfGenerator'
import { preloadLogo } from '@/utils/pdfGenerator'
import { getActiveBranches } from '@/services/branchService'

export default function Quotations() {
  const { user, isDemoMode, demoData, getBusinessId, filterBranchesByAccess } = useAppContext()
  const navigate = useNavigate()
  const toast = useToast()
  const [quotations, setQuotations] = useState([])
  const [companySettings, setCompanySettings] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [branches, setBranches] = useState([])
  const [filterBranch, setFilterBranch] = useState('all')
  const [viewingQuotation, setViewingQuotation] = useState(null)
  const [deletingQuotation, setDeletingQuotation] = useState(null)
  const [convertingQuotation, setConvertingQuotation] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0, openUpward: true })

  // Helper para manejar fechas de Firestore y Date objects
  const getDateFromTimestamp = (timestamp) => {
    if (!timestamp) return null
    return timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  }

  useEffect(() => {
    loadQuotations()
    loadBranches()
  }, [user])

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

  // Verificar cotizaciones expiradas
  useEffect(() => {
    if (quotations.length === 0 || isDemoMode) return // No ejecutar en modo demo

    const checkExpiredQuotations = () => {
      const now = new Date()
      quotations.forEach(quotation => {
        if (
          quotation.expiryDate &&
          quotation.status !== 'expired' &&
          quotation.status !== 'converted' &&
          quotation.status !== 'rejected'
        ) {
          const expiryDate = getDateFromTimestamp(quotation.expiryDate)

          if (expiryDate < now) {
            updateQuotationStatus(getBusinessId(), quotation.id, 'expired')
          }
        }
      })
    }

    checkExpiredQuotations()
    const interval = setInterval(checkExpiredQuotations, 60000) // Revisar cada minuto

    return () => clearInterval(interval)
  }, [quotations, user, isDemoMode])

  const loadQuotations = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      // MODO DEMO: Usar datos de ejemplo
      if (isDemoMode && demoData) {
        setQuotations(demoData.quotations || [])
        setCompanySettings(demoData.business || null)
        setIsLoading(false)
        return
      }

      const [quotationsResult, settingsResult] = await Promise.all([
        getQuotations(getBusinessId()),
        getCompanySettings(getBusinessId()),
      ])

      if (quotationsResult.success) {
        setQuotations(quotationsResult.data || [])
      } else {
        console.error('Error al cargar cotizaciones:', quotationsResult.error)
      }

      if (settingsResult.success) {
        setCompanySettings(settingsResult.data)
        // Pre-cargar logo en background
        if (settingsResult.data?.logoUrl) {
          preloadLogo(settingsResult.data.logoUrl).catch(() => {})
        }
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingQuotation || !user?.uid) return

    setIsDeleting(true)
    try {
      // MODO DEMO: Simular eliminación sin guardar en Firebase
      if (isDemoMode) {
        console.log('🎭 MODO DEMO: Eliminando cotización simulada...')
        await new Promise(resolve => setTimeout(resolve, 500)) // Simular delay

        // Eliminar de la lista local
        setQuotations(prev => prev.filter(q => q.id !== deletingQuotation.id))

        toast.success('Cotización eliminada exitosamente (DEMO - No se guardó)', { duration: 5000 })
        setDeletingQuotation(null)
        setIsDeleting(false)
        return
      }

      const result = await deleteQuotation(getBusinessId(), deletingQuotation.id)

      if (result.success) {
        toast.success('Cotización eliminada exitosamente')
        setDeletingQuotation(null)
        loadQuotations()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al eliminar cotización:', error)
      toast.error('Error al eliminar la cotización. Inténtalo nuevamente.')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleConvertToInvoice = async () => {
    if (!convertingQuotation || !user?.uid) return

    setIsConverting(true)
    try {
      // MODO DEMO: Simular conversión
      if (isDemoMode) {
        console.log('🎭 MODO DEMO: Navegando a POS con datos de cotización...')

        // Navegar a POS con los datos de la cotización
        navigate('/demo/pos', {
          state: {
            fromQuotation: true,
            quotationId: convertingQuotation.id,
            quotationNumber: convertingQuotation.number,
            customer: convertingQuotation.customer,
            items: convertingQuotation.items,
          }
        })

        setConvertingQuotation(null)
        setIsConverting(false)
        return
      }

      // Obtener datos de la cotización
      const convertResult = await convertToInvoice(getBusinessId(), convertingQuotation.id)

      if (!convertResult.success) {
        throw new Error(convertResult.error)
      }

      const quotationData = convertResult.data

      // Navegar a POS con los datos de la cotización prellenados
      navigate('/app/pos', {
        state: {
          fromQuotation: true,
          quotationId: convertingQuotation.id,
          quotationNumber: convertingQuotation.number,
          customer: quotationData.customer,
          items: quotationData.items,
          notes: quotationData.notes || '',
        }
      })

      setConvertingQuotation(null)
    } catch (error) {
      console.error('Error al preparar cotización:', error)
      toast.error(error.message || 'Error al cargar la cotización.')
    } finally {
      setIsConverting(false)
    }
  }

  const handleDownloadPDF = async (quotation) => {
    if (!companySettings || !companySettings.ruc || !companySettings.businessName) {
      toast.error(
        'Debes configurar los datos de tu empresa primero. Ve a Configuración > Información de la Empresa',
        5000
      )
      return
    }

    try {
      await generateQuotationPDF(quotation, companySettings)

      if (!isDemoMode) {
        await markQuotationAsSent(getBusinessId(), quotation.id, 'manual')
        loadQuotations()
      } else {
        // En modo demo, actualizar estado local
        setQuotations(prev => prev.map(q =>
          q.id === quotation.id
            ? { ...q, status: 'sent', isSent: true, sentAt: new Date() }
            : q
        ))
      }

      toast.success('PDF generado exitosamente')
    } catch (error) {
      console.error('Error al generar PDF:', error)
      toast.error('Error al generar el PDF')
    }
  }

  const handlePreviewPDF = async (quotation) => {
    if (!companySettings || !companySettings.ruc || !companySettings.businessName) {
      toast.error(
        'Debes configurar los datos de tu empresa primero. Ve a Configuración > Información de la Empresa',
        5000
      )
      return
    }

    try {
      await previewQuotationPDF(quotation, companySettings)
    } catch (error) {
      console.error('Error al generar vista previa:', error)
      toast.error('Error al generar la vista previa')
    }
  }

  // Filtrar cotizaciones
  const filteredQuotations = quotations.filter(quotation => {
    const search = searchTerm.toLowerCase()
    const matchesSearch =
      quotation.number?.toLowerCase().includes(search) ||
      quotation.customer?.name?.toLowerCase().includes(search) ||
      quotation.customer?.documentNumber?.includes(search)

    const matchesStatus = filterStatus === 'all' || quotation.status === filterStatus

    // Filtrar por sucursal
    let matchesBranch = true
    if (filterBranch !== 'all') {
      if (filterBranch === 'main') {
        matchesBranch = !quotation.branchId
      } else {
        matchesBranch = quotation.branchId === filterBranch
      }
    }

    return matchesSearch && matchesStatus && matchesBranch
  })

  const getStatusBadge = status => {
    switch (status) {
      case 'draft':
        return <Badge>Borrador</Badge>
      case 'sent':
        return <Badge variant="primary">Enviada</Badge>
      case 'accepted':
        return <Badge variant="success">Aceptada</Badge>
      case 'rejected':
        return <Badge variant="danger">Rechazada</Badge>
      case 'expired':
        return <Badge variant="warning">Vencida</Badge>
      case 'converted':
        return <Badge variant="success">Convertida</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  // Función para determinar si una cotización está próxima a vencer
  const isExpiringSoon = quotation => {
    if (!quotation.expiryDate || quotation.status === 'expired' || quotation.status === 'converted') {
      return false
    }

    const expiryDate = getDateFromTimestamp(quotation.expiryDate)
    const now = new Date()
    const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24))

    return daysUntilExpiry <= 7 && daysUntilExpiry > 0
  }

  // Estadísticas
  const stats = {
    total: quotations.length,
    sent: quotations.filter(q => q.status === 'sent').length,
    accepted: quotations.filter(q => q.status === 'accepted').length,
    converted: quotations.filter(q => q.status === 'converted').length,
    totalAmount: quotations
      .filter(q => q.status !== 'rejected' && q.status !== 'expired')
      .reduce((sum, q) => sum + (q.total || 0), 0),
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando cotizaciones...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Cotizaciones</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Gestiona tus cotizaciones y conviértelas en facturas
          </p>
        </div>
        <Link to="/app/cotizaciones/nueva" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Nueva Cotización
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Total</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-2">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Enviadas</p>
              <p className="text-xl sm:text-2xl font-bold text-blue-600 mt-2">{stats.sent}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Aceptadas</p>
              <p className="text-xl sm:text-2xl font-bold text-green-600 mt-2">{stats.accepted}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Convertidas</p>
              <p className="text-xl sm:text-2xl font-bold text-purple-600 mt-2">{stats.converted}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Monto Total</p>
              <p className="text-lg sm:text-xl font-bold text-primary-600 mt-2">
                {formatCurrency(stats.totalAmount)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-4">
            {/* Barra de búsqueda */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por número, cliente, RUC/DNI..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
              {/* Filtro de Sucursal */}
              {branches.length > 0 && (
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
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
              )}
              {/* Filtro de Estado */}
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                <FileText className="w-4 h-4 text-gray-500" />
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer"
                >
                  <option value="all">Todos los estados</option>
                  <option value="draft">Borrador</option>
                  <option value="sent">Enviadas</option>
                  <option value="accepted">Aceptadas</option>
                  <option value="rejected">Rechazadas</option>
                  <option value="expired">Vencidas</option>
                  <option value="converted">Convertidas</option>
                </select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quotations Table */}
      <Card>
        {filteredQuotations.length === 0 ? (
          <CardContent className="p-12 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || filterStatus !== 'all' || filterBranch !== 'all'
                ? 'No se encontraron cotizaciones'
                : 'No hay cotizaciones registradas'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || filterStatus !== 'all' || filterBranch !== 'all'
                ? 'Intenta con otros filtros de búsqueda'
                : 'Comienza creando tu primera cotización'}
            </p>
            {!searchTerm && filterStatus === 'all' && filterBranch === 'all' && (
              <Link to="/app/cotizaciones/nueva">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Nueva Cotización
                </Button>
              </Link>
            )}
          </CardContent>
        ) : (
          <>
            {/* Vista de tarjetas para móvil */}
            <div className="lg:hidden divide-y divide-gray-100">
              {filteredQuotations.map(quotation => (
                <div key={quotation.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                  {/* Fila superior: Número + acciones */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-primary-600 text-sm">{quotation.number}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        const menuHeight = 300
                        const spaceAbove = rect.top
                        const spaceBelow = window.innerHeight - rect.bottom
                        const openUpward = spaceAbove > menuHeight || spaceAbove > spaceBelow
                        setMenuPosition({
                          top: openUpward ? rect.top - 10 : rect.bottom + 10,
                          right: window.innerWidth - rect.right,
                          openUpward
                        })
                        setOpenMenuId(openMenuId === quotation.id ? null : quotation.id)
                      }}
                      className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                      title="Acciones"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Fila medio: Cliente */}
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm font-medium truncate">{quotation.customer?.name || 'Sin cliente'}</p>
                    {quotation.customer?.documentNumber && (
                      <span className="text-xs text-gray-500 flex-shrink-0">{quotation.customer.documentNumber}</span>
                    )}
                  </div>

                  {/* Fila inferior: Total + fechas + badge estado */}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-sm">{formatCurrency(quotation.total)}</span>
                      <span className="text-xs text-gray-500">
                        {quotation.createdAt ? formatDate(getDateFromTimestamp(quotation.createdAt)) : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="scale-90 origin-right">{getStatusBadge(quotation.status)}</div>
                    </div>
                  </div>

                  {/* Fila extra: Válida hasta */}
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-gray-500">
                      Válida hasta: {quotation.expiryDate ? formatDate(getDateFromTimestamp(quotation.expiryDate)) : 'N/A'}
                    </span>
                    {isExpiringSoon(quotation) && (
                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                    )}
                  </div>

                  {/* Portal del menú de acciones */}
                  {openMenuId === quotation.id && createPortal(
                    <>
                      <div className="fixed inset-0 z-[9998]" onClick={() => setOpenMenuId(null)} />
                      <div
                        className="fixed w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-[9999]"
                        style={{
                          top: `${menuPosition.top}px`,
                          right: `${menuPosition.right}px`,
                          transform: menuPosition.openUpward ? 'translateY(-100%)' : 'translateY(0)',
                          maxHeight: '80vh',
                          overflowY: 'auto'
                        }}
                      >
                        <button
                          onClick={() => { setOpenMenuId(null); setViewingQuotation(quotation) }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                        >
                          <Eye className="w-4 h-4 text-primary-600" />
                          <span>Ver detalles</span>
                        </button>
                        {quotation.status !== 'converted' && (
                          <button
                            onClick={() => { setOpenMenuId(null); navigate(`/app/cotizaciones/editar/${quotation.id}`) }}
                            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                          >
                            <Edit className="w-4 h-4 text-amber-600" />
                            <span>Editar</span>
                          </button>
                        )}
                        <button
                          onClick={() => { setOpenMenuId(null); handlePreviewPDF(quotation) }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                        >
                          <Eye className="w-4 h-4 text-purple-600" />
                          <span>Vista previa / Imprimir</span>
                        </button>
                        <button
                          onClick={() => { setOpenMenuId(null); handleDownloadPDF(quotation) }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                        >
                          <Download className="w-4 h-4 text-green-600" />
                          <span>Descargar PDF</span>
                        </button>
                        {quotation.status !== 'converted' && quotation.status !== 'expired' && quotation.status !== 'rejected' && (
                          <>
                            <div className="border-t border-gray-100 my-1" />
                            <button
                              onClick={() => { setOpenMenuId(null); setConvertingQuotation(quotation) }}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                            >
                              <Receipt className="w-4 h-4 text-blue-600" />
                              <span>Convertir a Factura</span>
                            </button>
                          </>
                        )}
                        <div className="border-t border-gray-100 my-1" />
                        <button
                          onClick={() => { setOpenMenuId(null); setDeletingQuotation(quotation) }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 flex items-center gap-3 text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Eliminar</span>
                        </button>
                      </div>
                    </>,
                    document.body
                  )}
                </div>
              ))}
            </div>

            {/* Tabla para desktop */}
            <div className="hidden lg:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2.5 px-3">Número</TableHead>
                  <TableHead className="py-2.5 px-3">Cliente</TableHead>
                  <TableHead className="py-2.5 px-3">Fecha</TableHead>
                  <TableHead className="py-2.5 px-3">Válida Hasta</TableHead>
                  <TableHead className="py-2.5 px-3">Total</TableHead>
                  <TableHead className="py-2.5 px-2">Estado</TableHead>
                  <TableHead className="py-2.5 px-1 text-right w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotations.map(quotation => (
                  <TableRow key={quotation.id}>
                    <TableCell className="py-2.5 px-3">
                      <span className="font-medium text-primary-600 text-sm whitespace-nowrap">
                        {quotation.number}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 px-3">
                      <div className="max-w-[140px]">
                        <p className="font-medium text-sm truncate">{quotation.customer?.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {quotation.customer?.documentNumber}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5 px-3">
                      <span className="text-sm whitespace-nowrap">
                        {quotation.createdAt
                          ? formatDate(getDateFromTimestamp(quotation.createdAt))
                          : 'N/A'}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 px-3">
                      <div className="flex items-center gap-1">
                        <span className="text-sm whitespace-nowrap">
                          {quotation.expiryDate
                            ? formatDate(getDateFromTimestamp(quotation.expiryDate))
                            : 'N/A'}
                        </span>
                        {isExpiringSoon(quotation) && (
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5 px-3">
                      <span className="font-semibold text-sm whitespace-nowrap">
                        {formatCurrency(quotation.total)}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 px-2">
                      <div className="scale-90 origin-left">{getStatusBadge(quotation.status)}</div>
                    </TableCell>
                    <TableCell className="py-2.5 px-1 w-12">
                      <div className="flex items-center justify-end">
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect()
                              const menuHeight = 300 // Altura estimada del menú
                              const spaceAbove = rect.top
                              const spaceBelow = window.innerHeight - rect.bottom
                              const openUpward = spaceAbove > menuHeight || spaceAbove > spaceBelow

                              setMenuPosition({
                                top: openUpward ? rect.top - 10 : rect.bottom + 10,
                                right: window.innerWidth - rect.right,
                                openUpward
                              })
                              setOpenMenuId(openMenuId === quotation.id ? null : quotation.id)
                            }}
                            className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                            title="Acciones"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {/* Dropdown Menu - usando Portal para evitar overflow clipping */}
                          {openMenuId === quotation.id && createPortal(
                            <>
                              {/* Backdrop */}
                              <div className="fixed inset-0 z-[9998]" onClick={() => setOpenMenuId(null)} />

                              {/* Menu */}
                              <div
                                className="fixed w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-[9999]"
                                style={{
                                  top: `${menuPosition.top}px`,
                                  right: `${menuPosition.right}px`,
                                  transform: menuPosition.openUpward ? 'translateY(-100%)' : 'translateY(0)',
                                  maxHeight: '80vh',
                                  overflowY: 'auto'
                                }}
                              >
                                {/* Ver detalles */}
                                <button
                                  onClick={() => {
                                    setOpenMenuId(null)
                                    setViewingQuotation(quotation)
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                                >
                                  <Eye className="w-4 h-4 text-primary-600" />
                                  <span>Ver detalles</span>
                                </button>

                                {/* Editar cotización */}
                                {quotation.status !== 'converted' && (
                                  <button
                                    onClick={() => {
                                      setOpenMenuId(null)
                                      navigate(`/app/cotizaciones/editar/${quotation.id}`)
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                                  >
                                    <Edit className="w-4 h-4 text-amber-600" />
                                    <span>Editar</span>
                                  </button>
                                )}

                                {/* Vista previa PDF */}
                                <button
                                  onClick={() => {
                                    setOpenMenuId(null)
                                    handlePreviewPDF(quotation)
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                                >
                                  <Eye className="w-4 h-4 text-purple-600" />
                                  <span>Vista previa / Imprimir</span>
                                </button>

                                {/* Descargar PDF */}
                                <button
                                  onClick={() => {
                                    setOpenMenuId(null)
                                    handleDownloadPDF(quotation)
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                                >
                                  <Download className="w-4 h-4 text-green-600" />
                                  <span>Descargar PDF</span>
                                </button>

                                {/* Convertir a factura */}
                                {quotation.status !== 'converted' &&
                                  quotation.status !== 'expired' &&
                                  quotation.status !== 'rejected' && (
                                    <>
                                      <div className="border-t border-gray-100 my-1" />
                                      <button
                                        onClick={() => {
                                          setOpenMenuId(null)
                                          setConvertingQuotation(quotation)
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3"
                                      >
                                        <Receipt className="w-4 h-4 text-blue-600" />
                                        <span>Convertir a Factura</span>
                                      </button>
                                    </>
                                  )}

                                {/* Eliminar */}
                                <div className="border-t border-gray-100 my-1" />
                                <button
                                  onClick={() => {
                                    setOpenMenuId(null)
                                    setDeletingQuotation(quotation)
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 flex items-center gap-3 text-red-600"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  <span>Eliminar</span>
                                </button>
                              </div>
                            </>,
                            document.body
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </>

        )}
      </Card>

      {/* View Quotation Modal */}
      <Modal
        isOpen={!!viewingQuotation}
        onClose={() => setViewingQuotation(null)}
        title="Detalles de la Cotización"
        size="lg"
      >
        {viewingQuotation && (
          <div className="space-y-6">
            {/* Header Info */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">Número</p>
                <p className="font-semibold text-primary-600">{viewingQuotation.number}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Estado</p>
                <div className="mt-1">{getStatusBadge(viewingQuotation.status)}</div>
              </div>
              <div>
                <p className="text-sm text-gray-600">Fecha</p>
                <p className="font-semibold">
                  {viewingQuotation.createdAt
                    ? formatDate(getDateFromTimestamp(viewingQuotation.createdAt))
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Válida Hasta</p>
                <p className="font-semibold">
                  {viewingQuotation.expiryDate
                    ? formatDate(getDateFromTimestamp(viewingQuotation.expiryDate))
                    : 'N/A'}
                </p>
              </div>
            </div>

            {/* Customer Info */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Cliente</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-600">Nombre</p>
                  <p className="font-medium">{viewingQuotation.customer?.name}</p>
                </div>
                <div>
                  <p className="text-gray-600">Documento</p>
                  <p className="font-medium">{viewingQuotation.customer?.documentNumber}</p>
                </div>
                {viewingQuotation.customer?.email && (
                  <div>
                    <p className="text-gray-600">Email</p>
                    <p className="font-medium">{viewingQuotation.customer?.email}</p>
                  </div>
                )}
                {viewingQuotation.customer?.phone && (
                  <div>
                    <p className="text-gray-600">Teléfono</p>
                    <p className="font-medium">{viewingQuotation.customer?.phone}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Items */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Items</h4>
              <div className="space-y-2">
                {viewingQuotation.items?.map((item, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-start p-3 bg-gray-50 rounded-lg text-sm"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-gray-600 mt-1 italic">
                          {item.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {item.quantity} x {formatCurrency(item.unitPrice)}
                      </p>
                    </div>
                    <p className="font-semibold">{formatCurrency(item.subtotal)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="border-t pt-4 space-y-2">
              {!viewingQuotation.hideIgv && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium">{formatCurrency(viewingQuotation.subtotal)}</span>
                  </div>
                  {viewingQuotation.discount && viewingQuotation.discount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        Descuento
                        {viewingQuotation.discountType === 'percentage'
                          ? ` (${viewingQuotation.discount}%)`
                          : ''}
                        :
                      </span>
                      <span className="font-medium text-red-600">
                        - {formatCurrency(
                          viewingQuotation.discountType === 'percentage'
                            ? (viewingQuotation.subtotal * viewingQuotation.discount) / 100
                            : viewingQuotation.discount
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">IGV (18%):</span>
                    <span className="font-medium">{formatCurrency(viewingQuotation.igv)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-xl font-bold border-t pt-2">
                <span>Total:</span>
                <span className="text-primary-600">{formatCurrency(viewingQuotation.total)}</span>
              </div>
            </div>

            {/* Notes */}
            {viewingQuotation.notes && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Observaciones</p>
                <p className="text-sm">{viewingQuotation.notes}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setViewingQuotation(null)}>
                Cerrar
              </Button>
              <Button variant="outline" onClick={() => handlePreviewPDF(viewingQuotation)}>
                <Eye className="w-4 h-4 mr-2" />
                Vista Previa
              </Button>
              <Button onClick={() => handleDownloadPDF(viewingQuotation)}>
                <Download className="w-4 h-4 mr-2" />
                Descargar PDF
              </Button>
              {viewingQuotation.status !== 'converted' &&
                viewingQuotation.status !== 'expired' &&
                viewingQuotation.status !== 'rejected' && (
                  <Button
                    onClick={() => {
                      setViewingQuotation(null)
                      setConvertingQuotation(viewingQuotation)
                    }}
                  >
                    <Receipt className="w-4 h-4 mr-2" />
                    Convertir a Factura
                  </Button>
                )}
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingQuotation}
        onClose={() => !isDeleting && setDeletingQuotation(null)}
        title="Eliminar Cotización"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-700">
                ¿Estás seguro de que deseas eliminar la cotización{' '}
                <strong>{deletingQuotation?.number}</strong>?
              </p>
              <p className="text-sm text-gray-600 mt-2">Esta acción no se puede deshacer.</p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingQuotation(null)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>Eliminar</>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Convert Confirmation Modal */}
      <Modal
        isOpen={!!convertingQuotation}
        onClose={() => !isConverting && setConvertingQuotation(null)}
        title="Convertir a Factura"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <Receipt className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-700">
                ¿Deseas convertir la cotización{' '}
                <strong>{convertingQuotation?.number}</strong> en un comprobante?
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Se abrirá el punto de venta con los datos de la cotización prellenados para que puedas revisar, agregar productos o modificar antes de emitir el comprobante.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConvertingQuotation(null)}
              disabled={isConverting}
            >
              Cancelar
            </Button>
            <Button onClick={handleConvertToInvoice} disabled={isConverting}>
              {isConverting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cargando...
                </>
              ) : (
                <>
                  <Receipt className="w-4 h-4 mr-2" />
                  Ir al Punto de Venta
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
