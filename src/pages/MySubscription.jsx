import { useAuth } from '@/contexts/AuthContext';
import { PLANS } from '@/services/subscriptionService';
import {
  CreditCard,
  Calendar,
  DollarSign,
  Package,
  CheckCircle,
  XCircle,
  FileText,
  Users,
  Box,
  Clock
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

export default function MySubscription() {
  const { subscription, user } = useAuth();

  if (!subscription) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-gray-500">No se encontró información de suscripción</p>
        </div>
      </div>
    );
  }

  const planInfo = PLANS[subscription.plan] || {};
  const periodEnd = subscription.currentPeriodEnd?.toDate?.() || subscription.currentPeriodEnd;
  const daysRemaining = periodEnd ? differenceInDays(new Date(periodEnd), new Date()) : 0;
  const isActive = subscription.status === 'active' && !subscription.accessBlocked;
  const isExpiringSoon = daysRemaining <= 7 && daysRemaining > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi Suscripción</h1>
        <p className="text-gray-600">Información sobre tu plan y estado de cuenta</p>
      </div>

      {/* Estado de la cuenta */}
      <div className={`p-6 rounded-lg ${isActive ? 'bg-green-50 border-2 border-green-200' : 'bg-red-50 border-2 border-red-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isActive ? (
              <>
                <CheckCircle className="w-8 h-8 text-green-600" />
                <div>
                  <h3 className="text-lg font-semibold text-green-900">Cuenta Activa</h3>
                  <p className="text-green-700">Tu suscripción está al día</p>
                </div>
              </>
            ) : (
              <>
                <XCircle className="w-8 h-8 text-red-600" />
                <div>
                  <h3 className="text-lg font-semibold text-red-900">Cuenta Suspendida</h3>
                  <p className="text-red-700">{subscription.blockReason || 'Contacta a soporte'}</p>
                </div>
              </>
            )}
          </div>
          {isExpiringSoon && isActive && (
            <div className="bg-yellow-100 text-yellow-800 px-4 py-2 rounded-lg font-medium">
              Vence en {daysRemaining} días
            </div>
          )}
        </div>
      </div>

      {/* Información del plan actual */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Plan */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center gap-3 mb-4">
            <Package className="w-6 h-6 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">Plan Actual</h3>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Nombre del Plan</p>
              <p className="text-xl font-bold text-primary-600 capitalize">
                {planInfo.name || subscription.plan}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Duración</p>
              <p className="text-lg font-semibold text-gray-900">
                {planInfo.months === 1 ? 'Mensual' :
                 planInfo.months === 6 ? 'Semestral' :
                 planInfo.months === 12 ? 'Anual' :
                 `${planInfo.months || 1} meses`}
              </p>
            </div>
            {planInfo.months === 1 && (
              <div>
                <p className="text-sm text-gray-500">Precio Mensual</p>
                <p className="text-2xl font-bold text-gray-900">
                  S/ {subscription.monthlyPrice}
                  <span className="text-sm text-gray-500 font-normal">/mes</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Fechas */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center gap-3 mb-4">
            <Calendar className="w-6 h-6 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Fechas Importantes</h3>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Inicio del Período</p>
              <p className="text-lg font-medium text-gray-900">
                {subscription.currentPeriodStart
                  ? format(subscription.currentPeriodStart.toDate(), "d 'de' MMMM 'de' yyyy", { locale: es })
                  : 'No disponible'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Próximo Vencimiento</p>
              <p className="text-lg font-medium text-gray-900">
                {periodEnd
                  ? format(new Date(periodEnd), "d 'de' MMMM 'de' yyyy", { locale: es })
                  : 'No disponible'}
              </p>
            </div>
            {daysRemaining > 0 && (
              <div className="pt-2 border-t">
                <p className="text-sm text-gray-500">Días restantes</p>
                <p className={`text-2xl font-bold ${isExpiringSoon ? 'text-yellow-600' : 'text-green-600'}`}>
                  {daysRemaining}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Límites y uso del plan */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Características de tu Plan
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Facturas */}
          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-gray-500">Comprobantes/mes</p>
              <p className="text-lg font-semibold text-gray-900">
                {subscription.limits?.maxInvoicesPerMonth === -1
                  ? 'Ilimitado'
                  : subscription.limits?.maxInvoicesPerMonth || 0}
              </p>
              {subscription.usage?.invoicesThisMonth !== undefined && subscription.limits?.maxInvoicesPerMonth !== -1 && (
                <>
                  <p className="text-xs text-gray-600 mt-1">
                    Emitidos: {subscription.usage.invoicesThisMonth} / {subscription.limits.maxInvoicesPerMonth}
                  </p>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className={`h-2 rounded-full ${
                        (subscription.usage.invoicesThisMonth / subscription.limits.maxInvoicesPerMonth) >= 0.9
                          ? 'bg-red-600'
                          : (subscription.usage.invoicesThisMonth / subscription.limits.maxInvoicesPerMonth) >= 0.7
                          ? 'bg-yellow-600'
                          : 'bg-green-600'
                      }`}
                      style={{
                        width: `${Math.min((subscription.usage.invoicesThisMonth / subscription.limits.maxInvoicesPerMonth) * 100, 100)}%`
                      }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Disponibles: {Math.max(0, subscription.limits.maxInvoicesPerMonth - subscription.usage.invoicesThisMonth)}
                  </p>
                </>
              )}
              {subscription.usage?.invoicesThisMonth !== undefined && subscription.limits?.maxInvoicesPerMonth === -1 && (
                <p className="text-xs text-gray-500 mt-1">
                  Emitidos este mes: {subscription.usage.invoicesThisMonth}
                </p>
              )}
            </div>
          </div>

          {/* Clientes */}
          <div className="flex items-start gap-3">
            <Users className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <p className="text-sm text-gray-500">Clientes</p>
              <p className="text-lg font-semibold text-gray-900">
                {subscription.limits?.maxCustomers === -1
                  ? 'Ilimitado'
                  : subscription.limits?.maxCustomers || 0}
              </p>
              {subscription.usage?.totalCustomers !== undefined && (
                <p className="text-xs text-gray-500">
                  Registrados: {subscription.usage.totalCustomers}
                </p>
              )}
            </div>
          </div>

          {/* Productos */}
          <div className="flex items-start gap-3">
            <Box className="w-5 h-5 text-purple-600 mt-0.5" />
            <div>
              <p className="text-sm text-gray-500">Productos</p>
              <p className="text-lg font-semibold text-gray-900">
                {subscription.limits?.maxProducts === -1
                  ? 'Ilimitado'
                  : subscription.limits?.maxProducts || 0}
              </p>
              {subscription.usage?.totalProducts !== undefined && (
                <p className="text-xs text-gray-500">
                  Registrados: {subscription.usage.totalProducts}
                </p>
              )}
            </div>
          </div>

          {/* Integración SUNAT */}
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-orange-600 mt-0.5" />
            <div>
              <p className="text-sm text-gray-500">Integración SUNAT</p>
              <p className="text-lg font-semibold text-gray-900">
                {subscription.limits?.sunatIntegration ? 'Incluido' : 'No incluido'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Historial de pagos */}
      {subscription.paymentHistory && subscription.paymentHistory.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center gap-3 mb-4">
            <DollarSign className="w-6 h-6 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">Historial de Pagos</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">Fecha</th>
                  {planInfo.months === 1 && (
                    <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">Monto</th>
                  )}
                  <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">Método</th>
                  <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">Estado</th>
                </tr>
              </thead>
              <tbody>
                {subscription.paymentHistory
                  .slice()
                  .reverse()
                  .slice(0, 10)
                  .map((payment, idx) => {
                    const paymentDate = payment.date?.toDate?.() || payment.date;
                    return (
                      <tr key={idx} className="border-b last:border-b-0">
                        <td className="py-3 px-4 text-sm text-gray-900">
                          {paymentDate
                            ? format(new Date(paymentDate), "dd/MM/yyyy", { locale: es })
                            : 'N/A'}
                        </td>
                        {planInfo.months === 1 && (
                          <td className="py-3 px-4 text-sm font-medium text-gray-900">
                            S/ {payment.amount}
                          </td>
                        )}
                        <td className="py-3 px-4 text-sm text-gray-700">{payment.method}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            payment.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : payment.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {payment.status === 'completed' ? 'Completado' :
                             payment.status === 'pending' ? 'Pendiente' : 'Fallido'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Información de contacto */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-3 text-lg">
          ¿Necesitas ayuda con tu suscripción?
        </h3>
        <p className="text-blue-800 mb-4">
          Si tienes preguntas sobre tu plan, pagos o necesitas actualizar tu suscripción, contáctanos:
        </p>
        <div className="space-y-2 text-blue-800">
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
    </div>
  );
}
