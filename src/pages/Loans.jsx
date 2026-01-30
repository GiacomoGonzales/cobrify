import { useState, useEffect, useMemo } from 'react'
import {
  Plus,
  Search,
  Eye,
  Trash2,
  Loader2,
  Landmark,
  AlertTriangle,
  DollarSign,
  Calendar,
  CheckCircle,
  Clock,
  List,
  Building2,
  User,
  X,
  Pencil,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getLoans, createLoan, updateLoan, deleteLoan } from '@/services/firestoreService'

// Datos de ejemplo para modo demo
const DEMO_LOANS = [
  {
    id: 'demo-loan-1',
    type: 'bank',
    lenderName: 'Banco de Crédito del Perú',
    description: 'Préstamo para capital de trabajo',
    amount: 50000,
    interestRate: 12,
    totalWithInterest: 56000,
    totalInstallments: 12,
    paidInstallments: 5,
    paidAmount: 23333.33,
    status: 'active',
    installments: Array.from({ length: 12 }, (_, i) => ({
      number: i + 1,
      amount: 4666.67,
      dueDate: new Date(2024, 0 + i, 15).toISOString(),
      status: i < 5 ? 'paid' : 'pending',
      paidAt: i < 5 ? new Date(2024, 0 + i, 14).toISOString() : null,
      paidAmount: i < 5 ? 4666.67 : 0
    }))
  },
  {
    id: 'demo-loan-2',
    type: 'bank',
    lenderName: 'Interbank',
    description: 'Préstamo vehicular',
    amount: 35000,
    interestRate: 15,
    totalWithInterest: 40250,
    totalInstallments: 24,
    paidInstallments: 8,
    paidAmount: 13416.67,
    status: 'active',
    installments: Array.from({ length: 24 }, (_, i) => ({
      number: i + 1,
      amount: 1677.08,
      dueDate: new Date(2024, 0 + i, 20).toISOString(),
      status: i < 8 ? 'paid' : 'pending',
      paidAt: i < 8 ? new Date(2024, 0 + i, 19).toISOString() : null,
      paidAmount: i < 8 ? 1677.08 : 0
    }))
  },
  {
    id: 'demo-loan-3',
    type: 'third_party',
    lenderName: 'Juan Pérez',
    description: 'Préstamo personal para mercadería',
    amount: 10000,
    interestRate: 5,
    totalWithInterest: 10500,
    totalInstallments: 6,
    paidInstallments: 6,
    paidAmount: 10500,
    status: 'paid',
    installments: Array.from({ length: 6 }, (_, i) => ({
      number: i + 1,
      amount: 1750,
      dueDate: new Date(2024, 0 + i, 10).toISOString(),
      status: 'paid',
      paidAt: new Date(2024, 0 + i, 9).toISOString(),
      paidAmount: 1750
    }))
  },
  {
    id: 'demo-loan-4',
    type: 'third_party',
    lenderName: 'María García',
    description: 'Préstamo para equipos',
    amount: 8000,
    interestRate: 0,
    totalWithInterest: 8000,
    totalInstallments: 4,
    paidInstallments: 2,
    paidAmount: 4000,
    status: 'active',
    installments: Array.from({ length: 4 }, (_, i) => ({
      number: i + 1,
      amount: 2000,
      dueDate: new Date(2024, 3 + i, 5).toISOString(),
      status: i < 2 ? 'paid' : 'pending',
      paidAt: i < 2 ? new Date(2024, 3 + i, 4).toISOString() : null,
      paidAmount: i < 2 ? 2000 : 0
    }))
  },
]

export default function Loans() {
  const { user, isDemoMode, getBusinessId } = useAppContext()
  const toast = useToast()
  const [loans, setLoans] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Modales
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [viewingLoan, setViewingLoan] = useState(null)
  const [deletingLoan, setDeletingLoan] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPayingInstallment, setIsPayingInstallment] = useState(false)

  // Modal de pago con fecha
  const [paymentModal, setPaymentModal] = useState({ open: false, loan: null, installmentIndex: null })
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])

  // Modal de edición de pago
  const [editPaymentModal, setEditPaymentModal] = useState({ open: false, loan: null, installmentIndex: null })
  const [editPaymentDate, setEditPaymentDate] = useState('')
  const [isEditingPayment, setIsEditingPayment] = useState(false)

  // Filtros
  const [typeFilter, setTypeFilter] = useState('all') // 'all', 'bank', 'third_party'
  const [statusFilter, setStatusFilter] = useState('all') // 'all', 'active', 'paid'

  // Formulario de nuevo préstamo
  const [formData, setFormData] = useState({
    type: 'bank', // 'bank' o 'third_party'
    lenderName: '',
    description: '',
    amount: '',
    interestRate: '',
    numInstallments: 12,
    issueDate: '', // Fecha de emisión del préstamo
    firstDueDate: '',
    frequency: 30,
  })

  useEffect(() => {
    loadLoans()
  }, [user])

  const loadLoans = async () => {
    if (!user?.uid && !isDemoMode) return

    setIsLoading(true)
    try {
      if (isDemoMode) {
        setLoans(DEMO_LOANS)
        setIsLoading(false)
        return
      }

      const result = await getLoans(getBusinessId())
      if (result.success) {
        setLoans(result.data || [])
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Generar cuotas automáticamente
  const generateInstallments = (amount, numInstallments, firstDueDate, frequency, interestRate) => {
    if (!amount || !numInstallments || !firstDueDate) return []

    const principal = parseFloat(amount)
    const rate = parseFloat(interestRate) || 0
    const totalWithInterest = principal * (1 + rate / 100)
    const installmentAmount = Math.floor((totalWithInterest / numInstallments) * 100) / 100
    const lastInstallmentAmount = Math.round((totalWithInterest - (installmentAmount * (numInstallments - 1))) * 100) / 100

    const installments = []
    let currentDate = new Date(firstDueDate + 'T12:00:00')

    for (let i = 0; i < numInstallments; i++) {
      installments.push({
        number: i + 1,
        amount: i === numInstallments - 1 ? lastInstallmentAmount : installmentAmount,
        dueDate: currentDate.toISOString(),
        status: 'pending',
        paidAt: null,
        paidAmount: 0
      })
      currentDate = new Date(currentDate)
      currentDate.setDate(currentDate.getDate() + frequency)
    }

    return installments
  }

  const handleCreateLoan = async (e) => {
    e.preventDefault()

    if (!formData.lenderName.trim()) {
      toast.error('Ingresa el nombre del prestamista')
      return
    }
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error('Ingresa un monto válido')
      return
    }
    if (!formData.firstDueDate) {
      toast.error('Selecciona la fecha de la primera cuota')
      return
    }

    if (isDemoMode) {
      toast.error('No se pueden crear préstamos en modo demo')
      return
    }

    setIsSaving(true)
    try {
      const installments = generateInstallments(
        formData.amount,
        formData.numInstallments,
        formData.firstDueDate,
        formData.frequency,
        formData.interestRate
      )

      const totalWithInterest = installments.reduce((sum, i) => sum + i.amount, 0)

      const loanData = {
        type: formData.type,
        lenderName: formData.lenderName.trim(),
        description: formData.description.trim(),
        amount: parseFloat(formData.amount),
        interestRate: parseFloat(formData.interestRate) || 0,
        totalWithInterest,
        installments,
        totalInstallments: formData.numInstallments,
        paidInstallments: 0,
        paidAmount: 0,
        status: 'active', // 'active' o 'paid'
        issueDate: formData.issueDate ? new Date(formData.issueDate + 'T12:00:00').toISOString() : new Date().toISOString(),
        frequency: formData.frequency, // Guardar frecuencia para referencia
      }

      const result = await createLoan(getBusinessId(), loanData)
      if (result.success) {
        toast.success('Préstamo registrado exitosamente')
        setShowCreateModal(false)
        resetForm()
        loadLoans()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al crear préstamo:', error)
      toast.error('Error al registrar el préstamo')
    } finally {
      setIsSaving(false)
    }
  }

  // Abrir modal de pago
  const openPaymentModal = (loan, installmentIndex) => {
    setPaymentDate(new Date().toISOString().split('T')[0]) // Reset a fecha actual
    setPaymentModal({ open: true, loan, installmentIndex })
  }

  // Confirmar pago con fecha seleccionada
  const handlePayInstallment = async () => {
    const { loan, installmentIndex } = paymentModal

    if (isDemoMode) {
      toast.error('No se pueden modificar préstamos en modo demo')
      return
    }

    if (!loan || installmentIndex === null) return

    setIsPayingInstallment(true)
    try {
      const selectedDate = new Date(paymentDate + 'T12:00:00') // Usar mediodía para evitar problemas de timezone

      const updatedInstallments = [...loan.installments]
      updatedInstallments[installmentIndex] = {
        ...updatedInstallments[installmentIndex],
        status: 'paid',
        paidAt: selectedDate.toISOString(),
        paidAmount: updatedInstallments[installmentIndex].amount
      }

      const paidInstallments = updatedInstallments.filter(i => i.status === 'paid').length
      const totalPaid = updatedInstallments.reduce((sum, i) => sum + (i.paidAmount || 0), 0)
      const allPaid = paidInstallments === updatedInstallments.length

      const result = await updateLoan(getBusinessId(), loan.id, {
        installments: updatedInstallments,
        paidInstallments,
        paidAmount: totalPaid,
        status: allPaid ? 'paid' : 'active',
        ...(allPaid && { paidAt: new Date() }),
      })

      if (result.success) {
        toast.success(`Cuota ${installmentIndex + 1} pagada exitosamente`)
        loadLoans()
        // Actualizar el modal de visualización
        setViewingLoan({ ...loan, installments: updatedInstallments, paidInstallments, paidAmount: totalPaid, status: allPaid ? 'paid' : 'active' })
        // Cerrar modal de pago
        setPaymentModal({ open: false, loan: null, installmentIndex: null })
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al pagar cuota:', error)
      toast.error('Error al registrar el pago')
    } finally {
      setIsPayingInstallment(false)
    }
  }

  // Abrir modal de edición de pago
  const openEditPaymentModal = (loan, installmentIndex) => {
    const installment = loan.installments[installmentIndex]
    const paidDate = installment.paidAt ? new Date(installment.paidAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
    setEditPaymentDate(paidDate)
    setEditPaymentModal({ open: true, loan, installmentIndex })
  }

  // Confirmar edición de pago
  const handleEditPayment = async () => {
    const { loan, installmentIndex } = editPaymentModal

    if (isDemoMode) {
      toast.error('No se pueden modificar préstamos en modo demo')
      return
    }

    if (!loan || installmentIndex === null) return

    setIsEditingPayment(true)
    try {
      const selectedDate = new Date(editPaymentDate + 'T12:00:00')

      const updatedInstallments = [...loan.installments]
      updatedInstallments[installmentIndex] = {
        ...updatedInstallments[installmentIndex],
        paidAt: selectedDate.toISOString(),
      }

      const result = await updateLoan(getBusinessId(), loan.id, {
        installments: updatedInstallments,
      })

      if (result.success) {
        toast.success(`Fecha de pago de cuota ${installmentIndex + 1} actualizada`)
        loadLoans()
        // Actualizar el modal de visualización
        setViewingLoan({ ...loan, installments: updatedInstallments })
        // Cerrar modal de edición
        setEditPaymentModal({ open: false, loan: null, installmentIndex: null })
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error al editar pago:', error)
      toast.error('Error al actualizar la fecha de pago')
    } finally {
      setIsEditingPayment(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingLoan || isDemoMode) {
      toast.error('No se pueden eliminar préstamos en modo demo')
      setDeletingLoan(null)
      return
    }

    setIsDeleting(true)
    try {
      const result = await deleteLoan(getBusinessId(), deletingLoan.id)
      if (result.success) {
        toast.success('Préstamo eliminado')
        setDeletingLoan(null)
        loadLoans()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al eliminar el préstamo')
    } finally {
      setIsDeleting(false)
    }
  }

  const resetForm = () => {
    setFormData({
      type: 'bank',
      lenderName: '',
      description: '',
      amount: '',
      interestRate: '',
      numInstallments: 12,
      issueDate: '',
      firstDueDate: '',
      frequency: 30,
    })
  }

  // Filtrado
  const filteredLoans = useMemo(() => {
    return loans
      .filter(loan => {
        if (typeFilter !== 'all' && loan.type !== typeFilter) return false
        if (statusFilter !== 'all' && loan.status !== statusFilter) return false
        if (searchTerm) {
          const search = searchTerm.toLowerCase()
          return loan.lenderName?.toLowerCase().includes(search) ||
                 loan.description?.toLowerCase().includes(search)
        }
        return true
      })
  }, [loans, typeFilter, statusFilter, searchTerm])

  // Estadísticas
  const stats = useMemo(() => {
    const activeLoans = loans.filter(l => l.status === 'active')
    const totalDebt = activeLoans.reduce((sum, l) => sum + ((l.totalWithInterest || l.amount) - (l.paidAmount || 0)), 0)
    const totalPaid = loans.reduce((sum, l) => sum + (l.paidAmount || 0), 0)

    return {
      total: loans.length,
      active: activeLoans.length,
      totalDebt,
      totalPaid,
    }
  }, [loans])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando préstamos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Préstamos</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Gestiona préstamos bancarios y de terceros
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Préstamo
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600">Préstamos</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{stats.total}</p>
              </div>
              <div className="p-2 bg-primary-100 rounded-lg">
                <Landmark className="w-5 h-5 text-primary-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600">Activos</p>
                <p className="text-xl font-bold text-yellow-600 mt-1">{stats.active}</p>
              </div>
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={stats.totalDebt > 0 ? 'ring-2 ring-red-200' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600">Deuda Total</p>
                <p className="text-lg font-bold text-red-600 mt-1">
                  {formatCurrency(stats.totalDebt)}
                </p>
              </div>
              <div className="p-2 bg-red-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600">Total Pagado</p>
                <p className="text-lg font-bold text-green-600 mt-1">
                  {formatCurrency(stats.totalPaid)}
                </p>
              </div>
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
            <Search className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <input
              type="text"
              placeholder="Buscar por prestamista, descripción..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 font-medium">Tipo:</span>
              <div className="flex gap-2">
                {[
                  { value: 'all', label: 'Todos' },
                  { value: 'bank', label: 'Banco' },
                  { value: 'third_party', label: 'Terceros' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTypeFilter(opt.value)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors shadow-sm ${
                      typeFilter === opt.value
                        ? 'bg-primary-600 text-white border border-primary-700'
                        : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 font-medium">Estado:</span>
              <div className="flex gap-2">
                {[
                  { value: 'all', label: 'Todos' },
                  { value: 'active', label: 'Activos' },
                  { value: 'paid', label: 'Pagados' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setStatusFilter(opt.value)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors shadow-sm ${
                      statusFilter === opt.value
                        ? 'bg-green-600 text-white border border-green-700'
                        : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loans Table */}
      <Card>
        {filteredLoans.length === 0 ? (
          <CardContent className="p-12 text-center">
            <Landmark className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || typeFilter !== 'all' || statusFilter !== 'all'
                ? 'No se encontraron préstamos'
                : 'No hay préstamos registrados'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || typeFilter !== 'all' || statusFilter !== 'all'
                ? 'Intenta con otros filtros'
                : 'Registra tu primer préstamo bancario o de terceros'}
            </p>
            {!searchTerm && typeFilter === 'all' && statusFilter === 'all' && (
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Registrar Préstamo
              </Button>
            )}
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Prestamista</TableHead>
                  <TableHead className="hidden sm:table-cell">Emisión</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-center">Cuotas</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLoans.map(loan => (
                  <TableRow key={loan.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {loan.type === 'bank' ? (
                          <Building2 className="w-4 h-4 text-blue-600" />
                        ) : (
                          <User className="w-4 h-4 text-purple-600" />
                        )}
                        <span className="text-sm">
                          {loan.type === 'bank' ? 'Banco' : 'Tercero'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{loan.lenderName}</p>
                        {loan.description && (
                          <p className="text-xs text-gray-500">{loan.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Calendar className="w-3 h-3" />
                        {loan.issueDate ? formatDate(new Date(loan.issueDate)) : '-'}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div>
                        <p className="font-semibold">{formatCurrency(loan.amount)}</p>
                        {loan.interestRate > 0 && (
                          <p className="text-xs text-gray-500">{loan.interestRate}% interés</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={loan.status === 'paid' ? 'success' : 'warning'} className="text-xs">
                        <List className="w-3 h-3 mr-1" />
                        {loan.paidInstallments || 0}/{loan.totalInstallments}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {loan.status === 'paid' ? (
                        <Badge variant="success" className="text-xs">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Pagado
                        </Badge>
                      ) : (
                        <Badge variant="warning" className="text-xs">
                          <Clock className="w-3 h-3 mr-1" />
                          Activo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewingLoan(loan)}
                          className="text-purple-600 hover:bg-purple-50"
                          title="Ver cuotas"
                        >
                          <List className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingLoan(loan)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Modal Crear Préstamo */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          resetForm()
        }}
        title="Nuevo Préstamo"
        size="lg"
      >
        <form onSubmit={handleCreateLoan} className="space-y-4">
          {/* Tipo de préstamo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Préstamo
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="loanType"
                  value="bank"
                  checked={formData.type === 'bank'}
                  onChange={e => setFormData({ ...formData, type: e.target.value })}
                  className="w-4 h-4 text-primary-600"
                />
                <Building2 className="w-4 h-4 ml-2 mr-1 text-blue-600" />
                <span className="text-sm">Préstamo Bancario</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="loanType"
                  value="third_party"
                  checked={formData.type === 'third_party'}
                  onChange={e => setFormData({ ...formData, type: e.target.value })}
                  className="w-4 h-4 text-primary-600"
                />
                <User className="w-4 h-4 ml-2 mr-1 text-purple-600" />
                <span className="text-sm">Préstamo de Tercero</span>
              </label>
            </div>
          </div>

          {/* Nombre del prestamista */}
          <Input
            label={formData.type === 'bank' ? 'Nombre del Banco' : 'Nombre del Prestamista'}
            value={formData.lenderName}
            onChange={e => setFormData({ ...formData, lenderName: e.target.value })}
            placeholder={formData.type === 'bank' ? 'Ej: BCP, Interbank' : 'Ej: Juan Pérez'}
            required
          />

          {/* Descripción */}
          <Input
            label="Descripción (opcional)"
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
            placeholder="Ej: Préstamo para capital de trabajo"
          />

          {/* Fecha de emisión */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de Emisión del Préstamo
            </label>
            <input
              type="date"
              value={formData.issueDate}
              onChange={e => setFormData({ ...formData, issueDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-gray-500 mt-1">Si no se especifica, se usará la fecha actual</p>
          </div>

          {/* Monto e interés */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Monto del Préstamo"
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={e => setFormData({ ...formData, amount: e.target.value })}
              placeholder="0.00"
              required
            />
            <Input
              label="Tasa de Interés (%)"
              type="number"
              step="0.01"
              value={formData.interestRate}
              onChange={e => setFormData({ ...formData, interestRate: e.target.value })}
              placeholder="0"
            />
          </div>

          {/* Cuotas */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                N° de Cuotas
              </label>
              <input
                type="number"
                min="1"
                max="120"
                value={formData.numInstallments}
                onChange={e => setFormData({ ...formData, numInstallments: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Primera Cuota
              </label>
              <input
                type="date"
                value={formData.firstDueDate}
                onChange={e => setFormData({ ...formData, firstDueDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frecuencia
              </label>
              <select
                value={formData.frequency}
                onChange={e => setFormData({ ...formData, frequency: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value={1}>Diario</option>
                <option value={7}>Semanal</option>
                <option value={15}>Quincenal</option>
                <option value={30}>Mensual</option>
                <option value={60}>Bimestral</option>
                <option value={90}>Trimestral</option>
              </select>
            </div>
          </div>

          {/* Preview de cuotas */}
          {formData.amount && formData.firstDueDate && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm font-medium text-gray-700 mb-2">Resumen del Préstamo</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Monto:</span>{' '}
                  <span className="font-medium">{formatCurrency(parseFloat(formData.amount) || 0)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Interés:</span>{' '}
                  <span className="font-medium">{formData.interestRate || 0}%</span>
                </div>
                <div>
                  <span className="text-gray-500">Total a pagar:</span>{' '}
                  <span className="font-medium text-red-600">
                    {formatCurrency((parseFloat(formData.amount) || 0) * (1 + (parseFloat(formData.interestRate) || 0) / 100))}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Cuota aprox:</span>{' '}
                  <span className="font-medium">
                    {formatCurrency(
                      ((parseFloat(formData.amount) || 0) * (1 + (parseFloat(formData.interestRate) || 0) / 100)) /
                      (formData.numInstallments || 1)
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCreateModal(false)
                resetForm()
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Registrar Préstamo
                </>
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Ver Cuotas */}
      <Modal
        isOpen={!!viewingLoan}
        onClose={() => setViewingLoan(null)}
        title="Cronograma de Cuotas"
        size="lg"
      >
        {viewingLoan && (
          <div className="space-y-4">
            {/* Resumen */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {viewingLoan.type === 'bank' ? (
                    <Building2 className="w-5 h-5 text-blue-600" />
                  ) : (
                    <User className="w-5 h-5 text-purple-600" />
                  )}
                  <span className="font-medium">{viewingLoan.lenderName}</span>
                </div>
                {viewingLoan.issueDate && (
                  <div className="flex items-center gap-1 text-sm text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span>Emisión: {formatDate(new Date(viewingLoan.issueDate))}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Monto Original</p>
                  <p className="font-bold">{formatCurrency(viewingLoan.amount)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total con Interés</p>
                  <p className="font-bold">{formatCurrency(viewingLoan.totalWithInterest || viewingLoan.amount)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Frecuencia</p>
                  <p className="font-medium">
                    {viewingLoan.frequency === 1 ? 'Diario' :
                     viewingLoan.frequency === 7 ? 'Semanal' :
                     viewingLoan.frequency === 15 ? 'Quincenal' :
                     viewingLoan.frequency === 30 ? 'Mensual' :
                     viewingLoan.frequency === 60 ? 'Bimestral' :
                     viewingLoan.frequency === 90 ? 'Trimestral' : 'Mensual'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Pagado</p>
                  <p className="font-medium text-green-600">{formatCurrency(viewingLoan.paidAmount || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Pendiente</p>
                  <p className="font-medium text-red-600">
                    {formatCurrency((viewingLoan.totalWithInterest || viewingLoan.amount) - (viewingLoan.paidAmount || 0))}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Interés</p>
                  <p className="font-medium">{viewingLoan.interestRate || 0}%</p>
                </div>
              </div>
            </div>

            {/* Lista de cuotas */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              <h4 className="font-medium text-gray-900 sticky top-0 bg-white py-2">Detalle de Cuotas</h4>
              {viewingLoan.installments?.map((inst, idx) => {
                const dueDate = new Date(inst.dueDate)
                const isOverdue = inst.status === 'pending' && dueDate < new Date()

                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      inst.status === 'paid'
                        ? 'bg-green-50 border-green-200'
                        : isOverdue
                        ? 'bg-red-50 border-red-200'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        inst.status === 'paid' ? 'bg-green-500' : isOverdue ? 'bg-red-500' : 'bg-gray-300'
                      }`}>
                        {inst.status === 'paid' ? (
                          <CheckCircle className="w-4 h-4 text-white" />
                        ) : (
                          <span className="text-white text-sm font-medium">{inst.number}</span>
                        )}
                      </div>
                      <div>
                        <p className="font-medium">Cuota {inst.number}</p>
                        <p className={`text-sm ${isOverdue ? 'text-red-600' : 'text-gray-500'}`}>
                          Vence: {formatDate(dueDate)}
                          {isOverdue && ' (Vencida)'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold">{formatCurrency(inst.amount)}</span>
                      {inst.status === 'pending' && (
                        <Button
                          size="sm"
                          onClick={() => openPaymentModal(viewingLoan, idx)}
                        >
                          Pagar
                        </Button>
                      )}
                      {inst.status === 'paid' && (
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <Badge variant="success" className="text-xs">Pagado</Badge>
                            {inst.paidAt && (
                              <p className="text-xs text-gray-500 mt-1">
                                {formatDate(new Date(inst.paidAt))}
                              </p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditPaymentModal(viewingLoan, idx)}
                            className="text-blue-600 hover:bg-blue-50"
                            title="Editar fecha de pago"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex justify-end pt-4">
              <Button variant="outline" onClick={() => setViewingLoan(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Confirmar Eliminación */}
      <Modal
        isOpen={!!deletingLoan}
        onClose={() => setDeletingLoan(null)}
        title="Eliminar Préstamo"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
            <div>
              <p className="text-sm text-gray-700">
                ¿Estás seguro de que deseas eliminar el préstamo de{' '}
                <strong>{deletingLoan?.lenderName}</strong>?
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Esta acción no se puede deshacer.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button variant="outline" onClick={() => setDeletingLoan(null)} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                'Eliminar'
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Registrar Pago */}
      <Modal
        isOpen={paymentModal.open}
        onClose={() => setPaymentModal({ open: false, loan: null, installmentIndex: null })}
        title="Registrar Pago de Cuota"
        size="sm"
      >
        {paymentModal.loan && paymentModal.installmentIndex !== null && (
          <div className="space-y-4">
            {/* Info de la cuota */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    Cuota {paymentModal.installmentIndex + 1} de {paymentModal.loan.totalInstallments}
                  </p>
                  <p className="text-sm text-gray-500">
                    Vence: {formatDate(new Date(paymentModal.loan.installments[paymentModal.installmentIndex].dueDate))}
                  </p>
                </div>
                <p className="text-xl font-bold text-primary-600">
                  {formatCurrency(paymentModal.loan.installments[paymentModal.installmentIndex].amount)}
                </p>
              </div>
            </div>

            {/* Selector de fecha */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha de Pago
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Selecciona la fecha en que se realizó el pago
              </p>
            </div>

            {/* Botones */}
            <div className="flex justify-end space-x-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setPaymentModal({ open: false, loan: null, installmentIndex: null })}
                disabled={isPayingInstallment}
              >
                Cancelar
              </Button>
              <Button
                onClick={handlePayInstallment}
                disabled={isPayingInstallment || !paymentDate}
              >
                {isPayingInstallment ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Confirmar Pago
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Editar Fecha de Pago */}
      <Modal
        isOpen={editPaymentModal.open}
        onClose={() => setEditPaymentModal({ open: false, loan: null, installmentIndex: null })}
        title="Editar Fecha de Pago"
        size="sm"
      >
        {editPaymentModal.loan && editPaymentModal.installmentIndex !== null && (
          <div className="space-y-4">
            {/* Info de la cuota */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    Cuota {editPaymentModal.installmentIndex + 1} de {editPaymentModal.loan.totalInstallments}
                  </p>
                  <p className="text-sm text-gray-500">
                    {editPaymentModal.loan.lenderName}
                  </p>
                </div>
                <p className="text-xl font-bold text-green-600">
                  {formatCurrency(editPaymentModal.loan.installments[editPaymentModal.installmentIndex].amount)}
                </p>
              </div>
            </div>

            {/* Selector de fecha */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nueva Fecha de Pago
              </label>
              <input
                type="date"
                value={editPaymentDate}
                onChange={(e) => setEditPaymentDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Modifica la fecha en que se realizó el pago para corregir el flujo de caja
              </p>
            </div>

            {/* Botones */}
            <div className="flex justify-end space-x-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setEditPaymentModal({ open: false, loan: null, installmentIndex: null })}
                disabled={isEditingPayment}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleEditPayment}
                disabled={isEditingPayment || !editPaymentDate}
              >
                {isEditingPayment ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Pencil className="w-4 h-4 mr-2" />
                    Guardar Cambios
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
