import { Check, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

// ============================================================================
// PLANES — EDITA AQUÍ para actualizar precios y beneficios de /pricing.
// Todo lo visible sale de este array.
//   badge:       null | 'Más Popular' | 'Mejor Ahorro'
//   highlighted: true → tarjeta azul destacada
//   annual:      oferta anual destacada dentro de la tarjeta { price, savings }
//                (null = solo mensual, sin oferta)
// ============================================================================
const WHATSAPP = '51900434988';
const waLink = (planName) =>
  `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hola, quiero contratar el plan ${planName} de Cobrify`)}`;

// Beneficios de los planes con 1,000 comprobantes (Mensual)
const FULL_FEATURES = [
  '1,000 comprobantes mensuales',
  'Control de stock completo',
  'Múltiples usuarios',
  'Múltiples sucursales',
  'Soporte prioritario',
  '100% Web (sin instalación)',
  'Reportes avanzados exportables',
  'Adaptado a cualquier negocio',
  'App para iPhone y Android',
  'Notas de venta ilimitadas',
  'Catálogo digital',
];

// Beneficios del plan Ilimitado
const UNLIMITED_FEATURES = [
  'Comprobantes ilimitados',
  'Control de stock completo',
  'Múltiples usuarios',
  'Múltiples sucursales',
  'Soporte prioritario',
  '100% Web (sin instalación)',
  'Reportes avanzados exportables',
  'App para iPhone y Android',
  'Notas de venta ilimitadas',
  'Catálogo digital',
];

const PLANS = [
  {
    id: 'basico',
    name: 'Básico Mensual',
    price: '19.90',
    unit: '/mes',
    note: 'Pago mes a mes',
    badge: null,
    highlighted: false,
    features: [
      '100 comprobantes mensuales',
      'Control de stock completo',
      '1 sub-usuario',
      '1 sucursal',
      'Soporte prioritario',
      '100% Web (sin instalación)',
      'Reportes avanzados exportables',
      'App para iPhone y Android',
      'Notas de venta ilimitadas',
      'Catálogo digital',
    ],
    annual: null,
  },
  {
    id: 'mensual',
    name: 'Mensual Completo',
    price: '29.90',
    unit: '/mes',
    note: 'Pago mes a mes',
    badge: 'Más Popular',
    highlighted: true,
    features: FULL_FEATURES,
    annual: { price: '199.90', savings: 'Ahorras S/158.90 (44%)' },
  },
  {
    id: 'ilimitado',
    name: 'Mensual Ilimitado',
    price: '39.90',
    unit: '/mes',
    note: 'Sin límite de comprobantes',
    badge: null,
    highlighted: false,
    features: UNLIMITED_FEATURES,
    annual: { price: '299.90', savings: 'Ahorras S/178.90 (37%)' },
  },
];

function PlanCard({ plan }) {
  const hl = plan.highlighted;
  return (
    <div
      className={`relative flex flex-col rounded-2xl px-6 py-8 transition-all ${
        hl
          ? 'bg-primary-600 text-white shadow-2xl lg:scale-[1.04] ring-1 ring-primary-500'
          : 'bg-white text-gray-900 border-2 border-gray-200 hover:border-primary-300 hover:shadow-xl'
      }`}
    >
      {plan.badge && (
        <span
          className={`absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap px-4 py-1 rounded-full text-xs font-bold shadow-md ${
            plan.badge === 'Más Popular' ? 'bg-amber-400 text-amber-950' : 'bg-green-500 text-white'
          }`}
        >
          {plan.badge}
        </span>
      )}

      <div className="text-center mb-6">
        <h3 className={`text-xl font-bold mb-2 ${hl ? 'text-white' : 'text-gray-900'}`}>{plan.name}</h3>
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-4xl font-extrabold">S/{plan.price}</span>
          <span className={hl ? 'text-primary-100' : 'text-gray-500'}>{plan.unit}</span>
        </div>
        {plan.note && (
          <p className={`text-sm mt-1 font-medium ${hl ? 'text-primary-100' : 'text-gray-500'}`}>{plan.note}</p>
        )}
      </div>

      <ul className="space-y-2 mb-6 text-left">
        {plan.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            <Check className={`mt-0.5 flex-shrink-0 ${hl ? 'text-white' : 'text-green-500'}`} style={{ width: 18, height: 18 }} />
            <span className={hl ? 'text-white' : 'text-gray-700'}>{f}</span>
          </li>
        ))}
      </ul>

      {/* Oferta anual destacada — para animar al plan anual */}
      {plan.annual && (
        <a
          href={waLink(`${plan.name} Anual`)}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl p-4 mb-6 bg-white border-2 border-emerald-300 text-center transition-transform hover:scale-[1.02]"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Oferta · Paga anual</p>
          <div className="flex items-baseline justify-center gap-1.5 mt-0.5">
            <span className="text-2xl font-extrabold text-gray-900">S/{plan.annual.price}</span>
            <span className="text-sm text-gray-500">/año</span>
          </div>
          <p className="text-sm font-semibold text-emerald-600">{plan.annual.savings}</p>
        </a>
      )}

      <a href={waLink(plan.name)} target="_blank" rel="noopener noreferrer" className="mt-auto">
        <button
          className={`w-full py-3 rounded-xl font-semibold transition-colors ${
            hl ? 'bg-white text-primary-700 hover:bg-primary-50' : 'bg-primary-600 text-white hover:bg-primary-700'
          }`}
        >
          Contratar Plan
        </button>
      </a>
    </div>
  );
}

export default function Pricing() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-primary-700 font-bold text-lg">
            <ArrowLeft className="w-5 h-5" /> Cobrify
          </Link>
          <Link
            to="/login"
            className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-colors"
          >
            Ingresar
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-14 pb-6 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Planes que se adaptan a tu negocio</h1>
        <p className="text-lg text-gray-500 mt-3">Todos los planes incluyen el mismo software completo.</p>
      </section>

      {/* Planes */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-10">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 items-stretch pt-4 max-w-5xl mx-auto">
          {PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>

        <div className="text-center text-sm text-gray-500 mt-10">
          <p>Los precios no incluyen IGV.</p>
        </div>

        <div className="text-center mt-6">
          <a
            href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Hola, tengo una consulta sobre los planes de Cobrify')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-primary-700 font-medium hover:underline"
          >
            ¿Tienes dudas? Escríbenos por WhatsApp
          </a>
        </div>
      </section>
    </div>
  );
}
