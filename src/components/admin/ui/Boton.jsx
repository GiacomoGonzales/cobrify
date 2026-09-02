import { cn } from '@/lib/utils'

// Botones del admin. Un solo primario (azul) por vista; el resto, secundarios.
const VARIANTES = {
  primario: 'bg-primary-600 text-white border border-primary-600 hover:bg-primary-700',
  secundario: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 hover:text-gray-900',
  peligro: 'bg-white text-red-600 border border-red-200 hover:bg-red-50',
  enlace: 'bg-transparent text-primary-700 border border-transparent hover:underline px-1',
}
const TAMANOS = { sm: 'h-7 px-2.5 text-[12px]', md: 'h-8 px-3 text-[12.5px]' }

export default function Boton({ variante = 'secundario', tamano = 'md', cargando = false, disabled, className, type = 'button', children, ...props }) {
  return (
    <button
      type={type}
      disabled={disabled || cargando}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTES[variante],
        TAMANOS[tamano],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
