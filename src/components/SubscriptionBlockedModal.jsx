import { AlertTriangle, MessageCircle, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

const WHATSAPP_NUMBER = '51943744460' // Número de soporte

export default function SubscriptionBlockedModal({ isOpen, subscription, businessName }) {
  const reason = subscription?.blockReason || 'Falta de pago'
  const blockedDate = subscription?.blockedAt?.toDate?.()

  const handleContactWhatsApp = () => {
    const message = encodeURIComponent(
      `Hola, soy ${businessName || 'un usuario'} y mi cuenta ha sido suspendida por: ${reason}.\n\n` +
      `Quisiera regularizar mi pago y reactivar mi suscripción.\n\n` +
      `Email: ${subscription?.email || ''}`
    )

    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`
    window.open(whatsappUrl, '_blank')
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}} // No se puede cerrar
      title=""
      size="md"
    >
      <div className="text-center py-6">
        {/* Icono de alerta */}
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
          <AlertTriangle className="h-8 w-8 text-red-600" />
        </div>

        {/* Título */}
        <h3 className="text-2xl font-bold text-gray-900 mb-2">
          Cuenta Suspendida
        </h3>

        {/* Mensaje */}
        <div className="mb-6 space-y-3">
          <p className="text-gray-600">
            Tu acceso ha sido temporalmente suspendido debido a:
          </p>
          <div className="inline-block px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 font-semibold">
              {reason}
            </p>
          </div>

          {blockedDate && (
            <p className="text-sm text-gray-500">
              Fecha de suspensión: {blockedDate.toLocaleDateString('es-PE', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
              })}
            </p>
          )}
        </div>

        {/* Mensaje de acción */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800">
            Para reactivar tu cuenta, contacta con nosotros vía WhatsApp y regulariza tu pago.
            Nuestro equipo te ayudará a resolver esto rápidamente.
          </p>
        </div>

        {/* Botón de WhatsApp */}
        <Button
          onClick={handleContactWhatsApp}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 text-lg"
        >
          <MessageCircle className="w-5 h-5 mr-2" />
          Contactar por WhatsApp
        </Button>

        {/* Nota adicional */}
        <p className="text-xs text-gray-500 mt-4">
          Una vez realizado el pago, tu cuenta será reactivada inmediatamente
        </p>
      </div>
    </Modal>
  )
}
