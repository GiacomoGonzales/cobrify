import { useCatalogTheme } from './CatalogThemeProvider'

/**
 * Pinta con el tema del catálogo un panel escrito en gris de Tailwind.
 *
 * El carrito, la cuenta del comprador y el login se escribieron con `bg-white`,
 * `text-gray-900`, `rounded-xl`… Sobre un tema oscuro (Bold, Velvet, Urban)
 * eso es un recuadro blanco en medio de una tienda negra, y sobre Brutalist un
 * panel redondeado en una tienda sin una sola curva.
 *
 * En vez de reescribir cada clase del markup de tres pantallas largas, se
 * inyecta un bloque CSS ACOTADO a la clase raíz del panel: mismo markup, otra
 * piel. Es el mismo mecanismo que estrenó el carrito; vive acá para que los
 * tres paneles no vayan cada uno por su lado.
 *
 * Uso:
 *   <div className="catalog-panel-cuenta ...">   ← la clase raíz
 *     <PanelTemaCss clase="catalog-panel-cuenta" />
 *
 * Es un componente y no un hook a propósito: así lo puede usar un panel que
 * hace `if (!isOpen) return null` sin romper el orden de los hooks.
 */
export default function PanelTemaCss({ clase, radios = true, oscuro = true }) {
  const { tokens } = useCatalogTheme()
  const esOscuro = !!tokens?.effects?.darkMode
  if (!clase) return null

  return <style>{construirCss(clase, tokens, { radios, oscuro: oscuro && esOscuro })}</style>
}

/**
 * Genera el CSS acotado. Separado del componente para que el carrito —que ya
 * tenía el suyo con OTROS nombres de clase— pueda reusar exactamente las
 * mismas reglas sin tocar su markup.
 *
 * `rounded-full` se deja intacto a propósito: los steppers de cantidad y los
 * globos de contador son circulares en todos los temas.
 */
export function construirCss(clase, tokens, { radios = true, oscuro = false } = {}) {
  const c = `.${clase}`
  const r = tokens?.radius || {}
  const col = tokens?.colors || {}

  // Con y sin espacio: el propio panel puede llevar la clase de radio (el
  // modal de login es `rounded-2xl` en su raiz), no solo sus hijos.
  const reglasRadio = radios ? `
      ${c}.rounded-lg,  ${c} .rounded-lg  { border-radius: ${r.md || '0.5rem'}; }
      ${c}.rounded-xl,  ${c} .rounded-xl  { border-radius: ${r.md || '0.75rem'}; }
      ${c}.rounded-2xl, ${c} .rounded-2xl { border-radius: ${r.lg || '1rem'}; }
  ` : ''

  const reglasOscuro = oscuro ? `
      ${c} { background-color: ${col.surface || '#1A1A20'} !important; color: ${col.text || '#F9FAFB'}; }
      ${c}.bg-white { background-color: ${col.surface || '#1A1A20'} !important; }
      ${c} .bg-white { background-color: ${col.surface || '#1A1A20'}; }
      ${c} .border-b, ${c} .border-t { border-color: rgba(255,255,255,0.1); }
      ${c} .bg-gray-50  { background-color: rgba(255,255,255,0.05); }
      ${c} .bg-gray-100 { background-color: rgba(255,255,255,0.08); }
      ${c} .bg-gray-200 { background-color: rgba(255,255,255,0.1); }
      ${c} .text-gray-900 { color: ${col.text || '#F9FAFB'}; }
      ${c} .text-gray-800, ${c} .text-gray-700 { color: #D1D5DB; }
      ${c} .text-gray-600, ${c} .text-gray-500 { color: ${col.textMuted || '#9CA3AF'}; }
      ${c} .text-gray-400 { color: #6B7280; }
      ${c} .border-gray-300 { border-color: #4B5563; }
      ${c} .border-gray-200, ${c} .border-gray-100 { border-color: ${col.border || '#374151'}; }
      ${c} .divide-gray-100 > * + * { border-color: ${col.border || '#374151'}; }
      ${c} input, ${c} textarea, ${c} select {
        background-color: rgba(255,255,255,0.05); border-color: #4B5563; color: #F9FAFB;
      }
      ${c} input::placeholder, ${c} textarea::placeholder { color: #6B7280; }
      ${c} .hover\\:bg-gray-100:hover, ${c} .hover\\:bg-gray-50:hover { background-color: rgba(255,255,255,0.08); }
      ${c} .bg-green-50 { background-color: rgba(16,185,129,0.12); }
      ${c} .text-green-800, ${c} .text-green-700 { color: #6EE7B7; }
      ${c} .bg-red-50 { background-color: rgba(239,68,68,0.12); }
      ${c} .text-red-800, ${c} .text-red-700 { color: #FCA5A5; }
  ` : ''

  return reglasRadio + reglasOscuro
}
