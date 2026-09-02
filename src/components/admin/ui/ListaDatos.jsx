import { cn } from '@/lib/utils'

// Lista clave-valor para fichas: etiqueta en gris a la izquierda, valor a la derecha.
export function ListaDatos({ children, className, columnas = 1 }) {
  return <dl className={cn('grid gap-x-8', columnas === 2 && 'sm:grid-cols-2', className)}>{children}</dl>
}

// recortar=false deja que el valor ocupe varias lineas (direcciones, selects).
export function Dato({ etiqueta, children, apagado = false, recortar = true, className }) {
  const vacio = children === null || children === undefined || children === ''
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-1.5 border-b border-gray-100 text-[12.5px]', className)}>
      <dt className="text-gray-500 shrink-0">{etiqueta}</dt>
      <dd className={cn('text-right min-w-0', recortar && 'truncate', apagado || vacio ? 'text-gray-400' : 'text-gray-900')}>
        {vacio ? '—' : children}
      </dd>
    </div>
  )
}
