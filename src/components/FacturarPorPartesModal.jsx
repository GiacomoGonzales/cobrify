import { useMemo, useState } from 'react'
import { Receipt } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { formatCurrency } from '@/lib/utils'
import { montoFacturado, montoPendiente, parteParaElPOS } from '@/utils/notaPorPartes'

/**
 * FACTURAR UNA NOTA DE VENTA POR PARTES.
 *
 * Se elige el monto de la próxima parte y se ve, antes de abrir el POS, cómo se
 * reparte en los productos de la nota. El reparto lo decide
 * utils/notaPorPartes (`parteParaElPOS`); esta ventana solo lo muestra y se lo
 * entrega a quien la abrió.
 */

const cantidadCorta = (n) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000)
}

const fechaDe = (f) => {
  const d = f?.toDate ? f.toDate() : (f ? new Date(f) : null)
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''
}

/** Lo facturado de la nota: avance y cada comprobante. También lo muestra el detalle en Ventas. */
export function ResumenDePartes({ nota }) {
  const total = Number(nota?.total) || 0
  const facturado = montoFacturado(nota)
  const pendiente = montoPendiente(nota)
  const completa = nota?.convertedTo?.porPartes === true
  const avance = total > 0 ? Math.min(100, Math.round((facturado / total) * 100)) : 0
  const partes = Array.isArray(nota?.facturasParciales) ? nota.facturasParciales.filter(Boolean) : []

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3 text-sm">
        <p className="text-gray-600">
          Facturado{' '}
          <span className="font-semibold tabular-nums text-gray-900">{formatCurrency(facturado, 'PEN')}</span>
          {' '}de <span className="tabular-nums">{formatCurrency(total, 'PEN')}</span>
        </p>
        <p className={completa ? 'font-medium text-green-700' : 'font-medium text-gray-900'}>
          {completa ? 'Completa' : <>Falta <span className="tabular-nums">{formatCurrency(pendiente, 'PEN')}</span></>}
        </p>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-gray-100"
        role="progressbar"
        aria-label="Avance de la facturación"
        aria-valuenow={avance}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-primary-600" style={{ width: `${avance}%` }} />
      </div>
      {partes.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {partes.map((p, k) => (
            <li key={p.id || k} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className={p.anulada ? 'font-medium text-gray-400 line-through' : 'font-medium text-gray-900'}>
                  {p.number || 'Sin número'}
                </span>
                <span className="ml-2 text-xs text-gray-500">
                  Parte {p.parte || k + 1}{fechaDe(p.fecha) ? ` · ${fechaDe(p.fecha)}` : ''}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {p.anulada && <span className="rounded-full px-2 py-0.5 text-xs chip-error">Anulada</span>}
                <span className={p.anulada ? 'tabular-nums text-gray-400 line-through' : 'tabular-nums text-gray-900'}>
                  {formatCurrency(Number(p.monto) || 0, 'PEN')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function FacturarPorPartesModal({ nota, onClose, onArmar }) {
  const pendiente = montoPendiente(nota)
  const [monto, setMonto] = useState('')
  const valor = Number(String(monto).replace(',', '.'))
  const pedido = Number.isFinite(valor) && valor > 0 ? Math.min(valor, pendiente) : 0
  const parte = useMemo(() => (pedido > 0 ? parteParaElPOS(nota, pedido) : null), [nota, pedido])
  const sinLineas = !!parte && parte.lineas.length === 0
  const puedeArmar = !!parte && !sinLineas

  return (
    <Modal isOpen onClose={onClose} title={`Facturar por partes · ${nota?.number || ''}`} size="lg">
      <div className="space-y-5">
        <ResumenDePartes nota={nota} />

        <div className="space-y-2">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="Monto de esta parte (S/)"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </div>
            <Button type="button" variant="outline" onClick={() => setMonto(pendiente.toFixed(2))}>
              Todo lo que falta
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Cada producto de la nota va en la misma proporción. La última parte toma exactamente lo que falta.
          </p>
          {valor > pendiente + 0.004 && (
            <p className="text-xs text-amber-700">
              Pasa lo que falta: esta parte factura solo {formatCurrency(pendiente, 'PEN')}, lo que queda de la nota.
            </p>
          )}
        </div>

        {puedeArmar && (
          <div className="space-y-2">
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Producto</th>
                    <th className="px-3 py-2 text-right font-semibold">Cantidad</th>
                    <th className="px-3 py-2 text-right font-semibold">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {parte.lineas.map((l, k) => (
                    <tr key={l.i}>
                      <td className="px-3 py-2 text-gray-900">{parte.items[k]?.name || 'Producto'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{cantidadCorta(l.cantidad)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                        {formatCurrency(l.precio * l.cantidad - (Number(l.itemDiscount) || 0), 'PEN')}
                      </td>
                    </tr>
                  ))}
                  {parte.descuentoGeneral > 0 && (
                    <tr>
                      <td className="px-3 py-2 text-gray-600" colSpan={2}>Descuento general</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                        −{formatCurrency(parte.descuentoGeneral, 'PEN')}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200">
                    <td className="px-3 py-2 font-semibold text-gray-900" colSpan={2}>
                      {parte.ultima ? 'Total de la última parte' : `Total de la parte ${parte.parte}`}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                      {formatCurrency(parte.totalEstimado, 'PEN')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-gray-500">
              El POS calcula el total exacto con el IGV y puede variar en algún céntimo. Allí solo eliges Boleta o Factura y emites.
            </p>
          </div>
        )}
        {sinLineas && (
          <p className="text-sm text-red-600">El monto es muy chico para repartirlo entre los productos de la nota.</p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={() => onArmar(parte)} disabled={!puedeArmar}>
            <Receipt className="mr-1 h-4 w-4" />
            Armar la parte en el POS
          </Button>
        </div>
      </div>
    </Modal>
  )
}
