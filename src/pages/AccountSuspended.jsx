import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle, Mail, Calendar, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function AccountSuspended() {
  const { user, subscription, logout } = useAuth();

  const getPeriodEndDate = () => {
    if (!subscription?.currentPeriodEnd) return 'No disponible';

    const date = subscription.currentPeriodEnd?.toDate?.() || subscription.currentPeriodEnd;
    return format(new Date(date), "d 'de' MMMM 'de' yyyy", { locale: es });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header con icono de alerta */}
          <div className="bg-gradient-to-r from-red-500 to-orange-500 p-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full mb-4">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Cuenta Suspendida
            </h1>
            <p className="text-red-100 text-lg">
              Tu acceso a Cobrify ha sido suspendido temporalmente
            </p>
          </div>

          {/* Contenido */}
          <div className="p-8">
            {/* Razón de suspensión */}
            {subscription?.blockReason && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-semibold text-red-800 mb-1">
                  Motivo de suspensión:
                </p>
                <p className="text-red-700">
                  {subscription.blockReason}
                </p>
              </div>
            )}

            {/* Información de la cuenta */}
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-gray-500">Email registrado</p>
                  <p className="font-medium text-gray-900">{user?.email}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <DollarSign className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-gray-500">Plan</p>
                  <p className="font-medium text-gray-900 capitalize">
                    {subscription?.plan || 'No definido'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-gray-500">Último período activo hasta</p>
                  <p className="font-medium text-gray-900">
                    {getPeriodEndDate()}
                  </p>
                </div>
              </div>
            </div>

            {/* Instrucciones */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
              <h3 className="font-semibold text-blue-900 mb-3 text-lg">
                ¿Cómo reactivar tu cuenta?
              </h3>
              <ol className="space-y-2 text-blue-800">
                <li className="flex gap-2">
                  <span className="font-bold">1.</span>
                  <span>Contacta con nuestro equipo de soporte</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold">2.</span>
                  <span>Realiza el pago de tu mensualidad pendiente</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold">3.</span>
                  <span>Tu cuenta será reactivada inmediatamente después de confirmar el pago</span>
                </li>
              </ol>
            </div>

            {/* Información de contacto */}
            <div className="border-t pt-6">
              <h3 className="font-semibold text-gray-900 mb-3">
                Información de Contacto
              </h3>
              <div className="space-y-2 text-gray-700">
                <p>
                  <span className="font-medium">WhatsApp:</span>{' '}
                  <a
                    href="https://wa.me/51900434988"
                    className="text-blue-600 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    +51 900 434 988
                  </a>
                </p>
                <p>
                  <span className="font-medium">Email:</span>{' '}
                  <a
                    href="mailto:soporte@cobrifyperu.com"
                    className="text-blue-600 hover:underline"
                  >
                    soporte@cobrifyperu.com
                  </a>
                </p>
              </div>
            </div>

            {/* Botones de acción */}
            <div className="flex flex-col sm:flex-row gap-3 mt-8">
              <a
                href="https://wa.me/51900434988?text=Hola,%20necesito%20reactivar%20mi%20cuenta%20de%20Cobrify"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors text-center"
              >
                Contactar por WhatsApp
              </a>
              <button
                onClick={logout}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 px-6 rounded-lg transition-colors"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-500 text-sm mt-6">
          Si crees que esto es un error, por favor contáctanos inmediatamente
        </p>
      </div>
    </div>
  );
}
