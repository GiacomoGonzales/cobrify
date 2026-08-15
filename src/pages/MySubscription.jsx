import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { useToast } from '@/contexts/ToastContext';
import { DEFAULT_BRANDING } from '@/services/brandingService';
import {
  PLANS,
  createFlowRenewalPayment,
  createCardRegistration,
  confirmCardRegistration,
  cancelAutoRenew,
  PLAN_TIERS,
  resolvePlanTier,
  getTierPrice,
  getAnnualSavings,
  ONLINE_PAYMENTS_ENABLED,
} from '@/services/subscriptionService';
import { getVendedorByLinkedUser, getVendedorClients } from '@/services/vendedorService';
import { useSubscriptionPaymentInfo } from '@/hooks/useSubscriptionPaymentInfo';
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
  Clock,
  Loader2,
  Store,
  Phone,
  X,
  ShieldCheck
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import yapeLogo from '@/assets/wallets/yape.png';

export default function MySubscription() {
  const { subscription, user, getBusinessId } = useAuth();
  const { branding } = useBranding();
  const toast = useToast();
  // Qué botón está iniciando el pago (id del plan de esa tarjeta, o 'legacy').
  // Es por-botón y no un booleano global: si no, al pulsar uno TODAS las tarjetas
  // mostraban "Abriendo…". `paying` sigue sirviendo para bloquear el resto.
  const [payingPlan, setPayingPlan] = useState(null);
  const paying = payingPlan !== null;
  // Ciclo de cobro elegido en el selector de planes ('monthly' | 'annual').
  // Arranca en el ciclo que el cliente ya tiene (ver efecto de sincronización).
  const [billingCycle, setBillingCycle] = useState('monthly');

  // Checkout de Flow embebido en un MODAL dentro de la app (verificado: pay.php
  // no envía X-Frame-Options ni frame-ancestors, así que permite iframe).
  const [flowUrl, setFlowUrl] = useState(null);

  // Renovación automática: el modal de Flow se reusa para el REGISTRO de la
  // tarjeta, así que hay que distinguir a qué volvió el cliente (?flow=1 es un
  // pago; ?flowcard=1 es un registro de tarjeta).
  const [registeringCard, setRegisteringCard] = useState(false);
  const [cancelingAutoRenew, setCancelingAutoRenew] = useState(false);

  // Si esta vista se cargó DENTRO del iframe/popup de retorno de Flow
  // (urlReturn=...?flow=1), avisar a la ventana principal y no renderizar de más:
  // el pago ya quedó registrado por el webhook y la vista principal se actualiza
  // en tiempo real (onSnapshot de la suscripción).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const esPago = params.get('flow') === '1';
    const esTarjeta = params.get('flowcard') === '1';
    if (!esPago && !esTarjeta) return;
    const mensaje = { type: esTarjeta ? 'flow-card-return' : 'flow-return' };
    if (window.opener) {
      try { window.opener.postMessage(mensaje, window.location.origin); } catch { /* noop */ }
      window.close();
    } else if (window.parent && window.parent !== window) {
      try { window.parent.postMessage(mensaje, window.location.origin); } catch { /* noop */ }
    }
  }, []);

  // El selector arranca mostrando el ciclo que el cliente ya paga (si tiene anual,
  // abre en anual). Los planes legacy (semestral, qpse_*) caen en mensual.
  useEffect(() => {
    if (!subscription?.plan) return;
    const { cycle } = resolvePlanTier(subscription.plan);
    if (cycle) setBillingCycle(cycle);
  }, [subscription?.plan]);

  // La ventana principal escucha el aviso de retorno y cierra el modal
  useEffect(() => {
    const onMsg = async (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'flow-return') {
        setFlowUrl(null);
        setPayingPlan(null);
        toast.success('Pago procesado. Tu suscripción se actualizará en unos segundos.');
        return;
      }
      // Registro de tarjeta: se CONFIRMA contra Flow antes de dar nada por
      // hecho — el retorno del navegador se puede falsificar.
      if (e.data?.type === 'flow-card-return') {
        setFlowUrl(null);
        try {
          const businessId = getBusinessId();
          const { getAuth } = await import('firebase/auth');
          const idToken = await getAuth().currentUser?.getIdToken();
          const res = await confirmCardRegistration(businessId, idToken);
          if (res.success && res.registered) {
            toast.success(`Tarjeta registrada. Tu plan se renovará solo.`);
          } else {
            toast.error(res.error || 'No se pudo confirmar el registro de la tarjeta');
          }
        } catch (err) {
          toast.error('No se pudo confirmar el registro de la tarjeta');
        } finally {
          setRegisteringCard(false);
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Renovación / cambio de plan con pasarela (Flow) — solo clientes directos.
  // targetPlan = null → renueva el plan actual; targetPlan = 'anual' etc → upgrade.
  // buttonKey identifica la tarjeta pulsada para mostrar "Abriendo…" solo en ella.
  // Los de reseller/vendedor pagan por su intermediario (el server lo re-valida).
  const handlePayWithFlow = async (targetPlan = null, buttonKey = null) => {
    if (paying) return;
    setPayingPlan(buttonKey || targetPlan || 'current');
    try {
      const businessId = getBusinessId();
      const { getAuth } = await import('firebase/auth');
      const idToken = await getAuth().currentUser?.getIdToken();
      if (!idToken) throw new Error('No se pudo obtener el token de autenticación');
      const result = await createFlowRenewalPayment(businessId, idToken, window.location.origin, targetPlan);
      if (!result.success || !result.url) {
        toast.error(result.error || 'No se pudo iniciar el pago');
        setPayingPlan(null);
        return;
      }
      setFlowUrl(result.url); // abre el modal embebido
    } catch (e) {
      toast.error(e.message || 'Error al iniciar el pago');
      setPayingPlan(null);
    }
  };

  // Activar renovación automática: abre el registro de tarjeta de Flow en el
  // mismo modal embebido del pago. Cobrify nunca ve el número de tarjeta.
  const handleRegisterCard = async () => {
    if (registeringCard) return;
    setRegisteringCard(true);
    try {
      const businessId = getBusinessId();
      const { getAuth } = await import('firebase/auth');
      const idToken = await getAuth().currentUser?.getIdToken();
      if (!idToken) throw new Error('No se pudo obtener el token de autenticación');
      const result = await createCardRegistration(businessId, idToken, window.location.origin);
      if (!result.success || !result.url) {
        toast.error(result.error || 'No se pudo iniciar el registro');
        setRegisteringCard(false);
        return;
      }
      setFlowUrl(result.url);
    } catch (e) {
      toast.error(e.message || 'Error al iniciar el registro');
      setRegisteringCard(false);
    }
  };

  const handleCancelAutoRenew = async () => {
    if (cancelingAutoRenew) return;
    if (!window.confirm('¿Desactivar la renovación automática? Tendrás que renovar manualmente antes de que venza tu plan.')) return;
    setCancelingAutoRenew(true);
    try {
      const businessId = getBusinessId();
      const { getAuth } = await import('firebase/auth');
      const idToken = await getAuth().currentUser?.getIdToken();
      const res = await cancelAutoRenew(businessId, idToken);
      if (res.success) toast.success('Renovación automática desactivada');
      else toast.error(res.error || 'No se pudo desactivar');
    } finally {
      setCancelingAutoRenew(false);
    }
  };

  const closeFlowModal = () => {
    setFlowUrl(null);
    setPayingPlan(null);
    toast.info('Si completaste el pago, tu suscripción se actualizará en unos segundos.');
  };

  // Vendedor asignado a ESTA cuenta (no confundir con `vendedorInfo` de más abajo,
  // que responde a "el usuario logueado ES un vendedor"). Mismo hook que usa la
  // pantalla de suscripción vencida, así el cliente ve siempre el mismo contacto.
  const { seller: assignedSeller } = useSubscriptionPaymentInfo(subscription)
  const assignedVendedor = subscription?.vendedorId ? assignedSeller : null

  // Contacto de soporte: si la cuenta pertenece a un RESELLER, mostrar SUS datos
  // (WhatsApp/email de su branding); si tiene VENDEDOR asignado, el teléfono del
  // vendedor —es con quien coordina el pago, igual que en los avisos de vencimiento—;
  // si es cliente directo de Cobrify, el soporte de Cobrify. No se mezclan (un
  // cliente de reseller no debe ver a Cobrify).
  const isResellerAccount = !!(branding?.companyName && branding.companyName !== DEFAULT_BRANDING.companyName)
  const supportName = isResellerAccount
    ? branding.companyName
    : (assignedVendedor?.name || 'Cobrify')
  const supportWhatsapp = (isResellerAccount
    ? (branding.whatsapp || '')
    : (assignedVendedor?.phone || '+51 900 434 988')).trim()
  // El vendedor no tiene correo en su ficha; el de Cobrify se mantiene porque
  // estas cuentas siguen siendo clientes de Cobrify (el vendedor es su asesor).
  const supportEmail = (isResellerAccount ? (branding.supportEmail || '') : 'soporte@cobrifyperu.com').trim()
  // wa.me necesita solo dígitos; si es un celular peruano de 9 dígitos, anteponer 51.
  const supportWaDigits = (() => {
    const d = supportWhatsapp.replace(/\D/g, '')
    return d.length === 9 ? `51${d}` : d
  })()

  const [vendedorInfo, setVendedorInfo] = useState(null)
  const [assignedClients, setAssignedClients] = useState([])
  const [loadingClients, setLoadingClients] = useState(false)

  // Verificar si el usuario es un vendedor vinculado
  useEffect(() => {
    if (!user?.uid) return
    const checkVendedor = async () => {
      const result = await getVendedorByLinkedUser(user.uid)
      if (result.success) {
        setVendedorInfo(result.data)
        // Cargar clientes asignados
        setLoadingClients(true)
        const clientsResult = await getVendedorClients(result.data.id)
        if (clientsResult.success) {
          setAssignedClients(clientsResult.data)
        }
        setLoadingClients(false)
      }
    }
    checkVendedor()
  }, [user?.uid])

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

  // Datos para renovación / cambio de plan (solo clientes directos de Cobrify)
  const isDirectClient = !isResellerAccount && !vendedorInfo && !subscription.resellerId && !subscription.vendedorId;
  // Monto de renovación del plan ACTUAL: el precio pactado congelado manda sobre
  // el catálogo (así un cliente viejo renueva a su precio, no al de la lista).
  const renewAmount = subscription.renewalPrice != null ? subscription.renewalPrice : planInfo.totalPrice;
  // Dónde está parado hoy dentro de la grilla nivel × ciclo (null si es legacy).
  const { tier: currentTier, cycle: currentCycle } = resolvePlanTier(subscription.plan);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi Suscripción</h1>
        <p className="text-gray-600">Información sobre tu plan y estado de cuenta</p>
      </div>

      {/* Hero: estado + plan actual */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className={`h-1.5 ${isActive ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-red-400 to-rose-500'}`} />
        <div className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl ${isActive ? 'bg-green-50' : 'bg-red-50'}`}>
              {isActive
                ? <CheckCircle className="w-7 h-7 text-green-600" />
                : <XCircle className="w-7 h-7 text-red-600" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-gray-900">
                  {subscription.planName || planInfo.name || subscription.plan}
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {isActive ? 'Activa' : 'Suspendida'}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {isActive
                  ? <>Vence el {periodEnd ? format(new Date(periodEnd), "d 'de' MMMM 'de' yyyy", { locale: es }) : '—'}</>
                  : (subscription.blockReason || 'Tu suscripción está suspendida')}
              </p>
            </div>
          </div>
          {isActive && daysRemaining >= 0 && (
            <div className={`text-center px-5 py-3 rounded-xl ${isExpiringSoon ? 'bg-amber-50' : 'bg-gray-50'}`}>
              <p className={`text-3xl font-bold ${isExpiringSoon ? 'text-amber-600' : 'text-gray-900'}`}>{daysRemaining}</p>
              <p className="text-xs text-gray-500">{daysRemaining === 1 ? 'día restante' : 'días restantes'}</p>
            </div>
          )}
        </div>
      </div>

      {/* RENOVACIÓN AUTOMÁTICA — solo clientes directos y con el cobro en línea
          activo. La tarjeta se registra en Flow: Cobrify nunca ve el número,
          solo la marca y los últimos dígitos que Flow devuelve. El cobro lo
          dispara nuestro programador diario con el precio PACTADO de cada
          cliente (renewalPrice congelado), no con el de catálogo. */}
      {isDirectClient && ONLINE_PAYMENTS_ENABLED && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-gray-900">Renovación automática</h3>
                {subscription.autoRenew && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700">
                    ACTIVA
                  </span>
                )}
              </div>

              {subscription.autoRenew ? (
                <>
                  <p className="text-gray-500 text-sm mt-1">
                    Tu plan se renueva solo el día que vence. No tienes que hacer nada.
                  </p>
                  {subscription.flowCard?.last4 && (
                    <div className="flex items-center gap-2 mt-3 text-sm text-gray-700">
                      <CreditCard className="w-4 h-4 text-gray-400" />
                      <span>
                        {subscription.flowCard.brand || 'Tarjeta'} terminada en{' '}
                        <strong>{subscription.flowCard.last4}</strong>
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-gray-500 text-sm mt-1">
                    Registra tu tarjeta una vez y tu plan se renovará solo cada período.
                    Puedes desactivarla cuando quieras.
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    Los datos de tu tarjeta los guarda Flow, nuestra pasarela de pago. Cobrify no los almacena.
                  </p>
                </>
              )}
            </div>

            <div className="flex-shrink-0">
              {subscription.autoRenew ? (
                <button
                  onClick={handleCancelAutoRenew}
                  disabled={cancelingAutoRenew}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  {cancelingAutoRenew ? 'Desactivando…' : 'Desactivar'}
                </button>
              ) : (
                <button
                  onClick={handleRegisterCard}
                  disabled={registeringCard}
                  className="px-5 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 inline-flex items-center gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  {registeringCard ? 'Abriendo…' : 'Activar renovación automática'}
                </button>
              )}
            </div>
          </div>

          {subscription.autoRenewDisabledReason && !subscription.autoRenew && (
            <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
              Desactivamos la renovación automática: {subscription.autoRenewDisabledReason.toLowerCase()}.
              Puedes volver a activarla con otra tarjeta.
            </div>
          )}
        </div>
      )}

      {/* Renovar o cambiar de plan — solo clientes directos.
          Grilla nivel × ciclo: 3 planes y un interruptor mensual/anual. El plan que
          ya tiene el cliente se marca "Tu plan" y su botón renueva al precio pactado
          (renewalPrice congelado); los demás cobran precio de catálogo y cambian
          el plan al confirmarse el pago. */}
      {isDirectClient && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-gray-900">Renueva o cambia tu plan</h3>
                {!ONLINE_PAYMENTS_ENABLED && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                    PRÓXIMAMENTE
                  </span>
                )}
              </div>
              <p className="text-gray-500 text-sm mt-0.5">
                {ONLINE_PAYMENTS_ENABLED
                  ? 'Paga en segundos y extiende tu suscripción al instante.'
                  : 'Estos son los planes disponibles. El pago en línea se activará muy pronto.'}
              </p>
              <div className="flex items-center gap-2.5 mt-3">
                <img src={yapeLogo} alt="Yape" className="h-6 w-auto rounded" />
                <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 rounded-full px-2.5 py-1">
                  <CreditCard className="w-3.5 h-3.5" /> Tarjeta
                </span>
                <span className="text-xs text-gray-600 bg-gray-100 rounded-full px-2.5 py-1">QR · Billeteras</span>
              </div>
            </div>

            {/* Interruptor de ciclo */}
            <div className="inline-flex items-center bg-gray-100 rounded-xl p-1 self-start">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  billingCycle === 'monthly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Mensual
              </button>
              <button
                onClick={() => setBillingCycle('annual')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors inline-flex items-center gap-1.5 ${
                  billingCycle === 'annual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Anual
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-1.5 py-0.5">
                  AHORRA
                </span>
              </button>
            </div>
          </div>

          {/* Aviso mientras el cobro en línea está apagado (ver ONLINE_PAYMENTS_ENABLED) */}
          {!ONLINE_PAYMENTS_ENABLED && (
            <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900">El pago en línea estará disponible muy pronto</p>
                <p className="text-sm text-amber-800 mt-0.5">
                  Estamos terminando de habilitar el pago con Yape, tarjeta y billeteras desde esta página.
                  Mientras tanto, para renovar o cambiar de plan escríbenos por WhatsApp
                  {supportWhatsapp && (
                    <>
                      {' '}al{' '}
                      <a
                        href={`https://wa.me/${supportWaDigits}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold underline"
                      >
                        {supportWhatsapp}
                      </a>
                    </>
                  )}
                  .
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
            {PLAN_TIERS.map((tier) => {
              const planId = tier.cycles[billingCycle];
              const catalogPrice = getTierPrice(tier, billingCycle);
              const savings = getAnnualSavings(tier);
              const isCurrent = currentTier?.id === tier.id && currentCycle === billingCycle;
              // El plan propio renueva al precio pactado; los otros, al de catálogo.
              const shownPrice = isCurrent && renewAmount != null ? Number(renewAmount) : catalogPrice;
              // Ciclo no disponible para este nivel (ej. Básico no tiene anual)
              if (!planId) {
                return (
                  <div key={tier.id} className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-5 flex flex-col">
                    <p className="text-base font-bold text-gray-400">{tier.name}</p>
                    <p className="text-sm text-gray-400 mt-1">Disponible solo en plan mensual.</p>
                    <button
                      onClick={() => setBillingCycle('monthly')}
                      className="mt-auto pt-4 text-sm text-primary-600 font-medium hover:underline text-left"
                    >
                      Ver mensual
                    </button>
                  </div>
                );
              }
              return (
                <div
                  key={tier.id}
                  className={`relative rounded-2xl p-5 flex flex-col transition-all ${
                    isCurrent
                      ? 'border-2 border-primary-500 bg-primary-50/40'
                      : 'border border-gray-200 bg-white hover:border-primary-300 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-bold text-gray-900">{tier.name}</p>
                      <p className="text-xs text-gray-500">{tier.tagline}</p>
                    </div>
                    {isCurrent ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary-600 text-white whitespace-nowrap">
                        Tu plan
                      </span>
                    ) : tier.popular ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 whitespace-nowrap">
                        Popular
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3">
                    <span className="text-2xl font-bold text-gray-900">S/ {Number(shownPrice).toFixed(2)}</span>
                    <span className="text-sm text-gray-500"> / {billingCycle === 'annual' ? 'año' : 'mes'}</span>
                    {billingCycle === 'annual' && savings > 0 && (
                      <p className="text-xs font-semibold text-emerald-600 mt-0.5">
                        Ahorras S/ {savings.toFixed(2)} al año
                      </p>
                    )}
                    {isCurrent && renewAmount != null && catalogPrice != null && Number(renewAmount) !== catalogPrice && (
                      <p className="text-xs text-gray-500 mt-0.5">Tu precio pactado</p>
                    )}
                  </div>

                  <ul className="mt-3 space-y-1.5 flex-1">
                    {tier.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        {h}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-2">
                    <button
                      onClick={() => handlePayWithFlow(isCurrent ? null : planId, planId)}
                      disabled={paying || !ONLINE_PAYMENTS_ENABLED}
                      className={`w-full px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                        !ONLINE_PAYMENTS_ENABLED
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : isCurrent
                          ? 'bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60'
                          : 'border border-primary-600 text-primary-700 hover:bg-primary-50 disabled:opacity-60'
                      }`}
                    >
                      {!ONLINE_PAYMENTS_ENABLED ? 'Próximamente'
                        : payingPlan === planId ? 'Abriendo…'
                        : isCurrent ? 'Renovar ahora' : 'Cambiar a este plan'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cliente en un plan legacy (ej. semestral): puede renovar el suyo igual */}
          {!currentTier && (
            <div className="mt-4 rounded-xl bg-gray-50 border border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-gray-600">
                Tu plan actual es <span className="font-semibold text-gray-900">{subscription.planName || planInfo.name || subscription.plan}</span>
                {renewAmount != null && <> — renovación S/ {Number(renewAmount).toFixed(2)}</>}
              </p>
              <button
                onClick={() => handlePayWithFlow(null, 'legacy')}
                disabled={paying || !ONLINE_PAYMENTS_ENABLED}
                className={`px-5 py-2.5 rounded-xl font-semibold text-sm whitespace-nowrap transition-colors ${
                  !ONLINE_PAYMENTS_ENABLED
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60'
                }`}
              >
                {!ONLINE_PAYMENTS_ENABLED ? 'Próximamente'
                  : payingPlan === 'legacy' ? 'Abriendo…' : 'Renovar mi plan actual'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal de pago embebido (checkout de Flow en iframe, escalado al 67%).
          Portal a document.body + z-[9999], igual que ui/Modal.jsx: si se renderiza
          dentro del layout, el header queda por encima del overlay (hueco arriba). */}
      {flowUrl && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[540px] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-green-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Pago seguro</p>
                  <p className="text-xs text-gray-500">Procesado por Flow</p>
                </div>
              </div>
              <button
                onClick={closeFlowModal}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative bg-gray-50" style={{ height: '72vh', overflow: 'hidden' }}>
              {/* Escala 67%: el iframe se renderiza a ~150% del tamaño visible y se
                  reduce con transform, así el checkout se ve ordenado (layout amplio). */}
              <iframe
                src={flowUrl}
                title="Pago seguro con Flow"
                style={{
                  width: '149.25%',
                  height: '149.25%',
                  transform: 'scale(0.67)',
                  transformOrigin: 'top left',
                  border: '0',
                }}
                allow="payment"
              />
            </div>
            <div className="px-5 py-2.5 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400">
                Tus datos se procesan en los servidores seguros de Flow.{' '}
                <a href={flowUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Abrir en ventana nueva
                </a>
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Información del plan actual */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Plan */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <Package className="w-6 h-6 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">Plan Actual</h3>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Nombre del Plan</p>
              <p className="text-xl font-bold text-primary-600 capitalize">
                {subscription.planName || planInfo.name || subscription.plan}
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
          </div>
        </div>

        {/* Fechas */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200">
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
      <div className="bg-white p-6 rounded-2xl border border-gray-200">
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
        <div className="bg-white p-6 rounded-2xl border border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <DollarSign className="w-6 h-6 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">Historial de Pagos</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">Fecha</th>
                  <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">Monto</th>
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
                    // Un registro en el historial ES un pago cobrado: si no trae
                    // `status` (pagos viejos y los de Flow anteriores al fix) se
                    // asume pagado. Solo 'failed'/'rejected' se muestran como fallo.
                    const st = payment.status || 'completed';
                    const isFailed = st === 'failed' || st === 'rejected';
                    const isPending = st === 'pending';
                    const method = payment.method === 'flow' ? 'En línea'
                      : payment.method === 'manual' ? 'Manual'
                      : (payment.method || '—');
                    return (
                      <tr key={idx} className="border-b last:border-b-0">
                        <td className="py-3 px-4 text-sm text-gray-900">
                          {paymentDate
                            ? format(new Date(paymentDate), "d 'de' MMMM 'de' yyyy", { locale: es })
                            : 'N/A'}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-900">
                          {payment.amount != null ? `S/ ${Number(payment.amount).toFixed(2)}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600 capitalize">{method}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            isFailed ? 'bg-red-100 text-red-800'
                              : isPending ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {isFailed ? 'Fallido' : isPending ? 'Pendiente' : 'Pagado'}
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

      {/* Clientes asignados (solo si es vendedor vinculado) */}
      {vendedorInfo && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <Users className="w-6 h-6 text-orange-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Mis Clientes Asignados</h3>
              <p className="text-sm text-gray-500">Cuentas vinculadas a tu perfil de vendedor ({vendedorInfo.name})</p>
            </div>
          </div>

          {loadingClients ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
              <span className="ml-2 text-gray-500">Cargando clientes...</span>
            </div>
          ) : assignedClients.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Store className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p>No tienes clientes asignados aún</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-3">
                Total: <span className="font-semibold">{assignedClients.length}</span> cliente(s)
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">Negocio</th>
                      <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">RUC</th>
                      <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">Plan</th>
                      <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">Estado</th>
                      <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">Vencimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignedClients.map(client => {
                      const endDate = client.currentPeriodEnd?.toDate?.() || client.currentPeriodEnd
                      const daysLeft = endDate ? differenceInDays(new Date(endDate), new Date()) : 0
                      const isClientActive = client.status === 'active'
                      return (
                        <tr key={client.id} className="border-b last:border-b-0 hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <p className="text-sm font-medium text-gray-900">{client.businessName || 'Sin nombre'}</p>
                            {client.phone && (
                              <a href={`https://wa.me/${client.phone}`} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3" />{client.phone}
                              </a>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">{client.ruc || '-'}</td>
                          <td className="py-3 px-4 text-sm text-gray-900 capitalize">{client.planName || client.plan}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              isClientActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {isClientActive ? 'Activo' : client.status === 'trial' ? 'Prueba' : 'Suspendido'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {endDate ? (
                              <div>
                                <p className="text-sm text-gray-900">{format(new Date(endDate), "dd/MM/yyyy")}</p>
                                <p className={`text-xs ${daysLeft <= 7 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                                  {daysLeft > 0 ? `${daysLeft} días` : daysLeft === 0 ? 'Hoy' : 'Vencido'}
                                </p>
                              </div>
                            ) : '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Información de contacto (del reseller si aplica, si no de Cobrify) */}
      {(supportWhatsapp || supportEmail) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-3 text-lg">
            ¿Necesitas ayuda con tu suscripción?
          </h3>
          <p className="text-blue-800 mb-4">
            Si tienes preguntas sobre tu plan, pagos o necesitas actualizar tu suscripción, contáctate con {supportName}:
          </p>
          <div className="space-y-2 text-blue-800">
            {supportWhatsapp && (
              <p>
                <span className="font-medium">WhatsApp:</span>{' '}
                <a
                  href={`https://wa.me/${supportWaDigits}`}
                  className="text-blue-600 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {supportWhatsapp}
                </a>
              </p>
            )}
            {supportEmail && (
              <p>
                <span className="font-medium">Email:</span>{' '}
                <a
                  href={`mailto:${supportEmail}`}
                  className="text-blue-600 hover:underline"
                >
                  {supportEmail}
                </a>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
