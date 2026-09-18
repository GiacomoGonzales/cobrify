import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Plus, Search } from 'lucide-react'
import { buildSearchHaystack, coincidenPalabras, normalizeText, palabrasDeBusqueda } from '@/lib/utils'
import { primerasCoincidencias } from '@/utils/listasGrandes'

/**
 * Un desplegable que se busca escribiendo.
 *
 * Nace el 18/09/2026 por CONSORCIO ANDINA GROUP (farmacia): con muchas marcas y
 * laboratorios, un `<select>` obliga a recorrer la lista entera con el dedo.
 * Acá se escriben dos letras y la lista se reduce sola.
 *
 * Reemplaza al `<select>` sin cambiarle nada al formulario: recibe `value` y
 * avisa con `onChange`, igual que antes. Se ve como el select de siempre hasta
 * que se toca.
 *
 * Detalles que ya costaron caros en otros buscadores del repo y acá vienen de
 * fábrica:
 * - Las opciones se eligen con `onMouseDown`, no con `onClick`: el `blur` del
 *   input desmonta la lista antes de que el clic llegue (ver VeterinaryAgenda).
 * - La búsqueda se indexa UNA vez por lista, no por tecla (`buildSearchHaystack`).
 * - Se dibuja un tope de coincidencias y se avisa cuántas quedaron fuera.
 */

// Tailwind necesita la clase escrita completa: nunca armar `ring-${color}-500`.
const ACENTOS = {
  primary: { anillo: 'focus:ring-primary-500', texto: 'text-primary-700', fondo: 'hover:bg-primary-50', borde: 'border-primary-300' },
  green: { anillo: 'focus:ring-green-500', texto: 'text-green-700', fondo: 'hover:bg-green-50', borde: 'border-green-300' },
  indigo: { anillo: 'focus:ring-indigo-500', texto: 'text-indigo-700', fondo: 'hover:bg-indigo-50', borde: 'border-indigo-300' },
}

// Con pocas opciones no se enfoca el buscador al abrir: en el celular eso
// levanta el teclado y tapa justo la lista que se venía a mirar.
const MINIMO_PARA_ENFOCAR = 8

export default function SelectorBuscable({
  value,
  onChange,
  opciones = [],
  label,
  textoVacio = 'Sin seleccionar',
  permiteVacio = true,
  placeholder = 'Escribe para buscar...',
  onCrear,
  etiquetaCrear = 'Crear',
  disabled = false,
  requerido = false,
  acento = 'primary',
  ayuda,
  className = '',
}) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [resaltado, setResaltado] = useState(0)
  const [creando, setCreando] = useState(false)
  const contenedor = useRef(null)
  const campo = useRef(null)
  const lista = useRef(null)

  const acc = ACENTOS[acento] || ACENTOS.primary

  // El índice se arma una vez por lista. Sin esto cada tecla vuelve a
  // normalizar el nombre de todas las marcas.
  const indice = useMemo(
    () => opciones.map((o) => ({ opcion: o, haystack: buildSearchHaystack(o.nombre, o.detalle) })),
    [opciones]
  )

  const { items: coincidencias, total } = useMemo(() => {
    const palabras = palabrasDeBusqueda(texto)
    return primerasCoincidencias(indice, (e) => coincidenPalabras(palabras, e.haystack))
  }, [indice, texto])

  const escrito = texto.trim()

  // "Crear" solo cuando lo escrito no es ya una opción: si escribe el nombre
  // exacto de una marca que existe, ofrecerle crearla otra vez es una trampa.
  const puedeCrear =
    !!onCrear &&
    escrito.length > 0 &&
    !opciones.some((o) => normalizeText(o.nombre).trim() === normalizeText(escrito))

  // Una sola lista de filas para que las flechas del teclado tengan un único
  // índice, sin importar si hay fila de "sin nada" o de "crear".
  const filas = useMemo(() => {
    const f = []
    if (permiteVacio && !escrito) f.push({ tipo: 'vacio' })
    coincidencias.forEach((e) => f.push({ tipo: 'opcion', opcion: e.opcion }))
    if (puedeCrear) f.push({ tipo: 'crear' })
    return f
  }, [permiteVacio, escrito, coincidencias, puedeCrear])

  const elegida = opciones.find((o) => o.id === value) || null

  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => {
      if (contenedor.current && !contenedor.current.contains(e.target)) cerrar()
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  useEffect(() => {
    if (abierto && opciones.length >= MINIMO_PARA_ENFOCAR) campo.current?.focus()
  }, [abierto, opciones.length])

  useEffect(() => setResaltado(0), [texto])

  // Que la fila resaltada con las flechas no quede fuera de la vista.
  useEffect(() => {
    if (!abierto) return
    lista.current?.querySelector('[data-resaltado="si"]')?.scrollIntoView({ block: 'nearest' })
  }, [resaltado, abierto])

  const abrir = () => {
    if (disabled) return
    setTexto('')
    setResaltado(0)
    setAbierto(true)
  }

  const cerrar = () => {
    setAbierto(false)
    setTexto('') // no dejar texto suelto de una búsqueda que no eligió nada
  }

  const elegir = async (fila) => {
    if (!fila) return
    if (fila.tipo === 'vacio') {
      onChange('', null)
      cerrar()
      return
    }
    if (fila.tipo === 'opcion') {
      onChange(fila.opcion.id, fila.opcion)
      cerrar()
      return
    }
    if (fila.tipo === 'crear') {
      setCreando(true)
      try {
        const nuevoId = await onCrear(escrito)
        if (nuevoId) onChange(nuevoId, { id: nuevoId, nombre: escrito })
        cerrar()
      } finally {
        setCreando(false)
      }
    }
  }

  const alTeclear = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setResaltado((i) => Math.min(i + 1, filas.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setResaltado((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      // El formulario no se envía por elegir de la lista.
      e.preventDefault()
      elegir(filas[resaltado])
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      cerrar()
    }
  }

  const filaBase = 'w-full text-left px-3 py-2 text-sm flex items-center gap-2 cursor-pointer'

  return (
    <div ref={contenedor} className={`relative ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {requerido && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {abierto ? (
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={campo}
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={alTeclear}
            placeholder={placeholder}
            className={`w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 ${acc.anillo}`}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={abrir}
          disabled={disabled}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 ${acc.anillo} disabled:bg-gray-100 disabled:cursor-not-allowed`}
        >
          <span className={`flex-1 truncate ${elegida ? 'text-gray-900' : 'text-gray-500'}`}>
            {elegida ? elegida.nombre : textoVacio}
          </span>
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        </button>
      )}

      {abierto && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
          <div ref={lista} className="max-h-64 overflow-y-auto">
            {filas.length === 0 && (
              <p className="px-3 py-5 text-sm text-gray-500 text-center">
                Nada coincide con "{texto}"
              </p>
            )}

            {filas.map((fila, i) => {
              const activo = i === resaltado
              const fondo = activo ? 'bg-gray-100' : 'hover:bg-gray-50'

              if (fila.tipo === 'vacio') {
                return (
                  <div
                    key="__vacio"
                    data-resaltado={activo ? 'si' : 'no'}
                    onMouseDown={(e) => { e.preventDefault(); elegir(fila) }}
                    onMouseEnter={() => setResaltado(i)}
                    className={`${filaBase} ${fondo} text-gray-500 border-b border-gray-100`}
                  >
                    {textoVacio}
                  </div>
                )
              }

              if (fila.tipo === 'crear') {
                return (
                  <div
                    key="__crear"
                    data-resaltado={activo ? 'si' : 'no'}
                    onMouseDown={(e) => { e.preventDefault(); elegir(fila) }}
                    onMouseEnter={() => setResaltado(i)}
                    className={`${filaBase} ${fondo} ${acc.texto} border-t border-gray-100 font-medium`}
                  >
                    <Plus className="w-4 h-4 flex-shrink-0" />
                    {creando ? 'Creando...' : `${etiquetaCrear} "${escrito}"`}
                  </div>
                )
              }

              const o = fila.opcion
              return (
                <div
                  key={o.id}
                  data-resaltado={activo ? 'si' : 'no'}
                  onMouseDown={(e) => { e.preventDefault(); elegir(fila) }}
                  onMouseEnter={() => setResaltado(i)}
                  className={`${filaBase} ${fondo} ${o.id === value ? 'font-medium' : ''}`}
                >
                  <span className={`flex-1 min-w-0 ${o.sangria ? 'pl-4' : ''}`}>
                    <span className="block truncate text-gray-900">{o.nombre}</span>
                    {o.detalle && (
                      <span className="block truncate text-xs text-gray-500">{o.detalle}</span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>

          {total > coincidencias.length && (
            <p className="px-3 py-2 text-xs text-gray-500 border-t border-gray-100">
              Se muestran {coincidencias.length} de {total}. Escribe más para encontrarlo.
            </p>
          )}
        </div>
      )}

      {ayuda && !abierto && <p className="mt-1 text-xs text-gray-500">{ayuda}</p>}
    </div>
  )
}
