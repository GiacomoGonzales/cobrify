import { Link, useLocation } from 'react-router-dom'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { useDemo } from '@/contexts/DemoContext'
import { prefijoDeRuta } from '@/utils/demoRoutes'
import { enlaceWhatsapp } from '@/data/contacto'
import { nombreDelVisitante } from '@/utils/nombreDelVisitante'
import { plegarGuiaDemo } from '@/data/demo/operaciones'

/**
 * LA GUÍA DEL DEMO: los pocos pasos que un lead tiene que hacer para ver el
 * sistema funcionando en SU rubro (en un restaurante: abrir mesa, pedir,
 * cocina, cobrar).
 *
 * Un demo abierto sin guía es una pantalla llena de menús: el lead mira el
 * tablero, no sabe por dónde empezar y cierra. Con un paso a la vez, llega al
 * momento en que la comanda sale y la boleta se emite, que es lo que vende.
 *
 * Es una franja bajo el encabezado y no una tarjeta flotante a propósito: una
 * tarjeta tapa el botón de cobrar del POS en el celular, que es donde la
 * mayoría abre el enlace del WhatsApp.
 *
 * Los pasos los define cada rubro (`recorrido`) y se marcan solos con lo que el
 * visitante hace de verdad (`hitos`, que anotan las operaciones del demo).
 */
export default function RecorridoDemo() {
  const demo = useDemo()
  const { pathname } = useLocation()

  const recorrido = demo?.recorrido
  const pasos = recorrido?.pasos || []
  if (pasos.length === 0) return null

  const hitos = demo.demoData?.hitos || {}
  const hechos = pasos.filter((p) => hitos[p.hito]).length
  const actual = pasos.find((p) => !hitos[p.hito]) || null
  const numeroActual = actual ? pasos.indexOf(actual) + 1 : pasos.length
  const plegada = demo.demoData?.guiaPlegada === true

  if (plegada) {
    return (
      <button
        type="button"
        onClick={() => plegarGuiaDemo(false)}
        className="flex-shrink-0 flex items-center gap-1.5 w-full px-3 sm:px-6 py-1 border-b border-primary-100 bg-primary-50/60 text-left text-[12px] font-medium text-primary-700 hover:bg-primary-50"
      >
        {actual ? `Guía del demo · ${hechos} de ${pasos.length}` : 'Guía del demo · completa'}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
    )
  }

  const botonPlegar = (
    <button
      type="button"
      onClick={() => plegarGuiaDemo(true)}
      className="shrink-0 p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-white/60"
      aria-label="Plegar la guía"
      title="Plegar la guía"
    >
      <ChevronUp className="w-4 h-4" />
    </button>
  )

  // Todo hecho: el cierre lleva al WhatsApp de Cobrify, que es donde el lead
  // ya estaba conversando.
  if (!actual) {
    const negocio = nombreDelVisitante()
    const mensaje = negocio ? `${recorrido.mensaje} Mi negocio: ${negocio}.` : recorrido.mensaje
    return (
      <div className="flex-shrink-0 flex items-center gap-3 px-3 sm:px-6 py-2 border-b border-green-100 bg-green-50">
        <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-green-600 text-white">
          <Check className="w-3.5 h-3.5" />
        </span>
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-gray-700">
          <span className="font-semibold text-gray-900">¡Listo!</span> {recorrido.final}
        </p>
        <a
          href={enlaceWhatsapp(mensaje)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-md bg-green-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-green-700"
        >
          Quiero Cobrify
        </a>
        {botonPlegar}
      </div>
    )
  }

  const enEsaPagina = pathname.endsWith(`/${actual.pagina}`)

  return (
    <div className="flex-shrink-0 flex items-center gap-3 px-3 sm:px-6 py-2 border-b border-primary-100 bg-primary-50/70">
      <div className="hidden sm:flex items-center gap-1" aria-hidden="true">
        {pasos.map((p) => (
          <span key={p.hito} className={`h-1.5 w-5 rounded-full ${hitos[p.hito] ? 'bg-primary-600' : 'bg-primary-200'}`} />
        ))}
      </div>
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-gray-600">
        <span className="font-semibold text-primary-700">Paso {numeroActual} de {pasos.length}:</span>{' '}
        <span className="font-semibold text-gray-900">{actual.titulo}.</span>{' '}
        {actual.detalle}
      </p>
      {!enEsaPagina && (
        <Link
          to={`${prefijoDeRuta(pathname, true)}/${actual.pagina}`}
          className="shrink-0 text-[13px] font-semibold text-primary-700 hover:text-primary-800 whitespace-nowrap"
        >
          Ir a {actual.nombrePagina} →
        </Link>
      )}
      {botonPlegar}
    </div>
  )
}
