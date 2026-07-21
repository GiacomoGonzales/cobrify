// Tira publicitaria del catálogo público (F2.1 del plan de rediseño).
// Primera "feature activable": se enciende desde Configuración > Mi Catálogo
// Online y se guarda como objeto `catalogAnnouncement` en el doc del negocio:
//   { enabled, text, mode: 'static' | 'marquee', backgroundColor, textColor }
// Modo 'static' = texto fijo centrado; 'marquee' = texto en movimiento
// continuo (el texto se repite para que el loop sea sin cortes).
const MARQUEE_STYLE = `
@keyframes catalog-marquee {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
.catalog-marquee-track {
  display: inline-flex;
  white-space: nowrap;
  animation: catalog-marquee 18s linear infinite;
  will-change: transform;
}
`

export default function AnnouncementBar({ config }) {
  if (!config?.enabled || !config?.text?.trim()) return null

  const text = config.text.trim()
  const bg = config.backgroundColor || '#111827'
  const color = config.textColor || '#FFFFFF'

  if (config.mode === 'marquee') {
    // Dos copias del grupo repetido: el keyframe corre -50% y reinicia
    // exactamente donde empieza la segunda copia → loop perfecto.
    const group = Array(4).fill(text)
    return (
      <div className="overflow-hidden" style={{ backgroundColor: bg }}>
        <style>{MARQUEE_STYLE}</style>
        <div className="catalog-marquee-track py-2">
          {[0, 1].map(copy => (
            <span key={copy} className="inline-flex">
              {group.map((t, i) => (
                <span key={i} className="text-sm font-medium px-8" style={{ color }}>
                  {t}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="py-2 px-4 text-center" style={{ backgroundColor: bg }}>
      <p className="text-sm font-medium" style={{ color }}>{text}</p>
    </div>
  )
}
