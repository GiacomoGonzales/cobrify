import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { Star, X } from 'lucide-react'

const REVIEW_STORAGE_KEY = 'cobrify_review_state'
const SALES_COUNT_KEY = 'cobrify_sales_count'
const SALES_THRESHOLD = 15 // Mostrar después de 15 ventas
const SNOOZE_DAYS = 30 // Si dice "ahora no", esperar 30 días

/**
 * Obtiene el estado guardado del review prompt
 */
const getReviewState = () => {
  try {
    const stored = localStorage.getItem(REVIEW_STORAGE_KEY)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

/**
 * Guarda el estado del review prompt
 */
const saveReviewState = (state) => {
  localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(state))
}

/**
 * Incrementa el contador de ventas y retorna el nuevo valor
 */
export const incrementSalesCount = () => {
  try {
    const current = parseInt(localStorage.getItem(SALES_COUNT_KEY) || '0', 10)
    const next = current + 1
    localStorage.setItem(SALES_COUNT_KEY, String(next))
    return next
  } catch {
    return 0
  }
}

/**
 * Verifica si se debe mostrar el prompt de review
 */
const shouldShowReview = () => {
  if (!Capacitor.isNativePlatform()) return false

  const salesCount = parseInt(localStorage.getItem(SALES_COUNT_KEY) || '0', 10)
  if (salesCount < SALES_THRESHOLD) return false

  const state = getReviewState()
  if (!state) return true // Nunca se ha mostrado

  const now = Date.now()
  const daysSince = (now - state.lastShown) / (1000 * 60 * 60 * 24)

  if (state.completed) return false // Ya calificó, no volver a mostrar
  if (state.snoozed) return daysSince > SNOOZE_DAYS

  return true
}

/**
 * Componente de prompt para calificar la app
 * Se muestra como un modal amigable
 */
export default function ReviewPrompt() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Verificar después de un breve delay para no interrumpir la carga
    const timer = setTimeout(() => {
      if (shouldShowReview()) {
        setVisible(true)
      }
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  const handleRate = async () => {
    try {
      const { InAppReview } = await import('@capacitor-community/in-app-review')
      await InAppReview.requestReview()
    } catch (error) {
      // Fallback: abrir Play Store directamente
      console.error('In-app review error:', error)
      window.open('https://play.google.com/store/apps/details?id=com.factuya.cobrify', '_blank')
    }
    saveReviewState({ lastShown: Date.now(), completed: true, snoozed: false })
    setVisible(false)
  }

  const handleSnooze = () => {
    saveReviewState({ lastShown: Date.now(), completed: false, snoozed: true })
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 relative animate-in fade-in zoom-in duration-300">
        {/* Botón cerrar */}
        <button
          onClick={handleSnooze}
          className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 rounded-full"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Contenido */}
        <div className="text-center">
          {/* Estrellas decorativas */}
          <div className="flex justify-center gap-1 mb-4">
            {[1, 2, 3, 4, 5].map(i => (
              <Star key={i} className="w-8 h-8 text-yellow-400 fill-yellow-400" />
            ))}
          </div>

          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Te gusta Cobrify?
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Tu opinion nos ayuda a mejorar. Si te esta sirviendo la app, regalanos una calificacion en Google Play.
          </p>

          {/* Botones */}
          <div className="space-y-3">
            <button
              onClick={handleRate}
              className="w-full py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
            >
              <Star className="w-5 h-5 fill-white" />
              Calificar ahora
            </button>
            <button
              onClick={handleSnooze}
              className="w-full py-2.5 text-gray-500 font-medium text-sm hover:text-gray-700 transition-colors"
            >
              Ahora no, recordarme despues
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
