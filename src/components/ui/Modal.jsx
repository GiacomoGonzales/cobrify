import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Modal({ isOpen, onClose, title, children, size = 'md', maxWidth, fullscreenOnMobile = false }) {
  if (!isOpen) return null

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
    '7xl': 'max-w-7xl',
  }

  // Si se proporciona maxWidth personalizado, usarlo, sino usar el size
  const maxWidthClass = maxWidth ? sizes[maxWidth] || maxWidth : sizes[size]

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={cn(
        "flex min-h-full items-center justify-center",
        fullscreenOnMobile ? "" : "p-4"
      )}>
        <div
          className={cn(
            'relative bg-white shadow-xl w-full',
            fullscreenOnMobile
              ? 'h-full md:h-auto md:rounded-lg md:max-h-[90vh]'
              : 'rounded-lg',
            fullscreenOnMobile ? `md:${maxWidthClass}` : maxWidthClass,
            'animate-fade-in',
            fullscreenOnMobile && 'flex flex-col'
          )}
          onClick={e => e.stopPropagation()}
        >
          {/* Header - solo si hay título */}
          {title && (
            <div className={cn(
              "flex items-center justify-between p-6 border-b border-gray-200",
              fullscreenOnMobile && "flex-shrink-0"
            )}>
              <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Content */}
          <div className={cn(
            title ? "p-6" : "",
            fullscreenOnMobile && "flex-1 overflow-y-auto"
          )}>{children}</div>
        </div>
      </div>
    </div>
  )
}
