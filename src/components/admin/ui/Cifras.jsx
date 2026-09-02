import { cn } from '@/lib/utils'

// Fila de cifras sin tarjetas ni iconos: etiqueta pequena arriba, numero abajo.
export function Cifras({ children, className }) {
  return <div className={cn('flex flex-wrap gap-x-8 gap-y-3', className)}>{children}</div>
}

export function Cifra({ etiqueta, valor, nota, alerta = false, className }) {
  return (
    <div className={cn('min-w-[6.5rem]', className)}>
      <p className="text-[11.5px] text-gray-500">{etiqueta}</p>
      <p className={cn('text-[18px] font-semibold leading-7 tabular-nums', alerta ? 'text-red-600' : 'text-gray-900')}>{valor}</p>
      {nota && <p className="text-[11.5px] text-gray-500">{nota}</p>}
    </div>
  )
}
