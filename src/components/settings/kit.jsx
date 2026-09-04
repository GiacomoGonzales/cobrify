/**
 * KIT DE CONFIGURACIÓN — las piezas con las que se arma cada pestaña.
 *
 * Una sola forma de sección, de interruptor, de campo, de nota y de botón
 * Guardar. Antes cada bloque de Configuración estaba escrito a mano: 82
 * `SettingToggle` conviviendo con 40 checkboxes sueltos, cajas azules,
 * ámbar, verdes y rojas según el humor del día, y un icono por título.
 *
 * ── Las reglas del estilo ───────────────────────────────────────────────────
 *   - Sin iconos en títulos ni en interruptores. Un título se lee.
 *   - Un solo color de acento (primary) para lo activo y para Guardar. Rojo
 *     únicamente para lo destructivo. Todo lo demás en grises.
 *   - Las notas son grises. No hay cajas azules "informativas" ni ámbar de
 *     "atención": si algo hay que decir, se dice en gris; si es peligroso,
 *     en rojo. No hay tercer caso.
 *   - Nada de emojis.
 *
 * ── El ancla `opcion-<flag>` ────────────────────────────────────────────────
 * El manual enlaza a `/app/configuracion?tab=X&opcion=<flag>` y la página
 * hace scroll hasta el `id="opcion-<flag>"` y lo resalta. Por eso `Ajuste`
 * exige `id` y lo pone en el elemento. El nombre es el del flag en
 * `businessSettings`, sin excepciones.
 */
import Button from '@/components/ui/Button'

/**
 * Un bloque temático dentro de la pestaña: título, una línea de contexto y
 * los ajustes. Sin icono.
 */
export function Seccion({ id, titulo, descripcion, children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-gray-900">{titulo}</h2>
        {descripcion && <p className="text-sm text-gray-500 mt-0.5 max-w-2xl">{descripcion}</p>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

/**
 * Un interruptor con su título y su explicación. Es el ex `SettingToggle`,
 * con el mismo contrato para que la migración sea mecánica.
 *
 * `children` va debajo de la descripción, para los ajustes que despliegan
 * campos al encenderse. Como todo el bloque es un <label>, lo que se ponga
 * adentro debe frenar la propagación del clic si no quiere marcar/desmarcar
 * el checkbox (ver `Regulador`).
 */
export function Ajuste({ id, checked, onChange, titulo, descripcion, disabled = false, children }) {
  return (
    <label
      id={id}
      className={`flex items-start gap-3 p-3 border rounded-lg transition-colors scroll-mt-24 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'border-primary-200 bg-primary-50/40' : 'border-gray-200 hover:border-gray-300'}`}
    >
      <input
        type="checkbox"
        checked={!!checked}
        onChange={onChange}
        disabled={disabled}
        className="mt-0.5 w-5 h-5 shrink-0 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
      />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-900 block">{titulo}</span>
        {descripcion && <span className="text-xs text-gray-500 block mt-0.5 leading-relaxed">{descripcion}</span>}
        {children}
      </div>
    </label>
  )
}

/**
 * Un campo con su etiqueta y su ayuda. El control va como `children`, para
 * que sirva igual con <Input>, <Select>, un <textarea> o un color.
 */
export function Campo({ id, etiqueta, ayuda, children }) {
  return (
    <div id={id} className="scroll-mt-24">
      <label className="block text-sm font-medium text-gray-700 mb-1">{etiqueta}</label>
      {children}
      {ayuda && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{ayuda}</p>}
    </div>
  )
}

/** Dos o tres campos en fila; en el celular, uno debajo de otro. */
export function Fila({ children, columnas = 2 }) {
  const grid = columnas === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'
  return <div className={`grid grid-cols-1 ${grid} gap-4`}>{children}</div>
}

/**
 * Una nota. Gris por defecto; roja solo para lo destructivo. No hay más
 * tonos: si el texto necesita color para llamar la atención, el problema es
 * el texto.
 */
export function Nota({ tono = 'neutro', titulo, children }) {
  const peligro = tono === 'peligro'
  return (
    <div
      className={`px-4 py-3 rounded-lg text-sm border-l-2 ${
        peligro ? 'bg-red-50 border-red-500 text-red-900' : 'bg-gray-50 border-gray-300 text-gray-700'
      }`}
    >
      {titulo && <p className="font-semibold mb-0.5">{titulo}</p>}
      <div className="leading-relaxed">{children}</div>
    </div>
  )
}

/**
 * La barra con el botón Guardar, al pie de la pestaña. Siempre el mismo
 * texto y el mismo lugar, para que el usuario no tenga que buscarlo.
 */
export function BarraGuardar({ onClick, guardando = false, disabled = false, texto = 'Guardar' }) {
  return (
    <div className="flex justify-end pt-2">
      <Button type="button" onClick={onClick} disabled={disabled || guardando}>
        {guardando ? 'Guardando...' : texto}
      </Button>
    </div>
  )
}

/**
 * Un regulador con su valor a la vista. Pensado para ir DENTRO de un
 * `Ajuste`: frena el clic para no marcar/desmarcar el checkbox de arriba.
 */
export function Regulador({ etiqueta, value, onChange, min = 0, max = 100, step = 1, sufijo = '', ayuda, extremos }) {
  return (
    <div className="mt-3" onClick={(e) => e.preventDefault()}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-700">{etiqueta}</span>
        <span className="text-xs font-semibold text-gray-900 tabular-nums">{value}{sufijo}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary-600 cursor-pointer"
      />
      {extremos && (
        <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
          <span>{extremos[0]}</span>
          <span>{extremos[1]}</span>
        </div>
      )}
      {ayuda && <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{ayuda}</p>}
    </div>
  )
}

/** Separa dos secciones. */
export function Separador() {
  return <div className="border-t border-gray-200" />
}
