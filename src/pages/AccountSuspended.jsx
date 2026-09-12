import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle } from 'lucide-react';
import PagoDeLaSuscripcion from '@/components/PagoDeLaSuscripcion';

export default function AccountSuspended() {
  const { user, subscription, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-red-500 to-orange-500 p-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full mb-4">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Tu suscripción ha vencido</h1>
            <p className="text-red-100 text-base">
              Realiza el pago a las siguientes cuentas y envía la captura al WhatsApp para reactivar tu cuenta.
            </p>
          </div>

          <div className="p-6 sm:p-8">
            {/* Datos de pago y envío de la captura: el mismo bloque que Mi
                Suscripción y el aviso de suscripción vencida. */}
            <PagoDeLaSuscripcion
              subscription={subscription}
              mensaje={`Hola, quiero renovar mi suscripción. Mi email es ${user?.email || ''}. Mi negocio es ${subscription?.businessName || ''}.`}
            />
            <button
              onClick={logout}
              className="w-full mt-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 px-6 rounded-lg transition-colors"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
