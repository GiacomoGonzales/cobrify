import { useState, useEffect, useMemo } from 'react'
import {
  Users,
  Search,
  CheckCircle,
  XCircle,
  Calendar,
  DollarSign,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter
} from 'lucide-react'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { getCustomersWithStats } from '@/services/firestoreService'
import { formatCurrency } from '@/lib/utils'
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import * as XLSX from 'xlsx'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export default function StudentPaymentControl() {
  const { user, getBusinessId, businessSettings } = useAppContext()
  const toast = useToast()

  const [students, setStudents] = useState([])
  const [payments, setPayments] = useState({}) // { customerId: [invoices] }
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [filterStatus, setFilterStatus] = useState('all') // all, paid, pending

  // Cargar estudiantes (clientes con studentName)
  useEffect(() => {
    loadStudents()
  }, [user])

  // Cargar pagos cuando cambia el mes seleccionado
  useEffect(() => {
    if (students.length > 0) {
      loadPaymentsForMonth()
    }
  }, [students, selectedMonth])

  const loadStudents = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const businessId = getBusinessId()
      const result = await getCustomersWithStats(businessId)

      if (result.success) {
        // Filtrar solo clientes que tienen studentName
        const studentsOnly = (result.data || []).filter(c => c.studentName && c.studentName.trim() !== '')
        setStudents(studentsOnly)
      }
    } catch (error) {
      console.error('Error cargando estudiantes:', error)
      toast.error('Error al cargar estudiantes')
    } finally {
      setIsLoading(false)
    }
  }

  const loadPaymentsForMonth = async () => {
    if (!user?.uid || students.length === 0) return

    try {
      const businessId = getBusinessId()
      const monthStart = startOfMonth(selectedMonth)
      const monthEnd = endOfMonth(selectedMonth)

      // Consultar todas las facturas del mes
      const invoicesRef = collection(db, 'businesses', businessId, 'invoices')
      const q = query(
        invoicesRef,
        where('createdAt', '>=', Timestamp.fromDate(monthStart)),
        where('createdAt', '<=', Timestamp.fromDate(monthEnd)),
        orderBy('createdAt', 'desc')
      )

      const snapshot = await getDocs(q)
      const invoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

      // Agrupar por customerId
      const paymentsByCustomer = {}

      // Crear mapas para búsqueda rápida
      const studentIds = new Set(students.map(s => s.id))
      // Mapa de documentNumber -> studentId para comprobantes antiguos sin customerId
      const docNumberToStudentId = {}
      students.forEach(s => {
        if (s.documentNumber) {
          docNumberToStudentId[s.documentNumber] = s.id
        }
      })

      invoices.forEach(invoice => {
        // Intentar primero por customerId
        let customerId = invoice.customerId || invoice.customer?.id

        // Si no tiene customerId, intentar por número de documento
        if (!customerId || !studentIds.has(customerId)) {
          const invoiceDocNumber = invoice.customer?.documentNumber
          if (invoiceDocNumber && docNumberToStudentId[invoiceDocNumber]) {
            customerId = docNumberToStudentId[invoiceDocNumber]
          }
        }

        if (customerId && studentIds.has(customerId)) {
          if (!paymentsByCustomer[customerId]) {
            paymentsByCustomer[customerId] = []
          }
          paymentsByCustomer[customerId].push(invoice)
        }
      })

      setPayments(paymentsByCustomer)
    } catch (error) {
      console.error('Error cargando pagos:', error)
    }
  }

  // Navegación de mes
  const goToPreviousMonth = () => {
    setSelectedMonth(prev => subMonths(prev, 1))
  }

  const goToNextMonth = () => {
    setSelectedMonth(prev => addMonths(prev, 1))
  }

  const goToCurrentMonth = () => {
    setSelectedMonth(new Date())
  }

  // Filtrar y ordenar estudiantes
  const filteredStudents = useMemo(() => {
    let result = [...students]

    // Filtrar por búsqueda
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(s =>
        s.name?.toLowerCase().includes(term) ||
        s.studentName?.toLowerCase().includes(term) ||
        s.phone?.toLowerCase().includes(term)
      )
    }

    // Filtrar por estado de pago
    if (filterStatus !== 'all') {
      result = result.filter(s => {
        const hasPaid = payments[s.id] && payments[s.id].length > 0
        return filterStatus === 'paid' ? hasPaid : !hasPaid
      })
    }

    // Ordenar: primero los que no han pagado
    result.sort((a, b) => {
      const aPaid = payments[a.id] && payments[a.id].length > 0
      const bPaid = payments[b.id] && payments[b.id].length > 0
      if (aPaid === bPaid) {
        return (a.studentName || '').localeCompare(b.studentName || '')
      }
      return aPaid ? 1 : -1
    })

    return result
  }, [students, searchTerm, filterStatus, payments])

  // Estadísticas
  const stats = useMemo(() => {
    const total = students.length
    const paid = students.filter(s => payments[s.id] && payments[s.id].length > 0).length
    const pending = total - paid

    // Total recaudado en el mes
    let totalAmount = 0
    Object.values(payments).forEach(invoices => {
      invoices.forEach(inv => {
        totalAmount += inv.total || 0
      })
    })

    return { total, paid, pending, totalAmount }
  }, [students, payments])

  // Obtener información de pago de un estudiante
  const getPaymentInfo = (studentId) => {
    const studentPayments = payments[studentId]
    if (!studentPayments || studentPayments.length === 0) {
      return null
    }

    // Obtener el pago más reciente
    const lastPayment = studentPayments[0]
    const totalPaid = studentPayments.reduce((sum, inv) => sum + (inv.total || 0), 0)

    // Obtener productos
    const products = []
    studentPayments.forEach(inv => {
      if (inv.items && Array.isArray(inv.items)) {
        inv.items.forEach(item => {
          products.push(`${item.quantity || 1}x ${item.name || item.description || 'Producto'}`)
        })
      }
    })

    return {
      lastPaymentDate: lastPayment.createdAt?.toDate?.() || lastPayment.createdAt,
      totalPaid,
      paymentsCount: studentPayments.length,
      products: products.join(', '),
      invoiceNumber: lastPayment.number
    }
  }

  // Exportar a Excel
  const exportToExcel = async () => {
    try {
      const workbook = XLSX.utils.book_new()

      const monthName = format(selectedMonth, 'MMMM yyyy', { locale: es })

      const data = [
        ['CONTROL DE PAGOS DE ALUMNOS'],
        [''],
        ['Mes:', monthName],
        ['Total Alumnos:', stats.total],
        ['Pagados:', stats.paid],
        ['Pendientes:', stats.pending],
        ['Total Recaudado:', formatCurrency(stats.totalAmount)],
        [''],
        ['DETALLE DE ALUMNOS'],
        [''],
        ['Alumno', 'Apoderado/Cliente', 'Teléfono', 'Horario', 'Estado', 'Fecha Pago', 'Monto', 'Productos', 'N° Comprobante']
      ]

      filteredStudents.forEach(student => {
        const paymentInfo = getPaymentInfo(student.id)

        data.push([
          student.studentName || '',
          student.name || '',
          student.phone || '',
          student.studentSchedule || '',
          paymentInfo ? 'PAGADO' : 'PENDIENTE',
          paymentInfo?.lastPaymentDate ? format(new Date(paymentInfo.lastPaymentDate), 'dd/MM/yyyy') : '',
          paymentInfo?.totalPaid || '',
          paymentInfo?.products || '',
          paymentInfo?.invoiceNumber || ''
        ])
      })

      const worksheet = XLSX.utils.aoa_to_sheet(data)

      worksheet['!cols'] = [
        { width: 25 },  // Alumno
        { width: 25 },  // Apoderado
        { width: 15 },  // Teléfono
        { width: 20 },  // Horario
        { width: 12 },  // Estado
        { width: 12 },  // Fecha Pago
        { width: 12 },  // Monto
        { width: 40 },  // Productos
        { width: 15 },  // N° Comprobante
      ]

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Control Pagos')

      const fileName = `Control_Pagos_Alumnos_${format(selectedMonth, 'yyyy-MM')}.xlsx`

      if (Capacitor.isNativePlatform()) {
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' })

        try {
          await Filesystem.mkdir({
            path: 'Reportes',
            directory: Directory.Documents,
            recursive: true
          })
        } catch (e) {
          // Directory exists
        }

        const result = await Filesystem.writeFile({
          path: `Reportes/${fileName}`,
          data: excelBuffer,
          directory: Directory.Documents,
          recursive: true
        })

        await Share.share({
          title: fileName,
          text: `Control de Pagos de Alumnos - ${monthName}`,
          url: result.uri,
          dialogTitle: 'Compartir Reporte'
        })
      } else {
        XLSX.writeFile(workbook, fileName)
      }

      toast.success('Reporte exportado correctamente')
    } catch (error) {
      console.error('Error exportando:', error)
      toast.error('Error al exportar el reporte')
    }
  }

  if (!businessSettings?.posCustomFields?.showStudentField) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Control de Pagos de Alumnos</h2>
            <p className="text-gray-500">
              Para usar esta función, activa el campo "Alumno" en Configuración &gt; Preferencias
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Control de Pagos de Alumnos</h1>
          <p className="text-gray-500 text-sm mt-1">
            Seguimiento de pagos mensuales por alumno
          </p>
        </div>
        <Button onClick={exportToExcel} variant="outline">
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Exportar Excel
        </Button>
      </div>

      {/* Selector de mes */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={goToPreviousMonth}>
              <ChevronLeft className="w-5 h-5" />
            </Button>

            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-gray-500" />
              <span className="text-lg font-semibold capitalize">
                {format(selectedMonth, 'MMMM yyyy', { locale: es })}
              </span>
              {format(selectedMonth, 'yyyy-MM') !== format(new Date(), 'yyyy-MM') && (
                <Button variant="ghost" size="sm" onClick={goToCurrentMonth}>
                  Hoy
                </Button>
              )}
            </div>

            <Button variant="ghost" size="sm" onClick={goToNextMonth}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Estadísticas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                <p className="text-sm text-gray-500">Total Alumnos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.paid}</p>
                <p className="text-sm text-gray-500">Pagados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{stats.pending}</p>
                <p className="text-sm text-gray-500">Pendientes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.totalAmount)}</p>
                <p className="text-sm text-gray-500">Recaudado</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Búsqueda */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nombre de alumno o cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {/* Filtro de estado */}
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-500" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="all">Todos</option>
                <option value="paid">Pagados</option>
                <option value="pending">Pendientes</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de alumnos */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-500">Cargando alumnos...</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                {searchTerm || filterStatus !== 'all'
                  ? 'No se encontraron alumnos con los filtros aplicados'
                  : 'No hay alumnos registrados. Agrega el nombre del alumno en la ficha de cliente.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Alumno</TableHead>
                    <TableHead className="hidden sm:table-cell">Cliente/Apoderado</TableHead>
                    <TableHead className="hidden md:table-cell">Horario</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="hidden sm:table-cell">Fecha Pago</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="hidden lg:table-cell">Productos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((student) => {
                    const paymentInfo = getPaymentInfo(student.id)
                    const isPaid = !!paymentInfo

                    return (
                      <TableRow key={student.id} className={!isPaid ? 'bg-red-50' : ''}>
                        <TableCell>
                          <div className="font-medium text-gray-900">{student.studentName}</div>
                          <div className="text-sm text-gray-500 sm:hidden">{student.name}</div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="text-gray-700">{student.name}</div>
                          {student.phone && (
                            <div className="text-sm text-gray-500">{student.phone}</div>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {student.studentSchedule ? (
                            <div className="flex items-center gap-1 text-gray-600">
                              <Clock className="w-4 h-4" />
                              {student.studentSchedule}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isPaid ? (
                            <Badge variant="success" className="whitespace-nowrap">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Pagado
                            </Badge>
                          ) : (
                            <Badge variant="error" className="whitespace-nowrap">
                              <XCircle className="w-3 h-3 mr-1" />
                              Pendiente
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {paymentInfo?.lastPaymentDate ? (
                            <span className="text-gray-600">
                              {format(new Date(paymentInfo.lastPaymentDate), 'dd/MM/yyyy')}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {paymentInfo ? (
                            <span className="font-medium text-green-600">
                              {formatCurrency(paymentInfo.totalPaid)}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell max-w-xs">
                          {paymentInfo?.products ? (
                            <span className="text-sm text-gray-600 truncate block" title={paymentInfo.products}>
                              {paymentInfo.products}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
