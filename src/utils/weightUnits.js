/**
 * Unidades del peso bruto de las guías de remisión — criterio único para los
 * 3 formularios (crear/editar remitente, crear transportista) y las vistas.
 *
 * SUNAT acepta dos unidades en el GrossWeightMeasure: KGM (kilogramos) y TNE
 * (toneladas), igual que el selector de su propia página. El valor se declara
 * EN la unidad elegida (2.5 TNE, no 2500), así que al cambiar de unidad en el
 * formulario el número se convierte solo — pedido de JMC GERENCIA Y
 * CONSTRUCCION (31-ago-2026), que trabaja en toneladas.
 */

export const UNIDADES_PESO = [
  { code: 'KGM', label: 'KGM' },
  { code: 'TNE', label: 'TNE' },
]

/** Decimales con los que se guarda/declara cada unidad: 2.575 t = 2575 kg. */
export const decimalesDe = (unidad) => (unidad === 'TNE' ? 3 : 2)

/**
 * Convierte un peso entre KGM y TNE. Devuelve un string listo para el input
 * (redondeado a los decimales de la unidad destino); '' si el valor no es
 * numérico, para no inventar ceros en un campo vacío.
 */
export const convertirPeso = (valor, de, a) => {
  if (de === a) return valor
  const n = parseFloat(valor)
  if (!Number.isFinite(n)) return ''
  const kg = de === 'TNE' ? n * 1000 : n
  const destino = a === 'TNE' ? kg / 1000 : kg
  return String(Math.round(destino * 10 ** decimalesDe(a)) / 10 ** decimalesDe(a))
}
