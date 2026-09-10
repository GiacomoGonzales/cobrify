/**
 * RÉPLICA DE CITEX.COM.PE para su catálogo (citex.pe). Diseño a medida
 * pagado (S/150, 10-set-2026): Luis pidió que la tienda sea IDÉNTICA a su
 * web, porque su botón "Comprar ahora" lleva acá y el salto no se tiene que
 * notar.
 *
 * Es una copia de su web: cabecera, portada, secciones 01 a 08, pie y botón
 * de WhatsApp, con la tienda en vivo entre "02 / Productos" y "03 /
 * Ubicación". El marcado, las clases y los textos salen de su página tal como
 * estaba el 10-set-2026; los estilos propios están en citex.css. Si Luis
 * cambia su web, esto se cambia a mano: no se sincroniza solo.
 *
 * Lo carga CatalogoPublico solo cuando el tema tiene `replica: 'citex'`
 * (src/themes/temasAMedida.js), con import dinámico: a los demás catálogos
 * no les pesa. Todas las réplicas exportan las mismas piezas: Cabecera,
 * Portada, SeccionesAntes, EncabezadoTienda, Notas, SeccionesDespues, Pie y
 * Flotantes.
 */
import { useEffect, useState } from 'react'
import { ShoppingBag, User } from 'lucide-react'
import './citex.css'

const WEB = 'https://www.citex.com.pe'
const WHATSAPP = 'https://wa.me/51976291526'

const ENLACES = {
  cotizador: `${WEB}/cotizador`,
  catalogos: `${WEB}/catalogo`,
  pdfAlgodon: `${WEB}/CATALOGO_ALGODO_N_CITEX.pdf`,
  pdfSublimacion: `${WEB}/CATALOGO_SUBLIMACIO_N_CITEX.pdf`,
  reclamos: 'https://cobrifyperu.com/app/reclamos/citex',
  whatsappCotizar: `${WHATSAPP}?text=Hola%20CITEX%2C%20quiero%20cotizar%20polos%20por%20mayor`,
  whatsappCotizarPolos: `${WHATSAPP}?text=Hola%20CITEX%2C%20quiero%20cotizar%20polos`,
  mapsFiscal: 'https://maps.app.goo.gl/WRn3sH5x7dHvHGBH9',
  mapsTienda: 'https://maps.app.goo.gl/wjbSGpWueKZmS1tg6',
  privacidad: `${WEB}/legal/politica-privacidad`,
  cambios: `${WEB}/legal/politica-cambios-devoluciones`,
  envios: `${WEB}/legal/politica-envios`,
  terminos: `${WEB}/legal/terminos-condiciones`,
}

// Las imágenes de su web (venían metidas en el HTML) viven en public/.
const IMG = {
  logo: '/a-medida/citex/logo.png',
  portada: '/a-medida/citex/portada.webp',
  oversize: '/a-medida/citex/oversize.webp',
  personalizado: '/a-medida/citex/personalizado.webp',
}

const PILDORA = 'inline-flex items-center justify-center rounded-full bg-white text-black px-[28px] h-[44px] text-[11px] font-[600] tracking-[0.12em] uppercase hover:bg-black hover:text-white transition-all duration-300 border border-white'
const PILDORA_CONTORNO = 'inline-flex items-center justify-center rounded-full bg-transparent text-white border border-white/80 px-[28px] h-[44px] text-[11px] font-[600] tracking-[0.12em] uppercase hover:bg-white hover:text-black transition-all duration-300 backdrop-blur-[2px]'
const FLECHA = 'w-8 h-8 rounded-full border border-black/15 flex items-center justify-center group-hover:bg-black group-hover:text-white transition-colors'

// La cabecera es pegajosa: cada ancla deja su alto de margen (citex.css).
const irA = (id) => (e) => {
  if (e && e.preventDefault) e.preventDefault()
  const destino = document.getElementById(id)
  if (destino) destino.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const LINEAS = [
  {
    etiqueta: 'Más Vendido', numero: '01', img: IMG.portada, alt: 'Polo Clásico', titulo: 'Polo Clásico',
    texto: 'Cuello redondo, 20/1 en Jersey Spun y Algodón Reactivo. Ideal para sublimado y DTF.',
    accion: 'Ver precios', buscar: 'Clásico',
  },
  {
    etiqueta: 'Nuevo', numero: '02', img: IMG.oversize, alt: 'Oversize', titulo: 'Oversize',
    texto: 'Corte ancho, hombro caído. El verdadero oversize. 20/1 En Jersey Spun o Algodón.',
    accion: 'Ver precios', buscar: 'Over',
  },
  {
    etiqueta: 'A medida', numero: '03', img: IMG.personalizado, alt: 'Polo Personalizado', titulo: 'Polo Personalizado',
    texto: 'Tu marca, tu etiqueta, los colores que quiera. Desde 50 unidades.',
    accion: 'Cotización', href: ENLACES.cotizador,
  },
]

const BENEFICIOS = [
  ['Directo de fábrica', 'Atención cercana y precios competitivos desde Gamarra.'],
  ['Para personalizar', 'Prendas preparadas para estampado, sublimación y bordado.'],
  ['Mayor y menor', 'Compra desde una unidad o solicita una cotización por volumen.'],
  ['Envíos', 'Coordinamos entregas a Lima y provincias según tu pedido.'],
]

const PASOS = [
  ['01', 'Elige tu modelo', 'Revisa el catálogo y cuéntanos qué necesitas.'],
  ['02', 'Solicita tu cotización', 'Indica cantidad, talla, color, material y ciudad.'],
  ['03', 'Confirma el pedido', 'Te ayudamos a definir disponibilidad y entrega.'],
  ['04', 'Recibe tu compra', 'Retira en tienda o recibe tu pedido por envío.'],
]

const PREGUNTAS = [
  ['¿Cuál es el pedido mínimo?', 'Vendemos por mayor y menor. La cantidad mínima depende del modelo y la disponibilidad; escríbenos para confirmarla.'],
  ['¿Hacen envíos a provincias?', 'Sí. Coordinamos el envío a todo el Perú con la agencia o modalidad que mejor se adapte a tu pedido.'],
  ['¿Puedo personalizar los polos?', 'Podemos orientarte para trabajar tus prendas con estampado, sublimación o bordado según el tipo de tela.'],
  ['¿Dónde está la tienda?', 'Estamos en Gamarra, La Victoria. Puedes revisar la dirección y abrir el mapa en la sección Tienda Física.'],
]

const CONFIANZA = [
  ['+500', 'Clientes por mayor'],
  ['100%', 'Algodón pima en nuestra línea premium'],
  ['Gamarra', 'Fabricación y atención en La Victoria'],
  ['Perú', 'Envíos coordinados a todo el país'],
]

/** Su cabecera. Suma lo que la tienda necesita y su web no tiene: carrito y cuenta. */
export function Cabecera({ cantidadEnCarrito = 0, onCarrito, conCuentas = false, onCuenta }) {
  const [abierto, setAbierto] = useState(false)

  // Con el menú abierto la página de atrás no se desplaza, como en su web.
  useEffect(() => {
    if (!abierto) return undefined
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const alEscape = (e) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('keydown', alEscape)
    return () => {
      document.body.style.overflow = antes
      document.removeEventListener('keydown', alEscape)
    }
  }, [abierto])

  // Primero se cierra el menú y después se desplaza: con el menú abierto la
  // página está bloqueada.
  const cerrarY = (accion) => (e) => {
    if (e && e.preventDefault && accion) e.preventDefault()
    setAbierto(false)
    if (accion) setTimeout(() => accion(), 60)
  }
  const alInicio = (e) => {
    e.preventDefault()
    setAbierto(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const carrito = (clase) => (
    <button type="button" className={clase} onClick={onCarrito} aria-label="Ver carrito">
      <ShoppingBag className="w-[18px] h-[18px]" strokeWidth={1.6} />
      {cantidadEnCarrito > 0 && <span className="citex-index-cart-badge">{cantidadEnCarrito}</span>}
    </button>
  )

  return (
    <>
      <header className="citex-index-header" aria-label="Navegación principal">
        <nav className="citex-index-nav citex-index-nav-left" aria-label="Secciones principales">
          <a href="#nosotros" onClick={irA('nosotros')}>Nosotros</a>
          <a href="#tienda" onClick={irA('tienda')}>Productos</a>
          <a href={ENLACES.cotizador} title="Arma tu pedido por mayor o personalizado">Armar mi pedido</a>
          <a href="#ubicacion" onClick={irA('ubicacion')}>Tienda física</a>
        </nav>
        <button
          className="citex-index-menu-button"
          type="button"
          aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={abierto}
          aria-controls="citex-index-mobile-menu"
          onClick={() => setAbierto((v) => !v)}
        >
          <span />
          <span />
        </button>
        <a className="citex-index-logo" href="#inicio" aria-label="CITEX inicio" onClick={alInicio}>
          <img src={IMG.logo} alt="CITEX" />
        </a>
        <div className="citex-index-nav citex-index-nav-right">
          <a className="citex-index-reclamaciones" href={ENLACES.reclamos} target="_blank" rel="noopener noreferrer">Libro de reclamaciones</a>
          <a className="citex-index-store" href="#tienda" onClick={irA('tienda')}>Comprar ahora</a>
          {conCuentas && (
            <button type="button" className="citex-index-cart citex-index-account" onClick={onCuenta} aria-label="Mi cuenta">
              <User className="w-[18px] h-[18px]" strokeWidth={1.6} />
            </button>
          )}
          {carrito('citex-index-cart')}
          <span className="citex-index-country">PE</span>
        </div>
        {/* En el celular la cabecera es una grilla de tres: menú, logo y carrito. */}
        {carrito('citex-index-cart citex-index-cart-movil')}
      </header>
      <nav className={`citex-index-mobile-menu${abierto ? ' is-open' : ''}`} id="citex-index-mobile-menu" aria-label="Navegación móvil">
        <a href="#nosotros" onClick={cerrarY(irA('nosotros'))}>Nosotros</a>
        <a href="#tienda" onClick={cerrarY(irA('tienda'))}>Productos</a>
        <a href={ENLACES.cotizador} title="Arma tu pedido por mayor o personalizado">Armar mi pedido</a>
        <a href="#ubicacion" onClick={cerrarY(irA('ubicacion'))}>Tienda física</a>
        <a href="#tienda" onClick={cerrarY(irA('tienda'))}>Comprar ahora</a>
        {conCuentas && <a href="#cuenta" onClick={cerrarY(() => onCuenta && onCuenta())}>Mi cuenta</a>}
        <a href={ENLACES.reclamos} target="_blank" rel="noopener noreferrer">Libro de reclamaciones</a>
      </nav>
    </>
  )
}

/** Su portada: la foto, el titular y los tres botones cápsula. */
export function Portada() {
  return (
    <section id="inicio" className="citex-hero relative h-[calc(100vh-52px)] min-h-[620px] bg-[#121212] overflow-hidden max-w-[100vw]">
      <div className="citex-hero-media absolute inset-0 w-full overflow-hidden">
        <img src={IMG.portada} alt="Modelo CITEX Polo Clásico" className="w-full h-full object-cover object-top lg:object-[50%_15%]" />
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent" />
      </div>
      <div className="citex-hero-body relative z-10 h-full flex items-center max-w-[100vw]">
        <div className="citex-hero-pad w-full px-6 lg:pl-[8%] lg:pr-0 flex justify-start">
          <div className="citex-hero-copy max-w-[900px] flex flex-col items-start text-left">
            <h1 className="citex-hero-title montserrat">Polos de fábrica para marcas y emprendimientos</h1>
            <p className="citex-hero-lead">Compra por mayor o menor desde Gamarra. Prendas listas para personalizar y envíos a todo el Perú.</p>
            <div className="citex-hero-actions mt-8 w-full flex items-center gap-4">
              <a className={`${PILDORA} citex-hero-quote`} href={ENLACES.cotizador} title="Elige productos, tallas, colores y estampados">Armar mi pedido</a>
              <a className={PILDORA} href="#tienda" onClick={irA('tienda')}>Comprar ahora</a>
              <a className={PILDORA_CONTORNO} href={ENLACES.catalogos} target="_blank" rel="noopener noreferrer">Ver catálogo</a>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-px bg-white/10 z-20" />
    </section>
  )
}

/** 01 / Nosotros y 02 / Productos. "Ver precios" filtra la tienda por esa línea. */
export function SeccionesAntes({ onVerLinea }) {
  return (
    <>
      <section id="nosotros" className="bg-[#1E1E1E] text-white py-20 lg:py-28 px-6 lg:px-[8%]">
        <div className="max-w-[1400px] mx-auto grid lg:grid-cols-[1.2fr_1fr] gap-10 lg:gap-20 items-end">
          <div>
            <div className="flex items-center gap-3 mb-8">
              <span className="text-[10px] tracking-[0.2em] uppercase text-white/50">01 / Nosotros</span>
              <span className="w-12 h-px bg-white/20" />
            </div>
            <h2 className="serif text-[clamp(28px,4vw,54px)] leading-[1.05] font-light">
              Polos sublimables,<br /><span className="italic text-white/70">personalizado,</span><br />por mayor y menor
            </h2>
          </div>
          <div className="lg:pb-2">
            <p className="text-[15px] leading-[1.7] text-white/70 max-w-[420px]">
              Desde Gamarra, La Victoria, confeccionamos prendas esenciales en Spun, Algodón premium y otras telas con acabados de taller propio. Especialistas en polos para sublimado, estampado y marcas independientes.
            </p>
            <div className="mt-8 flex gap-8 text-[11px] tracking-[0.12em] uppercase">
              <div>
                <div className="text-white font-[600] text-[18px] tracking-[0.02em]">+500</div>
                <div className="text-white/40 mt-1">Clientes por mayor</div>
              </div>
              <div className="w-px bg-white/10" />
              <div>
                <div className="text-white font-[600] text-[18px]">100%</div>
                <div className="text-white/40 mt-1">Algodón pima</div>
              </div>
              <div className="w-px bg-white/10" />
              <div>
                <div className="text-white font-[600] text-[18px]">Gamarra</div>
                <div className="text-white/40 mt-1">La Victoria</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="blog" className="bg-[#F4F2EE] py-20 lg:py-28 px-6 lg:px-[8%]">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex justify-between items-end mb-12">
            <div>
              <span className="text-[10px] tracking-[0.2em] uppercase text-black/40">02 / Productos</span>
              <h3 className="mt-3 text-[32px] lg:text-[42px] font-[300] tracking-[-0.02em] leading-[0.9]">Esenciales<br />de taller propio</h3>
            </div>
            <a href="#tienda" onClick={irA('tienda')} className="hidden lg:inline-flex text-[11px] tracking-[0.14em] uppercase border-b border-black pb-1 hover:opacity-60">Comprar ahora</a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-[1px] bg-black/10 border border-black/10">
            {LINEAS.map((l) => (
              <div key={l.numero} className="bg-[#F4F2EE] group p-8 lg:p-10 flex flex-col min-h-[420px] hover:bg-white transition-colors duration-500">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] tracking-[0.15em] uppercase px-2 py-1 bg-black text-white rounded-full">{l.etiqueta}</span>
                  <span className="text-[10px] tracking-[0.1em] text-black/30">{l.numero}</span>
                </div>
                <div className="mt-10 relative aspect-[4/3] overflow-hidden bg-[#E8E5E0] rounded-[12px]">
                  <img src={l.img} alt={l.alt} loading="lazy" className="w-full h-full object-cover object-top opacity-90 group-hover:scale-[1.03] transition-transform duration-[1.2s]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
                </div>
                <div className="mt-auto pt-8">
                  <h4 className="text-[22px] font-[500] tracking-[-0.01em]">{l.titulo}</h4>
                  <p className="mt-2 text-[13px] leading-[1.5] text-black/60 max-w-[28ch]">{l.texto}</p>
                  <div className="mt-6 flex items-center justify-between">
                    <span className="text-[12px] font-[600] tracking-[0.05em]">{l.accion}</span>
                    {l.href ? (
                      <a href={l.href} className={FLECHA} aria-label={`${l.accion}: ${l.titulo}`}>↗</a>
                    ) : (
                      <a
                        href="#tienda"
                        onClick={(e) => { e.preventDefault(); if (onVerLinea) onVerLinea(l.buscar) }}
                        className={FLECHA}
                        aria-label={`${l.accion}: ${l.titulo}`}
                      >↗</a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

/** Arriba de la tienda en vivo. Es también el destino de "Comprar ahora". */
export function EncabezadoTienda() {
  return (
    <div id="tienda" className="max-w-7xl mx-auto px-4 pt-16 lg:pt-20 pb-4">
      <span className="text-[10px] tracking-[0.2em] uppercase text-black/40">Tienda en línea</span>
      <h3 className="mt-3 text-[32px] lg:text-[42px] font-[300] tracking-[-0.02em] leading-[0.9]">Compra por mayor<br />o menor</h3>
    </div>
  )
}

/** Las observaciones del catálogo, con la voz de sus textos (sin recuadro gris). */
export function Notas({ texto }) {
  if (!texto) return null
  return (
    <div className="max-w-7xl mx-auto px-4 mt-2 mb-4">
      <p className="border-l border-black/10 pl-6 text-[13px] leading-[1.6] text-black/60 whitespace-pre-wrap max-w-[100ch]">{texto}</p>
    </div>
  )
}

// El formulario de su web: arma el mensaje y abre WhatsApp con él.
function FormularioCotizacion() {
  const [estado, setEstado] = useState('')
  const enviar = (e) => {
    e.preventDefault()
    const datos = new FormData(e.currentTarget)
    const valor = (nombre, porDefecto) => String(datos.get(nombre) || '').trim() || porDefecto
    const mensaje = [
      'Hola CITEX, quiero cotizar polos.',
      '',
      `Nombre: ${valor('nombre', 'Por confirmar')}`,
      `WhatsApp: ${valor('telefono', 'Por confirmar')}`,
      `Necesito: ${valor('necesidad', 'Por definir')}`,
      `Material: ${valor('material', 'Por definir')}`,
      `Cantidad: ${valor('cantidad', 'Por confirmar')}`,
      `Tallas / colores: ${valor('tallas', 'Por confirmar')}`,
      `Ciudad: ${valor('ciudad', 'Por confirmar')}`,
    ].join('\n')
    setEstado('Tu mensaje está listo en WhatsApp.')
    window.location.href = `${WHATSAPP}?text=${encodeURIComponent(mensaje)}`
  }
  return (
    <form className="citex-form" id="citex-quote-form" onSubmit={enviar}>
      <label>Nombre<input name="nombre" type="text" required autoComplete="name" placeholder="Tu nombre" /></label>
      <label>WhatsApp<input name="telefono" type="tel" required autoComplete="tel" inputMode="tel" pattern="[0-9 +()]{7,}" title="Ingresa un número de WhatsApp válido" placeholder="Tu número" /></label>
      <label>Necesito
        <select name="necesidad" defaultValue="Polos por mayor">
          <option>Polos por mayor</option>
          <option>Polos por menor</option>
          <option>Polos para mi marca</option>
          <option>Personalización</option>
        </select>
      </label>
      <label>Material
        <select name="material" defaultValue="Algodón">
          <option>Algodón</option>
          <option>Sublimación</option>
          <option>Jersey Spun</option>
          <option>Por definir</option>
        </select>
      </label>
      <label>Cantidad aproximada<input name="cantidad" type="text" required inputMode="numeric" placeholder="Ej. 50 unidades" /></label>
      <label>Ciudad<input name="ciudad" type="text" required autoComplete="address-level2" placeholder="Lima, Arequipa, etc." /></label>
      <label className="citex-form-wide">Tallas / colores<input name="tallas" type="text" placeholder="Ej. S-M-L en blanco y negro" /></label>
      <button type="submit">Enviar por WhatsApp ↗</button>
      <p className="citex-form-status" aria-live="polite">{estado}</p>
    </form>
  )
}

/** 03 / Ubicación a 08 / Empieza tu pedido: todo lo que en su web va después de los productos. */
export function SeccionesDespues() {
  return (
    <>
      <section id="ubicacion" className="bg-white py-20 lg:py-24 px-6 lg:px-[8%] border-y border-black/[0.06] mt-16">
        <div className="max-w-[1400px] mx-auto grid lg:grid-cols-2 gap-12">
          <div>
            <span className="text-[10px] tracking-[0.2em] uppercase text-black/40">03 / Ubicación</span>
            <h3 className="mt-4 serif text-[36px] lg:text-[48px] leading-[0.95]">Visítanos en<br />Gamarra</h3>
            <p className="mt-6 text-[14px] text-black/60 leading-[1.6] max-w-[40ch]">Taller y tienda física en La Victoria. Atención directa de fábrica, sin intermediarios.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-8 lg:gap-10">
            <div className="border-l border-black/10 pl-6">
              <div className="text-[10px] tracking-[0.18em] uppercase text-black/40 mb-4">Domicilio Fiscal</div>
              <div className="text-[14px] leading-[1.5] font-[500]">Av. Mexico 1590</div>
              <div className="text-[13px] text-black/60 mt-2">La Victoria — Lima — Perú<br />Gamarra</div>
              <a href={ENLACES.mapsFiscal} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-[11px] tracking-[0.1em] uppercase border-b border-black pb-1">Ver en Maps →</a>
            </div>
            <div className="border-l border-black/10 pl-6">
              <div className="text-[10px] tracking-[0.18em] uppercase text-black/40 mb-4">Tienda - Centro Comercial GAMA</div>
              <div className="text-[14px] leading-[1.5] font-[500]">JR. MARISCAL AGUSTÍN GAMARRA NRO 1215-1275</div>
              <div className="text-[13px] text-black/60 mt-2">Pasillo N3-19 Piso 3 Tienda TN 272 — Centro Comercial Gamarra Moda Plaza GAMA<br />La Victoria — Lima</div>
              <a href={ENLACES.mapsTienda} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-[11px] tracking-[0.1em] uppercase border-b border-black pb-1">Ver en Maps →</a>
            </div>
          </div>
        </div>
      </section>

      <section className="citex-conversion" aria-labelledby="citex-conversion-title">
        <div className="citex-conversion-inner">
          <div className="citex-section-head">
            <div>
              <span className="citex-kicker">04 / Por qué CITEX</span>
              <h2 id="citex-conversion-title">Polos listos para hacer crecer tu marca.</h2>
            </div>
            <p className="citex-section-copy">Elige el tipo de polo, define cantidades y recibe atención directa por WhatsApp. Pensado para emprendedores, marcas, promociones y compras rápidas de stock.</p>
          </div>
          <div className="citex-catalog-strip" id="productos">
            <a className="citex-catalog-card" href={ENLACES.pdfAlgodon} target="_blank" rel="noopener noreferrer">
              <div><span>Catálogo PDF</span><strong>Algodón para tu marca</strong><p>Revisa modelos, materiales y opciones para polos de algodón.</p></div>
              <span>Ver catálogo</span>
            </a>
            <a className="citex-catalog-card" href={ENLACES.pdfSublimacion} target="_blank" rel="noopener noreferrer">
              <div><span>Catálogo PDF</span><strong>Polos para sublimación</strong><p>Prendas listas para personalizar, vender o producir bajo pedido.</p></div>
              <span>Ver catálogo</span>
            </a>
            <a className="citex-catalog-card" href={ENLACES.cotizador}>
              <div><span>Atención rápida</span><strong>Tu pedido por mayor o personalizado</strong><p>Elige modelos, tallas y colores. Calcula tu total con precios por volumen.</p></div>
              <span>Armar mi pedido →</span>
            </a>
          </div>
          <div className="citex-benefits">
            {BENEFICIOS.map(([titulo, texto]) => (
              <article key={titulo} className="citex-benefit"><strong>{titulo}</strong><p>{texto}</p></article>
            ))}
          </div>
          <div className="citex-process">
            {PASOS.map(([numero, titulo, texto]) => (
              <div key={numero}><div className="citex-step-number">{numero}</div><strong>{titulo}</strong><p>{texto}</p></div>
            ))}
          </div>
          <div className="citex-quote" id="cotizacion">
            <div className="citex-quote-intro">
              <span className="citex-kicker">05 / Cotización</span>
              <h2>Arma tu pedido a tu medida.</h2>
              <p>Elige tus polos, combina tallas y colores y añade estampados si los necesitas. Revisa el importe y envía tu pedido a CITEX por WhatsApp.</p>
              <a className="citex-open-calculator" href={ENLACES.cotizador} title="Arma tu pedido por mayor o personalizado">Armar mi pedido →</a>
              <p>¿Necesitas asesoría? Completa el formulario y conversemos por WhatsApp.</p>
            </div>
            <FormularioCotizacion />
          </div>
          <div className="citex-faq" id="preguntas-frecuentes">
            <div>
              <span className="citex-kicker">06 / Preguntas frecuentes</span>
              <h2>Lo esencial, claro.</h2>
            </div>
            <div>
              {PREGUNTAS.map(([pregunta, respuesta]) => (
                <details key={pregunta}><summary>{pregunta}</summary><p>{respuesta}</p></details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="citex-trust" aria-labelledby="citex-trust-title">
        <div className="citex-trust-inner">
          <div>
            <span className="citex-kicker">07 / Confianza</span>
            <h2 id="citex-trust-title">Una base sólida para tu próximo pedido.</h2>
            <p className="citex-trust-copy">Trabajamos desde Gamarra con atención directa de fábrica para que puedas elegir tus prendas con claridad y comprar con respaldo.</p>
            <a className="citex-trust-link" href={ENLACES.cotizador} title="Arma tu pedido por mayor o personalizado">Armar mi pedido →</a>
          </div>
          <div className="citex-trust-grid">
            {CONFIANZA.map(([cifra, texto]) => (
              <div key={cifra} className="citex-trust-card"><strong>{cifra}</strong><span>{texto}</span></div>
            ))}
          </div>
        </div>
      </section>

      <section className="citex-final-cta" aria-labelledby="citex-final-cta-title">
        <div className="citex-final-cta-inner">
          <div>
            <span className="citex-kicker">08 / Empieza tu pedido</span>
            <h2 id="citex-final-cta-title">Define el modelo hoy y cotiza directo con fábrica.</h2>
            <p>Envíanos cantidad, tallas, color, material y ciudad. Te ayudamos a confirmar disponibilidad, precio y forma de entrega.</p>
          </div>
          <div className="citex-final-actions">
            <a href={ENLACES.whatsappCotizar} target="_blank" rel="noopener noreferrer">Cotizar por WhatsApp</a>
            <a href={ENLACES.catalogos}>Ver catálogos</a>
          </div>
        </div>
      </section>
    </>
  )
}

/** Su pie, con los datos de la empresa y las páginas legales. */
export function Pie() {
  return (
    <div className="footer citex-final-footer">
      <div className="footer-inner">
        <div>
          <div style={{ marginBottom: 16 }}>
            <img src={IMG.logo} alt="CITEX" width="180" height="37" style={{ width: 180, height: 'auto', maxWidth: '100%', objectFit: 'contain' }} />
          </div>
          <p style={{ maxWidth: '36ch' }}>Fabricamos polos esenciales para marcas que quieren crecer. Con acabados de primera. Desde Gamarra para todo el Perú.</p>
          <div className="footer-link-group">
            <div className="label">Accesos rápidos</div>
            <div className="footer-actions">
              <a href={ENLACES.whatsappCotizarPolos} target="_blank" rel="noopener noreferrer">Cotizar por WhatsApp</a>
              <a href={ENLACES.catalogos}>Ver catálogos</a>
            </div>
          </div>
          <div className="footer-link-group">
            <div className="label">Páginas legales</div>
            <div className="legal-links">
              <a href={ENLACES.privacidad}>Privacidad</a>
              <a href={ENLACES.cambios}>Cambios</a>
              <a href={ENLACES.envios}>Envíos</a>
              <a href={ENLACES.terminos}>Términos</a>
              <a href={ENLACES.reclamos} target="_blank" rel="noopener noreferrer">Libro de Reclamaciones</a>
            </div>
          </div>
        </div>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <div className="label">Datos de la empresa</div>
              <p><span>RUC:</span> <span className="white">20612459950</span></p>
              <p className="white">GRUPO CREATIVO INDEPENDIENTE TEXTIL E.I.R.L.</p>
              <p><span>Nombre comercial:</span> <span className="white">CITEX</span></p>
            </div>
            <div>
              <div className="label">Direcciones</div>
              <p><span>Fiscal:</span> Av. Mexico 1590, LA VICTORIA</p>
              <p><span>Tienda:</span> JR. MARISCAL AGUSTÍN GAMARRA NRO 1215-1275 (TIENDA TN 272 PISO 3 CENTRO COMERCIAL GAMA) LIMA - LIMA - LA VICTORIA</p>
            </div>
          </div>
        </div>
      </div>
      <div className="bottom-bar">
        <span>© {new Date().getFullYear()} CITEX. Todos los derechos reservados.</span>
        <span>Hecho en Gamarra, Perú</span>
      </div>
    </div>
  )
}

/** Su botón flotante de WhatsApp. */
export function Flotantes() {
  return (
    <a
      href={ENLACES.whatsappCotizar}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WhatsApp"
      className="citex-whatsapp fixed bottom-5 right-5 w-[56px] h-[56px] rounded-full bg-[#25D366] shadow-[0_8px_24px_rgba(0,0,0,0.25)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="white" aria-hidden="true">
        <path d="M19.05 4.94A9.9 9.9 0 0 0 12.04 2C6.51 2 2.03 6.48 2.03 12.01c0 1.76.46 3.48 1.34 4.99L2 22l5.17-1.36a9.92 9.92 0 0 0 4.74 1.21h.01c5.52 0 10-4.48 10-10 0-2.67-1.04-5.18-2.91-7.06l-.01-.01ZM12.05 20.9h-.01a8.3 8.3 0 0 1-4.23-1.16l-.3-.18-3.07.8.82-2.99-.2-.31A8.3 8.3 0 0 1 3.78 12c0-4.6 3.74-8.34 8.35-8.34 2.23 0 4.32.87 5.89 2.44a8.27 8.27 0 0 1 2.45 5.9c0 4.6-3.74 8.34-8.35 8.34l-.07.46Zm4.59-6.24c-.25-.12-1.48-.73-1.71-.81-.23-.09-.4-.13-.57.12-.17.25-.66.82-.81.99-.15.17-.3.19-.55.06-.25-.12-1.05-.39-2-1.24-.74-.66-1.24-1.47-1.38-1.72-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.24-.41.08-.17.04-.31-.02-.43-.06-.12-.57-1.37-.78-1.88-.2-.49-.41-.42-.57-.43h-.49c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.6c.12.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.48-.6 1.69-1.19.21-.58.21-1.08.15-1.19-.06-.1-.23-.16-.48-.28Z" />
      </svg>
    </a>
  )
}
