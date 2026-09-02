import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Calendar,
  Shield
} from 'lucide-react';
import { PLANS, SELLABLE_PLAN_IDS, extendSubscription } from '@/services/subscriptionService';
import { doc, updateDoc, setDoc, getDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function UserDetailsModal({ user, type, onClose, onRegisterPayment, onChangePlan, loading, toast, onUserUpdated, customPlans = {} }) {
  // Arranca con el plan ACTUAL del cliente (post-migración siempre es uno del
  // catálogo vendible): renovar = abrir el modal y registrar, sin re-elegir.
  const [selectedPlanForPayment, setSelectedPlanForPayment] = useState(
    SELLABLE_PLAN_IDS.includes(user.plan) ? user.plan : 'mensual'
  );
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('Transferencia');
  const [selectedPlan, setSelectedPlan] = useState(user.plan);
  const [addIgv, setAddIgv] = useState(false);
  // Cuando el cobro no coincide con el precio pactado, el admin decide si ese
  // monto pasa a ser el nuevo precio de renovación. Antes se ignoraba en
  // silencio y quedaban precios viejos cobrando planes nuevos.
  const [actualizarPrecioPactado, setActualizarPrecioPactado] = useState(false);
  const [useCustomDate, setUseCustomDate] = useState(false);
  const [customEndDate, setCustomEndDate] = useState('');
  // Corrección manual del vencimiento (sin registrar pago): sirve para arreglar
  // altas duplicadas, cortesías o errores de carga.
  const [expiryDate, setExpiryDate] = useState('');
  const [savingExpiry, setSavingExpiry] = useState(false);
  // Unificar planes estándar + personalizados
  const allPlans = { ...PLANS, ...customPlans };

  // Actualizar precio cuando cambia el plan seleccionado. Si renueva SU mismo
  // plan y tiene precio pactado (renewalPrice, congelado en la migración o al
  // registrarse), se sugiere ESE monto — no el catálogo. Editable igual.
  useEffect(() => {
    const plan = allPlans[selectedPlanForPayment];
    if (plan) {
      const base = (selectedPlanForPayment === user.plan && user.renewalPrice != null)
        ? user.renewalPrice
        : (plan.totalPrice || 0);
      setPaymentAmount(addIgv ? parseFloat((base * 1.18).toFixed(2)) : base);
    }
    setActualizarPrecioPactado(false);
  }, [selectedPlanForPayment, addIgv]);

  // Precio pactado vigente para ESTE plan (null si está cambiando de plan: ahí
  // el monto cobrado se congela solo y no hay nada que decidir).
  const precioPactado = (selectedPlanForPayment === user.plan && user.renewalPrice != null)
    ? Number(user.renewalPrice)
    : null;
  const difiereDelPactado = precioPactado !== null
    && Math.abs(Number(paymentAmount) - precioPactado) > 0.01;

  const periodEnd = user.currentPeriodEnd?.toDate?.() || user.currentPeriodEnd;
  const now = new Date();
  const baseDate = periodEnd && new Date(periodEnd) > now ? new Date(periodEnd) : now;

  // Calcular nueva fecha según el plan seleccionado
  const selectedPlanConfig = allPlans[selectedPlanForPayment];
  const monthsToAdd = selectedPlanConfig?.months || 3;
  const calculatedNewDate = new Date(baseDate);
  calculatedNewDate.setMonth(calculatedNewDate.getMonth() + monthsToAdd);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">
                {type === 'payment' && 'Registrar Pago'}
                {type === 'edit' && 'Editar Suscripción'}
                {type === 'expiry' && 'Cambiar Vencimiento'}
              </h2>
              <div className="flex items-center gap-2">
                <p className="text-gray-600">{user.businessName || user.email}</p>
                {/* Acceso directo al catálogo virtual */}
                {user.catalogEnabled && (user.customDomain || user.catalogSlug) && (() => {
                  const url = user.customDomain
                    ? `https://${user.customDomain}`
                    : `${window.location.origin}/catalogo/${user.catalogSlug}`
                  return (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 text-gray-700 hover:bg-gray-100 text-xs font-medium rounded transition-colors"
                      title={`Abrir catálogo: ${url}`}
                    >
                      tienda online ↗
                    </a>
                  )
                })()}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>

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
                  useCustomDate && customEndDate ? new Date(customEndDate) : null,
                  {
                    ...(addIgv ? { igvInfo: { includesIgv: true, baseAmount: selectedPlanConfig?.totalPrice || 0, igvAmount: parseFloat(((selectedPlanConfig?.totalPrice || 0) * 0.18).toFixed(2)) } } : {}),
                    updateRenewalPrice: difiereDelPactado && actualizarPrecioPactado,
                  }
                );
              }}
              className="space-y-4"
            >
              {/* Selector de Plan */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Seleccionar Plan
                </label>

                {/* Planes vendibles (catálogo actual — los legacy ya migraron y no se ofrecen) */}
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-gray-700" />
                    Planes
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {Object.entries(PLANS).filter(([key, plan]) => SELLABLE_PLAN_IDS.includes(key) && !plan.isAddon).map(([key, plan]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedPlanForPayment(key)}
                        className={`p-4 border-2 rounded-lg transition-all ${
                          selectedPlanForPayment === key
                            ? 'border-primary-600 bg-gray-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="text-center">
                          {plan.badge && (
                            <span className="inline-block px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-900 rounded-full mb-2">
                              {plan.badge}
                            </span>
                          )}
                          <p className="font-semibold text-gray-900 text-sm">{plan.name}</p>
                          <p className="text-2xl font-semibold text-gray-700 my-2">
                            S/ {plan.totalPrice}
                          </p>
                          <p className="text-xs text-gray-600">
                            S/ {plan.pricePerMonth.toFixed(2)}/mes
                          </p>
                          <p className="text-xs text-gray-700 font-medium mt-1">
                            {plan.limits?.maxInvoicesPerMonth === -1 ? 'Ilimitados' : `${plan.limits?.maxInvoicesPerMonth} compr./mes`}
                          </p>
                          {plan.limits?.maxBranches === 1 && (
                            <p className="text-xs text-gray-500 mt-0.5">1 sucursal</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Los add-ons y planes personalizados ya no se ofrecen (15-jul-2026):
                    los comprobantes extra se ajustan a mano en el límite (sin registrar
                    pago) y los custom quedaron absorbidos por el catálogo (ilimitado_anual). */}
              </div>

              {/* Monto Total (editable) */}
              <div className={`p-4 border rounded-lg ${selectedPlanConfig?.isAddon ? 'bg-gray-50 border-gray-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex justify-between items-center gap-3">
                  <span className={`font-semibold ${selectedPlanConfig?.isAddon ? 'text-gray-900' : 'text-gray-900'}`}>Monto Total a Cobrar:</span>
                  <div className="flex items-center gap-1">
                    <span className={`text-lg font-semibold ${selectedPlanConfig?.isAddon ? 'text-gray-700' : 'text-gray-700'}`}>S/</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                      className={`w-32 text-2xl font-semibold text-right border-2 rounded-lg px-2 py-1 focus:ring-2 ${
                        selectedPlanConfig?.isAddon
                          ? 'text-gray-700 border-gray-300 focus:ring-primary-500'
                          : 'text-gray-700 border-gray-300 focus:ring-primary-500'
                      }`}
                    />
                  </div>
                </div>
                <p className={`text-sm mt-1 ${selectedPlanConfig?.isAddon ? 'text-gray-700' : 'text-gray-700'}`}>
                  {selectedPlanConfig?.isAddon ? (
                    <>
                      {selectedPlanConfig.name} - Se agregarán +{selectedPlanConfig.addonAmount} comprobantes al límite actual
                    </>
                  ) : (
                    <>
                      Plan de {selectedPlanConfig?.months} {selectedPlanConfig?.months === 1 ? 'mes' : 'meses'} -
                      S/ {selectedPlanConfig?.pricePerMonth}/mes
                      {!addIgv && paymentAmount !== selectedPlanConfig?.totalPrice && (
                        <span className="ml-2 text-gray-700 font-medium">(monto modificado)</span>
                      )}
                    </>
                  )}
                </p>

                {/* El cobro no coincide con el precio pactado: decidirlo, no ignorarlo */}
                {difiereDelPactado && (
                  <div className="mt-3 p-3 bg-gray-50 border border-gray-300 rounded-lg">
                    <p className="text-sm text-gray-900">
                      Su precio pactado es <strong>S/ {precioPactado.toFixed(2)}</strong> y estás
                      cobrando <strong>S/ {Number(paymentAmount).toFixed(2)}</strong>.
                    </p>
                    <label className="flex items-start gap-2 cursor-pointer mt-2">
                      <input
                        type="checkbox"
                        checked={actualizarPrecioPactado}
                        onChange={(e) => setActualizarPrecioPactado(e.target.checked)}
                        className="w-4 h-4 mt-0.5 text-gray-700 border-gray-300 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-900">
                        Que S/ {Number(paymentAmount).toFixed(2)} pase a ser su nuevo precio de renovación
                      </span>
                    </label>
                    <p className="text-xs text-gray-700 mt-1.5">
                      Sin marcar, sigue pactado en S/ {precioPactado.toFixed(2)} y eso es lo que se le
                      cobrará al renovar. Déjalo sin marcar si cobraste varios períodos juntos o un
                      monto parcial.
                    </p>
                  </div>
                )}

                {/* Checkbox IGV */}
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addIgv}
                      onChange={(e) => setAddIgv(e.target.checked)}
                      className="w-4 h-4 text-gray-700 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">Agregar IGV (18%)</span>
                  </label>
                  {addIgv && selectedPlanConfig && (
                    <div className="mt-2 text-xs text-gray-600 bg-white/60 rounded px-3 py-2 space-y-0.5">
                      <div className="flex justify-between">
                        <span>Base (precio plan):</span>
                        <span>S/ {(selectedPlanConfig.totalPrice || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>IGV (18%):</span>
                        <span>S/ {((selectedPlanConfig.totalPrice || 0) * 0.18).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-gray-700 pt-1 border-t border-gray-200">
                        <span>Total:</span>
                        <span>S/ {((selectedPlanConfig.totalPrice || 0) * 1.18).toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
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
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-5 h-5 text-gray-700" />
                  <p className="font-semibold text-gray-900">
                    {useCustomDate ? 'Fecha de Vencimiento Personalizada' : 'Vista Previa de Renovación'}
                  </p>
                </div>

                {useCustomDate ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-2">
                        Fecha de fin de suscripción:
                      </label>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        min={format(now, 'yyyy-MM-dd')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white"
                      />
                    </div>
                    {customEndDate && (
                      <div className="pt-2 border-t border-gray-200">
                        <p className="text-sm text-gray-900">
                          <strong>Vencimiento actual:</strong>{' '}
                          {periodEnd ? format(new Date(periodEnd), "dd/MM/yyyy", { locale: es }) : 'N/A'}
                        </p>
                        <p className="text-lg font-semibold text-gray-900 mt-2">
                          <strong>Nuevo vencimiento:</strong>{' '}
                          {format(new Date(customEndDate), "dd/MM/yyyy", { locale: es })}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1 text-sm text-gray-900">
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
                    <p className="text-lg font-semibold text-gray-900 pt-2 border-t border-gray-200">
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
                  {loading ? 'Procesando...' : `Registrar Pago de S/ ${parseFloat(paymentAmount).toFixed(2)}`}
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
          {/* Cambiar vencimiento a mano: NO registra pago ni toca el historial.
              Es una corrección administrativa (alta duplicada, cortesía, error). */}
          {type === 'expiry' && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const userId = user.userId || user.id;
                if (!userId) { toast?.error('No se encontró el ID del usuario'); return; }
                if (!expiryDate) { toast?.error('Elige una fecha'); return; }
                setSavingExpiry(true);
                try {
                  // Se fija al final del día para que ese día siga siendo válido
                  await extendSubscription(userId, new Date(`${expiryDate}T23:59:59`));
                  toast?.success('Vencimiento actualizado');
                  onUserUpdated?.();
                  onClose();
                } catch (err) {
                  console.error('Error al cambiar vencimiento:', err);
                  toast?.error('No se pudo cambiar el vencimiento');
                } finally {
                  setSavingExpiry(false);
                }
              }}
              className="space-y-4"
            >
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-xs text-gray-500">Vencimiento actual</p>
                <p className="text-lg font-semibold text-gray-900">
                  {periodEnd ? format(new Date(periodEnd), "d 'de' MMMM 'de' yyyy", { locale: es }) : 'Sin fecha'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nueva fecha de vencimiento
                </label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>

              {/* Atajos: calculados desde HOY */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">Atajos desde hoy</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: '1 mes', months: 1 },
                    { label: '6 meses', months: 6 },
                    { label: '1 año', months: 12 },
                  ].map(({ label, months }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setMonth(d.getMonth() + months);
                        setExpiryDate(d.toISOString().slice(0, 10));
                      }}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border border-gray-300 text-gray-600 bg-white hover:border-primary-400 hover:text-primary-700"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Avisar qué implica la fecha elegida */}
              {expiryDate && (() => {
                const chosen = new Date(`${expiryDate}T23:59:59`);
                const isPast = chosen.getTime() <= Date.now();
                return (
                  <div className={`p-3 rounded-lg border text-sm ${
                    isPast ? 'bg-gray-50 border-gray-200 text-gray-900' : 'bg-gray-50 border-gray-200 text-gray-900'
                  }`}>
                    {isPast
                      ? 'Esa fecha ya pasó: la cuenta quedará SUSPENDIDA (sin acceso).'
                      : 'La cuenta quedará ACTIVA hasta esa fecha.'}
                  </div>
                );
              })()}

              <p className="text-xs text-gray-500">
                Esto solo corrige la fecha. No registra ningún pago ni modifica el historial.
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingExpiry || !expiryDate}
                  className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {savingExpiry ? 'Guardando...' : 'Guardar vencimiento'}
                </button>
              </div>
            </form>
          )}

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
                  <optgroup label="Planes Estándar">
                    {Object.entries(PLANS).filter(([key, plan]) => (SELLABLE_PLAN_IDS.includes(key) || key === 'enterprise') && !plan.isAddon).map(([key, plan]) => (
                      <option key={key} value={key}>
                        {plan.name} - S/ {plan.pricePerMonth}/mes
                      </option>
                    ))}
                  </optgroup>
                  {/* Los planes personalizados ya no se ofrecen (absorbidos por el catálogo, 15-jul-2026) */}
                </select>
              </div>

              {/* Mostrar características del plan seleccionado */}
              {allPlans[selectedPlan] && allPlans[selectedPlan].limits && (() => {
                const sp = allPlans[selectedPlan];
                const isCustom = sp.category === 'custom';
                return (
                  <div className={`p-4 border-2 rounded-lg ${
                    isCustom ? 'bg-gray-50 border-gray-200' :
                    sp.category === 'qpse' ? 'bg-gray-50 border-gray-200' :
                    sp.category === 'sunat_direct' ? 'bg-gray-50 border-gray-200' :
                    'bg-gray-50 border-gray-200'
                  }`}>
                    <h4 className="font-semibold text-gray-900 mb-2">
                      Características del plan:
                      {isCustom && <span className="ml-2 text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">Custom</span>}
                    </h4>
                    <ul className="space-y-1 text-sm text-gray-700">
                      <li className="font-semibold">
                        • Comprobantes/mes: {
                          sp.limits.maxInvoicesPerMonth === -1
                            ? '∞ ILIMITADO'
                            : `${sp.limits.maxInvoicesPerMonth} comprobantes`
                        }
                      </li>
                      <li>• Método de emisión: {
                        sp.emissionMethod === 'qpse' || sp.category === 'qpse' ? 'QPse (Factuya firma)' :
                        sp.emissionMethod === 'sunat_direct' || sp.category === 'sunat_direct' ? 'SUNAT Directo (CDT propio)' :
                        sp.emissionMethod === 'offline' ? 'Sin conexión' :
                        'Flexible'
                      }</li>
                      <li>• Clientes: {sp.limits.maxCustomers === -1 ? 'Ilimitado' : sp.limits.maxCustomers}</li>
                      <li>• Productos: {sp.limits.maxProducts === -1 ? 'Ilimitado' : sp.limits.maxProducts}</li>
                      <li>• Integración SUNAT: {sp.limits.sunatIntegration ? 'Sí' : 'No'}</li>
                      <li>• Multi-usuario: {sp.limits.multiUser ? 'Sí' : 'No'}</li>
                    </ul>
                    {(sp.emissionMethod === 'qpse' || sp.category === 'qpse') && (
                      <div className="mt-3 p-2 bg-gray-100 border border-gray-300 rounded text-xs text-gray-900">
                        Con QPse no necesitas certificado digital. Factuya firma por ti.
                      </div>
                    )}
                    {(sp.emissionMethod === 'sunat_direct' || sp.category === 'sunat_direct') && (
                      <div className="mt-3 p-2 bg-gray-100 border border-gray-300 rounded text-xs text-gray-900">
                        Con SUNAT Directo usas tu certificado y tienes comprobantes ilimitados.
                      </div>
                    )}
                    {sp.notes && (
                      <p className="mt-2 text-xs text-gray-500 italic">Nota: {sp.notes}</p>
                    )}
                  </div>
                );
              })()}

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
