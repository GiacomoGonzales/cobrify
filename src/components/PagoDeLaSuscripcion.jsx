import { useState } from 'react'
import { MessageCircle, Copy, Check, Building2, Loader2 } from 'lucide-react'
import { useSubscriptionPaymentInfo } from '@/hooks/useSubscriptionPaymentInfo'
import logoPlin from '@/assets/wallets/plin.png'
import logoYape from '@/assets/wallets/yape.png'

/**
 * DÓNDE PAGAR LA SUSCRIPCIÓN y a quién mandarle la captura. Lo usan el aviso de
 * suscripción vencida, la pantalla de cuenta suspendida y Mi Suscripción (adonde
 * lleva el "Renovar ahora" de la tira de vencimiento): los tres muestran
 * exactamente los mismos datos.
 *
 * De quién son los datos lo decide `useSubscriptionPaymentInfo`: los de Cobrify
 * para un cliente directo, los de su reseller o su vendedor si lo tiene. Un
 * cliente de reseller nunca ve (ni le paga a) la cuenta de Cobrify.
 *
 * Diseño (11-set-2026): una tarjeta blanca por medio de pago, con el logo de la
 * billetera, y UN solo botón. Nada de cajas teñidas de colores distintos ni de
 * botones a todo lo ancho en pantallas grandes: así se veía antes y a Giacomo
 * le pareció horrible. Es el mismo lenguaje de la landing.
 *
 * El Plin es solo de Cobrify: el QR vive en `public/pagos/qr-plin.png` y al lado
 * va el número para copiar. Si la imagen no carga, queda el número.
 */

// En pantalla los números van agrupados para leerlos fácil; lo que se copia va
// sin espacios ni guiones, como lo piden las apps del banco.
const sinSeparadores = (texto) => String(texto || '').replace(/[\s-]/g, '')

function Copiar({ texto }) {
  const [copiado, setCopiado] = useState(false)

  const copiar = async () => {
    const limpio = sinSeparadores(texto)
    try {
      await navigator.clipboard.writeText(limpio)
    } catch {
      // Sin https (red local) no hay navigator.clipboard.
      const caja = document.createElement('textarea')
      caja.value = limpio
      document.body.appendChild(caja)
      caja.select()
      document.execCommand('copy')
      document.body.removeChild(caja)
    }
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
      title="Copiar"
    >
      {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copiado ? 'Copiado' : 'Copiar'}
    </button>
  )
}

function Tarjeta({ logo, titulo, detalle, children }) {
  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2.5">
        {logo}
        <p className="text-sm font-semibold text-gray-900">
          {titulo}
          {detalle && <span className="font-normal text-gray-500"> · {detalle}</span>}
        </p>
      </div>
      {children}
    </div>
  )
}

function Numero({ etiqueta, valor, grande = false }) {
  return (
    <div>
      {etiqueta && <p className="text-xs text-gray-500">{etiqueta}</p>}
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        <span className={`font-semibold tabular-nums tracking-wide text-gray-900 ${grande ? 'text-xl' : 'text-base'}`}>
          {valor}
        </span>
        <Copiar texto={valor} />
      </div>
    </div>
  )
}

/**
 * @param {object} props
 * @param {object} props.subscription  la suscripción de la cuenta
 * @param {string} props.mensaje       lo que llega escrito en el WhatsApp
 * @param {boolean} [props.horizontal] las tarjetas lado a lado y el total con el
 *   botón al costado (Mi Suscripción); si no, todo en columna (los avisos)
 * @param {number|null} [props.monto]  el total a pagar sin IGV; solo se muestra si viene
 * @param {number|null} [props.montoConIgv] el mismo total con IGV, debajo y más
 *   chico, como en /precios
 * @param {string} [props.concepto]    qué se paga, debajo del total
 */
export default function PagoDeLaSuscripcion({ subscription, mensaje, horizontal = false, monto = null, montoConIgv = null, concepto = '' }) {
  const { loading, paymentInfo, whatsappNumber, isResellerWithoutPayment } = useSubscriptionPaymentInfo(subscription)
  const [sinQr, setSinQr] = useState(false)

  const whatsapp = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(mensaje || '')}`
  const plin = paymentInfo?.plin?.qr || paymentInfo?.plin?.number ? paymentInfo.plin : null
  const qrPlin = plin?.qr && !sinQr ? plin.qr : null
  const yape = paymentInfo?.yape?.number ? paymentInfo.yape : null
  const banco = paymentInfo?.bcp?.account ? paymentInfo.bcp : null
  const dosMedios = [plin, yape, banco].filter(Boolean).length > 1

  const boton = (
    <a
      href={whatsapp}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary-600/20 transition-colors hover:bg-primary-700"
    >
      <MessageCircle className="h-4 w-4" />
      Enviar captura por WhatsApp
    </a>
  )

  if (loading || isResellerWithoutPayment || !paymentInfo) {
    return (
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
            <p className="text-sm text-amber-800">Contacta a tu proveedor para renovar tu cuenta.</p>
          </div>
        )}
        <div className={horizontal ? 'sm:max-w-xs' : ''}>{boton}</div>
      </div>
    )
  }

  const tarjetaPlin = plin && (
    <Tarjeta logo={<img src={logoPlin} alt="" className="h-6 w-6 rounded-md" />} titulo="Plin">
      <div className={`flex flex-col items-center gap-4 text-center ${horizontal ? 'sm:flex-row sm:text-left' : ''}`}>
        {qrPlin && (
          <img
            src={qrPlin}
            alt="QR de Plin para pagar"
            onError={() => setSinQr(true)}
            className="h-48 w-48 shrink-0 rounded-lg border border-gray-200 bg-white object-contain"
          />
        )}
        <div className="min-w-0">
          {qrPlin && <p className="text-xs text-gray-500">Escanea el QR o copia el número</p>}
          {plin.number && (
            <div className={`mt-1 flex flex-wrap items-center justify-center gap-2 ${horizontal ? 'sm:justify-start' : ''}`}>
              <span className="text-xl font-semibold tabular-nums tracking-wide text-gray-900">{plin.number}</span>
              <Copiar texto={plin.number} />
            </div>
          )}
          {plin.name && <p className="mt-1 text-sm text-gray-500">{plin.name}</p>}
        </div>
      </div>
    </Tarjeta>
  )

  const tarjetaYape = yape && (
    <Tarjeta logo={<img src={logoYape} alt="" className="h-6 w-6 rounded-md" />} titulo="Yape">
      <Numero valor={yape.number} grande />
      {yape.name && <p className="mt-1 text-sm text-gray-500">{yape.name}</p>}
    </Tarjeta>
  )

  const tarjetaBanco = banco && (
    <Tarjeta logo={<Building2 className="h-5 w-5 text-gray-400" />} titulo="BCP" detalle="Cuenta en soles">
      <div className="space-y-3">
        <Numero etiqueta="Número de cuenta" valor={banco.account} />
        {banco.cci && <Numero etiqueta="CCI" valor={banco.cci} />}
      </div>
      {paymentInfo.titular && <p className="mt-auto pt-4 text-sm text-gray-500">Titular: {paymentInfo.titular}</p>}
    </Tarjeta>
  )

  const total = monto != null && (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Total a pagar</p>
      <p className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums text-gray-900">S/ {Number(monto).toFixed(2)}</p>
      {montoConIgv != null && (
        <>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Sin IGV</p>
          <p className="mt-1 text-sm text-gray-500 tabular-nums">
            <span className="font-semibold text-gray-700">S/ {Number(montoConIgv).toFixed(2)}</span> con IGV
          </p>
        </>
      )}
      {concepto && <p className="mt-2 text-sm text-gray-500">{concepto}</p>}
    </div>
  )

  if (horizontal) {
    // Con dos medios: en pantalla grande, tres columnas (medio, medio, total);
    // en mediana, los dos medios arriba y el total en una franja debajo.
    return (
      <div className={`grid gap-4 md:grid-cols-2 ${dosMedios ? 'xl:grid-cols-3' : ''}`}>
        {tarjetaPlin}
        {tarjetaYape}
        {tarjetaBanco}
        <div
          className={`flex flex-col justify-between gap-4 rounded-xl bg-gray-50 p-5 ${
            dosMedios ? 'md:col-span-2 md:flex-row md:items-end xl:col-span-1 xl:flex-col xl:items-stretch' : ''
          }`}
        >
          {total || <p className="text-sm text-gray-600">Cuando pagues, envíanos la captura por WhatsApp.</p>}
          <div className={dosMedios ? 'md:w-72 xl:w-full' : ''}>
            {boton}
            <p className="mt-2 text-center text-xs text-gray-500">Registramos tu renovación al confirmar el pago.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {tarjetaPlin}
      {tarjetaYape}
      {tarjetaBanco}
      {total && <div className="rounded-xl bg-gray-50 p-4">{total}</div>}
      <div className="pt-2">{boton}</div>
    </div>
  )
}
