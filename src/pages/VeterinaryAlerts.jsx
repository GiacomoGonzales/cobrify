import { useState, useEffect } from 'react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { getPendingAlerts, getOverdueAlerts, markServiceCompleted } from '@/services/veterinaryService'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import {
  Bell,
  Syringe,
  Calendar,
  PawPrint,
  Phone,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
  RefreshCw,
  MessageCircle,
} from 'lucide-react'

export default function VeterinaryAlerts() {
  const { user, getBusinessId, isDemoMode } = useAppContext()
  const toast = useToast()
  const [pendingAlerts, setPendingAlerts] = useState([])
  const [overdueAlerts, setOverdueAlerts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [daysAhead, setDaysAhead] = useState(7)
  const [markingCompleted, setMarkingCompleted] = useState(null)

  useEffect(() => {
    loadAlerts()
  }, [user, daysAhead])

  const loadAlerts = async () => {
    if (!user?.uid || isDemoMode) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const businessId = getBusinessId()
      const [pending, overdue] = await Promise.all([
        getPendingAlerts(businessId, daysAhead),
        getOverdueAlerts(businessId),
      ])
      setPendingAlerts(pending)
      setOverdueAlerts(overdue)
    } catch (error) {
      console.error('Error al cargar alertas:', error)
      toast.error('Error al cargar las alertas')
    } finally {
      setIsLoading(false)
    }
  }

  const handleMarkCompleted = async (alert) => {
    if (alert.type !== 'service') return

    setMarkingCompleted(alert.id)
    try {
      const businessId = getBusinessId()
      await markServiceCompleted(businessId, alert.customerId, alert.id)
      toast.success('Servicio marcado como completado')
      loadAlerts()
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al marcar el servicio')
    } finally {
      setMarkingCompleted(null)
    }
  }

  const handleWhatsApp = (alert) => {
    if (!alert.phone) {
      toast.error('Este cliente no tiene teléfono registrado')
      return
    }

    const phone = alert.phone.replace(/\D/g, '')
    const formattedPhone = phone.startsWith('51') ? phone : `51${phone}`

    let message = `Hola! Le recordamos que `
    if (alert.type === 'vaccination') {
      message += `${alert.petName} tiene pendiente su vacuna: ${alert.title.replace('Vacuna: ', '')}`
    } else {
      message += `${alert.petName} tiene programado: ${alert.title}`
    }
    message += ` para el ${formatDate(alert.dueDate)}. ¿Le gustaría agendar una cita?`

    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`
    window.open(url, '_blank')
  }

  const formatDate = (date) => {
    if (!date) return '-'
    const d = date instanceof Date ? date : new Date(date)
    return d.toLocaleDateString('es-PE', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  }

  const getDaysUntil = (date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const target = new Date(date)
    target.setHours(0, 0, 0, 0)
    const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24))
    return diff
  }

  const renderAlert = (alert, isOverdue = false) => {
    const daysUntil = getDaysUntil(alert.dueDate)
    const isVaccination = alert.type === 'vaccination'

    return (
      <div
        key={`${alert.type}-${alert.id}`}
        className={`p-4 rounded-lg border ${
          isOverdue
            ? 'bg-red-50 border-red-200'
            : daysUntil <= 1
              ? 'bg-yellow-50 border-yellow-200'
              : 'bg-white border-gray-200'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={`p-2 rounded-full flex-shrink-0 ${
              isVaccination ? 'bg-blue-100' : 'bg-purple-100'
            }`}>
              {isVaccination ? (
                <Syringe className={`w-4 h-4 ${isVaccination ? 'text-blue-600' : 'text-purple-600'}`} />
              ) : (
                <Calendar className="w-4 h-4 text-purple-600" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-gray-900">{alert.title}</span>
                <Badge variant={isVaccination ? 'primary' : 'secondary'} size="sm">
                  {isVaccination ? 'Vacuna' : 'Servicio'}
                </Badge>
              </div>
              <p className="text-sm text-gray-600 mt-0.5">{alert.description}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <PawPrint className="w-3 h-3" />
                  {alert.petName}
                  {alert.petSpecies && ` (${alert.petSpecies})`}
                </span>
                <span>{alert.customerName}</span>
                {alert.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {alert.phone}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <div className={`text-sm font-medium ${
              isOverdue
                ? 'text-red-600'
                : daysUntil <= 1
                  ? 'text-yellow-600'
                  : 'text-gray-700'
            }`}>
              {isOverdue ? (
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  Vencido
                </span>
              ) : daysUntil === 0 ? (
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Hoy
                </span>
              ) : daysUntil === 1 ? (
                'Mañana'
              ) : (
                `En ${daysUntil} días`
              )}
            </div>
            <span className="text-xs text-gray-500">{formatDate(alert.dueDate)}</span>

            <div className="flex items-center gap-1 mt-1">
              {alert.phone && (
                <button
                  onClick={() => handleWhatsApp(alert)}
                  className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                  title="Enviar WhatsApp"
                >
                  <MessageCircle className="w-4 h-4" />
                </button>
              )}
              {alert.type === 'service' && (
                <button
                  onClick={() => handleMarkCompleted(alert)}
                  disabled={markingCompleted === alert.id}
                  className="p-1.5 text-primary-600 hover:bg-primary-50 rounded transition-colors disabled:opacity-50"
                  title="Marcar como completado"
                >
                  {markingCompleted === alert.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando alertas...</p>
        </div>
      </div>
    )
  }

  const totalAlerts = pendingAlerts.length + overdueAlerts.length

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Recordatorios</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Vacunas y servicios pendientes de tus pacientes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={daysAhead}
            onChange={(e) => setDaysAhead(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value={7}>Próximos 7 días</option>
            <option value={14}>Próximos 14 días</option>
            <option value={30}>Próximos 30 días</option>
          </select>
          <Button variant="outline" onClick={loadAlerts}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Vencidos</p>
                <p className="text-2xl font-bold text-red-600">{overdueAlerts.length}</p>
              </div>
              <div className="p-3 bg-red-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Próximos</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingAlerts.length}</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-lg">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total</p>
                <p className="text-2xl font-bold text-gray-900">{totalAlerts}</p>
              </div>
              <div className="p-3 bg-primary-100 rounded-lg">
                <Bell className="w-5 h-5 text-primary-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Empty State */}
      {totalAlerts === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No hay recordatorios pendientes
            </h3>
            <p className="text-gray-600">
              Los recordatorios de vacunas y servicios aparecerán aquí cuando estén próximos a vencer.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Overdue Alerts */}
      {overdueAlerts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Vencidos ({overdueAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {overdueAlerts.map((alert) => renderAlert(alert, true))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Alerts */}
      {pendingAlerts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-600" />
              Próximos {daysAhead} días ({pendingAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {pendingAlerts.map((alert) => renderAlert(alert))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
