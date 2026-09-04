import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * El interruptor de claro/oscuro. Lo usan el panel y la bandeja del chat.
 *
 * El icono muestra a DÓNDE va, no dónde está: en modo claro se ve una luna
 * porque tocarla lleva al oscuro. Es la convención de casi todo el software y
 * al revés confunde.
 */
export default function BotonTema({ tema, onCambiar, className }) {
  const aOscuro = tema === 'claro'
  return (
    <button
      type="button"
      onClick={onCambiar}
      className={cn('p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900', className)}
      title={aOscuro ? 'Modo oscuro' : 'Modo claro'}
      aria-label={aOscuro ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
    >
      {aOscuro ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </button>
  )
}
