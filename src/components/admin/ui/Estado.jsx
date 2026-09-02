import { cn } from '@/lib/utils'

// Un estado es una palabra, no una pastilla de color. Solo lo que necesita
// accion se pinta de rojo; lo provisional (trial, pendiente) va en gris.
const ROJOS = new Set(['expired', 'suspended', 'rejected', 'error', 'failed', 'cancelled', 'canceled', 'blocked', 'inactive', 'vencido', 'suspendido', 'rechazado', 'fallido', 'bloqueado'])
const TENUES = new Set(['trial', 'pending', 'draft', 'archived', 'voided', 'pendiente', 'borrador', 'archivado', 'anulado'])

const TONOS = { rojo: 'text-red-600 font-medium', tenue: 'text-gray-500', normal: 'text-gray-900' }

export default function Estado({ valor, etiqueta, tono, className }) {
  const v = String(valor ?? '').toLowerCase()
  const t = tono || (ROJOS.has(v) ? 'rojo' : TENUES.has(v) ? 'tenue' : 'normal')
  return <span className={cn(TONOS[t], className)}>{etiqueta ?? valor ?? '—'}</span>
}
