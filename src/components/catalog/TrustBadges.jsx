// Sellos de confianza del catálogo (F2.6 del plan de rediseño).
// Feature activable: fila de badges (envío, pago seguro, garantía…) para dar
// confianza al comprador. Config en el doc del negocio:
//   catalogTrustBadges = { enabled, badges: [{ id, icon, text }] }
// `icon` es una clave del set fijo TRUST_ICONS (evita meter iconos arbitrarios).
import { Truck, ShieldCheck, CreditCard, RotateCcw, Headphones, BadgeCheck, Clock, Tag } from 'lucide-react'

// Set de íconos disponibles (clave → componente). El selector de Settings usa
// las mismas claves para que dueño y catálogo hablen el mismo idioma.
export const TRUST_ICONS = {
  truck: Truck,
  shield: ShieldCheck,
  card: CreditCard,
  return: RotateCcw,
  support: Headphones,
  quality: BadgeCheck,
  clock: Clock,
  tag: Tag,
}

export default function TrustBadges({ config, accent, themeClasses }) {
  const badges = (config?.badges || []).filter(b => b.text?.trim())
  if (!config?.enabled || badges.length === 0) return null

  return (
    <div className={`border-y ${themeClasses?.border || 'border-gray-100'} ${themeClasses?.card || 'bg-white'}`}>
      <div className="max-w-7xl mx-auto px-4 py-3">
        {/* Centrados y juntos. Repartidos de borde a borde (justify-between)
            en una pantalla ancha quedaban tan separados que no se leian como
            un grupo, sino como tres textos sueltos. */}
        <div className="flex items-center justify-center gap-x-8 md:gap-x-12 gap-y-2 flex-wrap">
          {badges.map((b, i) => {
            const Icon = TRUST_ICONS[b.icon] || ShieldCheck
            return (
              <div key={b.id || i} className="flex items-center gap-2 flex-shrink-0">
                <Icon className="w-5 h-5 flex-shrink-0" style={{ color: accent }} />
                <span className={`text-xs md:text-sm font-medium ${themeClasses?.text || 'text-gray-700'}`}>
                  {b.text.trim()}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
