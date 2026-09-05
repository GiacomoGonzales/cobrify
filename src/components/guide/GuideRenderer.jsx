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
 *   { type: 'tabla',   encabezados?: [], filas: [[]] }  tabla comparativa
 *   { type: 'ui',      kind, label, nota? }             maqueta de un control real
 *       kind: 'boton' | 'botonSecundario' | 'campo' | 'toggle' | 'menu'
 *       'menu' dibuja los tres puntitos de acciones de una fila.
 *   { type: 'enlace',  to, label }                      botón que lleva a otra página
 *       del sistema (ej. Configuración). En modo demo no se muestra, porque las
 *       rutas /app no existen ahí.
 *
 * Condiciones por sección:
 *   soloModos: ['retail', ...]   la sección solo existe en esos modos (se oculta)
 *
 * Condiciones por BLOQUE:
 *   soloModos: ['pharmacy', ...]  el bloque solo se dibuja en esos modos. Para
 *       matices chicos dentro de una seccion compartida (ej. la plantilla de
 *       importacion que cambia en farmacia y veterinaria) sin partir la guia.
 *
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

/**
 * Nombre visible de cada rubro. Solo se usa en el manual PUBLICO, donde no hay
 * sesión y por lo tanto no se sabe el rubro del que lee: en vez de ocultar las
 * secciones de otros rubros —que dejaría a un restaurante sin encontrar las
 * comandas— se muestran todas, con una etiqueta que dice a quién le aplica.
 */
const NOMBRE_MODO = {
  retail: 'General',
  restaurant: 'Restaurante',
  pharmacy: 'Farmacia',
  veterinary: 'Veterinaria',
  clinic: 'Clínica',
  hotel: 'Hotelería',
  transport: 'Transporte',
  logistics: 'Logística',
  real_estate: 'Inmobiliaria',
  lending: 'Préstamos',
}

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
  } else if (kind === 'menu') {
    // Los tres puntitos que abren el menu de acciones de una fila. Se dibujan
    // porque decir "en las acciones del producto" no le dice a nadie DONDE
    // hacer clic: el usuario busca un boton con texto y no lo encuentra.
    control = (
      <span className="inline-flex items-center gap-2 select-none">
        <span className="inline-flex items-center justify-center w-7 h-7 border border-gray-300 rounded-lg bg-white text-gray-500 leading-none">
          <span className="text-base font-bold tracking-[0.08em] -mt-0.5">⋮</span>
        </span>
        {label && <span className="text-sm text-gray-700">{label}</span>}
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

const Block = ({ block, isDemoMode, onNavigate, publico = false }) => {
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

    case 'tabla':
      // Comparaciones lado a lado. Sin esto habia que escribirlas en prosa, que
      // es exactamente donde una comparacion deja de entenderse.
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            {block.encabezados && (
              <thead>
                <tr className="bg-gray-50">
                  {block.encabezados.map((h, i) => (
                    <th
                      key={i}
                      className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200"
                    >
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody className="divide-y divide-gray-100">
              {(block.filas || []).map((fila, i) => (
                <tr key={i} className="align-top">
                  {fila.map((celda, j) => (
                    <td
                      key={j}
                      className={`px-3 py-2 leading-relaxed ${j === 0 ? 'text-gray-900 font-medium' : 'text-gray-700'}`}
                    >
                      {renderInline(celda)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    case 'enlace':
      // MANUAL PUBLICO: la ruta /app existe pero exige sesion, y quien lee sin
      // cuenta no puede seguirla. Se muestra como TEXTO en vez de ocultarla: el
      // "donde esta" es informacion util aunque no se pueda hacer clic, y
      // esconderla dejaria la guia diciendo "activa X" sin decir donde.
      if (publico) {
        return (
          <p className="text-sm text-gray-500 italic">{renderInline(block.label)}</p>
        )
      }
      // En demo las rutas /app no existen: se omite el enlace.
      if (isDemoMode) return null
      // El <div> importa: el boton es inline-flex (para no estirarse a todo el
      // ancho) y sin un contenedor de bloque varios enlaces seguidos fluyen en
      // la MISMA linea y se ven amontonados. Envuelto, cada uno ocupa su renglon
      // y el espaciado de la seccion los separa parejo.
      return (
        <div>
          <Link
            to={block.to}
            onClick={onNavigate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-700 border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors"
          >
            {block.label}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
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
  // Manual PUBLICO (sin sesion): muestra TODAS las secciones, etiquetando las
  // que son de un rubro, y convierte los enlaces a la app en texto.
  publico = false,
}) {
  if (!content) return null

  // En el manual publico el lector puede elegir su rubro. Si lo eligio, las
  // secciones se filtran igual que dentro de la app; si no eligio ninguno, se
  // muestran TODAS con su etiqueta (ocultarlas dejaria a un restaurante sin
  // encontrar las comandas).
  const sinRubroElegido = publico && !businessMode
  const sections = sinRubroElegido
    ? (content.sections || [])
    : getVisibleSections(content, businessMode)

  return (
    <div className="space-y-8">
      {content.intro && (
        <p className="text-sm text-gray-600 leading-relaxed">{renderInline(content.intro)}</p>
      )}

      {sections.map(section => (
        <section
          key={section.id}
          id={`${anchorPrefix}-${section.id}`}
          // Al saltar a un ancla, el navegador deja el titulo pegado al borde de
          // arriba — y en el manual publico ahi vive el encabezado FIJO, que lo
          // tapa. `scroll-mt` reserva ese alto (el encabezado mide ~64px, mas
          // aire) para que el titulo aterrice DEBAJO. Adentro de la app el panel
          // y la pagina no tienen encabezado fijo propio, asi que alcanza con el
          // margen chico de siempre.
          className={publico ? 'scroll-mt-20' : 'scroll-mt-4'}
        >
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h3 className="text-base font-bold text-gray-900">{section.title}</h3>
            {sinRubroElegido && section.soloModos?.length > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                Solo en {section.soloModos.map(m => NOMBRE_MODO[m] || m).join(' y ')}
              </span>
            )}
          </div>

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

          {/* La opción YA está activa. El aviso de arriba no aplica, pero el
              enlace a la configuración tiene que seguir a mano: quien lee esta
              sección con la función encendida suele venir justamente a
              ajustarla o a apagarla, y antes se quedaba sin camino. */}
          {section.requiereOpcion?.ruta
            && !optionIsOff(section.requiereOpcion, businessSettings)
            && !isDemoMode && (
            <p className="text-xs mb-3">
              <Link
                to={section.requiereOpcion.ruta}
                onClick={onNavigate}
                className="font-semibold text-primary-700 hover:underline"
              >
                Ajustar {section.requiereOpcion.nombre}
              </Link>
              {section.requiereOpcion.donde ? (
                <span className="text-gray-500"> · {section.requiereOpcion.donde}</span>
              ) : null}
            </p>
          )}

          <div className="space-y-3">
            {(section.blocks || [])
              // Un BLOQUE tambien puede ser de un rubro. Sirve para el matiz
              // que no da para seccion propia: una plantilla distinta, un campo
              // extra. Sin esto habia que elegir entre inventar una seccion
              // entera o dejar el parrafo visible para todos.
              // En publico sin rubro elegido se muestra todo, igual que las
              // secciones: ocultar el bloque dejaria al lector sin saber que
              // ese matiz existe.
              .filter(b => sinRubroElegido || !b.soloModos || b.soloModos.includes(businessMode))
              .map((block, i) => (
                <Block key={i} block={block} isDemoMode={isDemoMode} onNavigate={onNavigate} publico={publico} />
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
