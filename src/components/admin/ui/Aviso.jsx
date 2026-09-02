import { cn } from '@/lib/utils'

const TONOS = {
  neutro: 'border-gray-200 bg-gray-50 text-gray-700',
  rojo: 'border-red-200 bg-red-50 text-red-700',
}

export default function Aviso({ tono = 'neutro', titulo, className, children }) {
  return (
    <div className={cn('rounded-md border px-3 py-2 text-[12.5px]', TONOS[tono], className)}>
      {titulo && <p className="font-medium">{titulo}</p>}
      {children && <div className={titulo ? 'mt-0.5' : undefined}>{children}</div>}
    </div>
  )
}
