import { AlertTriangle, LogOut } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import PagoDeLaSuscripcion from '@/components/PagoDeLaSuscripcion'

export default function SubscriptionBlockedModal({ isOpen, subscription, businessName, onLogout }) {
  const email = subscription?.email || ''

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}}
      title=""
      size="md"
    >
      <div className="py-4 px-2">
        {/* Header */}
        <div className="text-center mb-5">
          <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-red-100 mb-3">
            <AlertTriangle className="h-7 w-7 text-red-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">Tu suscripción ha vencido</h3>
          <p className="text-sm text-gray-600 mt-2">
            Realiza el pago a las siguientes cuentas y envía la captura al WhatsApp para reactivar tu cuenta.
          </p>
        </div>


        {/* Datos de pago y envío de la captura: el mismo bloque que Mi Suscripción. */}
        <PagoDeLaSuscripcion
          subscription={subscription}
          mensaje={`Hola, quiero renovar mi suscripción. Mi email es ${email}. Mi negocio es ${businessName || ''}.`}
        />

        {/* Cerrar sesión: permite salir de la cuenta bloqueada (ej. para cambiar de usuario) */}
        {onLogout && (
          <button
            onClick={onLogout}
            className="w-full mt-3 flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        )}
      </div>
    </Modal>
  )
}
