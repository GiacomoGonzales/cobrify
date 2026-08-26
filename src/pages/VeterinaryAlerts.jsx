import { useState, useEffect } from 'react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { getVeterinaryReminders, markServiceCompleted } from '@/services/veterinaryService'
import { getRemindersFromSales, getDescartados, descartarRecordatorio } from '@/services/salesRemindersService'
import { getProducts } from '@/services/firestoreService'
import Card, { CardContent } from '@/components/ui/Card'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import Button from '@/components/ui/Button'
import {
  Bell,
  Syringe,
  Calendar,
  PawPrint,
  Phone,
  CheckCircle2,
  Loader2,
  RefreshCw,
  MessageCircle,
} from 'lucide-react'

export default function VeterinaryAlerts() {
  const { user, getBusinessId, isDemoMode, businessSettings } = useAppContext()
  const toast = useToast()
  const [pendingAlerts, setPendingAlerts] = useState([])
  const [overdueAlerts, setOverdueAlerts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  /**
   * Filtro por período. La carga SIEMPRE trae el mes completo y el filtro se
   * aplica en memoria: cambiar de "hoy" a "este mes" es instantáneo en vez de
   * volver a leer las ventas.
   */
  const [periodo, setPeriodo] = useState('mes')
  const daysAhead = 30
  const [markingCompleted, setMarkingCompleted] = useState(null)
  // Cuántos pacientes lleva revisados: esta pantalla tarda en proporción a
  // cuántos hay, así que la espera se muestra en vez de disimularse.
  const [avance, setAvance] = useState(null)

  // `businessId` en las dependencias, y no solo `user`: en un sub-usuario los
  // permisos llegan DESPUÉS del login, y hasta que llegan `getBusinessId()`
  // devuelve el uid propio en vez del del dueño. Esa lectura no falla — las
  // reglas la permiten sobre un negocio que no existe — así que devolvía cero
  // recordatorios en silencio y la pantalla nunca se volvía a cargar.
  const businessId = getBusinessId()

  useEffect(() => {
    loadAlerts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, isDemoMode])

  const loadAlerts = async () => {
    if (!user?.uid || isDemoMode || !businessId) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setAvance(null)
    const t0 = performance.now()
    try {
      // DOS fuentes, que responden preguntas distintas:
      //  - las VENTAS: qué se llevó cada cliente y hace cuánto (lo normal)
      //  - las vacunas y controles cargados a mano en la ficha del paciente
      const [catalogo, descartados] = await Promise.all([
        getProducts(businessId),
        getDescartados(businessId),
      ])
      const products = catalogo?.success ? (catalogo.data || []) : []

      const [deVentas, deFichas] = await Promise.all([
        getRemindersFromSales({ businessId, products, businessSettings, daysAhead, descartados, onProgress: setAvance }),
        getVeterinaryReminders(businessId, daysAhead).catch(() => ({ pending: [], overdue: [] })),
      ])

      console.log(`Recordatorios: ${Math.round(performance.now() - t0)} ms · ${deVentas.ventasLeidas ?? 0} ventas leídas`)
      const porFecha = (a, b) => a.dueDate - b.dueDate
      setPendingAlerts([...deVentas.pending, ...deFichas.pending].sort(porFecha))
      setOverdueAlerts([...deVentas.overdue, ...deFichas.overdue].sort(porFecha))
    } catch (error) {
      console.error('Error al cargar alertas:', error)
      toast.error('Error al cargar las alertas')
    } finally {
      setIsLoading(false)
    }
  }

  const handleMarkCompleted = async (alert) => {
    if (alert.type !== 'service' && alert.type !== 'sale') return

    setMarkingCompleted(alert.id)
    try {
      const businessId = getBusinessId()
      if (alert.type === 'sale') {
        // El recordatorio de una venta no es un documento que se pueda tachar:
        // se calcula. Lo que se guarda es que ya fue atendido. Cuando el
        // cliente vuelva a comprar lo mismo, el aviso reaparece solo.
        await descartarRecordatorio(businessId, alert.clave)
      } else {
        await markServiceCompleted(businessId, alert.customerId, alert.id)
      }
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

    // El texto cambia según de dónde salga el recordatorio: a quien compró
    // alimento hace un mes no se le dice que "tiene programado" nada.
    const quien = alert.petName || alert.customerName
    let message
    if (alert.type === 'vaccination') {
      message = `Hola! Le recordamos que ${quien} tiene pendiente su vacuna: ${alert.title.replace('Vacuna: ', '')}`
      message += ` para el ${formatDate(alert.dueDate)}. ¿Le gustaría agendar una cita?`
    } else if (alert.type === 'sale') {
      message = `Hola! Le escribimos de parte nuestra: ya pasó un tiempo desde que ${quien} recibió `
      message += `${alert.title}. ¿Le gustaría reservar para estos días?`
    } else {
      message = `Hola! Le recordamos que ${quien} tiene programado: ${alert.title}`
      message += ` para el ${formatDate(alert.dueDate)}. ¿Le gustaría agendar una cita?`
    }

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

  /**
   * Una fila de recordatorio.
   *
   * Fondo neutro siempre. La pantalla llegó a tener cinco colores a la vez —
   * tarjeta roja o amarilla, círculo azul o morado, badge de otro color — y
   * con eso lo urgente dejaba de destacar, porque todo destacaba. El color
   * queda para UNA sola cosa: lo vencido. El resto se lee en el texto.
   */
  const renderAlert = (alert, isOverdue = false) => {
    const daysUntil = getDaysUntil(alert.dueDate)
    const isVaccination = alert.type === 'vaccination'
    const esVenta = alert.type === 'sale'
    const urgente = isOverdue || daysUntil <= 1

    return (
      <div
        key={`${alert.type}-${alert.id}`}
        className="flex items-start justify-between gap-3 py-3 px-1 border-b border-gray-100 last:border-0"
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="p-2 rounded-lg bg-gray-100 flex-shrink-0">
            {isVaccination
              ? <Syringe className="w-4 h-4 text-gray-500" />
              : <Calendar className="w-4 h-4 text-gray-500" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-900">{alert.title}</span>
              <span className="text-xs text-gray-500 border border-gray-200 rounded px-1.5 py-0.5">
                {isVaccination ? 'Vacuna' : esVenta ? 'Comprado' : 'Servicio'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{alert.description}</p>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 flex-wrap">
              {alert.petName && (
                <span className="inline-flex items-center gap-1">
                  <PawPrint className="w-3 h-3" />
                  {alert.petName}
                  {alert.petSpecies && ` (${alert.petSpecies})`}
                </span>
              )}
              <span className="truncate">{alert.customerName}</span>
              {alert.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {alert.phone}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-sm font-medium ${urgente ? 'text-red-600' : 'text-gray-700'}`}>
            {isOverdue
              ? 'Vencido'
              : daysUntil === 0 ? 'Hoy'
                : daysUntil === 1 ? 'Mañana'
                  : `En ${daysUntil} días`}
          </span>
          <span className="text-xs text-gray-400">{formatDate(alert.dueDate)}</span>

          <div className="flex items-center gap-1 mt-1">
            {alert.phone && (
              <button
                onClick={() => handleWhatsApp(alert)}
                className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                title="Enviar WhatsApp"
              >
                <MessageCircle className="w-4 h-4" />
              </button>
            )}
            {(alert.type === 'service' || alert.type === 'sale') && (
              <button
                onClick={() => handleMarkCompleted(alert)}
                disabled={markingCompleted === alert.id}
                className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
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
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">
            {avance && avance.total > 0
              ? `Revisando ${avance.revisados} de ${avance.total} pacientes...`
              : 'Cargando recordatorios...'}
          </p>
        </div>
      </div>
    )
  }

  const totalAlerts = pendingAlerts.length + overdueAlerts.length

  const finDe = (dias) => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + dias)
    d.setHours(23, 59, 59, 999)
    return d
  }

  const limiteDelPeriodo = (id) =>
    id === 'hoy' ? finDe(0) : id === 'semana' ? finDe(7) : finDe(30)

  /**
   * Los recordatorios del período elegido.
   *
   * Se calcula sobre lo que ya está en memoria — la carga trae el mes entero —
   * así que cambiar de filtro es instantáneo en vez de volver a leer las
   * ventas.
   *
   * Lo VENCIDO acompaña a todos los períodos: es lo más urgente, y esconderlo
   * detrás de otro filtro es la forma más segura de que nadie lo llame nunca.
   */
  const cuantosEn = (id) =>
    id === 'vencidos'
      ? overdueAlerts.length
      : overdueAlerts.length + pendingAlerts.filter(a => a.dueDate <= limiteDelPeriodo(id)).length

  const visibles = periodo === 'vencidos'
    ? overdueAlerts
    : [...overdueAlerts, ...pendingAlerts.filter(a => a.dueDate <= limiteDelPeriodo(periodo))]

  const FILTROS = [
    { id: 'hoy', label: 'Hoy' },
    { id: 'semana', label: 'Esta semana' },
    { id: 'mes', label: 'Este mes' },
    { id: 'vencidos', label: 'Vencidos' },
  ]

  const etiquetaTipo = (a) =>
    a.type === 'vaccination' ? 'Vacuna' : a.type === 'sale' ? 'Comprado' : 'Servicio'

  const estadoDe = (a) => {
    if (a.overdue) return { texto: 'Vencido', urgente: true }
    const d = getDaysUntil(a.dueDate)
    if (d === 0) return { texto: 'Hoy', urgente: true }
    if (d === 1) return { texto: 'Mañana', urgente: true }
    return { texto: `En ${d} días`, urgente: false }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Recordatorios</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            A quién llamar: lo que cada cliente se llevó y ya toca repetir
          </p>
        </div>
        <Button variant="outline" onClick={loadAlerts}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Filtros por período. Cada uno lleva su conteo, así que hacen de
          resumen y las tres tarjetas de estadísticas dejaron de hacer falta. */}
      <div className="flex flex-wrap gap-2">
        {FILTROS.map(f => {
          const activo = periodo === f.id
          return (
            <button
              key={f.id}
              onClick={() => setPeriodo(f.id)}
              className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                activo
                  ? 'border-primary-600 bg-primary-50 text-primary-700 font-medium'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              {f.label}
              <span className={`ml-1.5 ${activo ? 'text-primary-500' : 'text-gray-400'}`}>
                {cuantosEn(f.id)}
              </span>
            </button>
          )
        })}
      </div>

      {visibles.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Bell className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No hay recordatorios en este periodo
            </h3>
            {/* Antes decía solo "no hay recordatorios pendientes" y ahí se
                terminaba la ayuda: quien nunca vendió con cliente no tenía cómo
                saber de qué depende esta pantalla, y la leía como rota. */}
            <p className="text-gray-600 max-w-md mx-auto">
              {totalAlerts > 0
                ? 'Prueba con un periodo más amplio.'
                : 'Aquí aparecen las ventas hechas a un cliente con nombre, pasado el plazo que definas en Configuración > Ventas. Las ventas de mostrador, sin cliente, no generan recordatorio.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ESCRITORIO: tabla. Con muchas filas, las columnas alineadas se
              recorren de un vistazo; las tarjetas obligan a leer cada una. */}
          <Card className="hidden lg:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto o servicio</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Última vez</TableHead>
                    <TableHead>Toca el</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibles.map(alert => {
                    const estado = estadoDe(alert)
                    return (
                      <TableRow key={`${alert.type}-${alert.id}`}>
                        <TableCell className="font-medium text-gray-900">{alert.title}</TableCell>
                        <TableCell className="text-gray-500">{etiquetaTipo(alert)}</TableCell>
                        <TableCell className="text-gray-700">{alert.customerName}</TableCell>
                        <TableCell className="text-gray-500">
                          {alert.petName || '-'}
                          {alert.petSpecies ? ` (${alert.petSpecies})` : ''}
                        </TableCell>
                        <TableCell className="text-gray-500">{alert.phone || '-'}</TableCell>
                        <TableCell className="text-gray-500">
                          {alert.fecha ? formatDate(alert.fecha) : '-'}
                        </TableCell>
                        <TableCell className="text-gray-500">{formatDate(alert.dueDate)}</TableCell>
                        <TableCell>
                          <span className={estado.urgente ? 'text-red-600 font-medium' : 'text-gray-700'}>
                            {estado.texto}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {alert.phone && (
                              <button
                                onClick={() => handleWhatsApp(alert)}
                                className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                                title="Enviar WhatsApp"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </button>
                            )}
                            {(alert.type === 'service' || alert.type === 'sale') && (
                              <button
                                onClick={() => handleMarkCompleted(alert)}
                                disabled={markingCompleted === alert.id}
                                className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                                title="Ya lo atendi"
                              >
                                {markingCompleted === alert.id
                                  ? <Loader2 className="w-4 h-4 animate-spin" />
                                  : <CheckCircle2 className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* MÓVIL: tarjetas, que en una pantalla angosta se leen mejor que
              nueve columnas apretadas. */}
          <Card className="lg:hidden">
            <CardContent className="p-4">
              {visibles.map(alert => renderAlert(alert, !!alert.overdue))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
