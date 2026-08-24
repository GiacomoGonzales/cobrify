import { optimizeImageUrl } from '@/utils/cloudinary'

/**
 * Hero del tema Bauhaus: una composición geométrica (De Stijl) en vez de una
 * portada rectangular.
 *
 * La retícula es de 12×6: bloque rojo grande con el nombre de la tienda y un
 * triángulo negro, círculo negro sobre amarillo, bloque negro con el lema, la
 * foto de portada dentro de un panel azul y tres bloques chicos abajo para
 * cerrar el ritmo. Si el negocio no subió portada, el panel azul se llena con
 * figuras primarias — el tema no depende de que haya imagen.
 *
 * Los colores salen de theme.palette (no están cableados aquí) para que la
 * miniatura de la galería y el catálogo real pinten exactamente lo mismo.
 */
export default function HeroMondrian({ business, palette = {}, accent }) {
  const ROJO = accent || palette.rojo || '#E63E3E'
  const AMARILLO = palette.amarillo || '#FFD500'
  const AZUL = palette.azul || '#1A4DCC'
  const NEGRO = palette.negro || '#0E0E0E'

  const nombre = business?.name || business?.businessName || ''
  const lema = business?.catalogTagline || business?.catalogWelcome || 'Menos, pero mejor.'
  const portada = business?.catalogCoverImage
    || (business?.catalogHero?.slides || []).find(s => s?.imageUrl)?.imageUrl
    || ''

  return (
    <section className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <div className="grid grid-cols-12 grid-rows-6 gap-3 md:gap-4 h-[420px] md:h-[540px]">

        {/* Bloque rojo: el nombre de la tienda */}
        <div className="col-span-7 row-span-3 relative flex items-end p-5 md:p-9" style={{ backgroundColor: ROJO }}>
          <div className="min-w-0">
            <p className="text-[10px] md:text-xs tracking-[0.3em] uppercase font-bold mb-2 text-white/80">
              Composición N°1
            </p>
            <h2
              className="catalog-heading text-3xl md:text-6xl lg:text-7xl leading-[0.9] uppercase tracking-tight text-white break-words"
              style={{ fontWeight: 900, letterSpacing: '-0.03em' }}
            >
              {nombre}
            </h2>
          </div>
          <svg className="absolute top-3 right-3 w-10 h-10 md:w-16 md:h-16" viewBox="0 0 50 50" aria-hidden>
            <polygon points="25,4 46,46 4,46" fill={NEGRO} />
          </svg>
        </div>

        {/* Círculo negro sobre amarillo */}
        <div className="col-span-5 row-span-2 flex items-center justify-center" style={{ backgroundColor: AMARILLO }}>
          <div className="w-2/3 aspect-square rounded-full" style={{ backgroundColor: NEGRO }} />
        </div>

        {/* Bloque negro con el lema */}
        <div className="col-span-5 row-span-2 p-4 md:p-7 flex items-center" style={{ backgroundColor: NEGRO }}>
          <p
            className="catalog-heading text-xs md:text-lg leading-tight uppercase text-white line-clamp-4"
            style={{ fontWeight: 600, letterSpacing: '-0.01em' }}
          >
            {lema}
          </p>
        </div>

        {/* La foto de la tienda, dentro del panel azul */}
        <div className="col-span-7 row-span-3 relative overflow-hidden" style={{ backgroundColor: AZUL }}>
          {portada ? (
            <img
              src={optimizeImageUrl(portada, 'cover_desktop')}
              alt=""
              className="w-full h-full object-cover"
              // eslint-disable-next-line react/no-unknown-property -- minuscula a proposito (React 18 la pasa tal cual al DOM)
              fetchpriority="high"
              decoding="async"
            />
          ) : (
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 600 400" preserveAspectRatio="none" aria-hidden>
              <rect x="40" y="60" width="180" height="180" fill={AMARILLO} />
              <circle cx="380" cy="220" r="100" fill="#FFFFFF" />
              <polygon points="500,60 580,200 420,200" fill={NEGRO} />
              <line x1="0" y1="320" x2="600" y2="320" stroke="#FFFFFF" strokeWidth="4" />
            </svg>
          )}
        </div>

        {/* Cierre de ritmo */}
        <div className="col-span-2 row-span-1" style={{ backgroundColor: AMARILLO }} />
        <div className="col-span-2 row-span-1" style={{ backgroundColor: NEGRO }} />
        <div className="col-span-1 row-span-1" style={{ backgroundColor: ROJO }} />
      </div>
    </section>
  )
}
