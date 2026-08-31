import { useState, useRef, useEffect } from 'react'
import { ScanLine, CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { analizarRafaga, MS_ABANDONO, MS_POR_CHAR_CODIGO } from '@/utils/scannerDetect'

/**
 * PROBAR LA PISTOLA LECTORA.
 *
 * Cuando un lector "no funciona" hay cuatro causas posibles y desde afuera se
 * ven todas igual: el aparato está en modo inventario y no teclea nada; teclea
 * pero no manda Enter al final; teclea demasiado lento para que el mostrador
 * lo reconozca; o anda bien y el problema es otro. Sin esta pantalla eso son
 * días de mensajes preguntando "¿y ahora qué pasa?".
 *
 * Usa EXACTAMENTE el mismo criterio que el detector del POS
 * (@/utils/scannerDetect). Si acá dice que se reconoce, en el mostrador se
 * reconoce.
 */
const ScannerTester = () => {
  const [resultado, setResultado] = useState(null)
  const [escuchando, setEscuchando] = useState(false)
  const cajaRef = useRef(null)

  // Buffer de la ráfaga. En refs y no en estado: cada tecla llega en su propio
  // evento y re-renderizar en cada una perdería caracteres.
  const buf = useRef({ texto: '', primera: 0, ultima: 0, timer: null })

  useEffect(() => {
    if (!escuchando) return
    const b = buf.current

    const limpiar = () => { b.texto = ''; b.primera = 0; b.ultima = 0 }

    const onKey = (e) => {
      const ahora = Date.now()

      if (e.key === 'Enter') {
        e.preventDefault()
        clearTimeout(b.timer)
        if (b.texto.length > 0) {
          const ms = b.ultima - b.primera
          setResultado({ ...analizarRafaga(b.texto, ms), texto: b.texto, ms, conEnter: true })
        }
        limpiar()
        return
      }

      if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return
      e.preventDefault()

      if (b.texto === '') b.primera = ahora
      b.texto += e.key
      b.ultima = ahora

      // Si la ráfaga se corta sin Enter, se muestra igual: "llegó pero sin
      // Enter" es justamente uno de los diagnósticos que se buscan, y callarlo
      // dejaría al usuario mirando una pantalla que no reacciona.
      clearTimeout(b.timer)
      b.timer = setTimeout(() => {
        if (b.texto.length > 0) {
          const ms = b.ultima - b.primera
          setResultado({ ...analizarRafaga(b.texto, ms), texto: b.texto, ms, conEnter: false })
        }
        limpiar()
      }, MS_ABANDONO + 400)
    }

    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      clearTimeout(b.timer)
    }
  }, [escuchando])

  const empezar = () => {
    setResultado(null)
    setEscuchando(true)
    cajaRef.current?.focus()
  }

  // El veredicto: qué le pasa al lector y qué hacer.
  const veredicto = () => {
    if (!resultado) return null
    if (!resultado.conEnter) {
      return {
        bien: false,
        titulo: 'Llega el código, pero sin Enter al final',
        texto: 'El lector escribe bien, pero no envía el "Enter" que cierra la lectura, así que el punto de venta nunca sabe que el código terminó. Se arregla en el aparato, no en el sistema: en el manual de tu lector busca el código de barras de "Add Enter suffix" o "Sufijo CR/LF" y escanéalo una vez.',
      }
    }
    if (resultado.motivo === 'corto') {
      return {
        bien: false,
        titulo: 'Llegaron muy pocos caracteres',
        texto: 'Se recibió menos de lo que tiene un código de barras. Prueba con la etiqueta de un producto real; si el lector está en modo inventario (guarda las lecturas en vez de escribirlas), cámbialo a modo teclado con el manual.',
      }
    }
    if (!resultado.esEscaneo) {
      return {
        bien: false,
        titulo: 'El lector escribe demasiado lento',
        texto: `Llegó a ${Math.round(resultado.msPorChar)} milésimas por carácter y el máximo que se acepta es ${MS_POR_CHAR_CODIGO}. Por encima de eso no se puede distinguir de una persona tecleando. Suele pasar con Bluetooth a mucha distancia o con la batería baja: acerca el lector al equipo, cárgalo y vuelve a probar. Si sigue igual, avísanos con este número.`,
      }
    }
    return {
      bien: true,
      titulo: 'El lector funciona',
      texto: 'El código llegó completo, con su Enter y a buena velocidad. En el punto de venta el producto se va a agregar solo al carrito.',
    }
  }

  const v = veredicto()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center space-x-2">
          <ScanLine className="w-5 h-5 text-primary-600" />
          <CardTitle>Probar mi pistola lectora</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Las pistolas lectoras —por cable, por Bluetooth o con su receptor USB— funcionan
          como un teclado: al disparar escriben el código y un Enter. No hay que conectarlas
          al sistema; si el equipo ya las reconoce, el punto de venta las usa.
        </p>
        <p className="text-sm text-gray-600">
          Si una no te funciona, prueba acá: dispara a cualquier código de barras y te digo
          exactamente qué llegó y qué hacer.
        </p>

        {!escuchando ? (
          <button
            onClick={empezar}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
          >
            <ScanLine className="w-4 h-4" />
            Empezar la prueba
          </button>
        ) : (
          <div
            ref={cajaRef}
            tabIndex={-1}
            className="border-2 border-dashed border-primary-300 bg-primary-50/50 rounded-lg p-6 text-center outline-none"
          >
            <ScanLine className="w-8 h-8 text-primary-500 mx-auto mb-2 animate-pulse" />
            <p className="text-sm font-medium text-primary-900">Dispara a un código de barras</p>
            <p className="text-xs text-primary-700 mt-1">
              Puede ser la etiqueta de cualquier producto, o hasta el código de una caja
            </p>
          </div>
        )}

        {v && (
          <div className={`rounded-lg border p-4 ${v.bien ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
            <div className="flex items-start gap-3">
              {v.bien
                ? <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                : <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />}
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${v.bien ? 'text-green-900' : 'text-amber-900'}`}>
                  {v.titulo}
                </p>
                <p className={`text-sm mt-1 ${v.bien ? 'text-green-800' : 'text-amber-800'}`}>
                  {v.texto}
                </p>
              </div>
            </div>

            {/* El detalle crudo. Es lo que el usuario copia y manda cuando hay
                que escalarlo, así que va en texto seleccionable. */}
            <div className="mt-3 pt-3 border-t border-black/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-gray-500">Código leído</p>
                <p className="font-mono font-medium text-gray-900 break-all select-all">{resultado.texto}</p>
              </div>
              <div>
                <p className="text-gray-500">Caracteres</p>
                <p className="font-medium text-gray-900">{resultado.texto.length}</p>
              </div>
              <div>
                <p className="text-gray-500">Velocidad</p>
                <p className="font-medium text-gray-900">
                  {resultado.msPorChar == null ? '—' : `${Math.round(resultado.msPorChar)} ms/carácter`}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Enter al final</p>
                <p className="font-medium text-gray-900">{resultado.conEnter ? 'Sí' : 'No'}</p>
              </div>
            </div>
          </div>
        )}

        {escuchando && (
          <>
            <button
              onClick={() => { setEscuchando(false); setResultado(null) }}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              <RotateCcw className="w-4 h-4" />
              Terminar la prueba
            </button>
            <p className="text-xs text-gray-500">
              Mientras la prueba está activa, el teclado de esta pantalla queda tomado. Termínala para volver a usarlo.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default ScannerTester
