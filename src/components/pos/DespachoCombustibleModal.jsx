import { useEffect, useMemo, useState } from 'react'
import { Delete, Fuel } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'
import { despacho } from '@/utils/serviceStation'

/**
 * Despachar combustible tecleando el MONTO, que es como lo pide la gente.
 *
 * "Cincuenta soles de premium" es la venta normal de un grifo; "tres galones
 * con treinta" no se lo dice nadie al despachador. Por eso el modal abre en
 * SOLES y los galones salen solos — pero el interruptor a GALONES queda a la
 * vista, porque el que llena un balde sí pide galones.
 *
 * Abajo se muestran los tres números que muestra la manguera: soles, galones
 * y precio por galón. Si el ticket dice otra cosa que el surtidor, el cajero
 * no le va a creer al sistema.
 *
 * Teclado propio en vez del del sistema operativo: esto se usa en tablet, de
 * pie y con una mano.
 */

const ATAJOS = {
  monto: [10, 20, 30, 50, 100],
  galones: [1, 2, 5, 10],
}

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0']

export default function DespachoCombustibleModal({
  isOpen,
  onClose,
  producto,
  precio,
  moneda = 'PEN',
  onConfirmar,
}) {
  const [modo, setModo] = useState('monto')
  const [texto, setTexto] = useState('')

  // Cada combustible entra limpio: el monto del auto anterior no se hereda.
  useEffect(() => {
    if (!isOpen) return
    setModo('monto')
    setTexto('')
  }, [isOpen, producto?.id])

  // El string crudo se conserva mientras se escribe: recortarlo a número en
  // cada tecla hace que "0.0" camino a "0.05" colapse a "0" y se trabe.
  const resultado = useMemo(
    () => despacho(parseFloat(texto), precio, modo),
    [texto, precio, modo],
  )

  const teclear = (tecla) => {
    setTexto((prev) => {
      if (tecla === '.') return prev.includes('.') ? prev : (prev === '' ? '0.' : prev + '.')
      // Sin decimales de más: al céntimo en soles, a la milésima en galones.
      const tope = modo === 'monto' ? 2 : 3
      const [, dec = ''] = prev.split('.')
      if (prev.includes('.') && dec.length >= tope) return prev
      if (prev === '0' && tecla !== '.') return tecla
      return prev + tecla
    })
  }

  const cambiarModo = (nuevo) => {
    if (nuevo === modo) return
    setModo(nuevo)
    setTexto('')
  }

  const confirmar = () => {
    if (!resultado) return
    onConfirmar(resultado)
  }

  const unidad = modo === 'monto' ? (moneda === 'USD' ? 'US$' : 'S/') : 'GAL'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={producto?.name || 'Despachar'} size="lg">
      <div className="space-y-4">
        {/* Precio del galón: sale del producto, así que cambiarlo en el
            catálogo lo cambia acá sin tocar nada más. */}
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          <Fuel className="w-5 h-5 text-gray-500 flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{producto?.name}</p>
            <p className="text-sm text-gray-600">{formatCurrency(precio, moneda)} por galón</p>
          </div>
        </div>

        {/* Soles o galones */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'monto', label: moneda === 'USD' ? 'DÓLARES' : 'SOLES' },
            { id: 'galones', label: 'GALONES' },
          ].map((op) => (
            <button
              key={op.id}
              type="button"
              onClick={() => cambiarModo(op.id)}
              className={`py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                modo === op.id
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {op.label}
            </button>
          ))}
        </div>

        {/* Lo tecleado */}
        <div className="border-2 border-primary-200 rounded-lg px-4 py-4 text-right bg-white">
          <div className="flex items-baseline justify-end gap-2">
            <span className="text-lg text-gray-400 font-medium">{unidad}</span>
            <span className="text-4xl sm:text-5xl font-bold text-gray-900 tabular-nums break-all">
              {texto || '0'}
            </span>
          </div>
        </div>

        {/* Atajos: así pide la gente */}
        <div className="flex flex-wrap gap-2">
          {ATAJOS[modo].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setTexto(String(v))}
              className="flex-1 min-w-[64px] py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-sm transition-colors"
            >
              {modo === 'monto' ? (moneda === 'USD' ? '$' : 'S/') : ''}{v}{modo === 'galones' ? ' gal' : ''}
            </button>
          ))}
        </div>

        {/* Teclado */}
        <div className="grid grid-cols-3 gap-2">
          {TECLAS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => teclear(k)}
              className="py-4 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-2xl font-semibold text-gray-900 transition-colors"
            >
              {k}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTexto((p) => p.slice(0, -1))}
            className="py-4 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center transition-colors"
            aria-label="Borrar"
          >
            <Delete className="w-6 h-6 text-gray-700" />
          </button>
        </div>

        {/* Los tres números de la manguera */}
        <div className="grid grid-cols-3 gap-2 bg-gray-900 rounded-lg p-3 text-center">
          {[
            { label: moneda === 'USD' ? 'Dólares' : 'Soles', valor: resultado ? formatCurrency(resultado.monto, moneda) : '—' },
            { label: 'Galones', valor: resultado ? resultado.galones.toFixed(3) : '—' },
            { label: 'Precio', valor: formatCurrency(precio, moneda) },
          ].map((n) => (
            <div key={n.label}>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">{n.label}</p>
              <p className="text-base sm:text-lg font-bold text-white tabular-nums">{n.valor}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!resultado} className="flex-1">
            Agregar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
