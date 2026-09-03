import { cn } from '@/lib/utils'

// Bloque plano con borde (sin sombra) y un titulo pequeno. Reemplaza a las
// tarjetas blancas. Con sinRelleno el contenido pega al borde (tablas).
export default function Seccion({ titulo, descripcion, acciones, sinRelleno = false, id, className, children }) {
  return (
    <section id={id} className={cn('min-w-0 bg-white border border-gray-200 rounded-lg', className)}>
      {(titulo || acciones) && (
        <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-200">
          <div className="min-w-0">
            {titulo && <h2 className="text-[13px] font-semibold text-gray-900 truncate">{titulo}</h2>}
            {descripcion && <p className="text-[12px] text-gray-500 mt-0.5">{descripcion}</p>}
          </div>
          {acciones && <div className="flex items-center gap-2 shrink-0">{acciones}</div>}
        </header>
      )}
      <div className={sinRelleno ? '' : 'px-4 py-3'}>{children}</div>
    </section>
  )
}
