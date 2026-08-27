import { useState, useMemo } from 'react'
import { Loader2, Calendar, Receipt, AlertTriangle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { createCommissionPayout } from '@/services/commissionPayoutService'
import { EXPENSE_PAYMENT_METHODS } from '@/services/expenseService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'

/**
 * Liquidar la comisión de un vendedor.
 *
 * Muestra QUÉ se está liquidando antes de cerrarlo: cuántas ventas, de qué
 * fechas y cuánto suma. Cerrar un período es una decisión con plata de por
 * medio, y el dueño tiene que poder revisarla.
 *
 * Solo entran ventas COBRADAS y no liquidadas antes. El filtrado lo hace la
 * página; acá se confirma y se congela.
 */
export default function CommissionPayoutModal({ isOpen, onClose, seller, pendientes = [], onSuccess }) {
  const { getBusinessId, user, isDemoMode } = useAppContext()
  const toast = useToast()

  const [isLoading, setIsLoading] = useState(false)
  const [hasta, setHasta] = useState(() => new Date().toISOString().split('T')[0])
  const [paymentMethod, setPaymentMethod] = useState('efectivo')
  const [notes, setNotes] = useState('')

  // Lo que entra en la liquidación: todo lo pendiente hasta la fecha de corte.
  // El corte existe para poder cerrar "hasta el 31" el día 3, que es como se
  // liquida de verdad.
  const incluidas = useMemo(() => {
    const corte = new Date(`${hasta}T23:59:59`)
    return pendientes.filter(v => v.fecha <= corte)
  }, [pendientes, hasta])

  const total = useMemo(
    () => Math.round(incluidas.reduce((s, v) => s + v.amount, 0) * 100) / 100,
    [incluidas]
  )
  const base = useMemo(
    () => Math.round(incluidas.reduce((s, v) => s + (v.base || 0), 0) * 100) / 100,
    [incluidas]
  )
  const hayEstimadas = useMemo(() => incluidas.some(v => v.estimated), [incluidas])

  const rango = useMemo(() => {
    if (incluidas.length === 0) return null
    const fechas = incluidas.map(v => v.fecha).sort((a, b) => a - b)
    return { desde: fechas[0], hasta: fechas[fechas.length - 1] }
  }, [incluidas])

  const guardar = async () => {
    if (isDemoMode) { toast.info('No disponible en modo demo'); return }
    if (incluidas.length === 0) { toast.error('No hay ventas para liquidar'); return }

    setIsLoading(true)
    try {
      const res = await createCommissionPayout(getBusinessId(), {
        sellerId: seller.id,
        sellerName: seller.name || '',
        desde: rango.desde,
        hasta: rango.hasta,
        invoiceIds: incluidas.map(v => v.id),
        amount: total,
        baseTotal: base,
        notes,
        createdBy: user?.uid || null,
        createdByName: user?.displayName || user?.email || '',
      })
      if (!res.success) { toast.error(res.error); return }
      toast.success(`Liquidación creada: S/ ${total.toFixed(2)}`)
      onSuccess?.({ ...res, paymentMethod })
      onClose()
    } finally {
      setIsLoading(false)
    }
  }

  if (!seller) return null

  const fmt = (d) => d?.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) || '-'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Liquidar comisión — ${seller.name}`}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            Liquidar hasta
          </label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Entran todas las ventas cobradas y aún no liquidadas hasta esa fecha.
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 flex items-center gap-1.5">
              <Receipt className="w-4 h-4" />
              Ventas incluidas
            </span>
            <span className="font-semibold text-gray-900">{incluidas.length}</span>
          </div>
          {rango && (
            <div className="flex items-center justify-between text-sm mt-1.5">
              <span className="text-gray-600">Período</span>
              <span className="text-gray-900">{fmt(rango.desde)} — {fmt(rango.hasta)}</span>
            </div>
          )}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
            <span className="text-sm font-medium text-gray-700">Total a pagar</span>
            <span className="text-xl font-bold text-gray-900">S/ {total.toFixed(2)}</span>
          </div>
        </div>

        {hayEstimadas && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Algunas ventas son anteriores a que existiera la comisión y su importe se
              calculó con la configuración actual del vendedor. Revísalas antes de pagar:
              al liquidar, ese importe queda congelado.
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Se pagará con</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {EXPENSE_PAYMENT_METHODS.map(m => (
              <option key={m.id || m} value={m.id || m}>{m.name || m.label || m}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Al marcarla como pagada se registra el gasto en <strong>Gastos de Ventas</strong>.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nota (opcional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej: comisión de agosto"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading} className="flex-1">
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={guardar}
            disabled={isLoading || incluidas.length === 0}
            className="flex-1 flex items-center justify-center gap-2"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Liquidar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
