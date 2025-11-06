import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

const toastVariants = {
  success: {
    bgColor: 'bg-green-50',
    borderColor: 'border-green-500',
    textColor: 'text-green-800',
    iconColor: 'text-green-500',
    icon: CheckCircle,
  },
  error: {
    bgColor: 'bg-red-50',
    borderColor: 'border-red-500',
    textColor: 'text-red-800',
    iconColor: 'text-red-500',
    icon: XCircle,
  },
  warning: {
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-500',
    textColor: 'text-yellow-800',
    iconColor: 'text-yellow-500',
    icon: AlertCircle,
  },
  info: {
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-500',
    textColor: 'text-blue-800',
    iconColor: 'text-blue-500',
    icon: Info,
  },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [counter, setCounter] = useState(0)

  const addToast = useCallback((message, variant = 'info', duration = 4000) => {
    // Usar Date.now() + contador para garantizar IDs únicos
    const id = `${Date.now()}-${counter}`
    setCounter(prev => prev + 1)

    const newToast = { id, message, variant, duration }

    setToasts(prev => [...prev, newToast])

    // Auto-remove after duration
    setTimeout(() => {
      removeToast(id)
    }, duration)

    return id
  }, [counter])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  const toast = {
    success: (message, duration) => addToast(message, 'success', duration),
    error: (message, duration) => addToast(message, 'error', duration),
    warning: (message, duration) => addToast(message, 'warning', duration),
    info: (message, duration) => addToast(message, 'info', duration),
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}

      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((toastItem) => {
          const variant = toastVariants[toastItem.variant]
          const Icon = variant.icon

          return (
            <div
              key={toastItem.id}
              className={`
                ${variant.bgColor} ${variant.borderColor} ${variant.textColor}
                border-l-4 p-4 rounded-lg shadow-lg
                animate-slide-in-right
                flex items-start gap-3
                min-w-[300px] max-w-sm
              `}
              style={{
                animation: 'slideInRight 0.3s ease-out, fadeOut 0.3s ease-in 3.7s forwards'
              }}
            >
              <Icon className={`w-5 h-5 ${variant.iconColor} flex-shrink-0 mt-0.5`} />
              <p className="flex-1 text-sm font-medium">{toastItem.message}</p>
              <button
                onClick={() => removeToast(toastItem.id)}
                className={`${variant.iconColor} hover:opacity-70 transition-opacity flex-shrink-0`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )
        })}
      </div>

      {/* Add keyframes for animations */}
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes fadeOut {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
          }
        }

        .animate-slide-in-right {
          animation: slideInRight 0.3s ease-out;
        }
      `}</style>
    </ToastContext.Provider>
  )
}
