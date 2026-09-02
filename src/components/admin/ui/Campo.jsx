import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

// Campos de formulario del admin: etiqueta pequena arriba, control de 32px.
// Campo es un <label> salvo que dentro vaya un boton (como="div").
export function Campo({ etiqueta, ayuda, error, como = 'label', className, children }) {
  const Etiqueta = como
  return (
    <Etiqueta className={cn('block', className)}>
      {etiqueta && <span className="block mb-1 text-[12px] font-medium text-gray-700">{etiqueta}</span>}
      {children}
      {error ? (
        <span className="block mt-1 text-[11.5px] text-red-600">{error}</span>
      ) : ayuda ? (
        <span className="block mt-1 text-[11.5px] text-gray-500">{ayuda}</span>
      ) : null}
    </Etiqueta>
  )
}

const BASE =
  'h-8 w-full rounded-md border border-gray-300 bg-white px-2.5 text-[12.5px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 disabled:bg-gray-50 disabled:text-gray-500'

export const Entrada = forwardRef(function Entrada({ className, ...props }, ref) {
  return <input ref={ref} className={cn(BASE, className)} {...props} />
})

export const Selector = forwardRef(function Selector({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(BASE, 'pr-7', className)} {...props}>
      {children}
    </select>
  )
})

export const AreaTexto = forwardRef(function AreaTexto({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(BASE, 'h-auto py-1.5 leading-snug', className)} {...props} />
})

export function Casilla({ etiqueta, ayuda, className, ...props }) {
  return (
    <label className={cn('flex items-start gap-2 cursor-pointer', className)}>
      <input
        type="checkbox"
        className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500/40"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-[12.5px] text-gray-900">{etiqueta}</span>
        {ayuda && <span className="block text-[11.5px] text-gray-500">{ayuda}</span>}
      </span>
    </label>
  )
}

// Opcion de un grupo de radios, con marco; la elegida lleva borde oscuro.
export function Opcion({ etiqueta, ayuda, className, checked, ...props }) {
  return (
    <label
      className={cn(
        'flex items-start gap-2 cursor-pointer rounded-md border px-3 py-2',
        checked ? 'border-gray-900' : 'border-gray-200 hover:border-gray-300',
        className
      )}
    >
      <input
        type="radio"
        checked={checked}
        className="mt-0.5 h-3.5 w-3.5 border-gray-300 text-primary-600 focus:ring-primary-500/40"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-[12.5px] text-gray-900">{etiqueta}</span>
        {ayuda && <span className="block text-[11.5px] text-gray-500 leading-snug">{ayuda}</span>}
      </span>
    </label>
  )
}
