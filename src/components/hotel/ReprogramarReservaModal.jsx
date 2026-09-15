import { useEffect, useState } from 'react'
import { CalendarClock, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { limitePorDefecto, fechaCorta, MESES_PARA_REPROGRAMAR } from '@/utils/reprogramacionHotel'

/**
 * Reprogramar una reserva con fecha abierta (utils/reprogramacionHotel): la
 * cabaña se libera, lo facturado se guarda y queda una fecha límite para que
 * el huésped elija sus nuevas fechas. El límite sugerido son seis meses desde
 * la entrada original; el hotel lo puede cambiar.
 */
export default function ReprogramarReservaModal({ isOpen, reservation, onClose, onConfirmar, procesando = false }) {
  const checkIn = reservation?.checkInDate || reservation?.checkIn || ''
  const checkOut = reservation?.checkOutDate || reservation?.checkOut || ''
  const [limite, setLimite] = useState('')

  useEffect(() => {
    if (isOpen) setLimite(limitePorDefecto(checkIn))
  }, [isOpen, checkIn])

  if (!reservation) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reprogramar con fecha abierta" size="md">
      <div className="space-y-4">
        <div className="text-sm space-y-1">
          <p className="text-gray-900">
            <span className="font-medium">{reservation.guestName}</span>
            {(reservation.roomName || reservation.roomNumber) && ` · ${reservation.roomName || reservation.roomNumber}`}
          </p>
          <p className="text-gray-500">Fechas originales: {fechaCorta(checkIn)} al {fechaCorta(checkOut)}</p>
        </div>

        <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
          <li>La cabaña queda libre para otras reservas.</li>
          <li>Lo ya facturado se guarda y pasa a las nuevas noches cuando asignes las fechas.</li>
          <li>La reserva queda en la pestaña Reprogramadas hasta que el huésped elija.</li>
        </ul>

        <div>
          <label htmlFor="limite-reprogramacion" className="block text-sm font-medium text-gray-700 mb-1">
            Fecha límite para usar la reserva
          </label>
          <input
            id="limite-reprogramacion"
            type="date"
            value={limite}
            min={checkIn || undefined}
            onChange={(e) => setLimite(e.target.value)}
            className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            Sugerida: {MESES_PARA_REPROGRAMAR} meses desde la entrada original.
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={procesando} className="w-full sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={() => onConfirmar(limite)} disabled={procesando || !limite} className="w-full sm:w-auto">
            {procesando
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><CalendarClock className="w-4 h-4 mr-1" /> Reprogramar</>}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
