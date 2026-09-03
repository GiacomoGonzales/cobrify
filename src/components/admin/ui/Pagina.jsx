import { cn } from '@/lib/utils'

// Contenedor de toda pagina del admin. Arriba va una linea de resumen en gris
// ("717 cuentas · 402 activas") y, a la derecha, las acciones de la pagina.
// No hay tarjetas de cifras ni titulo: el titulo lo pone la cabecera. Es un
// flex con gap (no space-y) para que los modales fijos hijos no hereden margen.
export default function Pagina({ resumen, acciones, className, children }) {
  return (
    <div className={cn('flex flex-col gap-4 min-w-0', className)}>
      {(resumen || acciones) && (
        <div className="flex flex-wrap items-center justify-between gap-3 min-h-8">
          <div className="text-[12.5px] text-gray-500 tabular-nums">{resumen}</div>
          {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
