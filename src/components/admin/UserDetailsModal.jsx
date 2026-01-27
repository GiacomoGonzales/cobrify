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
  BarChart3,
  Settings,
  Eye,
  EyeOff,
  Save,
  CheckCircle,
  Shield,
  PlusCircle,
  Plus
} from 'lucide-react';
import { getUserStats } from '@/services/userStatsService';
import { PLANS } from '@/services/subscriptionService';
import { doc, updateDoc, setDoc, getDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function UserDetailsModal({ user, type, onClose, onRegisterPayment, onChangePlan, loading, toast, onUserUpdated }) {
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [addingBonus, setAddingBonus] = useState(false);
  const [currentBonusInvoices, setCurrentBonusInvoices] = useState(user.bonusInvoices || 0);
  const [selectedPlanForPayment, setSelectedPlanForPayment] = useState('qpse_1_month');
  const [paymentAmount, setPaymentAmount] = useState(PLANS['qpse_1_month']?.totalPrice || 0);
  const [paymentMethod, setPaymentMethod] = useState('Transferencia');
  const [selectedPlan, setSelectedPlan] = useState(user.plan);
  const [showPasswords, setShowPasswords] = useState(false);
  const [useCustomDate, setUseCustomDate] = useState(false);
  const [customEndDate, setCustomEndDate] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [emissionConfig, setEmissionConfig] = useState({
    method: 'qpse',
    qpse: {
      enabled: true,
      usuario: '',
      password: '',
      environment: 'demo',
      firmasDisponibles: 0,
      firmasUsadas: 0
    },
    sunat: {
      enabled: false,
      environment: 'beta',
      solUser: '',
      solPassword: '',
      clientId: '',
      clientSecret: '',
      certificateName: '',
      certificatePassword: '',
      certificateData: '',
      homologated: false
    },
    taxConfig: {
      igvExempt: false,
      igvRate: 18,
      exemptionReason: '',
      exemptionCode: '10' // Código 10 = Gravado por defecto
    }
  });

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

  // Cargar configuración de emisión cuando se abre el modal en modo config
  useEffect(() => {
    if (type === 'config' && user.userId) {
      loadEmissionConfig();
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

  const loadEmissionConfig = async () => {
    try {
      const businessDoc = await getDoc(doc(db, 'businesses', user.userId));
      const data = businessDoc.data();

      console.log('📋 Cargando configuración para:', user.email);
      console.log('📋 Datos de Firestore:', data);

      if (data?.emissionConfig) {
        // Si ya existe emissionConfig del admin, usarlo
        console.log('✅ Cargando desde emissionConfig');
        // Asegurar que taxConfig exista, si no, usar valores por defecto
        setEmissionConfig({
          ...data.emissionConfig,
          taxConfig: data.emissionConfig.taxConfig || {
            igvExempt: false,
            igvRate: 18,
            exemptionReason: '',
            exemptionCode: '10'
          }
        });
      } else {
        // Si no existe, cargar desde la configuración antigua (Settings)
        console.log('✅ Cargando desde configuración antigua (qpse/sunat)');

        const qpseEnabled = data?.qpse?.enabled || false;
        const sunatEnabled = data?.sunat?.enabled || false;

        // Determinar el método activo
        let method = 'qpse';
        if (qpseEnabled) method = 'qpse';
        else if (sunatEnabled) method = 'sunat_direct';

        console.log('📋 Método detectado:', method);
        console.log('📋 QPse data:', data?.qpse);
        console.log('📋 SUNAT data:', data?.sunat);

        setEmissionConfig({
          method: method,
          qpse: {
            enabled: data?.qpse?.enabled || false,
            usuario: data?.qpse?.usuario || '',
            password: data?.qpse?.password || '',
            environment: data?.qpse?.environment || 'demo',
            firmasDisponibles: data?.qpse?.firmasDisponibles || 0,
            firmasUsadas: data?.qpse?.firmasUsadas || 0
          },
          sunat: {
            enabled: data?.sunat?.enabled || false,
            environment: data?.sunat?.environment || 'beta',
            solUser: data?.sunat?.solUser || '',
            solPassword: data?.sunat?.solPassword || '',
            clientId: data?.sunat?.clientId || '',
            clientSecret: data?.sunat?.clientSecret || '',
            certificateName: data?.sunat?.certificateName || '',
            certificatePassword: data?.sunat?.certificatePassword || '',
            certificateData: data?.sunat?.certificateData || '',
            homologated: data?.sunat?.homologated || false
          },
          taxConfig: data?.taxConfig || {
            igvExempt: false,
            igvRate: 18,
            exemptionReason: '',
            exemptionCode: '10'
          }
        });
      }
    } catch (error) {
      console.error('Error al cargar configuración:', error);
    }
  };

  const handleSaveEmissionConfig = async () => {
    setIsSavingConfig(true);
    try {
      const businessRef = doc(db, 'businesses', user.userId);

      // Actualizar el campo "enabled" según el método seleccionado
      const configToSave = {
        ...emissionConfig,
        qpse: {
          ...emissionConfig.qpse,
          enabled: emissionConfig.method === 'qpse'
        },
        sunat: {
          ...emissionConfig.sunat,
          enabled: emissionConfig.method === 'sunat_direct'
        }
      };

      await setDoc(businessRef, {
        emissionConfig: configToSave,
        updatedAt: new Date()
      }, { merge: true });

      if (toast) {
        toast.success('Configuración guardada exitosamente');
      }
      onClose();
    } catch (error) {
      console.error('Error al guardar configuración:', error);
      if (toast) {
        toast.error('Error al guardar configuración');
      }
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Función para agregar 500 comprobantes de bono
  const handleAddBonusInvoices = async (amount = 500) => {
    setAddingBonus(true);
    try {
      const subscriptionRef = doc(db, 'subscriptions', user.userId);

      await updateDoc(subscriptionRef, {
        bonusInvoices: increment(amount),
        updatedAt: new Date()
      });

      setCurrentBonusInvoices(prev => prev + amount);

      if (toast) {
        toast.success(`Se agregaron ${amount} comprobantes extra al usuario`);
      }

      // Notificar al componente padre para refrescar la lista
      if (onUserUpdated) {
        onUserUpdated();
      }
    } catch (error) {
      console.error('Error al agregar comprobantes de bono:', error);
      if (toast) {
        toast.error('Error al agregar comprobantes extra');
      }
    } finally {
      setAddingBonus(false);
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
                {type === 'config' && 'Configuración de Emisión'}
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

                  {/* Contador Oficial de Documentos del Período */}
                  {user.usage?.invoicesThisMonth !== undefined && (() => {
                    const planLimit = user.limits?.maxInvoicesPerMonth || -1;
                    const totalLimit = planLimit === -1 ? -1 : planLimit + currentBonusInvoices;
                    const availableInvoices = totalLimit === -1 ? Infinity : Math.max(0, totalLimit - user.usage.invoicesThisMonth);
                    const usagePercentage = totalLimit === -1 ? 0 : (user.usage.invoicesThisMonth / totalLimit) * 100;

                    return (
                      <div className="mb-6 p-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg shadow-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="bg-white bg-opacity-20 p-3 rounded-lg">
                              <FileText className="w-8 h-8" />
                            </div>
                            <div>
                              <p className="text-sm opacity-90">Comprobantes Emitidos (SUNAT Aceptados)</p>
                              <div className="flex items-baseline gap-2">
                                <p className="text-4xl font-bold">{user.usage.invoicesThisMonth}</p>
                                <p className="text-lg opacity-90">
                                  / {totalLimit === -1 ? '∞' : totalLimit}
                                </p>
                              </div>
                              {totalLimit !== -1 && (
                                <div className="text-sm mt-1 opacity-90">
                                  <p>Disponibles: {availableInvoices}</p>
                                  {currentBonusInvoices > 0 && (
                                    <p className="text-xs text-yellow-200">
                                      (Plan: {planLimit} + Bonus: {currentBonusInvoices})
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs opacity-75">Periodo actual</p>
                            <p className="text-sm font-medium">
                              {user.currentPeriodStart
                                ? format(user.currentPeriodStart.toDate(), "d MMM", { locale: es })
                                : 'N/A'
                              }
                              {' - '}
                              {periodEnd
                                ? format(new Date(periodEnd), "d MMM", { locale: es })
                                : 'N/A'
                              }
                            </p>
                            {user.lastCounterReset && (
                              <p className="text-xs opacity-75 mt-1">
                                Último reseteo: {format(user.lastCounterReset.toDate(), "d MMM HH:mm", { locale: es })}
                              </p>
                            )}
                          </div>
                        </div>
                        {totalLimit !== -1 && (
                          <div className="mt-3">
                            <div className="w-full bg-white bg-opacity-30 rounded-full h-3">
                              <div
                                className={`h-3 rounded-full transition-all duration-300 ${
                                  usagePercentage >= 90
                                    ? 'bg-red-400'
                                    : usagePercentage >= 70
                                    ? 'bg-yellow-400'
                                    : 'bg-green-400'
                                }`}
                                style={{
                                  width: `${Math.min(usagePercentage, 100)}%`
                                }}
                              ></div>
                            </div>
                            <p className="text-xs mt-1 opacity-75 text-right">
                              {usagePercentage.toFixed(1)}% usado
                            </p>
                          </div>
                        )}

                        {/* Botón para agregar comprobantes de bono */}
                        {planLimit !== -1 && (
                          <div className="mt-4 pt-3 border-t border-white border-opacity-30">
                            <button
                              type="button"
                              onClick={() => handleAddBonusInvoices(500)}
                              disabled={addingBonus}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg transition-all disabled:opacity-50"
                            >
                              {addingBonus ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                  Agregando...
                                </>
                              ) : (
                                <>
                                  <PlusCircle className="w-5 h-5" />
                                  Agregar +500 comprobantes
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Tarjetas de Estadísticas */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    {/* Facturas */}
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-3 mb-2">
                        <FileText className="w-6 h-6 text-blue-600" />
                        <div>
                          <p className="text-sm text-blue-600 font-medium">Comprobantes Totales</p>
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
                      <div className="mt-2 pt-2 border-t border-blue-200">
                        <p className="text-xs text-blue-600">Estado SUNAT:</p>
                        <div className="grid grid-cols-2 gap-1 mt-1 text-xs">
                          <span className="text-green-700">✓ Aceptados: {stats.invoices.bySunatStatus?.accepted || 0}</span>
                          <span className="text-red-700">✗ Rechazados: {stats.invoices.bySunatStatus?.rejected || 0}</span>
                          <span className="text-yellow-700">⏳ Pendientes: {stats.invoices.bySunatStatus?.pending || 0}</span>
                          <span className="text-gray-500">— Sin enviar: {stats.invoices.bySunatStatus?.not_sent || 0}</span>
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
                onRegisterPayment(
                  user.userId,
                  paymentAmount,
                  paymentMethod,
                  selectedPlanForPayment,
                  useCustomDate && customEndDate ? new Date(customEndDate) : null
                );
              }}
              className="space-y-4"
            >
              {/* Selector de Plan */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Seleccionar Plan
                </label>

                {/* Planes QPse */}
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-600" />
                    Planes con QPse (500 comprobantes/mes)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {Object.entries(PLANS).filter(([key, plan]) => plan.category === 'qpse').map(([key, plan]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedPlanForPayment(key)}
                        className={`p-4 border-2 rounded-lg transition-all ${
                          selectedPlanForPayment === key
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="text-center">
                          {plan.badge && (
                            <span className="inline-block px-2 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-full mb-2">
                              {plan.badge}
                            </span>
                          )}
                          <p className="font-bold text-gray-900">{plan.months} {plan.months === 1 ? 'Mes' : 'Meses'}</p>
                          <p className="text-2xl font-bold text-blue-600 my-2">
                            S/ {plan.totalPrice}
                          </p>
                          <p className="text-xs text-gray-600">
                            S/ {plan.pricePerMonth.toFixed(2)}/mes
                          </p>
                          <p className="text-xs text-blue-600 font-medium mt-1">
                            500 compr./mes
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Planes SUNAT Directo */}
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Planes SUNAT Directo (Comprobantes ILIMITADOS)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {Object.entries(PLANS).filter(([key, plan]) => plan.category === 'sunat_direct').map(([key, plan]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedPlanForPayment(key)}
                        className={`p-4 border-2 rounded-lg transition-all ${
                          selectedPlanForPayment === key
                            ? 'border-green-600 bg-green-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="text-center">
                          {plan.badge && (
                            <span className="inline-block px-2 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-full mb-2">
                              {plan.badge}
                            </span>
                          )}
                          <p className="font-bold text-gray-900">{plan.months} {plan.months === 1 ? 'Mes' : 'Meses'}</p>
                          <p className="text-2xl font-bold text-green-600 my-2">
                            S/ {plan.totalPrice}
                          </p>
                          <p className="text-xs text-gray-600">
                            S/ {plan.pricePerMonth.toFixed(2)}/mes
                          </p>
                          <p className="text-xs text-green-600 font-medium mt-1">
                            ∞ Ilimitados
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Add-ons (Paquetes adicionales) */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-purple-600" />
                    Paquetes Adicionales (No cambia plan ni fechas)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {Object.entries(PLANS).filter(([key, plan]) => plan.category === 'addon').map(([key, plan]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedPlanForPayment(key)}
                        className={`p-4 border-2 rounded-lg transition-all ${
                          selectedPlanForPayment === key
                            ? 'border-purple-600 bg-purple-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="text-center">
                          <p className="font-bold text-gray-900">{plan.name}</p>
                          <p className="text-2xl font-bold text-purple-600 my-2">
                            S/ {plan.totalPrice}
                          </p>
                          <p className="text-xs text-purple-600 font-medium mt-1">
                            +{plan.addonAmount} comprobantes
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Se suma al límite actual
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Monto Total */}
              <div className={`p-4 border rounded-lg ${selectedPlanConfig?.isAddon ? 'bg-purple-50 border-purple-200' : 'bg-green-50 border-green-200'}`}>
                <div className="flex justify-between items-center">
                  <span className={`font-semibold ${selectedPlanConfig?.isAddon ? 'text-purple-900' : 'text-green-900'}`}>Monto Total a Cobrar:</span>
                  <span className={`text-3xl font-bold ${selectedPlanConfig?.isAddon ? 'text-purple-600' : 'text-green-600'}`}>
                    S/ {paymentAmount}
                  </span>
                </div>
                <p className={`text-sm mt-1 ${selectedPlanConfig?.isAddon ? 'text-purple-700' : 'text-green-700'}`}>
                  {selectedPlanConfig?.isAddon ? (
                    <>
                      {selectedPlanConfig.name} - Se agregarán +{selectedPlanConfig.addonAmount} comprobantes al límite actual
                    </>
                  ) : (
                    <>
                      Plan de {selectedPlanConfig?.months} {selectedPlanConfig?.months === 1 ? 'mes' : 'meses'} -
                      S/ {selectedPlanConfig?.pricePerMonth}/mes
                    </>
                  )}
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

              {/* Toggle para usar fecha personalizada */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="useCustomDate"
                    checked={useCustomDate}
                    onChange={(e) => {
                      setUseCustomDate(e.target.checked);
                      if (!e.target.checked) {
                        setCustomEndDate('');
                      }
                    }}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <label htmlFor="useCustomDate" className="flex-1 cursor-pointer">
                    <p className="font-semibold text-gray-900">Establecer fecha de vencimiento manual</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Útil para regalar días extra o ajustar fechas a discreción
                    </p>
                  </label>
                </div>
              </div>

              {/* Vista previa de la nueva fecha */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  <p className="font-semibold text-blue-900">
                    {useCustomDate ? 'Fecha de Vencimiento Personalizada' : 'Vista Previa de Renovación'}
                  </p>
                </div>

                {useCustomDate ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-blue-900 mb-2">
                        Fecha de fin de suscripción:
                      </label>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        min={format(now, 'yyyy-MM-dd')}
                        className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
                      />
                    </div>
                    {customEndDate && (
                      <div className="pt-2 border-t border-blue-200">
                        <p className="text-sm text-blue-800">
                          <strong>Vencimiento actual:</strong>{' '}
                          {periodEnd ? format(new Date(periodEnd), "dd/MM/yyyy", { locale: es }) : 'N/A'}
                        </p>
                        <p className="text-lg font-bold text-blue-900 mt-2">
                          <strong>Nuevo vencimiento:</strong>{' '}
                          {format(new Date(customEndDate), "dd/MM/yyyy", { locale: es })}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
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
                )}
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
                // Usar user.userId si existe, sino user.id (para compatibilidad)
                const userId = user.userId || user.id;
                if (!userId) {
                  console.error('No se encontró userId para cambiar plan');
                  if (toast) toast.error('Error: No se encontró el ID del usuario');
                  return;
                }
                onChangePlan(userId, selectedPlan);
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
                <div className={`p-4 border-2 rounded-lg ${
                  PLANS[selectedPlan].category === 'qpse' ? 'bg-blue-50 border-blue-200' :
                  PLANS[selectedPlan].category === 'sunat_direct' ? 'bg-green-50 border-green-200' :
                  'bg-gray-50 border-gray-200'
                }`}>
                  <h4 className="font-semibold text-gray-900 mb-2">Características del plan:</h4>
                  <ul className="space-y-1 text-sm text-gray-700">
                    <li className="font-semibold">
                      • Comprobantes/mes: {
                        PLANS[selectedPlan].limits.maxInvoicesPerMonth === -1
                          ? '∞ ILIMITADO'
                          : `${PLANS[selectedPlan].limits.maxInvoicesPerMonth} comprobantes`
                      }
                    </li>
                    <li>• Método de emisión: {
                      PLANS[selectedPlan].category === 'qpse' ? 'QPse (Factuya firma)' :
                      PLANS[selectedPlan].category === 'sunat_direct' ? 'SUNAT Directo (CDT propio)' :
                      'Flexible'
                    }</li>
                    <li>• Clientes: {PLANS[selectedPlan].limits.maxCustomers === -1 ? 'Ilimitado' : PLANS[selectedPlan].limits.maxCustomers}</li>
                    <li>• Productos: {PLANS[selectedPlan].limits.maxProducts === -1 ? 'Ilimitado' : PLANS[selectedPlan].limits.maxProducts}</li>
                    <li>• Integración SUNAT: {PLANS[selectedPlan].limits.sunatIntegration ? 'Sí' : 'No'}</li>
                    <li>• Multi-usuario: {PLANS[selectedPlan].limits.multiUser ? 'Sí' : 'No'}</li>
                  </ul>
                  {PLANS[selectedPlan].category === 'qpse' && (
                    <div className="mt-3 p-2 bg-blue-100 border border-blue-300 rounded text-xs text-blue-800">
                      ℹ️ Con QPse no necesitas certificado digital. Factuya firma por ti.
                    </div>
                  )}
                  {PLANS[selectedPlan].category === 'sunat_direct' && (
                    <div className="mt-3 p-2 bg-green-100 border border-green-300 rounded text-xs text-green-800">
                      ✓ Con SUNAT Directo usas tu certificado y tienes comprobantes ilimitados.
                    </div>
                  )}
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

          {/* Vista de Configuración de Emisión */}
          {type === 'config' && (
            <div className="space-y-6">
              {/* Selección de método */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Método de Emisión
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEmissionConfig({ ...emissionConfig, method: 'qpse' })}
                    className={`p-4 border-2 rounded-lg transition-all ${
                      emissionConfig.method === 'qpse'
                        ? 'border-primary-600 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-semibold">QPse</p>
                    <p className="text-xs text-gray-600">Firma tercerizada (sin certificado)</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmissionConfig({ ...emissionConfig, method: 'sunat_direct' })}
                    className={`p-4 border-2 rounded-lg transition-all ${
                      emissionConfig.method === 'sunat_direct'
                        ? 'border-primary-600 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-semibold">SUNAT Directo</p>
                    <p className="text-xs text-gray-600">CDT propio del negocio</p>
                  </button>
                </div>
              </div>

              {/* Configuración de Impuestos (IGV) */}
              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
                  <DollarSign className="w-5 h-5" />
                  Configuración de Impuestos
                </h3>

                {/* Checkbox de Exoneración */}
                <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                  <input
                    type="checkbox"
                    id="igvExempt"
                    checked={emissionConfig.taxConfig.igvExempt}
                    onChange={(e) => {
                      const isExempt = e.target.checked
                      setEmissionConfig({
                        ...emissionConfig,
                        taxConfig: {
                          ...emissionConfig.taxConfig,
                          igvExempt: isExempt,
                          igvRate: isExempt ? 0 : 18,
                          exemptionCode: isExempt ? '20' : '10'
                        }
                      })
                    }}
                    className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500 mt-0.5"
                  />
                  <label htmlFor="igvExempt" className="flex-1 cursor-pointer">
                    <p className="font-semibold text-gray-900">Empresa exonerada de IGV</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Marcar si la empresa está acogida a beneficios tributarios (Ej: Amazonía, Zona Franca, etc.)
                    </p>
                  </label>
                </div>

                {/* Configuración cuando está exonerado */}
                {emissionConfig.taxConfig.igvExempt && (
                  <div className="space-y-4 pl-4 border-l-4 border-yellow-400">
                    {/* Info Box */}
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                      <strong>⚠️ Importante:</strong> Los comprobantes se emitirán con IGV 0% (exonerado).
                      Asegúrate de tener el respaldo legal correspondiente.
                    </div>

                    {/* Motivo de Exoneración */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Motivo de Exoneración <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={emissionConfig.taxConfig.exemptionReason}
                        onChange={(e) => setEmissionConfig({
                          ...emissionConfig,
                          taxConfig: { ...emissionConfig.taxConfig, exemptionReason: e.target.value }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">Seleccionar motivo...</option>
                        <option value="Amazonía - Ley 27037">Amazonía - Ley 27037</option>
                        <option value="Zona Franca">Zona Franca</option>
                        <option value="Convenio Internacional">Convenio Internacional</option>
                        <option value="Exportación">Exportación</option>
                        <option value="Otro">Otro motivo</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Este motivo aparecerá en los comprobantes electrónicos
                      </p>
                    </div>

                    {/* Tasa de IGV (solo informativo) */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tasa de IGV
                      </label>
                      <div className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700 font-semibold">
                        {emissionConfig.taxConfig.igvRate}%
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Tasa aplicada automáticamente según la configuración
                      </p>
                    </div>
                  </div>
                )}

                {/* Configuración cuando NO está exonerado (IGV normal) */}
                {!emissionConfig.taxConfig.igvExempt && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                    <strong>✓ IGV Normal:</strong> Los comprobantes se emitirán con IGV 18% (gravado).
                  </div>
                )}
              </div>

              {/* Configuración QPse */}
              {emissionConfig.method === 'qpse' && (
                <div className="space-y-4 border-t pt-4">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Credenciales QPse
                  </h3>

                  {/* Info Box */}
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                    <strong>QPse</strong> es un PSE que firma y envía a SUNAT sin necesidad de certificado digital.
                  </div>

                  {/* Ambiente */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Ambiente <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setEmissionConfig({
                          ...emissionConfig,
                          qpse: { ...emissionConfig.qpse, environment: 'demo' }
                        })}
                        className={`flex-1 py-2 px-4 rounded-lg border-2 transition-all ${
                          emissionConfig.qpse.environment === 'demo'
                            ? 'border-primary-600 bg-primary-50 text-primary-700'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        Demo
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmissionConfig({
                          ...emissionConfig,
                          qpse: { ...emissionConfig.qpse, environment: 'production' }
                        })}
                        className={`flex-1 py-2 px-4 rounded-lg border-2 transition-all ${
                          emissionConfig.qpse.environment === 'production'
                            ? 'border-primary-600 bg-primary-50 text-primary-700'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        Producción
                      </button>
                    </div>
                  </div>

                  {/* Usuario QPse */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Usuario QPse <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="usuario@ejemplo.com"
                      value={emissionConfig.qpse.usuario}
                      onChange={(e) => setEmissionConfig({
                        ...emissionConfig,
                        qpse: { ...emissionConfig.qpse, usuario: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Usuario que obtuviste al contratar QPse</p>
                  </div>

                  {/* Password QPse */}
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contraseña QPse <span className="text-red-500">*</span>
                    </label>
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      placeholder="••••••••••••••••"
                      value={emissionConfig.qpse.password}
                      onChange={(e) => setEmissionConfig({
                        ...emissionConfig,
                        qpse: { ...emissionConfig.qpse, password: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords(!showPasswords)}
                      className="absolute right-3 top-9 text-gray-500 hover:text-gray-700"
                    >
                      {showPasswords ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                    <p className="text-xs text-gray-500 mt-1">Password de tu cuenta QPse</p>
                  </div>

                  {/* Firmas Disponibles/Usadas */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Firmas Disponibles
                      </label>
                      <input
                        type="number"
                        placeholder="0"
                        value={emissionConfig.qpse.firmasDisponibles}
                        onChange={(e) => setEmissionConfig({
                          ...emissionConfig,
                          qpse: { ...emissionConfig.qpse, firmasDisponibles: parseInt(e.target.value) || 0 }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Firmas Usadas
                      </label>
                      <input
                        type="number"
                        placeholder="0"
                        value={emissionConfig.qpse.firmasUsadas}
                        onChange={(e) => setEmissionConfig({
                          ...emissionConfig,
                          qpse: { ...emissionConfig.qpse, firmasUsadas: parseInt(e.target.value) || 0 }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>

                  {/* Warning para producción */}
                  {emissionConfig.qpse.environment === 'production' && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                      <strong>⚠️ Producción:</strong> Los comprobantes serán enviados a SUNAT de forma real.
                    </div>
                  )}
                </div>
              )}

              {/* Configuración SUNAT Directo */}
              {emissionConfig.method === 'sunat_direct' && (
                <div className="space-y-4 border-t pt-4">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Credenciales SUNAT
                  </h3>

                  {/* Info Box */}
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                    <strong>SUNAT Directo:</strong> Requiere certificado digital (CDT) del negocio.
                  </div>

                  {/* Ambiente */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Ambiente <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setEmissionConfig({
                          ...emissionConfig,
                          sunat: { ...emissionConfig.sunat, environment: 'beta' }
                        })}
                        className={`flex-1 py-2 px-4 rounded-lg border-2 transition-all ${
                          emissionConfig.sunat.environment === 'beta'
                            ? 'border-primary-600 bg-primary-50 text-primary-700'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        Beta (Pruebas)
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmissionConfig({
                          ...emissionConfig,
                          sunat: { ...emissionConfig.sunat, environment: 'production' }
                        })}
                        className={`flex-1 py-2 px-4 rounded-lg border-2 transition-all ${
                          emissionConfig.sunat.environment === 'production'
                            ? 'border-primary-600 bg-primary-50 text-primary-700'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        Producción
                      </button>
                    </div>
                  </div>

                  {/* Usuario SOL */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Usuario SOL <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="MODDATOS"
                      value={emissionConfig.sunat.solUser}
                      onChange={(e) => setEmissionConfig({
                        ...emissionConfig,
                        sunat: { ...emissionConfig.sunat, solUser: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Usuario SOL de SUNAT</p>
                  </div>

                  {/* Contraseña SOL */}
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contraseña SOL <span className="text-red-500">*</span>
                    </label>
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      placeholder="••••••••••••••••"
                      value={emissionConfig.sunat.solPassword}
                      onChange={(e) => setEmissionConfig({
                        ...emissionConfig,
                        sunat: { ...emissionConfig.sunat, solPassword: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords(!showPasswords)}
                      className="absolute right-3 top-9 text-gray-500 hover:text-gray-700"
                    >
                      {showPasswords ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                    <p className="text-xs text-gray-500 mt-1">Contraseña SOL de SUNAT</p>
                  </div>

                  {/* Credenciales API REST (requeridas para Guías de Remisión) */}
                  <div className="md:col-span-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm font-medium text-blue-900 mb-2">
                      Credenciales API REST (para Guías de Remisión)
                    </p>
                    <p className="text-xs text-blue-700 mb-3">
                      Requeridas para enviar Guías de Remisión directamente a SUNAT.
                      Generar en: Menú SOL &gt; Empresa &gt; Credenciales API
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Client ID
                        </label>
                        <input
                          type="text"
                          placeholder="ej: 12345678901-abc123..."
                          value={emissionConfig.sunat.clientId}
                          onChange={(e) => setEmissionConfig({
                            ...emissionConfig,
                            sunat: { ...emissionConfig.sunat, clientId: e.target.value }
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div className="relative">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Client Secret
                        </label>
                        <input
                          type={showPasswords ? 'text' : 'password'}
                          placeholder="••••••••••••••••"
                          value={emissionConfig.sunat.clientSecret}
                          onChange={(e) => setEmissionConfig({
                            ...emissionConfig,
                            sunat: { ...emissionConfig.sunat, clientSecret: e.target.value }
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Certificado Digital */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Certificado Digital (PFX/P12) <span className="text-red-500">*</span>
                    </label>
                    {emissionConfig.sunat.certificateName ? (
                      <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-5 h-5 text-green-600" />
                          <span className="text-sm text-green-800">{emissionConfig.sunat.certificateName}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEmissionConfig({
                            ...emissionConfig,
                            sunat: { ...emissionConfig.sunat, certificateName: '', certificatePassword: '', certificateData: '' }
                          })}
                          className="text-sm text-red-600 hover:text-red-700"
                        >
                          Eliminar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center w-full">
                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <svg className="w-8 h-8 mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Clic para subir</span> certificado</p>
                            <p className="text-xs text-gray-500">PFX o P12</p>
                          </div>
                          <input
                            type="file"
                            className="hidden"
                            accept=".pfx,.p12"
                            onChange={async (e) => {
                              const file = e.target.files[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (event) => {
                                  // Remover el prefijo "data:application/x-pkcs12;base64," del resultado
                                  const base64 = event.target.result.split(',')[1] || event.target.result;
                                  setEmissionConfig({
                                    ...emissionConfig,
                                    sunat: {
                                      ...emissionConfig.sunat,
                                      certificateName: file.name,
                                      certificateData: base64
                                    }
                                  });
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-1">Certificado digital (.pfx o .p12) del negocio</p>
                  </div>

                  {/* Contraseña del Certificado */}
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contraseña del Certificado <span className="text-red-500">*</span>
                    </label>
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      placeholder="••••••••••••••••"
                      value={emissionConfig.sunat.certificatePassword}
                      onChange={(e) => setEmissionConfig({
                        ...emissionConfig,
                        sunat: { ...emissionConfig.sunat, certificatePassword: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords(!showPasswords)}
                      className="absolute right-3 top-9 text-gray-500 hover:text-gray-700"
                    >
                      {showPasswords ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                    <p className="text-xs text-gray-500 mt-1">Password para desencriptar el certificado</p>
                  </div>

                  {/* Homologado */}
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <input
                      type="checkbox"
                      id="homologated"
                      checked={emissionConfig.sunat.homologated}
                      onChange={(e) => setEmissionConfig({
                        ...emissionConfig,
                        sunat: { ...emissionConfig.sunat, homologated: e.target.checked }
                      })}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <label htmlFor="homologated" className="text-sm text-gray-700 cursor-pointer">
                      <strong>Certificado Homologado por SUNAT</strong>
                      <p className="text-xs text-gray-500">Marca si tu certificado ya fue homologado en SUNAT</p>
                    </label>
                  </div>

                  {/* Warning para producción */}
                  {emissionConfig.sunat.environment === 'production' && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                      <strong>⚠️ Producción:</strong> Los comprobantes serán enviados a SUNAT de forma real.
                    </div>
                  )}
                </div>
              )}

              {/* Botones */}
              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  disabled={isSavingConfig}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveEmissionConfig}
                  className="flex-1 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50 font-semibold flex items-center justify-center gap-2"
                  disabled={isSavingConfig}
                >
                  {isSavingConfig ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Guardar Configuración
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
