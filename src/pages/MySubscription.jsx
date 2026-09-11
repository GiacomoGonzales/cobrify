import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { DEFAULT_BRANDING } from '@/services/brandingService';
import {
  PLANS,
  PLAN_TIERS,
  resolvePlanTier,
  getTierPrice,
  getAnnualSavings,
} from '@/services/subscriptionService';
import { getVendedorByLinkedUser, getVendedorClients } from '@/services/vendedorService';
import { puedeVerHistorialDePagos } from '@/utils/subscriptionOwnership';
import { MESES_DE_REGALO, MESES_PARA_QUIEN_REFIERE, mesesDeRegalo } from '@/data/referidos';
import { useSubscriptionPaymentInfo } from '@/hooks/useSubscriptionPaymentInfo';
import {
  Calendar,
  DollarSign,
  Package,
  CheckCircle,
  XCircle,
  FileText,
  Users,
  Box,
  Loader2,
  Store,
  Phone,
  Gift,
  Copy,
  Check
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import yapeLogo from '@/assets/wallets/yape.png';
import { WHATSAPP_COBRIFY_LEGIBLE, EMAIL_SOPORTE } from '@/data/contacto';

/**
 * Copiar al portapapeles con aviso en el propio botón.
 *
 * El `execCommand` de respaldo no es de adorno: `navigator.clipboard` no existe
 * en http, y el sistema se abre en red local más veces de las que uno cree.
 */
function BotonCopiar({ texto, etiqueta = 'Copiar', className = '' }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const caja = document.createElement('textarea');
      caja.value = texto;
      document.body.appendChild(caja);
      caja.select();
      document.execCommand('copy');
      document.body.removeChild(caja);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={copiar}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
        copiado
          ? 'border-green-200 bg-green-50 text-green-700'
          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
      } ${className}`}
    >
      {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {copiado ? 'Copiado' : etiqueta}
    </button>
  );
}

export default function MySubscription() {
  const { subscription, user, businessSettings } = useAuth();
  const { branding } = useBranding();
  // Ciclo de cobro elegido en el selector de planes ('monthly' | 'annual').
  // Arranca en el ciclo que el cliente ya tiene (ver efecto de sincronización).
  const [billingCycle, setBillingCycle] = useState('monthly');

  // El selector arranca mostrando el ciclo que el cliente ya paga (si tiene anual,
  // abre en anual). Los planes legacy (semestral, qpse_*) caen en mensual.
  useEffect(() => {
    if (!subscription?.plan) return;
    const { cycle } = resolvePlanTier(subscription.plan);
    if (cycle) setBillingCycle(cycle);
  }, [subscription?.plan]);

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
    : (assignedVendedor?.phone || WHATSAPP_COBRIFY_LEGIBLE)).trim()
  // El vendedor no tiene correo en su ficha; el de Cobrify se mantiene porque
  // estas cuentas siguen siendo clientes de Cobrify (el vendedor es su asesor).
  const supportEmail = (isResellerAccount ? (branding.supportEmail || '') : EMAIL_SOPORTE).trim()
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

  // El historial de pagos SOLO para clientes directos de Cobrify: en una
  // cuenta de reseller o de vendedor, esos montos son lo que Cobrify le
  // cobró al INTERMEDIARIO, y mostrárselos al cliente le revela el precio
  // de compra de su proveedor (reporte de un vendedor, 02-sep-2026).
  //
  // `vendedorInfo` llega asíncrono, pero solo puede ABRIR la sección, nunca
  // cerrarla: mientras carga se ve oculta, que es el lado seguro.
  const verHistorialDePagos = puedeVerHistorialDePagos(subscription, {
    esElVendedorDeLaCuenta: !!(vendedorInfo?.id && vendedorInfo.id === subscription.vendedorId),
  });

  // Datos para renovación / cambio de plan (solo clientes directos de Cobrify)
  const isDirectClient = !isResellerAccount && !vendedorInfo && !subscription.resellerId && !subscription.vendedorId;
  // Monto de renovación del plan ACTUAL: el precio pactado congelado manda sobre
  // el catálogo (así un cliente viejo renueva a su precio, no al de la lista).
  const renewAmount = subscription.renewalPrice != null ? subscription.renewalPrice : planInfo.totalPrice;
  // Dónde está parado hoy dentro de la grilla nivel × ciclo (null si es legacy).
  const { tier: currentTier, cycle: currentCycle } = resolvePlanTier(subscription.plan);
  const cicloTexto = billingCycle === 'annual' ? 'anual' : 'mensual';
  // Renovar o cambiar de plan: por WhatsApp con el pedido ya escrito (Flow se
  // quitó el 11-set-2026). La grilla solo la ven los clientes directos, así que
  // el contacto es el de Cobrify. Va el correo para ubicar la cuenta sin preguntar.
  const pedirPorWhatsApp = (texto) =>
    `https://wa.me/${supportWaDigits}?text=${encodeURIComponent(`${texto}${user?.email ? ` Mi correo es ${user.email}.` : ''}`)}`;

  // ---- Programa de referidos ----------------------------------------------
  // El código NO se genera acá ni en ningún lado: es el número de cliente que
  // el negocio ya tiene desde que nació (correlativo desde 1000001). Por eso
  // los clientes de siempre ya lo tienen sin que haya que hacerles nada.
  const codigoDeReferido = businessSettings?.codigoCliente || null;
  // Lo que gana quien llega, armado desde la tabla de `data/referidos.js` para
  // que subir un mes allá lo cambie también en esta pantalla. Los ilimitados no
  // están en la tabla, así que no aparecen: no hay que acordarse de excluirlos.
  const planesConRegalo = Object.keys(MESES_DE_REGALO).map((id) => ({
    id,
    nombre: (PLANS[id]?.name || id).split(' - ')[0].replace(/^Plan /, ''),
    meses: mesesDeRegalo(id),
  }));
  // El enlace corto y decente es el que la persona va a pegar en un WhatsApp.
  // Al abrirlo, la landing mete el código en el mensaje de contacto sola, así
  // que llega a la bandeja sin que nadie tenga que acordarse de mencionarlo.
  const enlaceDeReferido = `https://cobrifyperu.com/?ref=${codigoDeReferido}`;
  const mensajeParaCompartir =
    `Yo uso Cobrify para emitir mis boletas y facturas electrónicas.\n` +
    `Si te sirve, entra de mi parte y te regalan un mes al contratar:\n` +
    enlaceDeReferido;


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

      {/* Renovar o cambiar de plan — solo clientes directos.
          Grilla nivel × ciclo: 3 planes y un interruptor mensual/anual. El plan que
          ya tiene el cliente se marca "Tu plan" y muestra su precio pactado
          (renewalPrice congelado). Los botones abren WhatsApp con el pedido ya
          escrito: la renovación la registra el admin al confirmar el pago. */}
      {isDirectClient && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-gray-900">Renueva o cambia tu plan</h3>
              </div>
              <p className="text-gray-500 text-sm mt-0.5">
                Elige el plan y escríbenos por WhatsApp: te pasamos los datos para pagar.
              </p>
              <div className="flex items-center gap-2.5 mt-3">
                <img src={yapeLogo} alt="Yape" className="h-6 w-auto rounded" />
                <span className="text-xs text-gray-600 bg-gray-100 rounded-full px-2.5 py-1">Plin</span>
                <span className="text-xs text-gray-600 bg-gray-100 rounded-full px-2.5 py-1">Transferencia</span>
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
                    <a
                      href={pedirPorWhatsApp(isCurrent
                        ? `Hola, quiero renovar mi plan ${tier.name} ${cicloTexto} (S/ ${Number(shownPrice).toFixed(2)}).`
                        : `Hola, quiero cambiar al plan ${tier.name} ${cicloTexto} (S/ ${Number(catalogPrice).toFixed(2)}).`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-full px-4 py-2.5 rounded-xl font-semibold text-sm text-center transition-colors ${
                        isCurrent
                          ? 'bg-primary-600 text-white hover:bg-primary-700'
                          : 'border border-primary-600 text-primary-700 hover:bg-primary-50'
                      }`}
                    >
                      {isCurrent ? 'Renovar por WhatsApp' : 'Cambiar a este plan'}
                    </a>
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
              <a
                href={pedirPorWhatsApp(`Hola, quiero renovar mi plan actual (${subscription.planName || planInfo.name || subscription.plan}${renewAmount != null ? `, S/ ${Number(renewAmount).toFixed(2)}` : ''}).`)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 rounded-xl font-semibold text-sm whitespace-nowrap text-center transition-colors bg-primary-600 text-white hover:bg-primary-700"
              >
                Renovar por WhatsApp
              </a>
            </div>
          )}
        </div>
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

      {/* Invita y gana un mes. Solo para clientes DIRECTOS de Cobrify: la
          cuenta de un reseller o de un vendedor no es nuestra para premiarla
          —el que le cobra es su proveedor—, igual que el historial de pagos. */}
      {isDirectClient && codigoDeReferido && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200">
          <div className="flex items-start gap-3 mb-5">
            <Gift className="w-6 h-6 text-purple-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Invita y gana un mes</h3>
              <p className="text-sm text-gray-500">
                Por cada negocio que traigas y contrate un plan, te regalamos{' '}
                {MESES_PARA_QUIEN_REFIERE === 1 ? '1 mes' : `${MESES_PARA_QUIEN_REFIERE} meses`}. Sin límite.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-500 mb-1.5">Tu código</p>
              <div className="flex items-center gap-3">
                <p className="text-3xl font-bold text-gray-900 tabular-nums tracking-wide">
                  {codigoDeReferido}
                </p>
                <BotonCopiar texto={String(codigoDeReferido)} />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                El mes se te suma a tu vencimiento cuando el negocio que trajiste paga.
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500 mb-2">Lo que gana quien traigas</p>
              <ul className="space-y-1">
                {planesConRegalo.map((plan) => (
                  <li key={plan.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-gray-700">{plan.nombre}</span>
                    <span className="font-semibold text-gray-900 whitespace-nowrap">
                      {plan.meses === 1 ? '1 mes' : `${plan.meses} meses`} de regalo
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-500 mt-2">En los planes Ilimitado no aplica.</p>
            </div>
          </div>

          <div className="mt-5 pt-5 border-t border-gray-100">
            <p className="text-sm text-gray-500 mb-2">Mensaje listo para reenviar</p>
            <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl p-3 whitespace-pre-line break-words">
              {mensajeParaCompartir}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <BotonCopiar texto={mensajeParaCompartir} etiqueta="Copiar mensaje" />
              {/* wa.me sin número abre la lista de contactos: elige a quién se
                  lo manda desde su propio WhatsApp, sin salir a ningún lado. */}
              <a
                href={`https://wa.me/?text=${encodeURIComponent(mensajeParaCompartir)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 transition-colors"
              >
                <Phone className="w-4 h-4" />
                Compartir por WhatsApp
              </a>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Quien abra tu enlace llega a nuestro WhatsApp con tu código adentro del
              mensaje, así que no tiene que acordarse de mencionarlo. Si prefiere
              escribirnos por su cuenta, basta con que diga que lo recomendó el
              cliente {codigoDeReferido}.
            </p>
          </div>
        </div>
      )}

      {/* Historial de pagos */}
      {verHistorialDePagos && subscription.paymentHistory && subscription.paymentHistory.length > 0 && (
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
                            isFailed ? 'chip-error'
                              : isPending ? 'chip-aviso'
                              : 'chip-ok'
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
                              isClientActive ? 'chip-ok' : 'chip-error'
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
