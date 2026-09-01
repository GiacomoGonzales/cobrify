/**
 * Criterio único para leer los ARCHIVOS y el ESTADO SUNAT de un comprobante
 * ya guardado en Firestore. Lo usan Contabilidad (la vista del negocio) y el
 * panel de administración de CPE (la vista de soporte): si un botón de CDR
 * aparece en una pantalla y no en la otra, es un bug — por eso la resolución
 * de campos vive acá y no copiada en cada página.
 *
 * Por qué tantos fallbacks: las functions guardaron estos datos de formas
 * distintas a lo largo del tiempo — primero URLs sueltas (`cdrUrl`), después
 * en Storage (`cdrStorageUrl`), a veces dentro de `sunatResponse`, y en los
 * casos más viejos el CDR entero en línea (`cdrData`). Todas las variantes
 * siguen vivas en producción.
 *
 * Las URLs son de descarga CON TOKEN (getDownloadURL), así que no dependen de
 * las reglas de Storage: cualquiera que tenga el documento de Firestore puede
 * bajar el archivo — es lo que permite que el admin descargue sin reglas extra.
 */

/** URL del XML firmado, o null si nunca se guardó. */
export const urlXmlDe = (inv) =>
  inv?.xmlStorageUrl || inv?.xmlUrl || inv?.sunatResponse?.xmlStorageUrl || inv?.sunatResponse?.xmlUrl || null

/** URL del CDR (constancia de SUNAT), o null. */
export const urlCdrDe = (inv) =>
  inv?.cdrStorageUrl || inv?.cdrUrl || inv?.sunatResponse?.cdrStorageUrl || inv?.sunatResponse?.cdrUrl || null

/** CDR guardado EN LÍNEA en el documento (formato viejo), o null. */
export const cdrEnLineaDe = (inv) => inv?.cdrData || inv?.sunatResponse?.cdrData || null

export const tieneCdr = (inv) => !!(urlCdrDe(inv) || cdrEnLineaDe(inv))

export const tieneXmlGuardado = (inv) => !!urlXmlDe(inv)

/**
 * ¿Hay un XML para mostrar? Con URL guardada, obvio. Sin URL pero con CDR,
 * también: un CDR implica que hubo un XML firmado aceptado, y Contabilidad
 * puede regenerarlo al vuelo.
 */
export const tieneXml = (inv) => tieneXmlGuardado(inv) || tieneCdr(inv)

/**
 * Estado SUNAT normalizado: 'accepted' | 'rejected' | 'voided' | 'pending'.
 * 'SIGNED'/'signed' son estados legacy de QPse que equivalen a aceptado.
 */
export const estadoSunatDe = (inv) => {
  const status = inv?.sunatStatus || 'pending'
  if (status === 'accepted' || status === 'SIGNED' || status === 'signed') return 'accepted'
  if (status === 'rejected') return 'rejected'
  if (status === 'voided') return 'voided'
  return 'pending'
}

/**
 * Fecha de EMISIÓN del comprobante como Date.
 *
 * `emissionDate` manda (es la fecha fiscal, editable en el POS); `createdAt`
 * es el fallback. Cuando `emissionDate` es un string "YYYY-MM-DD" se combina
 * con la HORA de createdAt para que el orden dentro del día no se pierda.
 */
export const fechaDelComprobante = (invoice) => {
  if (invoice?.emissionDate) {
    if (invoice.emissionDate.toDate) return invoice.emissionDate.toDate()
    if (typeof invoice.emissionDate === 'string') {
      const createdAt = invoice.createdAt?.toDate?.() || (invoice.createdAt ? new Date(invoice.createdAt) : null)
      if (createdAt) {
        const [year, month, day] = invoice.emissionDate.split('-').map(Number)
        const combined = new Date(createdAt)
        combined.setFullYear(year, month - 1, day)
        return combined
      }
      return new Date(invoice.emissionDate + 'T12:00:00')
    }
    return new Date(invoice.emissionDate)
  }
  if (!invoice?.createdAt) return null
  return invoice.createdAt.toDate ? invoice.createdAt.toDate() : new Date(invoice.createdAt)
}
