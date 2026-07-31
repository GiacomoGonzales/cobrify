import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, Loader2, Check, AlertCircle } from 'lucide-react'
import {
  cargarCatalogo,
  catalogoEnMemoria,
  buscar,
  describirCodigo,
  CODIGOS_ESCAPE,
} from '@/utils/sunatProductCatalog'

/**
 * Buscador del Código de Producto SUNAT (catálogo 25).
 *
 * El usuario escribe lo que vende —"helado", "gaseosa"— y elige de la lista. Se
 * guarda el código Y su descripción: así la ficha del producto se muestra
 * completa sin tener que descargar los 2.4 MB del catálogo cada vez.
 *
 * El catálogo se descarga la primera vez que alguien abre el buscador, no al
 * cargar la página.
 */
export default function SunatProductCodeField({ value, name, onChange, disabled = false }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState([])
  const [cargando, setCargando] = useState(false)
  const [errorCarga, setErrorCarga] = useState('')
  const [listo, setListo] = useState(!!catalogoEnMemoria())
  const contenedor = useRef(null)
  const input = useRef(null)

  const seleccionado = value
    ? { codigo: value, nombre: name || describirCodigo(value)?.nombre || '' }
    : null

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => {
      if (contenedor.current && !contenedor.current.contains(e.target)) {
        setAbierto(false)
        setTexto('') // no dejar texto suelto en el campo sin haber elegido nada
      }
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const abrir = useCallback(async () => {
    if (disabled) return
    setAbierto(true)
    if (listo) return
    setCargando(true)
    setErrorCarga('')
    try {
      await cargarCatalogo()
      setListo(true)
    } catch {
      setErrorCarga('No se pudo cargar el catálogo de SUNAT. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setCargando(false)
    }
  }, [disabled, listo])

  useEffect(() => {
    if (!listo || !abierto) return
    setResultados(buscar(texto, 30))
  }, [texto, listo, abierto])

  useEffect(() => {
    if (abierto && listo) input.current?.focus()
  }, [abierto, listo])

  const elegir = (entrada) => {
    onChange(entrada.codigo, entrada.nombre)
    setAbierto(false)
    setTexto('')
  }

  const limpiar = () => {
    onChange('', '')
    setTexto('')
  }

  const info = value && listo ? describirCodigo(value) : null

  return (
    <div ref={contenedor} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Código de Producto SUNAT (Opcional)
      </label>

      {seleccionado && !abierto ? (
        <div className="flex items-start gap-2 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
          <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-900">
              <span className="font-mono font-medium">{seleccionado.codigo}</span>
              {seleccionado.nombre && <span className="text-gray-700"> · {seleccionado.nombre}</span>}
            </p>
            {info?.ruta?.length > 0 && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">{info.ruta.join(' › ')}</p>
            )}
          </div>
          {!disabled && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={abrir}
                className="text-xs text-primary-600 hover:text-primary-700 px-2 py-1"
              >
                Cambiar
              </button>
              <button
                type="button"
                onClick={limpiar}
                className="text-gray-400 hover:text-gray-600 p-1"
                aria-label="Quitar código"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      ) : (
        // El mismo campo hace de disparador y de buscador: al enfocarlo se
        // despliegan los resultados debajo. Antes eran dos cajas apiladas.
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={input}
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onFocus={abrir}
            disabled={disabled}
            placeholder={abierto ? 'Escribe qué vendes: helado, gaseosa, pollo...' : 'Buscar el código de tu producto'}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>
      )}

      {abierto && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="max-h-72 overflow-y-auto">
            {cargando && (
              <div className="flex items-center gap-2 px-3 py-6 text-sm text-gray-500 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando el catálogo de SUNAT...
              </div>
            )}

            {errorCarga && (
              <div className="flex items-start gap-2 px-3 py-4 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p>{errorCarga}</p>
                  <button type="button" onClick={abrir} className="mt-1 text-primary-600 hover:underline">
                    Reintentar
                  </button>
                </div>
              </div>
            )}

            {listo && !cargando && texto.trim().length < 2 && (
              <p className="px-3 py-6 text-sm text-gray-500 text-center">
                Escribe al menos dos letras para buscar
              </p>
            )}

            {listo && !cargando && texto.trim().length >= 2 && resultados.length === 0 && (
              <div className="px-3 py-5 text-sm text-gray-600">
                <p className="mb-2">
                  Nada coincide con "{texto}". El catálogo de SUNAT está traducido del inglés,
                  así que a veces usa otra palabra: prueba con un término más general.
                </p>
                <button
                  type="button"
                  onClick={() => elegir({ codigo: CODIGOS_ESCAPE[1], nombre: 'Código genérico (sin clasificar)' })}
                  className="text-primary-600 hover:underline"
                >
                  Usar el código genérico {CODIGOS_ESCAPE[1]}
                </button>
              </div>
            )}

            {listo && !cargando && resultados.map((r) => (
              <button
                key={r.codigo}
                type="button"
                onClick={() => elegir(r)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0"
              >
                <p className="text-sm text-gray-900">
                  <span className="font-mono text-gray-500 mr-2">{r.codigo}</span>
                  {r.nombre}
                </p>
                {r.nivel === 'clase' && (
                  <span className="text-xs text-gray-400">Categoría general</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="mt-1 text-sm text-gray-500">
        Lo exige SUNAT solo a un grupo reducido de emisores. Si no lo llenas, tus comprobantes
        se emiten igual.
      </p>
    </div>
  )
}
