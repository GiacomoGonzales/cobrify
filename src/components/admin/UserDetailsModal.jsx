import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  FileText,
  Users,
  Package,
  DollarSign,
  Calendar,
  TrendingUp,
  Activity,
  BarChart3
} from 'lucide-react';
import { getUserStats } from '@/services/userStatsService';
import { PLANS } from '@/services/subscriptionService';

export default function UserDetailsModal({ user, type, onClose, onRegisterPayment, onChangePlan, loading }) {
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [selectedPlanForPayment, setSelectedPlanForPayment] = useState('standard_3_months');
  const [paymentAmount, setPaymentAmount] = useState(PLANS['standard_3_months']?.totalPrice || 0);
  const [paymentMethod, setPaymentMethod] = useState('Transferencia');
  const [selectedPlan, setSelectedPlan] = useState(user.plan);

  // Actualizar precio cuando cambia el plan seleccionado
  useEffect(() => {
    if (PLANS[selectedPlanForPayment]) {
      setPaymentAmount(PLANS[selectedPlanForPayment].totalPrice || 0);
    }
  }, [selectedPlanForPayment]);

  const periodEnd = user.currentPeriodEnd?.toDate?.() || user.currentPeriodEnd;
  const now = new Date();
  const baseDate = periodEnd && new Date(periodEnd) > now ? new Date(periodEnd) : now;

  // Calcular nueva fecha según el plan seleccionado
  const selectedPlanConfig = PLANS[selectedPlanForPayment];
  const monthsToAdd = selectedPlanConfig?.months || 3;
  const calculatedNewDate = new Date(baseDate);
  calculatedNewDate.setMonth(calculatedNewDate.getMonth() + monthsToAdd);

  // Cargar estadísticas cuando se muestra el modal de detalles
  useEffect(() => {
    if (type === 'view' && user.userId) {
      loadUserStats();
    }
  }, [type, user.userId]);

  const loadUserStats = async () => {
    try {
      setLoadingStats(true);
      const userStats = await getUserStats(user.userId);
      setStats(userStats);
    } catch (error) {
      console.error('Error al cargar estadísticas:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {type === 'view' && 'Detalles del Usuario'}
                {type === 'payment' && 'Registrar Pago'}
                {type === 'edit' && 'Editar Suscripción'}
              </h2>
              <p className="text-gray-600">{user.businessName || user.email}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ✕
            </button>
          </div>

          {/* Vista de Detalles */}
          {type === 'view' && (
            <div className="space-y-6">
              {/* Información Básica */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <label className="text-sm font-medium text-gray-500">Email</label>
                  <p className="text-gray-900">{user.email}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Usuario ID</label>
                  <p className="text-gray-900 font-mono text-xs">{user.userId}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Plan</label>
                  <p className="text-gray-900 capitalize font-semibold">{PLANS[user.plan]?.name || user.plan}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Precio Mensual</label>
                  <p className="text-gray-900 font-semibold">S/ {user.monthlyPrice}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Estado</label>
                  <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                    user.status === 'active' && !user.accessBlocked
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {user.accessBlocked ? 'Suspendido' : user.status === 'active' ? 'Activo' : user.status}
                  </span>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Vencimiento</label>
                  <p className="text-gray-900 font-semibold">
                    {periodEnd ? format(new Date(periodEnd), "dd/MM/yyyy", { locale: es }) : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Motivo de Bloqueo */}
              {user.blockReason && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <label className="text-sm font-medium text-red-800">Motivo de Bloqueo</label>
                  <p className="text-red-600">{user.blockReason}</p>
                </div>
              )}

              {/* Estadísticas de Uso */}
              {loadingStats ? (
                <div className="flex items-center justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
              ) : stats ? (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    Estadísticas de Uso
                  </h3>

                  {/* Tarjetas de Estadísticas */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    {/* Facturas */}
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-3 mb-2">
                        <FileText className="w-6 h-6 text-blue-600" />
                        <div>
                          <p className="text-sm text-blue-600 font-medium">Comprobantes</p>
                          <p className="text-2xl font-bold text-blue-900">{stats.invoices.total}</p>
                        </div>
                      </div>
                      <p className="text-xs text-blue-700">Este mes: {stats.invoices.thisMonth}</p>
                      <div className="mt-2 pt-2 border-t border-blue-200">
                        <p className="text-xs text-blue-600">Por tipo:</p>
                        <div className="grid grid-cols-2 gap-1 mt-1 text-xs text-blue-700">
                          <span>Facturas: {stats.invoices.byType.factura || 0}</span>
                          <span>Boletas: {stats.invoices.byType.boleta || 0}</span>
                          <span>N.Crédito: {stats.invoices.byType.nota_credito || 0}</span>
                          <span>N.Débito: {stats.invoices.byType.nota_debito || 0}</span>
                        </div>
                      </div>
                    </div>

                    {/* Facturación */}
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-3 mb-2">
                        <DollarSign className="w-6 h-6 text-green-600" />
                        <div>
                          <p className="text-sm text-green-600 font-medium">Facturación Total</p>
                          <p className="text-2xl font-bold text-green-900">
                            S/ {stats.invoices.totalAmount.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-green-700">
                        Este mes: S/ {stats.invoices.totalAmountThisMonth.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        Promedio: S/ {stats.invoices.total > 0 ? (stats.invoices.totalAmount / stats.invoices.total).toLocaleString('es-PE', { minimumFractionDigits: 2 }) : '0.00'}
                      </p>
                    </div>

                    {/* Clientes y Productos */}
                    <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <Users className="w-6 h-6 text-purple-600" />
                          <div>
                            <p className="text-sm text-purple-600 font-medium">Clientes</p>
                            <p className="text-2xl font-bold text-purple-900">{stats.customers.total}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 pt-3 border-t border-purple-200">
                          <Package className="w-6 h-6 text-purple-600" />
                          <div>
                            <p className="text-sm text-purple-600 font-medium">Productos</p>
                            <p className="text-2xl font-bold text-purple-900">{stats.products.total}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Límites del Plan */}
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Uso vs Límites del Plan
                    </h4>
                    <div className="space-y-3">
                      {/* Facturas/mes */}
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">Facturas este mes</span>
                          <span className="font-medium text-gray-900">
                            {stats.invoices.thisMonth} / {user.limits?.maxInvoicesPerMonth === -1 ? '∞' : user.limits?.maxInvoicesPerMonth}
                          </span>
                        </div>
                        {user.limits?.maxInvoicesPerMonth !== -1 && (
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                (stats.invoices.thisMonth / user.limits?.maxInvoicesPerMonth) * 100 > 80
                                  ? 'bg-red-500'
                                  : 'bg-blue-500'
                              }`}
                              style={{
                                width: `${Math.min((stats.invoices.thisMonth / user.limits?.maxInvoicesPerMonth) * 100, 100)}%`
                              }}
                            ></div>
                          </div>
                        )}
                      </div>

                      {/* Clientes */}
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">Clientes</span>
                          <span className="font-medium text-gray-900">
                            {stats.customers.total} / {user.limits?.maxCustomers === -1 ? '∞' : user.limits?.maxCustomers}
                          </span>
                        </div>
                        {user.limits?.maxCustomers !== -1 && (
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                (stats.customers.total / user.limits?.maxCustomers) * 100 > 80
                                  ? 'bg-red-500'
                                  : 'bg-green-500'
                              }`}
                              style={{
                                width: `${Math.min((stats.customers.total / user.limits?.maxCustomers) * 100, 100)}%`
                              }}
                            ></div>
                          </div>
                        )}
                      </div>

                      {/* Productos */}
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">Productos</span>
                          <span className="font-medium text-gray-900">
                            {stats.products.total} / {user.limits?.maxProducts === -1 ? '∞' : user.limits?.maxProducts}
                          </span>
                        </div>
                        {user.limits?.maxProducts !== -1 && (
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                (stats.products.total / user.limits?.maxProducts) * 100 > 80
                                  ? 'bg-red-500'
                                  : 'bg-purple-500'
                              }`}
                              style={{
                                width: `${Math.min((stats.products.total / user.limits?.maxProducts) * 100, 100)}%`
                              }}
                            ></div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Historial de Pagos */}
              {user.paymentHistory && user.paymentHistory.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Historial de Pagos (últimos 10)
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Duración</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Monto</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Método</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {user.paymentHistory.slice(-10).reverse().map((payment, idx) => {
                          const paymentDate = payment.date?.toDate?.() || payment.date;
                          return (
                            <tr key={idx}>
                              <td className="px-4 py-2 text-sm text-gray-900">
                                {paymentDate ? format(new Date(paymentDate), "dd/MM/yyyy HH:mm", { locale: es }) : 'N/A'}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-700">
                                {payment.planName || (payment.plan && PLANS[payment.plan]?.name) || 'N/A'}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-700">
                                {payment.months ? `${payment.months} ${payment.months === 1 ? 'mes' : 'meses'}` : 'N/A'}
                              </td>
                              <td className="px-4 py-2 text-sm font-medium text-gray-900">
                                S/ {payment.amount.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-700">{payment.method}</td>
                              <td className="px-4 py-2 text-sm">
                                <span className={`px-2 py-1 text-xs rounded-full ${
                                  payment.status === 'completed' ? 'bg-green-100 text-green-800' :
                                  payment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
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
            </div>
          )}

          {/* Vista de Registro de Pago */}
          {type === 'payment' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onRegisterPayment(user.userId, paymentAmount, paymentMethod, selectedPlanForPayment);
              }}
              className="space-y-4"
            >
              {/* Selector de Plan */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Seleccionar Plan
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {Object.entries(PLANS).filter(([key]) => key !== 'trial' && key !== 'custom').map(([key, plan]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedPlanForPayment(key)}
                      className={`p-4 border-2 rounded-lg transition-all ${
                        selectedPlanForPayment === key
                          ? 'border-primary-600 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-center">
                        {plan.badge && (
                          <span className="inline-block px-2 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-full mb-2">
                            {plan.badge}
                          </span>
                        )}
                        <p className="font-bold text-gray-900">{plan.name}</p>
                        <p className="text-2xl font-bold text-primary-600 my-2">
                          S/ {plan.totalPrice}
                        </p>
                        <p className="text-xs text-gray-600">
                          S/ {plan.pricePerMonth}/mes × {plan.months} {plan.months === 1 ? 'mes' : 'meses'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Monto Total */}
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-green-900">Monto Total a Cobrar:</span>
                  <span className="text-3xl font-bold text-green-600">
                    S/ {paymentAmount}
                  </span>
                </div>
                <p className="text-sm text-green-700 mt-1">
                  Plan de {selectedPlanConfig?.months} {selectedPlanConfig?.months === 1 ? 'mes' : 'meses'} -
                  S/ {selectedPlanConfig?.pricePerMonth}/mes
                </p>
              </div>

              {/* Método de Pago */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Método de Pago
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="Transferencia">Transferencia Bancaria</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Yape">Yape</option>
                  <option value="Plin">Plin</option>
                  <option value="Tarjeta">Tarjeta de Crédito/Débito</option>
                  <option value="Depósito">Depósito Bancario</option>
                </select>
              </div>

              {/* Vista previa de la nueva fecha */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  <p className="font-semibold text-blue-900">Vista Previa de Renovación</p>
                </div>
                <div className="space-y-1 text-sm text-blue-800">
                  <p>
                    <strong>Vencimiento actual:</strong>{' '}
                    {periodEnd ? format(new Date(periodEnd), "dd/MM/yyyy", { locale: es }) : 'N/A'}
                  </p>
                  <p>
                    <strong>Se extenderá desde:</strong>{' '}
                    {format(baseDate, "dd/MM/yyyy", { locale: es })}
                    {baseDate > now ? ' (fecha de vencimiento)' : ' (hoy - vencido)'}
                  </p>
                  <p>
                    <strong>Duración:</strong> {monthsToAdd} {monthsToAdd === 1 ? 'mes' : 'meses'}
                  </p>
                  <p className="text-lg font-bold text-blue-900 pt-2 border-t border-blue-200">
                    <strong>Nuevo vencimiento:</strong>{' '}
                    {format(calculatedNewDate, "dd/MM/yyyy", { locale: es })}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50 font-semibold"
                >
                  {loading ? 'Procesando...' : `Registrar Pago de S/ ${paymentAmount}`}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {/* Vista de Editar Plan */}
          {type === 'edit' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onChangePlan(user.userId, selectedPlan);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Plan
                </label>
                <select
                  value={selectedPlan}
                  onChange={(e) => setSelectedPlan(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  {Object.entries(PLANS).map(([key, plan]) => (
                    <option key={key} value={key}>
                      {plan.name} - S/ {plan.pricePerMonth}/mes
                    </option>
                  ))}
                </select>
              </div>

              {/* Mostrar características del plan seleccionado */}
              {PLANS[selectedPlan] && (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-2">Características del plan:</h4>
                  <ul className="space-y-1 text-sm text-gray-700">
                    <li>• Facturas/mes: {PLANS[selectedPlan].limits.maxInvoicesPerMonth === -1 ? 'Ilimitado' : PLANS[selectedPlan].limits.maxInvoicesPerMonth}</li>
                    <li>• Clientes: {PLANS[selectedPlan].limits.maxCustomers === -1 ? 'Ilimitado' : PLANS[selectedPlan].limits.maxCustomers}</li>
                    <li>• Productos: {PLANS[selectedPlan].limits.maxProducts === -1 ? 'Ilimitado' : PLANS[selectedPlan].limits.maxProducts}</li>
                    <li>• Integración SUNAT: {PLANS[selectedPlan].limits.sunatIntegration ? 'Sí' : 'No'}</li>
                    <li>• Multi-usuario: {PLANS[selectedPlan].limits.multiUser ? 'Sí' : 'No'}</li>
                  </ul>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {loading ? 'Guardando...' : 'Cambiar Plan'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
