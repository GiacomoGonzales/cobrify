/**
 * EL RECIBO DE SERVICIO, en ticket de 80 mm.
 *
 * Calcado del recibo que el negocio venía llenando a mano, porque el vecino ya
 * sabe leerlo: el mismo orden de campos, los mismos rótulos. Lo único que
 * cambia es que los números ya vienen calculados.
 *
 * ── Por qué se imprime el detalle del cálculo ───────────────────────────────
 * Lectura anterior, actual, diferencia y tarifa van en el papel para que el
 * vecino pueda rehacer la cuenta él mismo. Es lo primero que se pide cuando
 * alguien reclama, y si no está impreso hay que volver a la casa con el
 * cuaderno.
 *
 * ── La firma ────────────────────────────────────────────────────────────────
 * "Firma digital" acá es el nombre del responsable impreso al pie, como en el
 * papel. No es firma electrónica ni tiene valor tributario: este recibo es un
 * documento interno del negocio, no un comprobante de SUNAT.
 */
import { CON_MEDIDOR } from '@/utils/cobranzaServicios'

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const soles = (n) => `S/ ${(Number(n) || 0).toFixed(2)}`

/** "2026-08-15" -> "15/08/2026". Se deja pasar cualquier otra cosa tal cual. */
const fecha = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '')
}

const hoy = () => new Date().toLocaleDateString('es-PE')

/**
 * @param {object} recibo   Lo emitido, de `serviceReceipts`.
 * @param {object} periodo  `{ desde, hasta, vencimiento }`.
 * @param {object} negocio  `{ titulo, nombre, ruc, telefonos, firma, lema }`.
 */
export function reciboServicioHtml(recibo, periodo = {}, negocio = {}) {
  const linea = '<div style="border-top:1px dashed #000; margin:5px 0"></div>'
  const campo = (rotulo, valor) => `
    <div style="display:flex; justify-content:space-between; gap:8px; padding:1px 0">
      <span>${esc(rotulo)}</span><span style="font-weight:bold; text-align:right">${esc(valor)}</span>
    </div>`

  const conMedidor = recibo.tipo === CON_MEDIDOR
  const detalle = conMedidor
    ? `
      <div style="font-weight:bold; text-align:center; margin:4px 0">DETALLE DEL CONSUMO</div>
      ${campo('Lectura anterior', recibo.lecturaAnterior ?? '—')}
      ${campo('Lectura actual', recibo.lecturaActual ?? '—')}
      ${campo('Consumo (kWh)', recibo.consumo ?? '—')}
      ${campo('Precio por kWh', `S/ ${(Number(recibo.tarifa) || 0).toFixed(3)}`)}`
    : `
      <div style="font-weight:bold; text-align:center; margin:4px 0">DETALLE</div>
      ${campo('Sin medidor', 'Cuota mensual')}`

  // El aviso del mínimo evita el reclamo de "consumí 2 kWh y me cobran 5".
  const avisoMinimo = recibo.aplicoMinimo
    ? `<div style="font-size:10px; text-align:center; margin-top:2px">Se aplicó el consumo mínimo acordado</div>`
    : ''

  const cargo = Number(recibo.cargoFijo) > 0
    ? campo('Cargo fijo', soles(recibo.cargoFijo))
    : ''

  return `
    <div style="font-family:'Courier New', monospace; font-size:12px; width:280px; margin:0 auto; color:#000">
      <div style="text-align:center; font-weight:bold">${esc(negocio.titulo || 'RECIBO POR CONSUMO')}</div>
      ${periodo.desde ? `<div style="text-align:center; font-size:11px">Consumo del ${fecha(periodo.desde)} al ${fecha(periodo.hasta)}</div>` : ''}
      <div style="text-align:center; font-weight:bold; margin-top:4px">${esc(negocio.nombre || '')}</div>
      ${negocio.ruc ? `<div style="text-align:center">RUC ${esc(negocio.ruc)}</div>` : ''}
      ${negocio.telefonos ? `<div style="text-align:center; font-size:11px">${esc(negocio.telefonos)}</div>` : ''}
      ${linea}
      ${campo('Recibo N°', recibo.numero ?? '—')}
      ${campo('Fecha', hoy())}
      ${linea}
      <div>Usuario: <b>${esc(recibo.nombre)}</b></div>
      ${recibo.direccion ? `<div style="font-size:11px">${esc(recibo.direccion)}</div>` : ''}
      ${recibo.numeroSuministro ? `<div style="font-size:11px">Suministro: ${esc(recibo.numeroSuministro)}</div>` : ''}
      ${linea}
      ${detalle}
      ${linea}
      ${campo('Consumo', soles(recibo.importeConsumo))}
      ${cargo}
      <div style="display:flex; justify-content:space-between; gap:8px; border-top:1px solid #000; margin-top:4px; padding-top:4px; font-size:14px; font-weight:bold">
        <span>TOTAL A PAGAR</span><span>${soles(recibo.total)}</span>
      </div>
      ${avisoMinimo}
      ${linea}
      ${campo('Vence el', fecha(recibo.vencimiento || periodo.vencimiento))}
      ${campo('Estado', recibo.estado === 'pagado' ? 'PAGADO' : 'PENDIENTE')}
      ${negocio.firma ? `
        <div style="margin-top:14px; text-align:center">
          <div style="border-top:1px solid #000; width:70%; margin:0 auto"></div>
          <div style="font-size:11px; margin-top:2px">Firma autorizada</div>
          <div style="font-weight:bold">${esc(negocio.firma)}</div>
        </div>` : ''}
      ${negocio.lema ? `<div style="text-align:center; font-size:10px; font-style:italic; margin-top:8px">"${esc(negocio.lema)}"</div>` : ''}
      <div style="text-align:center; font-size:10px; margin-top:6px">Documento interno sin valor tributario</div>
    </div>`
}

/**
 * Varios recibos en una sola impresión, uno por hoja.
 *
 * Es como se imprime en la práctica: se generan los 179 del mes y se cortan
 * después. Mandarlos de a uno serían 179 diálogos de impresión.
 */
export function recibosServicioHtml(recibos, periodo, negocio) {
  return recibos
    .map((r, i) => `
      <div style="${i < recibos.length - 1 ? 'page-break-after:always;' : ''} padding-bottom:8px">
        ${reciboServicioHtml(r, periodo, negocio)}
      </div>`)
    .join('')
}
