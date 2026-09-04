/**
 * TARJETA DE ORDEN — los pedazos que se repiten en Órdenes y Cocina.
 *
 * Las clases, los colores y el porqué del estilo están al lado, en
 * tarjetaOrdenEstilos.js. Acá solo hay componentes: es lo que le permite a
 * Fast Refresh recargar el archivo en caliente.
 */
import { AlertTriangle } from 'lucide-react'
import { CAJITA, ESTADO_ITEM } from './tarjetaOrdenEstilos'

/** La cantidad del plato, en una cajita gris clara. */
export function Cantidad({ n }) {
  return (
    <span className={`shrink-0 min-w-[2rem] h-8 px-1.5 flex items-center justify-center text-[15px] font-bold tabular-nums ${CAJITA}`}>
      {n}
    </span>
  )
}

/** Chip con el estado del plato. */
export function ChipDeEstadoItem({ status }) {
  const estado = ESTADO_ITEM[status] || ESTADO_ITEM.pending
  return (
    <span className={`shrink-0 inline-block px-1.5 py-0.5 text-xs font-semibold rounded-md ${estado.chip}`}>
      {estado.texto}
    </span>
  )
}

/**
 * Los modificadores del plato: "Temperatura de la gaseosa: Helada".
 *
 * `conPrecios` apaga el "(+S/ 2.00)": en cocina el recargo es ruido, lo que
 * importa es que la gaseosa vaya helada.
 */
export function Modificadores({ modifiers, conPrecios = true }) {
  if (!Array.isArray(modifiers) || modifiers.length === 0) return null
  return (
    <div className="mt-1.5 space-y-0.5 border-l-2 border-gray-200 pl-2.5">
      {modifiers.map((modifier, i) => {
        const opciones = Array.isArray(modifier.options) ? modifier.options : []
        return (
          <div key={i} className="text-sm text-gray-500 leading-snug">
            {modifier.modifierName}:{' '}
            <span className="font-medium text-gray-700">
              {opciones.map((opt, j) => (
                <span key={j}>
                  {opt.optionName}
                  {conPrecios && opt.priceAdjustment > 0 && ` (+S/ ${opt.priceAdjustment.toFixed(2)})`}
                  {j < opciones.length - 1 && ', '}
                </span>
              ))}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** La nota del plato ("sin ají"): fondo ámbar muy suave, filete ámbar. */
export function NotaDelPlato({ nota }) {
  if (!nota) return null
  return (
    <div className="mt-1.5 flex items-start gap-1.5 text-sm text-amber-800 bg-amber-50 border-l-2 border-amber-300 rounded-r-md pl-2 pr-2 py-1">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{nota}</span>
    </div>
  )
}
