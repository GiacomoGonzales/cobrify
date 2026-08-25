import { optimizeImageUrl } from '@/utils/cloudinary'
import RansomText from './RansomText'

/**
 * Hero del tema Zine: un collage de fanzine fotocopiado.
 *
 * Arriba, dos tiras de cinta adhesiva torcidas, el sello del número, el nombre
 * de la tienda en letras recortadas (RansomText) y el lema en un recuadro rojo
 * ladeado. Debajo, si el negocio subió portada, la foto en blanco y negro con
 * marco grueso y sombra dura, al lado de una tarjeta con el manifiesto.
 *
 * Sin portada el collage no se cae: se queda con el sello, el nombre y el
 * lema, que es justo lo que hace un fanzine hecho a mano.
 */
export default function HeroZine({ business, accent = '#E11414', tinta = '#0A0A0A', papel = '#EFEDE6' }) {
  const nombre = business?.name || business?.businessName || ''
  const lema = business?.catalogTagline || business?.catalogWelcome || ''
  const portada = business?.catalogCoverImage
    || (business?.catalogHero?.slides || []).find(s => s?.imageUrl)?.imageUrl
    || ''
  const portadaMovil = business?.catalogCoverImageMobile || portada

  return (
    <section className="relative overflow-hidden py-10 md:py-16">
      <div className="max-w-6xl mx-auto px-4 md:px-6">

        {/* Cinta adhesiva: dos tiras torcidas, como pegadas a mano */}
        <div
          className="absolute top-3 left-1/4 w-24 md:w-28 h-6 md:h-7 pointer-events-none"
          style={{ backgroundColor: 'rgba(253, 230, 138, 0.8)', transform: 'rotate(-12deg)', boxShadow: '1px 2px 6px rgba(0,0,0,0.18)' }}
        />
        <div
          className="absolute top-7 right-1/3 w-20 md:w-24 h-6 md:h-7 pointer-events-none"
          style={{ backgroundColor: 'rgba(253, 230, 138, 0.75)', transform: 'rotate(8deg)', boxShadow: '1px 2px 6px rgba(0,0,0,0.18)' }}
        />

        <div className="relative text-center">
          {/* Sello del número */}
          <p
            className="inline-block uppercase tracking-widest mb-5 text-[10px] md:text-xs px-3 py-1.5"
            style={{ backgroundColor: tinta, color: papel, transform: 'rotate(-2deg)', fontFamily: "'Special Elite', monospace" }}
          >
            ★ Número uno ★ Hecho a mano
          </p>

          <div className="my-5 md:my-6">
            <RansomText
              text={nombre.toUpperCase()}
              colorFondo={tinta}
              colorTexto={papel}
              colorNormal={tinta}
            />
          </div>

          {lema && (
            <p
              className="inline-block mt-3 text-sm md:text-xl px-3 py-1.5 uppercase font-bold"
              style={{ backgroundColor: accent, color: papel, transform: 'rotate(1deg)', fontFamily: "'Anonymous Pro', monospace" }}
            >
              &gt; {lema}
            </p>
          )}
        </div>

        {portada && (
          <div className="mt-9 md:mt-10 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            {/* La foto, revelada como una fotocopia: sin color y a puro contraste */}
            <div
              className="md:col-span-2 aspect-[16/10] overflow-hidden relative"
              style={{
                border: `3px solid ${tinta}`,
                boxShadow: `6px 6px 0 0 ${tinta}`,
                filter: 'grayscale(0.85) contrast(1.4) brightness(0.95)',
                transform: 'rotate(-1deg)',
              }}
            >
              <picture>
                <source media="(max-width: 767px)" srcSet={optimizeImageUrl(portadaMovil, 'cover_mobile')} />
                <img
                  src={optimizeImageUrl(portada, 'cover_desktop')}
                  alt=""
                  className="w-full h-full object-cover"
                  decoding="async"
                />
              </picture>
            </div>

            {/* Tarjeta del manifiesto: ladeada al otro lado, con sombra roja */}
            <div
              className="hidden md:flex flex-col justify-between p-4"
              style={{
                border: `3px solid ${tinta}`,
                boxShadow: `6px 6px 0 0 ${accent}`,
                backgroundColor: '#FFFFFF',
                transform: 'rotate(2deg)',
              }}
            >
              <p className="text-[11px] uppercase tracking-widest" style={{ fontFamily: "'Special Elite', monospace" }}>
                [ manifiesto ]
              </p>
              <p className="text-base md:text-lg font-bold leading-tight uppercase" style={{ fontFamily: "'Special Elite', monospace" }}>
                Corta · Pega · Usa · Repite.
              </p>
              <div className="text-[11px] flex justify-between items-center" style={{ fontFamily: "'Anonymous Pro', monospace" }}>
                <span>Desde {new Date().getFullYear() - 2}</span>
                <span>★★★</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
