/**
 * QUÉ DICE EL TICKET DE UNA GUÍA DE REMISIÓN.
 *
 * Solo el CONTENIDO: las secciones, sus etiquetas y sus valores. Cómo se pinta
 * es cosa de cada formato — el componente de pantalla lo hace con HTML y el
 * generador de PDF con jsPDF, pero los dos leen de acá.
 *
 * POR QUÉ EXISTE (6-set-2026): el mismo día en que se arregló que el PDF A4
 * imprimiera un motivo de traslado distinto al del ticket —cada uno tenía su
 * tabla y una estaba corrida un código— hubo que agregar un TERCER formato: el
 * ticket en PDF, porque en la app `window.print()` no hace nada y el cliente no
 * podía sacar el ticket de ninguna forma. Escribir el contenido por tercera vez
 * era garantizar el mismo problema dentro de unos meses.
 */
import { etiquetaBreveRemitente } from '@/utils/senderTransferReasons'
import { urlQrDeLaGuia } from '@/utils/qrGuiaSunat'
import { etiquetaMotivo as etiquetaMotivoTransportista } from '@/utils/carrierTransferReasons'

const UNIDADES = {
  NIU: 'UND', KGM: 'KG', LTR: 'LT', MTR: 'MT',
  GLL: 'GAL', BOX: 'CJ', PK: 'PQ', DZN: 'DOC', TNE: 'TN',
}

const TIPOS_DOC = { 1: 'DNI', 4: 'CE', 6: 'RUC', 7: 'PAS' }

const TIPOS_DOC_RELACIONADO = {
  '01': 'FAC', '03': 'BOL', '09': 'GRE', '31': 'GRT', '49': 'OC',
}

/** Fecha en dd/mm/aaaa. Una cadena YYYY-MM-DD se parte a mano: `new Date` la lee en UTC y corre el día. */
export const fechaDeTicket = (valor) => {
  if (!valor) return '-'
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [a, m, d] = valor.split('-')
    return `${d}/${m}/${a}`
  }
  const fecha = valor?.toDate ? valor.toDate() : new Date(valor)
  if (isNaN(fecha?.getTime?.())) return '-'
  return fecha.toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export const unidadCorta = (unidad) => UNIDADES[unidad] || unidad || 'UND'

/**
 * Lo que va en el QR.
 *
 * Manda la URL de SUNAT: escanearla ABRE la guía en el sitio de SUNAT, que es
 * lo que el fedatario verifica en carretera. El formato de tuberías es solo
 * texto —escanearlo no lleva a ningún lado— y queda de respaldo para las guías
 * que no tienen CDR guardado.
 */
export function datosQrDeLaGuia(guia, ruc) {
  const url = urlQrDeLaGuia(guia)
  if (url) return url
  const serie = guia?.series || guia?.number?.split('-')[0] || 'T001'
  const numero = guia?.number?.split('-')[1] || '1'
  const tipo = guia?.documentType === '31' ? '31' : '09'
  return `${ruc || '00000000000'}|${tipo}|${serie}|${numero}`
}

const transporte = (guia) => {
  if (guia?.transportMode === '02') {
    const chofer = guia.transport?.driver || guia.driver || {}
    const vehiculo = guia.transport?.vehicle || guia.vehicle || {}
    const filas = []
    if (vehiculo.plate) filas.push({ etiqueta: 'Placa', valor: vehiculo.plate })
    if (vehiculo.authorizationNumber) {
      filas.push({
        etiqueta: 'Autoriz',
        valor: `${vehiculo.authorizationEntity || ''} ${vehiculo.authorizationNumber}`.trim(),
      })
    }
    const nombre = `${chofer.name || ''} ${chofer.lastName || ''}`.trim()
    if (nombre) {
      filas.push({ etiqueta: 'Conductor', valor: nombre })
      if (chofer.documentNumber) {
        filas.push({
          etiqueta: TIPOS_DOC[chofer.documentType] || chofer.documentType || 'Doc',
          valor: chofer.documentNumber,
        })
      }
      if (chofer.license) filas.push({ etiqueta: 'Licencia', valor: chofer.license })
    }
    return {
      titulo: `Transporte ${guia.isM1LVehicle ? 'PRIVADO (M1/L)' : 'PRIVADO'}`,
      filas,
      nota: guia.isM1LVehicle ? '(Vehículo categoría M1 o L)' : null,
    }
  }
  const empresa = guia?.transport?.carrier || guia?.carrier || {}
  return {
    titulo: 'Transporte PUBLICO',
    filas: [
      { etiqueta: 'Transportista', valor: empresa.businessName || '-' },
      { etiqueta: 'RUC', valor: empresa.ruc || '-' },
    ],
    nota: null,
  }
}

const documentosRelacionados = (guia) => {
  const docs = []
  if (guia?.referenceInvoice?.fullNumber) {
    docs.push({
      etiqueta: TIPOS_DOC_RELACIONADO[guia.referenceInvoice.documentType] || 'DOC',
      valor: guia.referenceInvoice.fullNumber,
    })
  }
  for (const d of (guia?.relatedDocuments || [])) {
    const numero = d.number || d.fullNumber
    if (numero) docs.push({ etiqueta: TIPOS_DOC_RELACIONADO[d.type] || 'DOC', valor: numero })
  }
  return docs
}

/**
 * El encabezado: quién emite.
 * `guide` puede traer los datos de su sucursal; si no, manda el negocio.
 */
export function encabezadoDeGuia(guia = {}, empresa = {}) {
  return {
    nombre: guia.branchTradeName || empresa.tradeName || empresa.name || 'MI EMPRESA',
    ruc: empresa.ruc || '00000000000',
    direccion: guia.branchAddress || empresa.address || '',
    telefono: guia.branchPhone || empresa.phone || '',
    sucursal: guia.branchName || '',
    tipo: guia.documentType === '31' ? 'GUÍA REMISIÓN TRANSPORTISTA' : 'GUÍA DE REMISIÓN',
    numero: guia.number || '-',
  }
}

/**
 * Las secciones del ticket, en orden.
 *
 * Cada una: `{ titulo, filas: [{etiqueta, valor}], texto, destacado, nota, items }`.
 * Las que quedarían vacías no se devuelven, así ningún formato tiene que
 * acordarse de esconderlas.
 */
export function seccionesDeGuiaParaTicket(guia = {}) {
  // La guía del TRANSPORTISTA (documento 31) es otro papel: el emisor es el
  // transportista, aparece el remitente, y puede llevar varios conductores y
  // vehículos. Se reparte acá para que quien pida "las secciones de esta guía"
  // no tenga que saber de qué tipo es.
  if (guia.documentType === '31') return seccionesDeTransportista(guia)
  return seccionesDeRemitente(guia)
}

/** Las secciones de una guía del REMITENTE (documento 09). */
function seccionesDeRemitente(guia = {}) {
  const destinatario = guia.recipient || {}
  const secciones = []

  secciones.push({
    filas: [
      { etiqueta: 'F. Emisión', valor: fechaDeTicket(guia.issueDate || guia.createdAt) },
      { etiqueta: 'F. Traslado', valor: fechaDeTicket(guia.transferDate) },
    ],
  })

  secciones.push({
    titulo: 'Destinatario',
    filas: [
      { etiqueta: 'Doc', valor: destinatario.documentNumber || destinatario.ruc || '-' },
      { etiqueta: 'Nombre', valor: destinatario.name || destinatario.businessName || '-' },
    ],
  })

  if (guia.supplier?.documentNumber) {
    secciones.push({
      titulo: 'Proveedor',
      filas: [
        { etiqueta: 'RUC', valor: guia.supplier.documentNumber },
        { etiqueta: 'Nombre', valor: guia.supplier.name || '-' },
      ],
      texto: guia.supplier.address || null,
    })
  }

  secciones.push({
    titulo: 'Datos del Traslado',
    filas: [
      {
        etiqueta: 'Motivo',
        valor: etiquetaBreveRemitente(guia.transferReason) || guia.transferReason || '-',
      },
    ],
    destacado: `PESO: ${guia.totalWeight || guia.weight || '0'} ${guia.weightUnit || 'KGM'}`,
    texto: guia.transferDescription ? `Obs: ${guia.transferDescription}` : null,
  })

  const relacionados = documentosRelacionados(guia)
  if (relacionados.length) {
    secciones.push({ titulo: 'Doc. Relacionados', filas: relacionados })
  }

  for (const [titulo, punto] of [
    ['Punto de Partida', guia.origin || { address: guia.originAddress }],
    ['Punto de Llegada', guia.destination || { address: guia.destinationAddress }],
  ]) {
    secciones.push({
      titulo,
      texto: punto?.address || '-',
      filas: punto?.ubigeo ? [{ etiqueta: 'Ubigeo', valor: punto.ubigeo }] : [],
    })
  }

  secciones.push(transporte(guia))

  const items = (guia.items || []).map(i => ({
    cantidad: i.quantity || 0,
    unidad: unidadCorta(i.unit),
    descripcion: i.description || i.name || '-',
    serie: i.serialNumber || null,
  }))
  secciones.push({ titulo: `Bienes (${items.length})`, items })

  return secciones.filter(s => s.titulo || s.filas?.length || s.texto || s.items)
}

/**
 * Las secciones de una guía del TRANSPORTISTA (documento 31).
 *
 * Ojo con los nombres: acá el tipo de transporte es `transportType` (no
 * `transportMode`) y el indicador de vehículo menor es `isM1OrLVehicle` (no
 * `isM1LVehicle`). Son campos distintos guardados con nombres parecidos, y
 * confundirlos deja el dato en blanco sin que nadie se entere.
 */
function seccionesDeTransportista(guia = {}) {
  const remitente = guia.shipper || {}
  const destinatario = guia.recipient || {}
  const secciones = []

  secciones.push({
    filas: [
      { etiqueta: 'F. Emisión', valor: fechaDeTicket(guia.issueDate || guia.createdAt) },
      { etiqueta: 'F. Traslado', valor: fechaDeTicket(guia.transferDate) },
    ],
  })

  secciones.push({
    titulo: 'Remitente',
    filas: [
      { etiqueta: 'RUC', valor: remitente.ruc || '-' },
      { etiqueta: 'Nombre', valor: remitente.businessName || '-' },
    ],
  })

  secciones.push({
    titulo: 'Destinatario',
    filas: [
      { etiqueta: 'Doc', valor: destinatario.documentNumber || '-' },
      { etiqueta: 'Nombre', valor: destinatario.name || '-' },
    ],
  })

  secciones.push({
    titulo: 'Datos del Traslado',
    filas: [
      {
        etiqueta: 'Motivo',
        valor: etiquetaMotivoTransportista(guia.transferReason) || guia.transferReason || '-',
      },
      { etiqueta: 'Transporte', valor: guia.transportType === '01' ? 'PUBLICO' : 'PRIVADO' },
    ],
    destacado: `PESO: ${guia.totalWeight || 0} ${guia.weightUnit === 'TNE' ? 'TNE' : 'KGM'}`,
    texto: guia.transferDescription || null,
  })

  for (const [titulo, punto] of [
    ['Punto de Partida', guia.origin],
    ['Punto de Llegada', guia.destination],
  ]) {
    secciones.push({
      titulo,
      texto: punto?.address || '-',
      filas: punto?.ubigeo ? [{ etiqueta: 'Ubigeo', valor: punto.ubigeo }] : [],
    })
  }

  // Conductores: puede haber uno principal y uno secundario.
  const conductores = (guia.drivers?.length ? guia.drivers : [guia.driver])
    .filter(c => c && (c.documentNumber || c.name))
  if (conductores.length) {
    const filas = []
    conductores.forEach((c, i) => {
      const nombre = `${c.name || ''} ${c.lastName || ''}`.trim() || '-'
      filas.push({ etiqueta: conductores.length > 1 ? `Conductor ${i + 1}` : 'Conductor', valor: nombre })
      if (c.documentNumber) {
        filas.push({ etiqueta: TIPOS_DOC[c.documentType] || 'Doc', valor: c.documentNumber })
      }
      if (c.license) filas.push({ etiqueta: 'Licencia', valor: c.license })
    })
    secciones.push({ titulo: conductores.length > 1 ? 'Conductores' : 'Conductor', filas })
  }

  const vehiculos = (guia.vehicles?.length ? guia.vehicles : [guia.vehicle]).filter(v => v?.plate)
  if (vehiculos.length) {
    const filas = []
    vehiculos.forEach((v, i) => {
      filas.push({ etiqueta: vehiculos.length > 1 ? `Placa ${i + 1}` : 'Placa', valor: v.plate })
      if (v.mtcAuthorization) filas.push({ etiqueta: 'MTC', valor: v.mtcAuthorization })
      if (v.tuce) filas.push({ etiqueta: 'TUCE', valor: v.tuce })
    })
    secciones.push({
      titulo: vehiculos.length > 1 ? 'Vehículos' : 'Vehículo',
      filas,
      nota: guia.isM1OrLVehicle ? '(Vehículo categoría M1 o L)' : null,
    })
  }

  if (guia.observations) {
    secciones.push({ titulo: 'Observaciones', texto: guia.observations })
  }

  const items = (guia.items || []).map(i => ({
    cantidad: i.quantity || 0,
    unidad: unidadCorta(i.unit),
    descripcion: i.description || i.name || '-',
    serie: i.serialNumber || null,
  }))
  secciones.push({ titulo: `Bienes (${items.length})`, items })

  return secciones.filter(s => s.titulo || s.filas?.length || s.texto || s.items)
}

export const PIE_DE_TICKET = [
  'REPRESENTACIÓN IMPRESA DE LA',
  'GUÍA DE REMISIÓN ELECTRÓNICA',
  'Consulte en: www.sunat.gob.pe',
]
