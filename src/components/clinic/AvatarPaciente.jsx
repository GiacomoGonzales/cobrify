/**
 * El círculo del paciente: su foto o sus iniciales (ver utils/avatarPaciente).
 * Un solo componente para la ficha y para la lista.
 */
import { fuenteDeAvatar } from '@/utils/avatarPaciente'

const TAMANOS = {
  sm: 'w-9 h-9 text-xs',
  lg: 'w-14 h-14 text-lg',
}

export default function AvatarPaciente({ customer, tamano = 'sm', className = '' }) {
  const fuente = fuenteDeAvatar(customer)
  const base = `${TAMANOS[tamano] || TAMANOS.sm} rounded-full flex-shrink-0 ${className}`
  if (fuente.tipo === 'foto') {
    return (
      <img
        src={fuente.url}
        alt={customer?.name || 'Paciente'}
        className={`${base} object-cover bg-gray-100`}
      />
    )
  }
  return (
    <div className={`${base} bg-primary-100 text-primary-700 flex items-center justify-center font-bold`} aria-label={customer?.name || 'Paciente'}>
      {fuente.texto}
    </div>
  )
}
