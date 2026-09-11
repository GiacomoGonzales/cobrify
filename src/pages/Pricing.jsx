import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Download, Check, Receipt, ShoppingCart, Boxes, FileText, BarChart3,
  ShoppingBag, Smartphone, Store, MessageCircle, Video,
} from 'lucide-react';
import { PLANES_VENDIBLES } from '@/data/planes';
import { PLAN_TIERS, getAnnualSavings, getAnnualSavingsPercent } from '@/services/subscriptionService';
import { WHATSAPP_COBRIFY, WHATSAPP_COBRIFY_LEGIBLE, EMAIL_SOPORTE } from '@/data/contacto';

// ============================================================================
// /precios (y /pricing): la lista de precios de Cobrify armada como un
// documento de dos hojas A4. "Descargar PDF" abre la ventana de imprimir y,
// con "Guardar como PDF", sale exactamente lo que se ve.
//
// Los PRECIOS no se escriben acá. Salen de `PLANES_VENDIBLES`
// (functions/src/data/planes.js), el mismo catálogo con el que se cobra y el
// que ve el cliente en Mi Suscripción; los niveles y lo que trae cada uno, de
// `PLAN_TIERS`; el ahorro anual, de `getAnnualSavings`. Para cambiar un precio
// se cambia allá y esta página lo toma sola.
//
// Letra grande y texto corto a propósito: mucha gente la lee de lejos o en el
// celular (Giacomo, 11-set-2026). Lo que se agregue tiene que entrar en las
// dos hojas: medir el alto de cada una contra el A4 (297 mm) antes de subir.
// ============================================================================

// Desde cuándo rigen. Va en el encabezado de cada hoja.
const VIGENTES_DESDE = 'septiembre de 2026';
const SITIO = 'cobrifyperu.com';

const soles = (n) => `S/ ${Number(n).toFixed(2)}`;
const miles = (n) => Number(n).toLocaleString('en-US');
const waLink = (texto) => `https://wa.me/${WHATSAPP_COBRIFY}?text=${encodeURIComponent(texto)}`;
const nombreDelNivel = (id) => PLAN_TIERS.find((t) => t.id === id)?.name || id;

// Lo que trae el software en cualquier plan: los planes no recortan funciones,
// solo cambian el cupo de comprobantes, los locales y la forma de pago.
const INCLUIDO = [
  { icono: Receipt, titulo: 'Facturación electrónica SUNAT' },
  { icono: ShoppingCart, titulo: 'Punto de venta' },
  { icono: Boxes, titulo: 'Control de stock' },
  { icono: FileText, titulo: 'Cotizaciones' },
  { icono: BarChart3, titulo: 'Reportes en Excel' },
  { icono: ShoppingBag, titulo: 'Catálogo digital' },
  { icono: Smartphone, titulo: 'App iPhone y Android' },
  { icono: Store, titulo: 'Para todo rubro' },
  { icono: MessageCircle, titulo: 'Soporte por WhatsApp' },
];

// En la lista de CADA plan, además de lo del nivel: sobre todo en el Básico,
// que se sepa que las notas de venta no gastan sus 100 comprobantes.
const EN_TODOS_LOS_PLANES = ['Notas de venta ilimitadas'];

// Lo que los planes anuales suman a lo del nivel. Va como una línea más de su
// lista, no como un bloque aparte. No va en PLAN_TIERS: esos textos son por
// nivel y Mi Suscripción los muestra también en el mensual.
const EXTRAS_DEL_ANUAL = [
  { icono: Video, texto: 'Atención por Meet', nota: 'solo planes anuales' },
];

// Una hoja = una página del PDF. Alto FIJO al imprimir: si el contenido
// pasara del A4, se cortaría en vez de soltar una tercera hoja a medias.
const ESTILOS_DE_IMPRESION = `
  @page { size: A4; margin: 0; }
  @media print {
    html, body, #root { height: auto !important; background: #fff !important; }
    .hoja-precios {
      width: 210mm !important; height: 297mm !important; min-height: 0 !important;
      margin: 0 !important; overflow: hidden;
      break-after: page; page-break-after: always;
    }
    .hoja-precios:last-child { break-after: auto; page-break-after: auto; }
    .hoja-precios, .hoja-precios * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

/** Una hoja A4: en pantalla se ve como una página de PDF; al imprimir, es exactamente una. */
function Hoja({ pagina, total, children }) {
  return (
    <section className="hoja-precios mx-auto my-6 flex w-full max-w-[210mm] flex-col bg-white px-5 py-8 shadow-lg ring-1 ring-gray-200 sm:my-10 sm:min-h-[297mm] sm:px-[12mm] sm:py-[10mm] print:my-0 print:shadow-none print:ring-0">
      <header className="flex items-center justify-between gap-4 border-b-2 border-primary-600 pb-4">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" width="36" height="36" className="h-9 w-9 object-contain" />
          <span className="text-xl font-extrabold tracking-tight text-gray-900">Cobrify</span>
        </div>
        <div className="text-right leading-tight">
          <p className="text-base font-bold text-gray-900">Planes y precios</p>
          <p className="text-sm text-gray-500">Vigentes desde {VIGENTES_DESDE}</p>
        </div>
      </header>

      <div className="flex-1 py-6">{children}</div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3 text-xs text-gray-500">
        <span>{SITIO} · WhatsApp {WHATSAPP_COBRIFY_LEGIBLE} · {EMAIL_SOPORTE}</span>
        <span className="tabular-nums">Hoja {pagina} de {total}</span>
      </footer>
    </section>
  );
}

function Seccion({ titulo, nota, className = '', children }) {
  return (
    <div className={className}>
      <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">{titulo}</h2>
      {nota && <p className="mt-1 text-base text-gray-600">{nota}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** El precio SIN IGV, grande; debajo y más chico, el precio con IGV. */
function Precio({ plan, periodo }) {
  return (
    <div>
      <p className="flex items-baseline gap-1 whitespace-nowrap">
        <span className="text-4xl font-extrabold tracking-tight text-gray-900 tabular-nums">{soles(plan.totalPrice)}</span>
        <span className="text-base font-medium text-gray-500">{periodo}</span>
      </p>
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Sin IGV</p>
      <p className="mt-2 text-sm text-gray-500 tabular-nums">
        <span className="font-bold text-gray-700">{soles(plan.precioConIgv)}</span> con IGV
      </p>
    </div>
  );
}

function Incluye({ items, extras = [] }) {
  return (
    <ul className="space-y-2">
      {items.map((texto) => (
        <li key={texto} className="flex items-start gap-2 text-sm text-gray-800">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />
          <span>{texto}</span>
        </li>
      ))}
      {extras.map(({ icono: Icono, texto, nota }) => (
        <li key={texto} className="flex items-start gap-2 text-sm text-gray-800">
          <Icono className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />
          <span>
            {texto}
            {nota && <span className="text-gray-500"> · {nota}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Contratar({ texto, destacado = false }) {
  return (
    <a
      href={waLink(texto)}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-4 block rounded-lg px-3 py-2.5 text-center text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
        destacado
          ? 'bg-primary-600 text-white hover:bg-primary-700'
          : 'border border-primary-600 text-primary-700 hover:bg-primary-50'
      }`}
    >
      Contratar por WhatsApp
    </a>
  );
}

function TarjetaMensual({ tier, plan }) {
  const destacado = tier.popular === true;
  return (
    <article className={`relative flex flex-col rounded-xl border p-4 ${destacado ? 'border-primary-600 ring-1 ring-primary-600' : 'border-gray-200'}`}>
      {destacado && (
        <span className="absolute -top-3 left-4 rounded bg-primary-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
          El más elegido
        </span>
      )}
      <h3 className="text-xl font-bold text-gray-900">{tier.name}</h3>
      <div className="my-3 border-y border-gray-100 py-3">
        <Precio plan={plan} periodo="/mes" />
      </div>
      <Incluye items={[...tier.highlights, ...EN_TODOS_LOS_PLANES]} />
      <div className="mt-auto">
        <Contratar destacado={destacado} texto={`Hola, quiero contratar el plan ${tier.name} mensual de Cobrify`} />
      </div>
    </article>
  );
}

function TarjetaAnual({ tier, plan }) {
  const ahorro = getAnnualSavings(tier);
  const porcentaje = getAnnualSavingsPercent(tier);
  return (
    <article className="flex flex-col rounded-xl border border-gray-200 p-4">
      <h3 className="text-xl font-bold text-gray-900">{tier.name} anual</h3>
      <div className="my-3 border-y border-gray-100 py-3">
        <Precio plan={plan} periodo="/año" />
        <p className="mt-1 text-sm text-gray-600">
          Equivale a <span className="font-bold text-gray-800 tabular-nums">{soles(plan.pricePerMonth)}</span> al mes
        </p>
      </div>
      {ahorro > 0 && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
          Ahorras {soles(ahorro)} ({porcentaje}%)
        </p>
      )}
      <Incluye items={[...tier.highlights, ...EN_TODOS_LOS_PLANES]} extras={EXTRAS_DEL_ANUAL} />
      <div className="mt-auto">
        <Contratar texto={`Hola, quiero contratar el plan ${tier.name} anual de Cobrify`} />
      </div>
    </article>
  );
}

/**
 * La misma regla que `planQueLeCalza`: cuántos comprobantes al mes y cuántos
 * locales. Las cifras salen de los límites del catálogo.
 */
function ComoElegir({ className = '' }) {
  const limite = (id, campo) => PLANES_VENDIBLES[id].limits[campo];
  const docs = (id) => miles(limite(id, 'maxInvoicesPerMonth'));
  const locales = (id) => limite(id, 'maxBranches');
  const filas = [
    { cuando: `Hasta ${docs('basico_mensual')} comprobantes al mes y ${locales('basico_mensual')} local`, plan: nombreDelNivel('basico') },
    { cuando: `Hasta ${docs('mensual')} comprobantes al mes y hasta ${locales('mensual')} locales`, plan: nombreDelNivel('completo') },
    { cuando: `Más de ${docs('mensual')} comprobantes o de ${locales('mensual') + 1} a ${locales('ilimitado_mensual')} locales`, plan: nombreDelNivel('ilimitado') },
    { cuando: `Más de ${locales('ilimitado_mensual')} locales o algo a medida`, plan: 'Consúltanos', aMedida: true },
  ];
  return (
    <div className={`rounded-xl bg-gray-50 p-4 ${className}`}>
      <h2 className="text-lg font-bold text-gray-900">¿Qué plan me conviene?</h2>
      <dl className="mt-1 divide-y divide-gray-200">
        {filas.map((f) => (
          <div key={f.plan} className="flex items-center justify-between gap-4 py-2.5 text-base">
            <dt className="text-gray-700">{f.cuando}</dt>
            <dd className={`shrink-0 font-bold ${f.aMedida ? 'text-primary-700' : 'text-gray-900'}`}>{f.plan}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function Pricing() {
  useEffect(() => {
    // El título es el nombre que propone "Guardar como PDF".
    const tituloAntes = document.title;
    document.title = 'Planes y precios · Cobrify';
    // La app entera se ve al 90% (index.css) y eso incluye lo que se imprime.
    // Esta hoja es para leer de lejos: al 100%, respetando la escala que haya
    // elegido el usuario (`--escala-ui`, que al imprimir vale 1).
    const raiz = document.documentElement;
    const tamanoAntes = raiz.style.fontSize;
    raiz.style.fontSize = 'calc(100% * var(--escala-ui))';
    return () => {
      document.title = tituloAntes;
      raiz.style.fontSize = tamanoAntes;
    };
  }, []);

  const mensuales = PLAN_TIERS
    .map((tier) => ({ tier, plan: PLANES_VENDIBLES[tier.cycles.monthly] }))
    .filter((x) => x.plan);
  const anuales = PLAN_TIERS
    .filter((tier) => tier.cycles.annual)
    .map((tier) => ({ tier, plan: PLANES_VENDIBLES[tier.cycles.annual] }))
    .filter((x) => x.plan);
  const soloMensual = PLAN_TIERS.filter((tier) => !tier.cycles.annual).map((tier) => tier.name);

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <style>{ESTILOS_DE_IMPRESION}</style>

      {/* Barra de arriba: no sale en el PDF */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-[210mm] items-center justify-between gap-3 px-4">
          <Link to="/" className="flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800">
            <ArrowLeft className="h-4 w-4" /> Cobrify
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              title="Se abre la ventana de imprimir: elige «Guardar como PDF»"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              <Download className="h-4 w-4" /> Descargar PDF
            </button>
            <Link
              to="/login"
              className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
            >
              Ingresar
            </Link>
          </div>
        </div>
      </div>

      <main className="px-3 pb-6 print:p-0">
        <Hoja pagina={1} total={2}>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Elige tu plan</h1>
          <p className="mt-1.5 text-base text-gray-600">
            Todos traen el software completo. Solo cambian los comprobantes al mes y los locales.
          </p>

          <Seccion className="mt-6" titulo="Planes mensuales" nota="Pagas mes a mes.">
            <div className="grid gap-3 sm:grid-cols-3 print:grid-cols-3">
              {mensuales.map(({ tier, plan }) => <TarjetaMensual key={tier.id} tier={tier} plan={plan} />)}
            </div>
          </Seccion>

          <ComoElegir className="mt-6" />
        </Hoja>

        <Hoja pagina={2} total={2}>
          <Seccion
            titulo="Planes anuales"
            nota={`Un solo pago por 12 meses.${soloMensual.length ? ` El ${soloMensual.join(' y ')} es solo mensual.` : ''}`}
          >
            <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
              {anuales.map(({ tier, plan }) => <TarjetaAnual key={tier.id} tier={tier} plan={plan} />)}
            </div>
          </Seccion>

          <Seccion className="mt-5" titulo="Incluido en todos los planes">
            <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-3 print:grid-cols-3">
              {INCLUIDO.map(({ icono: Icono, titulo }) => (
                <div key={titulo} className="flex items-center gap-2.5">
                  <Icono className="h-5 w-5 shrink-0 text-primary-600" aria-hidden="true" />
                  <span className="text-sm font-semibold text-gray-800">{titulo}</span>
                </div>
              ))}
            </div>
          </Seccion>

          <div className="mt-5 rounded-xl bg-gray-50 p-4">
            <h2 className="text-lg font-bold text-gray-900">Bueno saber</h2>
            <ul className="mt-1.5 list-disc space-y-1.5 pl-5 text-sm text-gray-700">
              <li>Cuentan como comprobantes las facturas, boletas y guías.</li>
              <li>Cambias de plan pagando solo la diferencia.</li>
              <li>Al renovar, mantienes tu precio.</li>
            </ul>
          </div>
        </Hoja>
      </main>
    </div>
  );
}
