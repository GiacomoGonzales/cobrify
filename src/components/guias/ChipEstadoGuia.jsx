import { FileText, Ban, CheckCircle, XCircle, Clock } from 'lucide-react'
import { estadoDeGuia } from '@/utils/filtroGuias'

/**
 * Chip de estado de una guía de remisión (Remitente y Transportista).
 * El estado sale de `estadoDeGuia`, el mismo criterio que usa el filtro de la
 * lista: lo que el chip dice es lo que el desplegable de estado encuentra.
 */
const CHIPS = {
  draft: { clase: 'chip-info', Icono: FileText, texto: 'Borrador' },
  voided: { clase: 'chip-neutro', Icono: Ban, texto: 'Anulada' },
  accepted: { clase: 'chip-ok', Icono: CheckCircle, texto: 'Aceptada' },
  rejected: { clase: 'chip-error', Icono: XCircle, texto: 'Rechazada' },
  pending: { clase: 'chip-aviso', Icono: Clock, texto: 'Pendiente' },
}

export default function ChipEstadoGuia({ guide }) {
  const { clase, Icono, texto } = CHIPS[estadoDeGuia(guide)]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${clase}`}>
      <Icono className="w-3 h-3" />
      {texto}
    </span>
  )
}
