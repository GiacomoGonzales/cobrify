import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle, Info, XCircle } from 'lucide-react'

const variants = {
  default: 'bg-gray-50 text-gray-900 border-gray-200',
  info: 'bg-blue-50 text-blue-900 border-blue-200',
  success: 'bg-green-50 text-green-900 border-green-200',
  warning: 'bg-yellow-50 text-yellow-900 border-yellow-200',
  danger: 'bg-red-50 text-red-900 border-red-200',
}

const icons = {
  default: Info,
  info: Info,
  success: CheckCircle,
  warning: AlertCircle,
  danger: XCircle,
}

export default function Alert({ variant = 'default', title, children, className }) {
  const Icon = icons[variant]

  return (
    <div className={cn('rounded-lg border p-4', variants[variant], className)}>
      <div className="flex items-start space-x-3">
        <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          {title && <h5 className="font-semibold mb-1">{title}</h5>}
          <div className="text-sm">{children}</div>
        </div>
      </div>
    </div>
  )
}
