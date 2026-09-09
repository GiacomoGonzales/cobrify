/**
 * Reglas de una RECETA para el paciente (modo Clínica).
 *
 * El vocabulario es el de Adara (9-set-2026): no recomiendan pastillas sino
 * cremas regeneradoras de laboratorio, así que acá no hay "medicamentos" ni
 * "doctor". Cada línea es una INDICACIÓN: el producto, cómo usarlo, cada
 * cuánto y por cuánto tiempo. Debajo, indicaciones generales en texto libre.
 *
 * Lo que puede decidirse sin tocar la base vive acá y se prueba solo; el
 * servicio guarda, el PDF dibuja y la pestaña muestra.
 */
import { slugDeArchivo } from './consentimiento'

const t = (v) => String(v == null ? '' : v).trim()

export const lineaVacia = () => ({ producto: '', uso: '', frecuencia: '', duracion: '' })

const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Lo que se guarda a partir del formulario: sin líneas vacías, sin espacios
 * de más. Una línea existe si tiene producto; lo demás es opcional.
 * @throws {Error} con el texto que ve quien está escribiendo la receta
 */
export function limpiarReceta(form, hoy = hoyLocal()) {
  const items = (form?.items || [])
    .map((i) => ({ producto: t(i?.producto), uso: t(i?.uso), frecuencia: t(i?.frecuencia), duracion: t(i?.duracion) }))
    .filter((i) => i.producto)
  if (items.length === 0) throw new Error('Escribe al menos una indicación con su producto')
  const date = /^\d{4}-\d{2}-\d{2}$/.test(t(form?.date)) ? t(form.date) : hoy
  return { date, items, notes: t(form?.notes) }
}

/** "aplicar capa fina · 2 veces al día · 15 días", con lo que haya. */
export const textoDeIndicacion = (item) =>
  [t(item?.uso), t(item?.frecuencia), t(item?.duracion)].filter(Boolean).join(' · ')

/** Los productos de la receta, para la lista: "Crema A, Crema B". */
export const resumenDeReceta = (receta) =>
  (receta?.items || []).map((i) => t(i?.producto)).filter(Boolean).join(', ')

export const nombreDeArchivoReceta = (receta, nombrePaciente) =>
  `receta-${slugDeArchivo(nombrePaciente) || 'paciente'}-${receta?.date || 'sin-fecha'}.pdf`
