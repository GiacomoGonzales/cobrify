import { cn } from '@/lib/utils'

// Para los pocos casos en que una palabra necesita marco (p. ej. "sugerido").
const TONOS = {
  neutro: 'bg-gray-100 text-gray-700 border border-gray-200',
  rojo: 'bg-red-50 text-red-700 border border-red-100',
  azul: 'bg-primary-50 text-primary-700 border border-primary-100',
  punteado: 'text-gray-500 border border-dashed border-gray-300',
}

export default function Pastilla({ tono = 'neutro', className, children, ...props }) {
  return (
    <span
      className={cn('inline-flex items-center rounded px-1.5 py-px text-[11.5px] font-medium leading-4 whitespace-nowrap', TONOS[tono], className)}
      {...props}
    >
      {children}
    </span>
  )
}
