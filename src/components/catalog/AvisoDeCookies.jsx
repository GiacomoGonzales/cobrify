import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { leerConsentimiento, guardarConsentimiento, EVENTO_PREFERENCIAS_COOKIES } from '@/utils/pixelesDelCatalogo'

/**
 * AVISO DE COOKIES del catálogo. Aparece solo si el negocio configuró píxeles
 * de publicidad (utils/pixelesDelCatalogo) y el comprador todavía no decidió.
 * Los píxeles se cargan únicamente si acepta; si rechaza, la tienda funciona
 * igual y no se inyecta nada. La decisión queda en su navegador, por negocio,
 * y se puede cambiar con el botón "Cookies" (este mismo componente lo pinta
 * chico abajo a la izquierda, y el pie de un diseño a medida puede llamar a
 * `abrirPreferenciasDeCookies`, en utils/pixelesDelCatalogo).
 *
 * Copiado del aviso que CITEX ya tenía en su web (fondo #121212, dos botones):
 * es su política de privacidad la que describe este comportamiento.
 */
export default function AvisoDeCookies({ businessId, redes = [], politica = null, onDecidir }) {
  const [abierto, setAbierto] = useState(() => leerConsentimiento(businessId) === null)
  const [decidido, setDecidido] = useState(() => leerConsentimiento(businessId) !== null)

  useEffect(() => {
    const abrir = () => setAbierto(true)
    window.addEventListener(EVENTO_PREFERENCIAS_COOKIES, abrir)
    return () => window.removeEventListener(EVENTO_PREFERENCIAS_COOKIES, abrir)
  }, [])

  const decidir = (acepta) => {
    guardarConsentimiento(businessId, acepta)
    setAbierto(false)
    setDecidido(true)
    if (onDecidir) onDecidir(acepta)
  }

  const nombres = redes.length === 0 ? 'publicidad'
    : redes.length === 1 ? redes[0]
      : `${redes.slice(0, -1).join(', ')} y ${redes[redes.length - 1]}`

  if (!abierto) {
    if (!decidido) return null
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Cambiar preferencias de cookies"
        className="fixed left-4 bottom-4 z-[70] px-3 py-2 text-[11px] font-semibold tracking-[0.08em] uppercase bg-[#121212] text-white/85 border border-white/20 hover:text-white print:hidden"
      >
        Cookies
      </button>
    )
  }

  return (
    <section
      role="dialog"
      aria-label="Preferencias de cookies"
      className="fixed left-3 right-3 bottom-3 sm:left-5 sm:right-5 sm:bottom-5 z-[70] max-w-[760px] mx-auto p-5 sm:p-6 bg-[#121212] text-white shadow-[0_12px_40px_rgba(0,0,0,0.28)] border border-white/10 text-sm leading-relaxed print:hidden"
      style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
    >
      <p className="m-0 mb-4 text-white/80">
        <strong className="text-white">Tu privacidad importa.</strong> Usamos cookies esenciales para que la tienda
        funcione y, solo con tu permiso, cookies de {nombres} para medir nuestras campañas.
        {politica && (
          <>
            {' '}Lee nuestra{' '}
            <Link to={politica} className="text-white underline">Política de privacidad</Link>.
          </>
        )}
      </p>
      <div className="grid grid-cols-1 sm:flex gap-2 sm:gap-2.5">
        <button
          type="button"
          onClick={() => decidir(true)}
          className="px-4 py-2.5 sm:min-w-[150px] bg-white text-[#121212] border border-white text-xs font-semibold tracking-[0.04em]"
        >
          Aceptar
        </button>
        <button
          type="button"
          onClick={() => decidir(false)}
          className="px-4 py-2.5 sm:min-w-[150px] bg-transparent text-white border border-white/40 text-xs font-semibold tracking-[0.04em] hover:border-white"
        >
          Rechazar no esenciales
        </button>
      </div>
    </section>
  )
}
