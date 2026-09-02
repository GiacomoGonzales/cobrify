import { cn } from '@/lib/utils'

const ALINEAR = { izq: 'text-left', der: 'text-right', centro: 'text-center' }

// Tabla densa del admin: 12.5px, cabecera fija, una linea por celda. Las
// flechas de orden son texto (↑ ↓), no iconos.
export function Tabla({ children, className, fija = false, alto }) {
  return (
    <div className={cn('overflow-auto custom-scrollbar', alto)}>
      <table className={cn('w-full border-collapse text-[12.5px] leading-tight', fija && 'table-fixed', className)}>
        {children}
      </table>
    </div>
  )
}

// campo + onOrdenar hacen la columna ordenable; orden = { campo, direccion }.
export function Th({ children, className, alinear = 'izq', ancho, campo, orden, onOrdenar, title }) {
  const ordenable = Boolean(campo && onOrdenar)
  const activo = ordenable && orden?.campo === campo
  return (
    <th
      scope="col"
      title={title}
      style={ancho ? { width: ancho } : undefined}
      onClick={ordenable ? () => onOrdenar(campo) : undefined}
      className={cn(
        'sticky top-0 z-[1] bg-gray-50 border-b border-gray-200 px-3 py-2 text-[11.5px] font-medium text-gray-500 whitespace-nowrap',
        ALINEAR[alinear],
        ordenable && 'cursor-pointer select-none hover:text-gray-900',
        activo && 'text-gray-900',
        className
      )}
    >
      {children}
      {activo && (
        <span className="ml-1 text-gray-400" aria-hidden="true">
          {orden.direccion === 'asc' ? '↑' : '↓'}
        </span>
      )}
    </th>
  )
}

export function Td({ children, className, alinear = 'izq', apagado = false, numero = false, colSpan, title, onClick }) {
  return (
    <td
      colSpan={colSpan}
      title={title}
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 border-b border-gray-100 align-middle whitespace-nowrap',
        numero ? 'text-right tabular-nums' : ALINEAR[alinear],
        apagado ? 'text-gray-500' : 'text-gray-900',
        className
      )}
    >
      {children}
    </td>
  )
}

export function Fila({ children, className, onClick, seleccionada = false, apagada = false }) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'transition-colors',
        onClick && 'cursor-pointer hover:bg-gray-50',
        seleccionada && 'bg-primary-50 hover:bg-primary-50',
        apagada && 'text-gray-400',
        className
      )}
    >
      {children}
    </tr>
  )
}

export function FilaVacia({ colSpan, children }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-[12.5px] text-gray-500">
        {children}
      </td>
    </tr>
  )
}
