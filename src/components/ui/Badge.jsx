import { cn } from '@/lib/utils'

// Los tonos viven en src/index.css (.chip-*). Acá solo se elige cuál le toca a
// cada variante, para que una etiqueta puesta a mano en cualquier página y una
// puesta con <Badge> se vean iguales.
const variants = {
  default: 'chip-neutro',
  primary: 'bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-200',
  success: 'chip-ok',
  danger: 'chip-error',
  warning: 'chip-aviso',
  info: 'chip-info',
}

export default function Badge({ children, variant = 'default', className, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
