import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  MessageCircle, ArrowRight, Check, FileText, ShoppingCart, Package,
  Users, BarChart3, ClipboardList, Handshake, ShieldCheck,
  LayoutDashboard, Wallet, Settings, Bell, Search, TrendingUp, TrendingDown,
  Signal, Wifi, BatteryFull, Home, MoreHorizontal,
} from 'lucide-react'

// Landing alternativa (previsualización en /landing-nueva).
// Dirección: B2B PREMIUM estilo Stripe/Shopify — fondo claro, navy corporativo,
// degradado animado sutil en el hero, captura real del producto en marco de navegador,
// bordes finos, mucho aire y reveals discretos. Seriedad para empresas.

const WA_BASE = 'https://wa.me/51900434988'
const waLink = (text) => `${WA_BASE}?text=${encodeURIComponent(text)}`

const RUBROS = [
  'Bodegas', 'Restaurantes', 'Farmacias', 'Ferreterías', 'Boutiques', 'Minimarkets',
  'Hoteles', 'Veterinarias', 'Pollerías', 'Ópticas', 'Licorerías', 'Librerías',
]

// Mockup de teléfono (marco titanio + isla + reflejo) con una captura como pantalla.
// `width` controla el tamaño; la isla escala proporcional. Reutilizado para Play Store y App Store.
function PhoneMock({ src, alt, width = 210 }) {
  const island = Math.round(width * 0.32)
  return (
    <div className="relative" style={{ width }}>
      <div className="relative" style={{ borderRadius: '2.6rem', padding: '2px', background: 'linear-gradient(135deg,#5b5e66 0%,#23262d 18%,#0c0d11 50%,#1a1c21 78%,#3a3d44 100%)', boxShadow: '0 40px 70px -24px rgba(10,37,64,.55)' }}>
        <div style={{ background: '#050608', borderRadius: '2.5rem', padding: '5px' }}>
          <div className="relative overflow-hidden" style={{ borderRadius: '2.15rem' }}>
            <img src={src} alt={alt} loading="lazy" className="block w-full" />
            <div className="absolute left-1/2" style={{ top: '8px', transform: 'translateX(-50%)', width: island, height: Math.round(island * 0.28), borderRadius: '999px', background: '#050608' }} />
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(135deg,rgba(255,255,255,.10),rgba(255,255,255,0) 28%)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LandingPageV2() {
  // Reveal discreto al hacer scroll (se desactiva con prefers-reduced-motion)
  useEffect(() => {
    const els = document.querySelectorAll('.lp3r')
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach(el => el.classList.add('lp3r-in'))
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('lp3r-in')
            observer.unobserve(e.target)
          }
        })
      },
      { threshold: 0.12 }
    )
    els.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <div className="lp3-root min-h-screen">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        .lp3-root {
          --navy: #0A2540;
          --body: #425466;
          --soft: #F6F9FC;
          --border: #E6EBF1;
          --blue: #2563EB;
          --blue-dark: #1D4ED8;
          --cyan: #06B6D4;
          background: #fff;
          color: var(--navy);
          font-family: 'Plus Jakarta Sans', -apple-system, 'Segoe UI', sans-serif;
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden;
        }
        .lp3-container { max-width: 73rem; margin: 0 auto; padding-left: 1.5rem; padding-right: 1.5rem; }
        .lp3-section { scroll-margin-top: 96px; }
        .lp3-eyebrow {
          font-size: .8rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
          color: var(--blue); margin-bottom: 1rem;
        }

        /* ===== Degradado animado del hero (estilo Stripe, sutil) ===== */
        .lp3-hero-bg { position: absolute; inset: 0 0 auto 0; height: 760px; overflow: hidden; pointer-events: none; }
        .lp3-ribbon {
          position: absolute; left: -10%; right: -10%; top: -42%; height: 115%;
          transform: skewY(-8deg); transform-origin: top left;
          background:
            radial-gradient(42% 60% at 18% 42%, rgba(37, 99, 235, .20), transparent 70%),
            radial-gradient(38% 55% at 62% 28%, rgba(6, 182, 212, .18), transparent 70%),
            radial-gradient(46% 62% at 88% 58%, rgba(59, 130, 246, .14), transparent 70%),
            linear-gradient(100deg, #F2F7FF 0%, #EAF6FB 45%, #F4F1FF 100%);
          background-size: 160% 160%;
          animation: lp3-mesh 16s ease-in-out infinite alternate;
        }
        .lp3-ribbon::after {
          content: ''; position: absolute; inset: 0;
          background:
            radial-gradient(30% 45% at 40% 70%, rgba(14, 165, 233, .16), transparent 70%),
            radial-gradient(26% 40% at 75% 20%, rgba(99, 162, 255, .16), transparent 70%);
          background-size: 170% 170%;
          animation: lp3-mesh 22s ease-in-out infinite alternate-reverse;
        }
        @keyframes lp3-mesh {
          0% { background-position: 0% 0%; }
          100% { background-position: 100% 100%; }
        }

        /* ===== Botones ===== */
        .lp3-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
          padding: .8rem 1.45rem; border-radius: 999px; font-weight: 600; font-size: .95rem;
          text-decoration: none; transition: background .18s ease, box-shadow .18s ease, transform .18s ease, color .18s ease;
          white-space: nowrap;
        }
        .lp3-btn:active { transform: translateY(1px); }
        .lp3-primary { background: var(--blue); color: #fff; box-shadow: 0 4px 14px -4px rgba(37, 99, 235, .5); }
        .lp3-primary:hover { background: var(--blue-dark); box-shadow: 0 8px 22px -6px rgba(37, 99, 235, .55); transform: translateY(-1px); }
        .lp3-secondary { background: #fff; color: var(--navy); border: 1px solid var(--border); box-shadow: 0 1px 3px rgba(10, 37, 64, .08); }
        .lp3-secondary:hover { border-color: #C9D4E3; box-shadow: 0 4px 12px rgba(10, 37, 64, .1); transform: translateY(-1px); }
        .lp3-ondark { background: #fff; color: var(--navy); }
        .lp3-ondark:hover { background: #EAF1FA; transform: translateY(-1px); }
        .lp3-link { color: var(--blue); font-weight: 600; display: inline-flex; align-items: center; gap: .35rem; text-decoration: none; }
        .lp3-link:hover { color: var(--blue-dark); }

        /* ===== Tarjetas ===== */
        .lp3-card {
          background: #fff; border: 1px solid var(--border); border-radius: 14px;
          transition: box-shadow .22s ease, transform .22s ease, border-color .22s ease;
        }
        .lp3-card:hover {
          box-shadow: 0 18px 36px -16px rgba(10, 37, 64, .16), 0 4px 10px rgba(10, 37, 64, .05);
          transform: translateY(-3px); border-color: #D8E1EC;
        }
        .lp3-icon {
          width: 2.6rem; height: 2.6rem; border-radius: 10px; display: flex; align-items: center; justify-content: center;
          background: #EFF6FF; color: var(--blue); margin-bottom: 1.1rem;
        }

        /* ===== Marco de navegador (captura del producto) ===== */
        .lp3-browser {
          background: #fff; border-radius: 14px; border: 1px solid var(--border); overflow: hidden;
          box-shadow: 0 50px 100px -24px rgba(50, 50, 93, .28), 0 24px 48px -28px rgba(10, 37, 64, .3);
        }
        .lp3-browser-bar {
          display: flex; align-items: center; gap: .9rem; padding: .65rem 1rem;
          background: #F6F9FC; border-bottom: 1px solid var(--border);
        }
        .lp3-url {
          flex: 1; max-width: 22rem; margin: 0 auto; background: #fff; border: 1px solid var(--border);
          border-radius: 999px; font-size: .72rem; color: var(--body); padding: .28rem .9rem; text-align: center;
        }

        /* ===== Reveal ===== */
        .lp3r { opacity: 0; transform: translateY(22px); transition: opacity .65s ease, transform .65s cubic-bezier(.2, .7, .2, 1); }
        .lp3r-in { opacity: 1; transform: none; }

        /* ===== Marquee sobrio ===== */
        .lp3-marquee { overflow: hidden; position: relative; }
        .lp3-marquee::before, .lp3-marquee::after {
          content: ''; position: absolute; top: 0; bottom: 0; width: 7rem; z-index: 1; pointer-events: none;
        }
        .lp3-marquee::before { left: 0; background: linear-gradient(90deg, #fff, transparent); }
        .lp3-marquee::after { right: 0; background: linear-gradient(-90deg, #fff, transparent); }
        .lp3-marquee-track { display: flex; width: max-content; animation: lp3-marquee 44s linear infinite; }
        @keyframes lp3-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }

        @media (prefers-reduced-motion: reduce) {
          .lp3-ribbon, .lp3-ribbon::after, .lp3-marquee-track { animation: none !important; }
        }
      `}</style>

      {/* WhatsApp flotante (discreto) */}
      <a
        href={waLink('Hola, quiero información sobre Cobrify')}
        target="_blank" rel="noopener noreferrer" aria-label="Escríbenos por WhatsApp"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center transition-transform hover:scale-105"
        style={{ background: '#16A34A', boxShadow: '0 10px 26px -8px rgba(22, 163, 74, .55)' }}
      >
        <MessageCircle className="w-7 h-7 text-white" fill="white" />
      </a>

      {/* ===== Header ===== */}
      <header className="fixed top-0 w-full z-40" style={{ background: 'rgba(255,255,255,.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
        <nav className="lp3-container flex items-center justify-between py-3.5">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Cobrify" className="w-9 h-9 object-contain" width="36" height="36" />
            <span className="text-[1.35rem] font-extrabold tracking-tight">Cobrify</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-[0.93rem] font-semibold" style={{ color: 'var(--body)' }}>
            <a href="#caracteristicas" className="hover:text-[var(--navy)] transition-colors">Producto</a>
            <a href="#como-funciona" className="hover:text-[var(--navy)] transition-colors">Cómo funciona</a>
            <a href="#demos" className="hover:text-[var(--navy)] transition-colors">Demos</a>
            <a href="#resellers" className="hover:text-[var(--navy)] transition-colors">Resellers</a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="hidden sm:inline-flex text-[0.93rem] font-semibold hover:text-[var(--blue)] transition-colors" style={{ color: 'var(--navy)' }}>
              Iniciar sesión
            </Link>
            {/* Móvil: Iniciar sesión */}
            <Link to="/login" className="sm:!hidden lp3-btn lp3-primary !py-2.5 !px-4 text-sm">
              Iniciar sesión <ArrowRight className="w-4 h-4" />
            </Link>
            {/* Desktop: Contactar ventas */}
            <a href={waLink('Hola, quiero información sobre Cobrify')} target="_blank" rel="noopener noreferrer" className="!hidden sm:!inline-flex lp3-btn lp3-primary !py-2.5 !px-4 text-sm">
              Contactar ventas <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </nav>
      </header>

      {/* ===== Hero ===== */}
      <section className="relative pt-32 lg:pt-40 pb-10">
        <div className="lp3-hero-bg" aria-hidden="true">
          <div className="lp3-ribbon"></div>
        </div>

        <div className="lp3-container relative">
          <div className="grid lg:grid-cols-[2.2fr_1fr] lg:gap-10 items-center">
            <div className="max-w-3xl">
            <div className="lp3r inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 mb-7 text-[0.8rem] font-semibold" style={{ border: '1px solid var(--border)', color: 'var(--body)', boxShadow: '0 1px 3px rgba(10,37,64,.06)' }}>
              <ShieldCheck className="w-4 h-4" style={{ color: 'var(--blue)' }} />
              Homologado con SUNAT · Facturación electrónica
            </div>
            <h1 className="lp3r font-extrabold leading-[1.04] tracking-tight" style={{ fontSize: 'clamp(2.6rem, 5.8vw, 4.4rem)', transitionDelay: '.07s' }}>
              La plataforma de facturación para hacer crecer tu negocio
            </h1>
            <p className="lp3r mt-6 text-lg lg:text-xl leading-relaxed max-w-2xl" style={{ color: 'var(--body)', transitionDelay: '.14s' }}>
              Punto de venta, inventario, clientes y comprobantes electrónicos en una sola
              plataforma. Miles de negocios peruanos venden y declaran a SUNAT con Cobrify,
              desde la web o el celular.
            </p>
            <div className="lp3r mt-9 flex flex-col sm:flex-row gap-3.5" style={{ transitionDelay: '.21s' }}>
              <Link to="/demo" className="lp3-btn lp3-primary">
                Probar demo gratis <ArrowRight className="w-4 h-4" />
              </Link>
              <a href={waLink('Hola, quiero información sobre Cobrify')} target="_blank" rel="noopener noreferrer" className="lp3-btn lp3-secondary">
                Hablar con ventas
              </a>
            </div>
            </div>
            <div className="lp3r relative mt-4 lg:mt-0" style={{ transitionDelay: '.18s' }}>
              <div className="absolute inset-0 z-0" style={{ background: 'radial-gradient(60% 60% at 55% 45%, rgba(37,99,235,.20), transparent 70%)' }} />
              <picture className="relative z-10 block w-full max-w-[16rem] sm:max-w-[18rem] lg:max-w-[22rem] mx-auto lg:ml-auto">
                <source srcSet="/landing/printer-cobrify.webp" type="image/webp" />
                <img src="/landing/printer-cobrify.png" alt="Impresora térmica Cobrify imprimiendo una factura electrónica con QR" className="block w-full" style={{ filter: 'drop-shadow(0 28px 50px rgba(10,37,64,.3))' }} />
              </picture>
            </div>
          </div>

          {/* Vista previa del punto de venta (mockup CSS) en marco de navegador */}
          <div className="lp3r mt-16 lg:mt-20" style={{ transitionDelay: '.28s' }}>
            <div className="lp3-browser max-w-5xl mx-auto">
              <div className="lp3-browser-bar">
                <span className="flex gap-1.5">
                  <span className="w-3 h-3 rounded-full" style={{ background: '#FF5F57' }}></span>
                  <span className="w-3 h-3 rounded-full" style={{ background: '#FEBC2E' }}></span>
                  <span className="w-3 h-3 rounded-full" style={{ background: '#28C840' }}></span>
                </span>
                <span className="lp3-url">cobrifyperu.com/app/pos</span>
                <span className="w-12"></span>
              </div>

              <div aria-hidden="true" className="flex" style={{ background: 'var(--soft)' }}>
                {/* Sidebar de la app */}
                <aside className="hidden md:block w-[150px] shrink-0 bg-white" style={{ borderRight: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-1.5 px-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                    <img src="/logo.png" className="w-5 h-5 object-contain" alt="" />
                    <span className="text-[0.8rem] font-extrabold" style={{ color: 'var(--blue)' }}>Cobrify</span>
                  </div>
                  <nav className="p-2 space-y-0.5">
                    {[
                      [LayoutDashboard, 'Dashboard', false],
                      [ShoppingCart, 'Punto de Venta', true],
                      [Wallet, 'Control de Caja', false],
                      [FileText, 'Ventas', false],
                      [Users, 'Clientes', false],
                      [Package, 'Productos', false],
                      [BarChart3, 'Reportes', false],
                      [Settings, 'Configuración', false],
                    ].map(([Ic, label, active]) => (
                      <div key={label} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[0.66rem] font-semibold"
                        style={active ? { background: '#EFF6FF', color: 'var(--blue)' } : { color: 'var(--body)' }}>
                        <Ic className="w-3 h-3 shrink-0" />
                        <span className="truncate">{label}</span>
                      </div>
                    ))}
                  </nav>
                </aside>

                <div className="flex-1 min-w-0">
                  {/* Cabecera de la app */}
                  <div className="flex items-center justify-between bg-white px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <p className="text-[0.88rem] font-extrabold leading-none">Punto de Venta</p>
                      <p className="text-[0.62rem] mt-1" style={{ color: '#8898AA' }}>Selecciona productos para la venta</p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Bell className="w-3.5 h-3.5" style={{ color: '#8898AA' }} />
                      <div className="text-right leading-tight hidden sm:block">
                        <p className="text-[0.62rem] font-bold">Usuario Demo</p>
                        <p className="text-[0.56rem]" style={{ color: '#8898AA' }}>demo@facturacion.pe</p>
                      </div>
                      <span className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: '#EFF6FF' }}>
                        <Users className="w-3 h-3" style={{ color: 'var(--blue)' }} />
                      </span>
                    </div>
                  </div>

                  <div className="grid lg:grid-cols-[1fr_238px]">
                    {/* Catálogo */}
                    <div className="p-3 min-w-0">
                      <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-1.5 mb-2.5" style={{ border: '1px solid var(--border)' }}>
                        <Search className="w-3 h-3 shrink-0" style={{ color: '#8898AA' }} />
                        <span className="text-[0.66rem] truncate" style={{ color: '#8898AA' }}>Buscar producto por nombre o código...</span>
                      </div>
                      <div className="flex gap-1.5 mb-2.5 flex-wrap">
                        {['Todas', 'Electrónica', 'Accesorios', 'Servicio Técnico', 'Sin categoría'].map((c, i) => (
                          <span key={c} className="text-[0.6rem] font-bold rounded-full px-2.5 py-1"
                            style={i === 0 ? { background: 'var(--blue)', color: '#fff' } : { background: '#fff', border: '1px solid var(--border)', color: 'var(--body)' }}>
                            {c}
                          </span>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {[
                          { img: '/landing/pos-laptop.jpg', n: 'Laptop HP 15"', code: 'PROD001', p: 'S/ 2,500.00', st: 'Stock: 10', ok: true, badge: null },
                          { img: '/landing/pos-monitor.jpg', n: 'Monitor 24"', code: 'PROD004', p: 'S/ 650.00', st: 'Stock: 8', ok: true, badge: '1' },
                          { img: '/landing/pos-audifonos.jpg', n: 'Audífonos Bluetooth', code: 'PROD007', p: 'S/ 250.00', st: 'Stock: 25', ok: true, badge: '1' },
                          { img: '/landing/pos-mouse.jpg', n: 'Mouse Inalámbrico', code: 'PROD012', p: 'S/ 89.00', st: 'Sin stock', ok: false, badge: null },
                          { img: '/landing/pos-teclado.jpg', n: 'Teclado Mecánico', code: 'PROD014', p: 'S/ 189.00', st: 'Stock: 14', ok: true, badge: null },
                          { img: '/landing/pos-celular.jpg', n: 'Smartphone 128GB', code: 'PROD018', p: 'S/ 1,290.00', st: 'Stock: 6', ok: true, badge: null },
                          { img: '/landing/pos-impresora.jpg', n: 'Impresora Térmica', code: 'PROD021', p: 'S/ 320.00', st: 'Stock: 11', ok: true, badge: null },
                          { img: '/landing/pos-usb.jpg', n: 'USB 64GB', code: 'PROD025', p: 'S/ 45.00', st: 'Stock: 40', ok: true, badge: null },
                        ].map((p, i) => (
                          <div key={p.code} className={`relative bg-white rounded-xl overflow-hidden ${i >= 4 ? 'hidden sm:block' : ''}`} style={{ border: '1px solid var(--border)' }}>
                            {p.badge && (
                              <span className="absolute top-1.5 left-1.5 z-10 w-[1.1rem] h-[1.1rem] rounded-full text-[0.58rem] font-bold text-white flex items-center justify-center" style={{ background: 'var(--blue)' }}>{p.badge}</span>
                            )}
                            <div className="aspect-square overflow-hidden" style={{ background: 'var(--soft)' }}>
                              <img src={p.img} alt="" loading="lazy" className="w-full h-full object-cover" style={p.ok ? undefined : { opacity: .55 }} />
                            </div>
                            <div className="p-2">
                              <p className="text-[0.7rem] font-bold leading-tight truncate">{p.n}</p>
                              <p className="text-[0.58rem] mt-0.5" style={{ color: '#8898AA' }}>{p.code}</p>
                              <p className="text-[0.74rem] font-extrabold mt-1" style={{ color: 'var(--blue)' }}>{p.p}</p>
                              <p className="text-[0.6rem] font-bold" style={{ color: p.ok ? '#16A34A' : '#DC2626' }}>{p.st}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Panel derecho: comprobante + carrito */}
                    <div className="bg-white p-3 space-y-2" style={{ borderLeft: '1px solid var(--border)', borderTop: '1px solid var(--border)' }}>
                      <div>
                        <p className="text-[0.6rem] font-bold mb-1" style={{ color: 'var(--body)' }}>Almacén</p>
                        <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[0.64rem] font-semibold" style={{ border: '1px solid var(--border)' }}>
                          <span className="truncate">Almacén Principal</span><span style={{ color: '#8898AA' }}>▾</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[0.6rem] font-bold mb-1" style={{ color: 'var(--body)' }}>Tipo de Comprobante</p>
                        <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[0.64rem] font-semibold" style={{ border: '1px solid var(--border)' }}>
                          <span className="truncate">Factura Electrónica</span><span style={{ color: '#8898AA' }}>▾</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[0.6rem] font-bold mb-1" style={{ color: 'var(--body)' }}>Datos del Cliente</p>
                        <div className="space-y-1.5">
                          <div className="rounded-lg px-2.5 py-1.5 text-[0.64rem] font-semibold" style={{ border: '1px solid var(--border)' }}>20512345678</div>
                          <div className="rounded-lg px-2.5 py-1.5 text-[0.64rem] font-semibold truncate" style={{ border: '1px solid var(--border)' }}>COMERCIAL ANDINA S.A.C.</div>
                        </div>
                      </div>
                      <div>
                        <p className="text-[0.6rem] font-bold mb-1" style={{ color: 'var(--body)' }}>Forma de Pago</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          <span className="text-center text-[0.62rem] font-bold rounded-lg py-1.5" style={{ background: '#EFF6FF', border: '1px solid var(--blue)', color: 'var(--blue)' }}>Contado</span>
                          <span className="text-center text-[0.62rem] font-bold rounded-lg py-1.5" style={{ border: '1px solid var(--border)', color: 'var(--body)' }}>Crédito</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <p className="text-[0.66rem] font-bold">Carrito de Compras</p>
                        <span className="text-[0.62rem] font-extrabold rounded-md px-2 py-0.5" style={{ background: '#EFF6FF', color: 'var(--blue)' }}>Total S/ 900.00</span>
                      </div>
                      <div className="space-y-1.5">
                        {[
                          { img: '/landing/pos-monitor.jpg', n: 'Monitor 24"', m: 'S/ 650.00' },
                          { img: '/landing/pos-audifonos.jpg', n: 'Audífonos Bluetooth', m: 'S/ 250.00' },
                        ].map((it) => (
                          <div key={it.n} className="rounded-lg p-2" style={{ border: '1px solid var(--border)' }}>
                            <div className="flex items-center gap-2">
                              <img src={it.img} alt="" loading="lazy" className="w-6 h-6 rounded-md object-cover shrink-0" />
                              <span className="text-[0.64rem] font-bold truncate flex-1">{it.n}</span>
                            </div>
                            <div className="flex items-center justify-between mt-1.5">
                              <span className="flex items-center gap-1">
                                <span className="w-4 h-4 rounded flex items-center justify-center text-[0.6rem] font-bold" style={{ border: '1px solid var(--border)', color: 'var(--body)' }}>−</span>
                                <span className="text-[0.62rem] font-bold w-4 text-center">1</span>
                                <span className="w-4 h-4 rounded flex items-center justify-center text-[0.6rem] font-bold text-white" style={{ background: 'var(--blue)' }}>+</span>
                              </span>
                              <span className="text-[0.66rem] font-extrabold">{it.m}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-xl py-2 text-center text-white text-[0.72rem] font-bold" style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', boxShadow: '0 6px 16px -6px rgba(37,99,235,.5)' }}>
                        Emitir Factura · S/ 900.00
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Rubros (marquee sobrio) ===== */}
      <section className="py-12" aria-hidden="true">
        <p className="text-center text-[0.8rem] font-semibold uppercase tracking-[0.14em] mb-6" style={{ color: '#8898AA' }}>
          Acompaña a negocios de todos los rubros
        </p>
        <div className="lp3-marquee">
          <div className="lp3-marquee-track">
            {[0, 1].map((dup) => (
              <div key={dup} className="flex items-center gap-14 px-7 text-[1.02rem] font-bold whitespace-nowrap" style={{ color: '#A9B6C6' }}>
                {RUBROS.map((r) => <span key={`${dup}-${r}`}>{r}</span>)}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Características ===== */}
      <section id="caracteristicas" className="lp3-section py-20 lg:py-24" style={{ background: 'var(--soft)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div className="lp3-container">
          <div className="lp3r max-w-2xl mb-14">
            <p className="lp3-eyebrow">Plataforma completa</p>
            <h2 className="font-extrabold leading-tight tracking-tight" style={{ fontSize: 'clamp(1.9rem, 4vw, 2.9rem)' }}>
              Un solo sistema para operar todo tu negocio
            </h2>
            <p className="mt-4 text-lg leading-relaxed" style={{ color: 'var(--body)' }}>
              Cada módulo conectado con los demás: lo que vendes descuenta stock,
              alimenta tus reportes y queda declarado ante SUNAT.
            </p>
          </div>
          {/* Clúster de dispositivos: dashboard en computadora + celular con reporte */}
          <div className="lp3r relative pb-20 lg:pb-36" style={{ transitionDelay: '.1s' }} aria-hidden="true">
            {/* ===== Computadora: panel de reportes ===== */}
            <div className="lp3-browser mx-auto" style={{ maxWidth: '60rem' }}>
              <div className="lp3-browser-bar">
                <span className="flex gap-1.5">
                  <span className="w-3 h-3 rounded-full" style={{ background: '#FF5F57' }}></span>
                  <span className="w-3 h-3 rounded-full" style={{ background: '#FEBC2E' }}></span>
                  <span className="w-3 h-3 rounded-full" style={{ background: '#28C840' }}></span>
                </span>
                <span className="lp3-url">cobrifyperu.com/app/dashboard</span>
                <span className="w-12"></span>
              </div>

              <div className="flex" style={{ background: 'var(--soft)' }}>
                {/* Sidebar (Dashboard activo) */}
                <aside className="hidden md:block w-[150px] shrink-0 bg-white" style={{ borderRight: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-1.5 px-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                    <img src="/logo.png" className="w-5 h-5 object-contain" alt="" />
                    <span className="text-[0.8rem] font-extrabold" style={{ color: 'var(--blue)' }}>Cobrify</span>
                  </div>
                  <nav className="p-2 space-y-0.5">
                    {[
                      [LayoutDashboard, 'Dashboard', true],
                      [ShoppingCart, 'Punto de Venta', false],
                      [Wallet, 'Control de Caja', false],
                      [FileText, 'Ventas', false],
                      [Users, 'Clientes', false],
                      [Package, 'Productos', false],
                      [BarChart3, 'Reportes', false],
                      [Settings, 'Configuración', false],
                    ].map(([Ic, label, active]) => (
                      <div key={label} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[0.66rem] font-semibold"
                        style={active ? { background: '#EFF6FF', color: 'var(--blue)' } : { color: 'var(--body)' }}>
                        <Ic className="w-3 h-3 shrink-0" />
                        <span className="truncate">{label}</span>
                      </div>
                    ))}
                  </nav>
                </aside>

                <div className="flex-1 min-w-0">
                  {/* Cabecera */}
                  <div className="flex items-center justify-between bg-white px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <p className="text-[0.88rem] font-extrabold leading-none">Dashboard</p>
                      <p className="text-[0.62rem] mt-1" style={{ color: '#8898AA' }}>Resumen de tu negocio · Hoy</p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[0.6rem] font-bold rounded-lg px-2.5 py-1 hidden sm:block" style={{ border: '1px solid var(--border)', color: 'var(--body)' }}>Últimos 7 días ▾</span>
                      <Bell className="w-3.5 h-3.5" style={{ color: '#8898AA' }} />
                      <span className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: '#EFF6FF' }}>
                        <Users className="w-3 h-3" style={{ color: 'var(--blue)' }} />
                      </span>
                    </div>
                  </div>

                  <div className="p-3 lg:p-4 space-y-3">
                    {/* KPIs */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {[
                        { Ic: TrendingUp, l: 'Ventas hoy', v: 'S/ 4,820', d: '+12%', up: true, bg: '#DCFCE7', tx: '#16A34A' },
                        { Ic: FileText, l: 'Comprobantes', v: '38', d: 'emitidos', up: null, bg: '#DBEAFE', tx: '#1D4ED8' },
                        { Ic: Wallet, l: 'Ticket promedio', v: 'S/ 126', d: '+4%', up: true, bg: '#EDE9FE', tx: '#7C3AED' },
                        { Ic: ClipboardList, l: 'Por cobrar', v: 'S/ 1,240', d: '6 pendientes', up: false, bg: '#FEF3C7', tx: '#B45309' },
                      ].map((k) => (
                        <div key={k.l} className="bg-white rounded-xl p-3" style={{ border: '1px solid var(--border)' }}>
                          <div className="flex items-center justify-between">
                            <span className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: k.bg }}>
                              <k.Ic className="w-3 h-3" style={{ color: k.tx }} />
                            </span>
                            {k.up !== null && (
                              <span className="flex items-center gap-0.5 text-[0.56rem] font-bold" style={{ color: k.up ? '#16A34A' : '#B45309' }}>
                                {k.up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}{k.d}
                              </span>
                            )}
                          </div>
                          <p className="text-[1.05rem] font-extrabold mt-2 leading-none">{k.v}</p>
                          <p className="text-[0.58rem] mt-1" style={{ color: '#8898AA' }}>{k.up === null ? `${k.l} · ${k.d}` : k.l}</p>
                        </div>
                      ))}
                    </div>

                    {/* Gráficos */}
                    <div className="grid lg:grid-cols-[1.55fr_1fr] gap-2.5">
                      {/* Barras: ventas de la semana */}
                      <div className="bg-white rounded-xl p-3.5" style={{ border: '1px solid var(--border)' }}>
                        <div className="flex items-start justify-between mb-1">
                          <div>
                            <p className="text-[0.7rem] font-bold">Ventas de la semana</p>
                            <p className="text-[0.55rem]" style={{ color: '#8898AA' }}>+18% vs. semana anterior</p>
                          </div>
                          <p className="text-[0.62rem] font-extrabold rounded-md px-2 py-0.5" style={{ background: '#EFF6FF', color: 'var(--blue)' }}>S/ 27,000</p>
                        </div>
                        <div className="flex gap-2 pt-5">
                          {/* Eje Y */}
                          <div className="flex flex-col justify-between text-right shrink-0 text-[0.5rem] font-semibold" style={{ color: '#A9B6C6', width: 24, height: '5.5rem' }}>
                            <span>S/6k</span><span>4k</span><span>2k</span><span>0</span>
                          </div>
                          <div className="flex-1">
                            {/* Área de barras con líneas guía */}
                            <div className="relative" style={{ height: '5.5rem' }}>
                              {[33.3, 66.6, 100].map((p) => (
                                <div key={p} className="absolute left-0 right-0" style={{ bottom: `${p}%`, borderTop: '1px dashed var(--border)' }} />
                              ))}
                              <div className="relative flex items-end gap-2" style={{ height: '100%' }}>
                                {[[48, '3.1k'], [62, '3.9k'], [38, '2.4k'], [72, '4.6k'], [88, '5.8k'], [80, '5.2k'], [32, '2.0k']].map(([pct, val], i) => (
                                  <div key={i} className="relative flex-1 rounded-t-md" style={{ height: `${pct}%`, background: i === 4 ? 'linear-gradient(180deg,#22D3EE,#2563EB)' : 'linear-gradient(180deg,#93C5FD,#3B82F6)', opacity: i === 4 ? 1 : .85 }}>
                                    <span className="absolute left-1/2 text-[0.5rem] font-bold whitespace-nowrap" style={{ bottom: 'calc(100% + 3px)', transform: 'translateX(-50%)', color: i === 4 ? 'var(--blue)' : '#8898AA' }}>{val}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="flex gap-2 mt-1">
                              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                                <span key={i} className="flex-1 text-center text-[0.5rem] font-semibold" style={{ color: '#8898AA' }}>{d}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Donut: métodos de pago + top productos */}
                      <div className="bg-white rounded-xl p-3.5" style={{ border: '1px solid var(--border)' }}>
                        <p className="text-[0.7rem] font-bold mb-2.5">Métodos de pago</p>
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0" style={{ width: 64, height: 64 }}>
                            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'conic-gradient(#2563EB 0 45%, #06B6D4 45% 80%, #FBBF24 80% 100%)' }}></div>
                            <div className="absolute" style={{ inset: 12, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span className="text-[0.6rem] font-extrabold">38</span>
                            </div>
                          </div>
                          <div className="space-y-1.5 text-[0.6rem] font-semibold">
                            <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#2563EB' }}></span>Efectivo <span style={{ color: '#8898AA' }}>45%</span></p>
                            <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#06B6D4' }}></span>Yape <span style={{ color: '#8898AA' }}>35%</span></p>
                            <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#FBBF24' }}></span>Tarjeta <span style={{ color: '#8898AA' }}>20%</span></p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ===== iPhone: app de reportes (flota sobre la compu en desktop) ===== */}
            <div className="mx-auto mt-12 w-[244px] lg:mt-0 lg:absolute lg:-right-6 lg:-bottom-12 z-20">
              {/* Marco metálico (titanio) */}
              <div className="relative" style={{ borderRadius: '3.05rem', padding: '1px', background: 'linear-gradient(135deg,#5b5e66 0%,#23262d 18%,#0c0d11 50%,#1a1c21 78%,#3a3d44 100%)', boxShadow: '0 54px 90px -28px rgba(10,37,64,.6), 0 10px 22px -10px rgba(0,0,0,.55)' }}>
                {/* Botones laterales metálicos */}
                <span className="absolute" style={{ left: '-1px', top: '104px', width: '2px', height: '26px', borderRadius: '4px', background: 'linear-gradient(90deg,#6a6d76,#1f2228)' }} />
                <span className="absolute" style={{ left: '-1px', top: '146px', width: '2px', height: '48px', borderRadius: '4px', background: 'linear-gradient(90deg,#6a6d76,#1f2228)' }} />
                <span className="absolute" style={{ left: '-1px', top: '206px', width: '2px', height: '48px', borderRadius: '4px', background: 'linear-gradient(90deg,#6a6d76,#1f2228)' }} />
                <span className="absolute" style={{ right: '-1px', top: '168px', width: '2px', height: '70px', borderRadius: '4px', background: 'linear-gradient(270deg,#6a6d76,#1f2228)' }} />
                {/* Bisel negro */}
                <div style={{ background: '#050608', borderRadius: '3rem', padding: '5px' }}>
                  {/* Pantalla */}
                  <div className="relative overflow-hidden" style={{ borderRadius: '2.65rem', background: '#F4F7FB' }}>
                    {/* Isla dinámica */}
                    <div className="absolute left-1/2 z-30" style={{ top: '11px', transform: 'translateX(-50%)', width: '86px', height: '25px', borderRadius: '999px', background: '#050608' }} />
                    {/* Reflejo de vidrio */}
                    <div className="absolute inset-0 z-20 pointer-events-none" style={{ background: 'linear-gradient(135deg,rgba(255,255,255,.12),rgba(255,255,255,0) 30%)' }} />
                    {/* Barra de estado */}
                    <div className="flex items-center justify-between bg-white px-6 pt-3 pb-1">
                      <span className="text-[0.64rem] font-bold" style={{ color: '#0B1220' }}>9:41</span>
                      <span className="flex items-center gap-1" style={{ color: '#0B1220' }}>
                        <Signal className="w-3 h-3" />
                        <Wifi className="w-3 h-3" />
                        <BatteryFull className="w-4 h-4" />
                      </span>
                    </div>
                    {/* Cabecera de la app */}
                    <div className="flex items-center justify-between bg-white px-4 pt-2 pb-3">
                      <div>
                        <p className="text-[0.55rem]" style={{ color: '#8898AA' }}>Buen día 👋</p>
                        <p className="text-[0.85rem] font-extrabold leading-none mt-0.5">Mi negocio</p>
                      </div>
                      <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#EFF6FF' }}>
                        <Users className="w-3.5 h-3.5" style={{ color: 'var(--blue)' }} />
                      </span>
                    </div>
                    {/* Tarjeta hero */}
                    <div className="mx-3 rounded-2xl p-3.5 text-white" style={{ background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', boxShadow: '0 14px 26px -12px rgba(37,99,235,.6)' }}>
                      <p className="text-[0.54rem] uppercase tracking-widest" style={{ opacity: .85 }}>Ventas de hoy</p>
                      <p className="text-[1.6rem] font-extrabold mt-1 leading-none">S/ 4,820.00</p>
                      <div className="flex items-center justify-between mt-2.5">
                        <span className="text-[0.6rem] font-semibold flex items-center gap-1" style={{ color: '#A7F3D0' }}><TrendingUp className="w-3 h-3" /> +12% vs. ayer</span>
                        <span className="text-[0.56rem]" style={{ opacity: .85 }}>38 emitidos</span>
                      </div>
                    </div>
                    {/* Mini stats */}
                    <div className="grid grid-cols-2 gap-2 px-3 pt-3">
                      {[['Comprobantes', '38', 'hoy'], ['Ticket prom.', 'S/ 126', '+4%']].map(([l, v, d]) => (
                        <div key={l} className="rounded-xl bg-white p-2.5" style={{ border: '1px solid var(--border)' }}>
                          <p className="text-[0.52rem]" style={{ color: '#8898AA' }}>{l}</p>
                          <p className="text-[0.82rem] font-extrabold mt-0.5 leading-none">{v}</p>
                          <p className="text-[0.5rem] font-bold mt-0.5" style={{ color: '#16A34A' }}>{d}</p>
                        </div>
                      ))}
                    </div>
                    {/* Mini chart */}
                    <div className="px-4 pt-3">
                      <p className="text-[0.54rem] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#8898AA' }}>Esta semana</p>
                      <div className="flex items-end gap-1.5" style={{ height: '3rem' }}>
                        {[48, 62, 38, 72, 88, 80, 32].map((pct, i) => (
                          <div key={i} className="flex-1 rounded-t" style={{ height: `${pct}%`, background: i === 4 ? '#06B6D4' : '#BFDBFE' }} />
                        ))}
                      </div>
                    </div>
                    {/* Más vendidos */}
                    <div className="px-4 pt-3 pb-2 space-y-1.5">
                      <p className="text-[0.54rem] font-bold uppercase tracking-wider" style={{ color: '#8898AA' }}>Más vendidos</p>
                      {[
                        ['Audífonos Bluetooth', '24', '/landing/pos-audifonos.jpg'],
                        ['Monitor 24"', '11', '/landing/pos-monitor.jpg'],
                        ['USB 64GB', '40', '/landing/pos-usb.jpg'],
                      ].map(([n, q, img]) => (
                        <div key={n} className="flex items-center gap-2 bg-white rounded-lg p-1.5" style={{ border: '1px solid var(--border)' }}>
                          <img src={img} alt="" className="w-6 h-6 rounded-md object-cover shrink-0" />
                          <span className="text-[0.62rem] font-semibold truncate flex-1">{n}</span>
                          <span className="text-[0.56rem] font-bold whitespace-nowrap" style={{ color: 'var(--blue)' }}>{q} und</span>
                        </div>
                      ))}
                    </div>
                    {/* Tab bar */}
                    <div className="grid grid-cols-4 bg-white px-2 pt-2 pb-1" style={{ borderTop: '1px solid var(--border)' }}>
                      {[[Home, 'Inicio', true], [BarChart3, 'Ventas', false], [ShoppingCart, 'POS', false], [MoreHorizontal, 'Más', false]].map(([Ic, l, active]) => (
                        <div key={l} className="flex flex-col items-center gap-0.5" style={{ color: active ? 'var(--blue)' : '#A9B6C6' }}>
                          <Ic className="w-3.5 h-3.5" />
                          <span className="text-[0.5rem] font-semibold">{l}</span>
                        </div>
                      ))}
                    </div>
                    {/* Indicador home */}
                    <div className="flex justify-center bg-white pb-2 pt-1">
                      <span style={{ width: '96px', height: '4px', borderRadius: '999px', background: '#0B1220', opacity: .85 }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Cómo funciona ===== */}
      <section id="como-funciona" className="lp3-section py-20 lg:py-24">
        <div className="lp3-container">
          <div className="lp3r max-w-2xl mb-14">
            <p className="lp3-eyebrow">Cómo funciona</p>
            <h2 className="font-extrabold leading-tight tracking-tight" style={{ fontSize: 'clamp(1.9rem, 4vw, 2.9rem)' }}>
              Empieza a facturar el mismo día
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-10 lg:gap-14">
            {[
              { n: '1', t: 'Configura tu empresa', d: 'Ingresa tu RUC, tu logo y tus productos. En minutos tienes tu serie lista para emitir.' },
              { n: '2', t: 'Vende en el punto de venta', d: 'Marca los productos, cobra en efectivo, Yape o tarjeta, e imprime el ticket al instante.' },
              { n: '3', t: 'SUNAT recibe todo automáticamente', d: 'El comprobante se firma y se declara solo. Tú solo ves la constancia de aceptación.' },
            ].map((s, i) => (
              <div key={s.n} className="lp3r" style={{ transitionDelay: `${i * 0.08}s` }}>
                <div className="flex items-center gap-4 mb-4">
                  <span className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white" style={{ background: 'var(--blue)' }}>{s.n}</span>
                  <span className="hidden md:block flex-1 h-px" style={{ background: i < 2 ? 'var(--border)' : 'transparent' }}></span>
                </div>
                <h3 className="text-lg font-bold mb-2">{s.t}</h3>
                <p className="text-[0.95rem] leading-relaxed" style={{ color: 'var(--body)' }}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Demos ===== */}
      <section id="demos" className="lp3-section py-20 lg:py-24" style={{ background: 'var(--soft)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div className="lp3-container">
          <div className="lp3r flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-12">
            <div className="max-w-xl">
              <p className="lp3-eyebrow">Demos interactivas</p>
              <h2 className="font-extrabold leading-tight tracking-tight" style={{ fontSize: 'clamp(1.9rem, 4vw, 2.9rem)' }}>
                Explora el sistema antes de decidir
              </h2>
            </div>
            <p className="max-w-sm text-[0.95rem] leading-relaxed" style={{ color: 'var(--body)' }}>
              Tres entornos completos con datos de ejemplo. Sin registro y sin compromiso.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { to: '/demo', tag: 'Retail', t: 'Tiendas y comercios', d: 'Bodegas, boutiques, ferreterías, minimarkets y todo negocio que vende productos.' },
              { to: '/demorestaurant', tag: 'Restaurante', t: 'Restaurantes y bares', d: 'Mesas, comandas a cocina, mozos y precuenta. Hecho para el servicio en salón.' },
              { to: '/demopharmacy', tag: 'Farmacia', t: 'Farmacias y boticas', d: 'Lotes, vencimientos, laboratorios y registro sanitario bajo control.' },
            ].map((d, i) => (
              <Link key={d.to} to={d.to} className="lp3r lp3-card p-7 block" style={{ transitionDelay: `${i * 0.07}s`, textDecoration: 'none', color: 'var(--navy)' }}>
                <span className="inline-block text-[0.72rem] font-bold uppercase tracking-[0.12em] rounded-full px-3 py-1 mb-6" style={{ background: '#EFF6FF', color: 'var(--blue)' }}>
                  {d.tag}
                </span>
                <h3 className="text-xl font-bold mb-2">{d.t}</h3>
                <p className="text-[0.94rem] leading-relaxed mb-6" style={{ color: 'var(--body)' }}>{d.d}</p>
                <span className="lp3-link text-[0.95rem]">Explorar demo <ArrowRight className="w-4 h-4" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== App móvil ===== */}
      <section className="lp3-section py-20 lg:py-24">
        <div className="lp3-container">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="lp3r">
              <p className="lp3-eyebrow">App iOS y Android</p>
              <h2 className="font-extrabold leading-tight tracking-tight" style={{ fontSize: 'clamp(1.9rem, 4vw, 2.9rem)' }}>
                Tu negocio también en el celular
              </h2>
              <p className="mt-4 text-lg leading-relaxed max-w-lg" style={{ color: 'var(--body)' }}>
                Factura desde el celular, imprime por Bluetooth en tu ticketera y sigue
                vendiendo aunque se corte el internet: todo se sincroniza automáticamente.
              </p>
              <ul className="mt-7 space-y-3">
                {['Impresión Bluetooth en ticketeras térmicas', 'Modo offline con sincronización automática', 'Notificaciones de ventas en tiempo real'].map((t) => (
                  <li key={t} className="flex items-center gap-3 text-[0.97rem] font-medium">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: '#E8F8EE' }}>
                      <Check className="w-3.5 h-3.5" style={{ color: '#16A34A' }} />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <a href="https://play.google.com/store/apps/details?id=com.factuya.cobrify&pcampaignid=web_share" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl px-5 py-3 transition-transform hover:-translate-y-0.5" style={{ background: 'var(--navy)', color: '#fff' }}>
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92z" fill="#00D7FF"/>
                    <path d="M17.556 8.236L5.082.572C4.752.378 4.39.276 4.018.276L14.856 12 17.556 8.236z" fill="#00F076"/>
                    <path d="M17.556 15.764L14.856 12 4.018 23.724c.372 0 .734-.102 1.064-.296l12.474-7.664z" fill="#FF3A44"/>
                    <path d="M21.003 10.573l-3.447-2.337L14.856 12l2.7 3.764 3.447-2.337c.605-.41.997-1.09.997-1.854s-.392-1.444-.997-1.854v.854z" fill="#FFC107"/>
                  </svg>
                  <span className="text-left leading-tight">
                    <span className="block text-[0.6rem] uppercase tracking-widest opacity-70">Disponible en</span>
                    <span className="block font-bold">Google Play</span>
                  </span>
                </a>
                <a href="https://apps.apple.com/pe/app/cobrify-peru/id6756195760" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl px-5 py-3 transition-transform hover:-translate-y-0.5" style={{ background: 'var(--navy)', color: '#fff' }}>
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  <span className="text-left leading-tight">
                    <span className="block text-[0.6rem] uppercase tracking-widest opacity-70">Descarga en el</span>
                    <span className="block font-bold">App Store</span>
                  </span>
                </a>
              </div>
            </div>
            <div className="lp3r flex justify-center items-center" style={{ transitionDelay: '.12s' }}>
              {/* Play Store — atrás */}
              <div style={{ transform: 'rotate(-5deg)', zIndex: 1 }}>
                <PhoneMock src="/landing/app-playstore.jpg" alt="Cobrify Perú en Google Play — 4.9★, 500+ descargas" width={194} />
              </div>
              {/* App Store — adelante */}
              <div style={{ transform: 'rotate(4deg)', zIndex: 2, marginLeft: '-70px', marginTop: '26px' }}>
                <PhoneMock src="/landing/app-appstore.jpg" alt="Cobrify Perú en App Store — 5.0★" width={206} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Resellers ===== */}
      <section id="resellers" className="lp3-section py-20 lg:py-24" style={{ background: 'var(--soft)', borderTop: '1px solid var(--border)' }}>
        <div className="lp3-container">
          <div className="lp3r lp3-card p-8 lg:p-14 grid lg:grid-cols-[1.1fr_0.9fr] gap-10 items-center" style={{ boxShadow: '0 24px 48px -24px rgba(10,37,64,.12)' }}>
            <div>
              <p className="lp3-eyebrow">Programa de socios</p>
              <h2 className="font-extrabold leading-tight tracking-tight" style={{ fontSize: 'clamp(1.9rem, 4vw, 2.8rem)' }}>
                Ofrece Cobrify con tu propia marca
              </h2>
              <p className="mt-5 text-lg leading-relaxed" style={{ color: 'var(--body)' }}>
                ¿Tienes clientes que necesitan facturar? Revende el sistema en versión
                white-label: tu logo, tus colores, tu dominio y tus precios.
                Nosotros ponemos la tecnología y el soporte.
              </p>
              <a href={waLink('Hola, quiero información sobre el programa de resellers de Cobrify')} target="_blank" rel="noopener noreferrer" className="lp3-btn lp3-primary mt-8">
                <Handshake className="w-4 h-4" /> Quiero ser reseller
              </a>
            </div>
            <ul className="space-y-3">
              {[
                'Marca blanca: logo, colores y dominio propio',
                'Panel para administrar a todos tus clientes',
                'Precios preferenciales y márgenes por volumen',
                'Soporte técnico que te respalda siempre',
              ].map((t) => (
                <li key={t} className="flex items-start gap-3 rounded-xl bg-white p-4" style={{ border: '1px solid var(--border)' }}>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: '#EFF6FF' }}>
                    <Check className="w-3.5 h-3.5" style={{ color: 'var(--blue)' }} />
                  </span>
                  <span className="font-semibold text-[0.96rem]">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ===== CTA final (banda navy) ===== */}
      <section className="py-20 lg:py-28" style={{ background: 'var(--navy)' }}>
        <div className="lp3-container text-center">
          <h2 className="lp3r font-extrabold leading-[1.08] tracking-tight text-white" style={{ fontSize: 'clamp(2.1rem, 4.8vw, 3.4rem)' }}>
            Empieza a facturar con Cobrify hoy
          </h2>
          <p className="lp3r mt-5 text-lg max-w-xl mx-auto" style={{ color: '#9DB2CC', transitionDelay: '.08s' }}>
            Prueba la demo o conversa con nuestro equipo: te dejamos emitiendo
            comprobantes el mismo día.
          </p>
          <div className="lp3r mt-9 flex flex-col sm:flex-row gap-3.5 justify-center" style={{ transitionDelay: '.16s' }}>
            <Link to="/demo" className="lp3-btn lp3-ondark">
              Probar demo gratis <ArrowRight className="w-4 h-4" />
            </Link>
            <a href={waLink('Hola, quiero información sobre Cobrify')} target="_blank" rel="noopener noreferrer" className="lp3-btn" style={{ background: '#16A34A', color: '#fff' }}>
              <MessageCircle className="w-4 h-4" /> Hablar por WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="bg-white" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="lp3-container">
          {/* Sellos de confianza */}
          <div className="py-10 border-b" style={{ borderColor: 'var(--border)' }}>
            <p className="text-center text-[0.72rem] font-bold uppercase tracking-[0.18em] mb-6" style={{ color: '#8898AA' }}>
              Seguridad y cumplimiento
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-14 gap-y-7">
              {[
                ['/landing/badge-sunat.png', 'Verificado por SUNAT'],
                ['/landing/badge-iso27001.png', 'Certificación ISO 27001'],
                ['/landing/badge-cloudflare.png?v=4', 'Protegido por Cloudflare'],
              ].map(([src, alt]) => (
                <img key={alt} src={src} alt={alt} title={alt} loading="lazy" className="w-auto object-contain" style={{ height: '46px', maxWidth: '200px' }} />
              ))}
            </div>
          </div>

          {/* Columnas */}
          <div className="py-12 grid gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <img src="/logo.png" alt="Cobrify" className="w-8 h-8 object-contain" width="32" height="32" />
                <span className="text-lg font-extrabold">Cobrify</span>
              </div>
              <p className="text-sm leading-relaxed max-w-xs mb-5" style={{ color: 'var(--body)' }}>
                Plataforma de facturación electrónica, punto de venta e inventario para
                negocios en Perú. Homologado con SUNAT.
              </p>
              <a href={waLink('Hola, quiero información sobre Cobrify')} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold rounded-lg px-3.5 py-2" style={{ background: '#E8F8EE', color: '#15803D' }}>
                <MessageCircle className="w-4 h-4" /> Escríbenos por WhatsApp
              </a>
            </div>
            <div>
              <h4 className="text-[0.78rem] font-bold uppercase tracking-[0.12em] mb-4" style={{ color: '#8898AA' }}>Producto</h4>
              <ul className="space-y-2.5 text-sm font-medium" style={{ color: 'var(--body)' }}>
                <li><Link to="/demo" className="hover:text-[var(--blue)] transition-colors">Probar demo</Link></li>
                <li><Link to="/login" className="hover:text-[var(--blue)] transition-colors">Iniciar sesión</Link></li>
                <li><a href="#resellers" className="hover:text-[var(--blue)] transition-colors">Programa de resellers</a></li>
                <li><a href="#caracteristicas" className="hover:text-[var(--blue)] transition-colors">Características</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-[0.78rem] font-bold uppercase tracking-[0.12em] mb-4" style={{ color: '#8898AA' }}>Demos</h4>
              <ul className="space-y-2.5 text-sm font-medium" style={{ color: 'var(--body)' }}>
                <li><Link to="/demo" className="hover:text-[var(--blue)] transition-colors">Retail / Tienda</Link></li>
                <li><Link to="/demorestaurant" className="hover:text-[var(--blue)] transition-colors">Restaurante</Link></li>
                <li><Link to="/demopharmacy" className="hover:text-[var(--blue)] transition-colors">Farmacia</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-[0.78rem] font-bold uppercase tracking-[0.12em] mb-4" style={{ color: '#8898AA' }}>Legal</h4>
              <ul className="space-y-2.5 text-sm font-medium" style={{ color: 'var(--body)' }}>
                <li><Link to="/terminos-y-condiciones" className="hover:text-[var(--blue)] transition-colors">Términos y condiciones</Link></li>
                <li><a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--blue)] transition-colors">Política de privacidad</a></li>
                <li><a href="/delete-account.html" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--blue)] transition-colors">Eliminación de cuenta</a></li>
              </ul>
            </div>
          </div>

          {/* Barra inferior */}
          <div className="py-7 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm" style={{ borderTop: '1px solid var(--border)', color: '#8898AA' }}>
            <p>© 2026 Cobrify. Todos los derechos reservados.</p>
            <p className="flex items-center gap-1.5">Hecho en Perú 🇵🇪 · Homologado con SUNAT</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
