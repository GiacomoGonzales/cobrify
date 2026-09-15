/**
 * Excel del REGISTRO DE HUÉSPEDES por fechas (utils/registroDeHuespedes): el
 * reemplazo del Excel que San Ignacio Bamboo Lodge armaba con su formulario de
 * Google. Una fila por huésped; la reserva sin registro sale con su titular y
 * "Pendiente", para ver a quién falta pedírselo.
 */
import {
  XLSX,
  setStyle,
  cellStyle,
  applyTitleRow,
  applySubtitleRow,
  applyHeaderRow,
  applyFreezeBelow,
  applyColumnWidths,
  buildExcelFileName,
  saveAndShareExcel,
} from '@/services/excelStyles'
import { filasDelRegistro, COLUMNAS_DEL_REGISTRO, fechaCorta } from '@/utils/registroDeHuespedes'

const ANCHOS = [11, 11, 7, 22, 11, 10, 11, 8, 13, 22, 22, 11, 13, 10, 12, 6, 12, 16, 13, 26]

/** Arma y descarga (o comparte, en el celular) el Excel. Devuelve cuántas filas salieron. */
export async function descargarRegistroDeHuespedes({ reservas, desde, hasta, negocio }) {
  const filas = filasDelRegistro(reservas, { desde, hasta })
  const total = COLUMNAS_DEL_REGISTRO.length
  const aoa = [
    [`Registro de huéspedes${negocio ? ` · ${negocio}` : ''}`],
    [`Estadías del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`],
    COLUMNAS_DEL_REGISTRO,
    ...filas,
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  applyColumnWidths(ws, ANCHOS)
  applyTitleRow(ws, 0, total)
  applySubtitleRow(ws, 1, total)
  applyHeaderRow(ws, 2, total)
  filas.forEach((_, i) => {
    for (let c = 0; c < total; c++) setStyle(ws, 3 + i, c, cellStyle(i))
  })
  applyFreezeBelow(ws, 2)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Registro de huéspedes')
  await saveAndShareExcel(wb, buildExcelFileName('RegistroHuespedes', [desde, hasta]), {
    shareTitle: 'Registro de huéspedes',
    shareText: `Registro de huéspedes del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`,
  })
  return filas.length
}
