/**
 * La firma del paciente antes de descontar una sesión de su paquete.
 *
 * Lo abren los dos lugares desde donde se usa una sesión: la pestaña Paquetes
 * de la ficha y "Usar sesión del paquete" de la Agenda. Los dos piden lo
 * mismo y guardan lo mismo, por eso es un solo modal (ver utils/firmaDeSesion).
 */
import { useEffect, useState } from 'react'
import { Loader2, Check } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import FirmaCanvas from './FirmaCanvas'
import { firmaValida } from '@/utils/consentimiento'
import { tituloDeFirma, reducirFirma } from '@/utils/firmaDeSesion'

export default function FirmaDeSesionModal({ isOpen, paquete, onClose, onConfirmar, ocupado = false }) {
  const [firma, setFirma] = useState(null)

  // Cada apertura arranca con el lienzo vacío: la firma es de ESTA sesión.
  useEffect(() => { if (isOpen) setFirma(null) }, [isOpen, paquete?.id])

  const confirmar = async () => {
    if (!firmaValida(firma)) return
    onConfirmar(await reducirFirma(firma))
  }

  return (
    <Modal isOpen={isOpen} onClose={() => !ocupado && onClose()} title={tituloDeFirma(paquete)} size="md">
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          <strong>{paquete?.productName}</strong>. La firma deja constancia de que el paciente se atendió esta sesión.
        </p>
        <FirmaCanvas onChange={setFirma} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={ocupado}>Cancelar</Button>
          <Button onClick={confirmar} disabled={ocupado || !firmaValida(firma)} className="gap-1">
            {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Registrar sesión
          </Button>
        </div>
      </div>
    </Modal>
  )
}
