import { cn } from '@/lib/utils'

// Lista clave-valor para fichas: etiqueta en gris a la izquierda, valor a la derecha.
export function ListaDatos({ children, className, columnas = 1 }) {
  return <dl className={cn('grid gap-x-8', columnas === 2 && 'sm:grid-cols-2', className)}>{children}</dl>
}

/**
 * Una fila etiqueta-valor.
 *
 * `recortar=false` deja que el valor ocupe varias lineas (direcciones, selects).
 * `apilar` pone la etiqueta arriba y el valor abajo: es lo que corresponde
 * cuando el valor es largo de por si —una razon social, una direccion— porque
 * en una sola linea no entra y recortarlo esconde justo lo que se vino a leer.
 *
 * El `min-w-0` de la fila NO es decorativo. Sin el, la fila es un elemento de
 * rejilla con `min-width: auto`, se niega a encogerse y el valor se sale de la
 * tarjeta: con una razon social larga se salia 177 px y se metia debajo de la
 * tarjeta de al lado.
 */
export function Dato({ etiqueta, children, apagado = false, recortar = true, apilar = false, className }) {
  const vacio = children === null || children === undefined || children === ''
  const color = apagado || vacio ? 'text-gray-400' : 'text-gray-900'

  if (apilar) {
    return (
      <div className={cn('min-w-0 py-1.5 border-b border-gray-100 text-[12.5px]', className)}>
        <dt className="text-gray-500">{etiqueta}</dt>
        <dd className={cn('mt-0.5 break-words', color)}>{vacio ? '—' : children}</dd>
      </div>
    )
  }

  return (
    <div className={cn('flex min-w-0 items-baseline justify-between gap-4 py-1.5 border-b border-gray-100 text-[12.5px]', className)}>
      <dt className="text-gray-500 shrink-0">{etiqueta}</dt>
      <dd className={cn('text-right min-w-0', recortar && 'truncate', color)}>
        {vacio ? '—' : children}
      </dd>
    </div>
  )
}
