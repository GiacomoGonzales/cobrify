import { Link } from 'react-router-dom'
import { Lightbulb, AlertTriangle, Info, ArrowRight } from 'lucide-react'
import { getVisibleSections } from '@/data/guides/registry'

/**
 * Renderiza el CONTENIDO de una guía de uso (los archivos de src/data/guides/).
 *
 * Es el único componente que sabe dibujar una guía: lo usan tanto el panel
 * lateral de ayuda como la página /app/manual, así ambas se ven idénticas.
 *
 * REGLA DE ORO DEL CONTENIDO: cada botón, campo o texto que una guía menciona
 * debe existir con ese nombre EXACTO en la pantalla real. Nada de inventar
 * controles: una guía que nombra un botón inexistente confunde más que no
 * tener guía.
 *
 * Bloques soportados dentro de cada sección:
 *   { type: 'texto',   text }                          párrafo (admite **negrita**)
 *   { type: 'pasos',   items: ['...'] }                 lista numerada
 *   { type: 'consejo', text }                           recuadro de consejo
 *   { type: 'ojo',     text }                           recuadro de advertencia
 *   { type: 'ui',      kind, label, nota? }             maqueta de un control real
 *       kind: 'boton' | 'botonSecundario' | 'campo' | 'toggle'
 *   { type: 'enlace',  to, label }                      botón que lleva a otra página
 *       del sistema (ej. Configuración). En modo demo no se muestra, porque las
 *       rutas /app no existen ahí.
 *
 * Condiciones por sección:
 *   soloModos: ['retail', ...]   la sección solo existe en esos modos (se oculta)
 *   requiereOpcion: { flag, nombre, donde, ruta?, defaultOn? }
 *       NO oculta: muestra la sección con una nota "requiere activar X" cuando
 *       la opción está apagada, para que el usuario descubra la función. Si trae
 *       `ruta`, el "donde" es un enlace directo a esa página.
 */

/** Convierte los **tramos en negrita** de un texto plano en <strong>. */
const renderInline = (text = '') =>
  String(text)
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i} className="font-semibold text-gray-900">
          {part.slice(2, -2)}
        </strong>
      ) : (
        part
      )
    )

/** ¿La opción de configuración de esta sección está apagada? */
const optionIsOff = (requiereOpcion, businessSettings) => {
  if (!requiereOpcion?.flag) return false
  const value = businessSettings?.[requiereOpcion.flag]
  // Opciones que nacen encendidas (defaultOn): solo avisar si están en false
  // explícito. Opciones que nacen apagadas: avisar salvo que estén en true.
  return requiereOpcion.defaultOn ? value === false : value !== true
}

/** Maqueta estática de un control de la interfaz, para que el usuario lo reconozca. */
const UiMock = ({ kind, label, nota }) => {
  let control = null
  if (kind === 'boton') {
    control = (
      <span className="inline-flex items-center px-4 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg select-none">
        {label}
      </span>
    )
  } else if (kind === 'botonSecundario') {
    control = (
      <span className="inline-flex items-center px-4 py-1.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg select-none">
        {label}
      </span>
    )
  } else if (kind === 'campo') {
    control = (
      <span className="inline-flex items-center w-full max-w-xs px-3 py-1.5 bg-white border border-gray-300 text-gray-400 text-sm rounded-lg select-none">
        {label}
      </span>
    )
  } else if (kind === 'toggle') {
    control = (
      <span className="inline-flex items-center gap-2 select-none">
        <span className="relative inline-flex w-9 h-5 bg-primary-600 rounded-full">
          <span className="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full" />
        </span>
        <span className="text-sm text-gray-700">{label}</span>
      </span>
    )
  }
  return (
    <div className="my-2">
      <div className="inline-flex items-center gap-2 p-2.5 bg-gray-50 border border-dashed border-gray-300 rounded-lg">
        {control}
      </div>
      {nota && <p className="mt-1 text-xs text-gray-500">{nota}</p>}
    </div>
  )
}

const Block = ({ block, isDemoMode, onNavigate }) => {
  switch (block.type) {
    case 'texto':
      return <p className="text-sm text-gray-700 leading-relaxed">{renderInline(block.text)}</p>

    case 'pasos':
      return (
        <ol className="space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-sm text-gray-700 leading-relaxed">
              <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary-50 text-primary-700 text-xs font-bold mt-0.5">
                {i + 1}
              </span>
              <span className="pt-0.5">{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      )

    case 'consejo':
      return (
        <div className="flex gap-2.5 p-3 bg-blue-50 border border-blue-100 rounded-lg">
          <Lightbulb className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-900 leading-relaxed">{renderInline(block.text)}</p>
        </div>
      )

    case 'ojo':
      return (
        <div className="flex gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900 leading-relaxed">{renderInline(block.text)}</p>
        </div>
      )

    case 'ui':
      return <UiMock kind={block.kind} label={block.label} nota={block.nota} />

    case 'enlace':
      // En demo las rutas /app no existen: se omite el enlace.
      if (isDemoMode) return null
      return (
        <Link
          to={block.to}
          onClick={onNavigate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-700 border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors"
        >
          {block.label}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )

    default:
      return null
  }
}

export default function GuideRenderer({
  content,
  businessMode,
  businessSettings,
  anchorPrefix = 'sec',
  isDemoMode = false,
  onNavigate,
}) {
  if (!content) return null

  const sections = getVisibleSections(content, businessMode)

  return (
    <div className="space-y-8">
      {content.intro && (
        <p className="text-sm text-gray-600 leading-relaxed">{renderInline(content.intro)}</p>
      )}

      {sections.map(section => (
        <section key={section.id} id={`${anchorPrefix}-${section.id}`} className="scroll-mt-4">
          <h3 className="text-base font-bold text-gray-900 mb-3">{section.title}</h3>

          {optionIsOff(section.requiereOpcion, businessSettings) && (
            <div className="flex gap-2 items-start p-2.5 mb-3 bg-gray-50 border border-gray-200 rounded-lg">
              <Info className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-gray-600 leading-relaxed">
                Para usar esto primero activa{' '}
                <span className="font-semibold">{section.requiereOpcion.nombre}</span>
                {section.requiereOpcion.donde ? (
                  <>
                    {' '}en{' '}
                    {section.requiereOpcion.ruta && !isDemoMode ? (
                      <Link
                        to={section.requiereOpcion.ruta}
                        onClick={onNavigate}
                        className="font-semibold text-primary-700 hover:underline"
                      >
                        {section.requiereOpcion.donde}
                      </Link>
                    ) : (
                      section.requiereOpcion.donde
                    )}
                  </>
                ) : null}
                .
              </p>
            </div>
          )}

          <div className="space-y-3">
            {(section.blocks || []).map((block, i) => (
              <Block key={i} block={block} isDemoMode={isDemoMode} onNavigate={onNavigate} />
            ))}
          </div>
        </section>
      ))}

      {Array.isArray(content.preguntas) && content.preguntas.length > 0 && (
        <section id={`${anchorPrefix}-preguntas`} className="scroll-mt-4">
          <h3 className="text-base font-bold text-gray-900 mb-3">Preguntas frecuentes</h3>
          <div className="space-y-4">
            {content.preguntas.map((item, i) => (
              <div key={i}>
                <p className="text-sm font-semibold text-gray-900 mb-1">{item.q}</p>
                <p className="text-sm text-gray-700 leading-relaxed">{renderInline(item.a)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {content.actualizado && (
        <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
          Guía actualizada el {content.actualizado}
        </p>
      )}
    </div>
  )
}
