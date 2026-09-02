import { forwardRef } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Filtros({ children, className }) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>
}

// Select compacto. Con un valor distinto de "todos" se marca con borde oscuro,
// para ver de un vistazo que filtros estan puestos.
export const FiltroSelect = forwardRef(function FiltroSelect(
  { className, activo, value, valorTodos = 'all', children, ...props },
  ref
) {
  const puesto = activo ?? (value !== undefined && value !== valorTodos && value !== '')
  return (
    <select
      ref={ref}
      value={value}
      className={cn(
        'h-8 rounded-md border bg-white pl-2.5 pr-7 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500',
        puesto ? 'border-gray-500 text-gray-900' : 'border-gray-300 text-gray-600',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
})

export const Buscador = forwardRef(function Buscador({ className, ancho = 'w-72', ...props }, ref) {
  return (
    <div className={cn('relative', ancho, className)}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
      <input
        ref={ref}
        type="search"
        className="h-8 w-full rounded-md border border-gray-300 bg-white pl-8 pr-2.5 text-[12.5px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500"
        {...props}
      />
    </div>
  )
})
