import { useEffect } from 'react'
import { X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

export default function Modal({ isOpen, onClose, title, children, size = 'md', maxWidth, fullScreenMobile = false }) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

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

  // Usar Portal para renderizar el modal fuera del árbol DOM normal
  // Esto soluciona el problema de z-index en iOS Safari
  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-y-auto" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 bg-black bg-opacity-50 transition-opacity",
          fullScreenMobile && "lg:block hidden"
        )}
        onClick={onClose}
      />

      {/* Modal */}
      <div className={cn(
        "flex min-h-full items-center justify-center relative",
        fullScreenMobile ? "p-0 lg:p-4" : "p-4"
      )}>
        <div
          className={cn(
            'relative bg-white shadow-xl w-full',
            fullScreenMobile ? 'h-full lg:h-auto lg:rounded-lg' : 'rounded-lg',
            fullScreenMobile ? 'lg:max-w-4xl' : maxWidthClass,
            'animate-fade-in'
          )}
          onClick={e => e.stopPropagation()}
        >
          {/* Header - solo si hay título */}
          {title && (
            <div className={cn(
              "flex items-center justify-between p-6 border-b border-gray-200 bg-white z-10",
              fullScreenMobile && "sticky top-0"
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
          <div className={title ? "p-6" : ""}>{children}</div>
        </div>
      </div>
    </div>,
    document.body
  )
}
