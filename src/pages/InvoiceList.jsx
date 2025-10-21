import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus,
  Search,
  Filter,
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
  Ban,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Alert from '@/components/ui/Alert'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import Select from '@/components/ui/Select'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getInvoices, deleteInvoice, updateInvoice, getCompanySettings, sendInvoiceToSunat } from '@/services/firestoreService'
import { generateInvoicePDF } from '@/utils/pdfGenerator'
import { prepareInvoiceXML, downloadCompressedXML, isSunatConfigured } from '@/services/sunatService'

export default function InvoiceList() {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [companySettings, setCompanySettings] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [viewingInvoice, setViewingInvoice] = useState(null)
  const [deletingInvoice, setDeletingInvoice] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [sendingToSunat, setSendingToSunat] = useState(null) // ID de factura siendo enviada a SUNAT
  const [message, setMessage] = useState(null)

  useEffect(() => {
    loadInvoices()
  }, [user])

  const loadInvoices = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const [invoicesResult, settingsResult] = await Promise.all([
        getInvoices(user.uid),
        getCompanySettings(user.uid)
      ])

      if (invoicesResult.success) {
        setInvoices(invoicesResult.data || [])
      } else {
        console.error('Error al cargar facturas:', invoicesResult.error)
      }

      if (settingsResult.success) {
        setCompanySettings(settingsResult.data)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingInvoice || !user?.uid) return

    setIsDeleting(true)
    try {
      const result = await deleteInvoice(user.uid, deletingInvoice.id)

      if (result.success) {
        setMessage({
          type: 'success',
          text: '✓ Factura eliminada exitosamente',
        })
        setDeletingInvoice(null)
        loadInvoices()
        setTimeout(() => setMessage(null), 3000)
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al eliminar factura:', error)
      setMessage({
        type: 'error',
        text: 'Error al eliminar la factura. Inténtalo nuevamente.',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleUpdateStatus = async (invoiceId, newStatus) => {
    if (!user?.uid) return

    try {
      const result = await updateInvoice(user.uid, invoiceId, { status: newStatus })

      if (result.success) {
        setMessage({
          type: 'success',
          text: '✓ Estado actualizado exitosamente',
        })
        loadInvoices()
        setTimeout(() => setMessage(null), 3000)
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al actualizar estado:', error)
      setMessage({
        type: 'error',
        text: 'Error al actualizar el estado.',
      })
    }
  }

  const handleSendToSunat = async (invoiceId) => {
    if (!user?.uid) return

    setSendingToSunat(invoiceId)
    try {
      console.log('📤 Enviando factura a SUNAT...', invoiceId)

      const result = await sendInvoiceToSunat(user.uid, invoiceId)

      if (result.success) {
        setMessage({
          type: 'success',
          text: `✓ ${result.message}`,
        })

        // Si hay observaciones, mostrarlas
        if (result.observations && result.observations.length > 0) {
          console.log('📝 Observaciones SUNAT:', result.observations)
        }

        // Recargar facturas para ver el estado actualizado
        loadInvoices()
        setTimeout(() => setMessage(null), 5000)
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al enviar a SUNAT:', error)
      setMessage({
        type: 'error',
        text: error.message || 'Error al enviar a SUNAT. Inténtalo nuevamente.',
      })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setSendingToSunat(null)
    }
  }

  // Filtrar facturas
  const filteredInvoices = invoices.filter(invoice => {
    const search = searchTerm.toLowerCase()
    const matchesSearch =
      invoice.number?.toLowerCase().includes(search) ||
      invoice.customer?.name?.toLowerCase().includes(search) ||
      invoice.customer?.documentNumber?.includes(search)

    const matchesStatus = filterStatus === 'all' || invoice.status === filterStatus
    const matchesType = filterType === 'all' || invoice.documentType === filterType

    return matchesSearch && matchesStatus && matchesType
  })

  const getStatusBadge = status => {
    switch (status) {
      case 'paid':
        return <Badge variant="success">Pagada</Badge>
      case 'pending':
        return <Badge variant="warning">Pendiente</Badge>
      case 'overdue':
        return <Badge variant="danger">Vencida</Badge>
      case 'cancelled':
        return <Badge>Anulada</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const getDocumentTypeName = type => {
    if (type === 'factura') return 'Factura'
    if (type === 'nota_venta') return 'Nota de Venta'
    return 'Boleta'
  }

  const getSunatStatusBadge = sunatStatus => {
    switch (sunatStatus) {
      case 'accepted':
        return (
          <Badge variant="success" className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Aceptado
          </Badge>
        )
      case 'pending':
        return (
          <Badge variant="warning" className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Pendiente
          </Badge>
        )
      case 'rejected':
        return (
          <Badge variant="danger" className="flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            Rechazado
          </Badge>
        )
      case 'not_applicable':
        return (
          <Badge className="flex items-center gap-1">
            <Ban className="w-3 h-3" />
            N/A
          </Badge>
        )
      default:
        return <Badge>{sunatStatus || 'N/A'}</Badge>
    }
  }

  // Estadísticas
  const stats = {
    total: invoices.length,
    paid: invoices.filter(i => i.status === 'paid').length,
    pending: invoices.filter(i => i.status === 'pending').length,
    totalAmount: invoices.reduce((sum, i) => sum + (i.total || 0), 0),
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando facturas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Facturas y Boletas</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Visualiza y gestiona todas tus facturas y boletas emitidas
          </p>
        </div>
        <Link to="/pos" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Nueva Venta
          </Button>
        </Link>
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

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Total Comprobantes</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-2">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Pagadas</p>
              <p className="text-xl sm:text-2xl font-bold text-green-600 mt-2">{stats.paid}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Pendientes</p>
              <p className="text-xl sm:text-2xl font-bold text-yellow-600 mt-2">{stats.pending}</p>
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
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por número, cliente..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <Select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="sm:w-48"
            >
              <option value="all">Todos los tipos</option>
              <option value="factura">Facturas</option>
              <option value="boleta">Boletas</option>
              <option value="nota_venta">Notas de Venta</option>
            </Select>
            <Select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="sm:w-48"
            >
              <option value="all">Todos los estados</option>
              <option value="paid">Pagadas</option>
              <option value="pending">Pendientes</option>
              <option value="overdue">Vencidas</option>
              <option value="cancelled">Anuladas</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Table */}
      <Card>
        {filteredInvoices.length === 0 ? (
          <CardContent className="p-12 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || filterStatus !== 'all' || filterType !== 'all'
                ? 'No se encontraron comprobantes'
                : 'No hay comprobantes registrados'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || filterStatus !== 'all' || filterType !== 'all'
                ? 'Intenta con otros filtros de búsqueda'
                : 'Comienza creando tu primer comprobante desde el Punto de Venta'}
            </p>
            {!searchTerm && filterStatus === 'all' && filterType === 'all' && (
              <Link to="/pos">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Ir al Punto de Venta
                </Button>
              </Link>
            )}
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden md:table-cell">Fecha</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden lg:table-cell">SUNAT</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map(invoice => (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      <span className="font-medium text-primary-600 text-sm">
                        {invoice.number}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{getDocumentTypeName(invoice.documentType)}</span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{invoice.customer?.name}</p>
                        <p className="text-xs text-gray-500">{invoice.customer?.documentNumber}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm">
                        {invoice.createdAt
                          ? formatDate(invoice.createdAt.toDate())
                          : 'N/A'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-sm">{formatCurrency(invoice.total)}</span>
                    </TableCell>
                    <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {getSunatStatusBadge(invoice.sunatStatus || 'pending')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end space-x-1">
                        {/* Botón Enviar a SUNAT - solo para facturas y boletas pendientes */}
                        {(invoice.documentType === 'factura' || invoice.documentType === 'boleta') &&
                         invoice.sunatStatus === 'pending' && (
                          <button
                            onClick={() => handleSendToSunat(invoice.id)}
                            disabled={sendingToSunat === invoice.id}
                            className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Enviar a SUNAT"
                          >
                            {sendingToSunat === invoice.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => setViewingInvoice(invoice)}
                          className="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Ver detalles"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingInvoice(invoice)}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* View Invoice Modal */}
      <Modal
        isOpen={!!viewingInvoice}
        onClose={() => setViewingInvoice(null)}
        title="Detalles del Comprobante"
        size="lg"
      >
        {viewingInvoice && (
          <div className="space-y-6">
            {/* Header Info */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">Número</p>
                <p className="font-semibold text-primary-600">{viewingInvoice.number}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Tipo</p>
                <p className="font-semibold">{getDocumentTypeName(viewingInvoice.documentType)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Fecha</p>
                <p className="font-semibold">
                  {viewingInvoice.createdAt
                    ? formatDate(viewingInvoice.createdAt.toDate())
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Estado</p>
                <div className="mt-1">{getStatusBadge(viewingInvoice.status)}</div>
              </div>
            </div>

            {/* Customer Info */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Cliente</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-600">Nombre</p>
                  <p className="font-medium">{viewingInvoice.customer?.name}</p>
                </div>
                <div>
                  <p className="text-gray-600">Documento</p>
                  <p className="font-medium">{viewingInvoice.customer?.documentNumber}</p>
                </div>
                {viewingInvoice.customer?.email && (
                  <div>
                    <p className="text-gray-600">Email</p>
                    <p className="font-medium">{viewingInvoice.customer?.email}</p>
                  </div>
                )}
                {viewingInvoice.customer?.phone && (
                  <div>
                    <p className="text-gray-600">Teléfono</p>
                    <p className="font-medium">{viewingInvoice.customer?.phone}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Items */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Items</h4>
              <div className="space-y-2">
                {viewingInvoice.items?.map((item, index) => (
                  <div key={index} className="flex justify-between items-start p-3 bg-gray-50 rounded-lg text-sm">
                    <div className="flex-1">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-gray-500">
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
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium">{formatCurrency(viewingInvoice.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">IGV (18%):</span>
                <span className="font-medium">{formatCurrency(viewingInvoice.igv)}</span>
              </div>
              <div className="flex justify-between text-xl font-bold border-t pt-2">
                <span>Total:</span>
                <span className="text-primary-600">{formatCurrency(viewingInvoice.total)}</span>
              </div>
            </div>

            {/* Payment Info */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">Método de Pago</p>
                <p className="font-semibold">{viewingInvoice.paymentMethod}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Estado de Pago</p>
                <Select
                  value={viewingInvoice.status}
                  onChange={e => handleUpdateStatus(viewingInvoice.id, e.target.value)}
                  className="text-sm"
                >
                  <option value="pending">Pendiente</option>
                  <option value="paid">Pagada</option>
                  <option value="overdue">Vencida</option>
                  <option value="cancelled">Anulada</option>
                </Select>
              </div>
            </div>

            {/* Notes */}
            {viewingInvoice.notes && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Observaciones</p>
                <p className="text-sm">{viewingInvoice.notes}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setViewingInvoice(null)}>
                Cerrar
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  // Validar que existan los datos de la empresa
                  if (!companySettings || !companySettings.ruc || !companySettings.businessName) {
                    setMessage({
                      type: 'error',
                      text: '⚠️ Debes configurar los datos de tu empresa primero. Ve a Configuración > Información de la Empresa'
                    })
                    setTimeout(() => setMessage(null), 5000)
                    return
                  }

                  try {
                    const result = await prepareInvoiceXML(viewingInvoice, companySettings)

                    if (result.success) {
                      await downloadCompressedXML(result.xml, result.fileName)
                      setMessage({
                        type: 'success',
                        text: '✓ XML SUNAT descargado exitosamente'
                      })
                      setTimeout(() => setMessage(null), 3000)
                    } else {
                      throw new Error(result.error)
                    }
                  } catch (error) {
                    console.error('Error al generar XML:', error)
                    setMessage({
                      type: 'error',
                      text: 'Error al generar el XML: ' + error.message
                    })
                    setTimeout(() => setMessage(null), 3000)
                  }
                }}
              >
                <FileText className="w-4 h-4 mr-2" />
                XML SUNAT
              </Button>
              <Button
                onClick={() => {
                  // Validar que existan los datos de la empresa
                  if (!companySettings || !companySettings.ruc || !companySettings.businessName) {
                    setMessage({
                      type: 'error',
                      text: '⚠️ Debes configurar los datos de tu empresa primero. Ve a Configuración > Información de la Empresa'
                    })
                    setTimeout(() => setMessage(null), 5000)
                    return
                  }

                  try {
                    generateInvoicePDF(viewingInvoice, companySettings)
                    setMessage({
                      type: 'success',
                      text: '✓ PDF generado exitosamente'
                    })
                    setTimeout(() => setMessage(null), 3000)
                  } catch (error) {
                    console.error('Error al generar PDF:', error)
                    setMessage({
                      type: 'error',
                      text: 'Error al generar el PDF'
                    })
                    setTimeout(() => setMessage(null), 3000)
                  }
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Descargar PDF
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingInvoice}
        onClose={() => !isDeleting && setDeletingInvoice(null)}
        title="Eliminar Comprobante"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-700">
                ¿Estás seguro de que deseas eliminar el comprobante{' '}
                <strong>{deletingInvoice?.number}</strong>?
              </p>
              <p className="text-sm text-gray-600 mt-2">Esta acción no se puede deshacer.</p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingInvoice(null)}
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
    </div>
  )
}
