/**
 * EMISIÓN MASIVA — parser y validación del Excel de GRE REMITENTE.
 *
 * Importa el contrato de bulkSenderGuideTemplateService (columnas + valores) y
 * devuelve las guías agrupadas con cada problema anclado a su fila real del
 * Excel. Acá no se emite nada: es la compuerta de validación.
 *
 * Cada operación sale con la MISMA forma que arma el modal de GRE Remitente
 * (recipient/origin/destination/transport/items), lista para pasarla a
 * createDispatchGuide sin traducciones a mitad de camino.
 *
 * Lo que NO se pide en el Excel y sale de la ficha del negocio: el remitente
 * (es el propio emisor), la serie y el número (los asigna el sistema).
 */
import { COLUMNAS_GRE_REMITENTE, VALORES_GRE_REMITENTE } from './bulkSenderGuideTemplateService'
import { codigoDeMotivoRemitente, MOTIVO_OTROS, MOTIVO_REMITENTE_POR_DEFECTO } from '@/utils/senderTransferReasons'
import { validateDocument, ID_TYPES } from '@/utils/peruUtils'
import { esUnidadValida, normalizeSunatUnit } from '@/data/sunatUnits'
import {
  LIMITE_GUIAS,
  MAX_DIAS_ATRAS,
  TIPO_DOC_A_SISTEMA,
  TIPO_DOC_A_CODIGO,
  normalizar,
  diaDeCelda,
  diaANumero,
  diaAFecha,
  diaLegible,
  diaISO,
  diasEntre,
  numeroDe,
  textoDe,
  resolverUbigeo,
  agruparPorOperacion,
} from '@/utils/bulkGuideExcel'

export { LIMITE_GUIAS, MAX_DIAS_ATRAS }

/** Partes legibles de un ubigeo resuelto, para el PDF y la pantalla. */
const partesLegibles = (u) => {
  const [department = '', province = '', district = ''] = String(u?.legible || '').split('/')
  return { department, province, district }
}

/**
 * Parsea y valida el Excel de GRE Remitente.
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {object} [ctx]
 * @param {Date} [ctx.hoy] - inyectable para pruebas
 * @returns {Promise<{success:boolean, error?:string, operaciones?:Array, errores?:Array, advertencias?:Array, resumen?:object}>}
 */
export async function parsearExcelGreRemitente(buffer, { hoy = new Date() } = {}) {
  const ExcelJS = (await import('exceljs')).default || (await import('exceljs'))
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buffer)
  } catch {
    return { success: false, error: 'El archivo no es un Excel válido (.xlsx). Descarga la plantilla y llénala.' }
  }

  const hoja = wb.getWorksheet('GUIAS')
  if (!hoja) {
    return { success: false, error: 'El archivo no tiene la hoja GUIAS. Usa la plantilla de GRE Remitente de Cobrify (no la de transportista ni la de comprobantes).' }
  }

  const hoyDia = { y: hoy.getFullYear(), m: hoy.getMonth() + 1, d: hoy.getDate() }

  // Solo el documento del destinatario delata una fila de ejemplo. El RUC del
  // transportista NO se mira: 20100047218 es un RUC real que un negocio puede
  // tener de transportista, y descartarle la guía en silencio sería peor que
  // dejar pasar un ejemplo.
  const { porOperacion, erroresGlobales } = agruparPorOperacion(
    hoja, COLUMNAS_GRE_REMITENTE, ['NUM_DOC_DESTINATARIO'],
  )

  if (porOperacion.size === 0 && erroresGlobales.length === 0) {
    return { success: false, error: 'El archivo no tiene ninguna fila de datos. Llena la hoja GUIAS debajo del encabezado.' }
  }
  if (porOperacion.size > LIMITE_GUIAS) {
    return { success: false, error: `El archivo tiene ${porOperacion.size} guías y el máximo es ${LIMITE_GUIAS}. Divídelo en varios archivos.` }
  }

  const operaciones = []

  for (const [nOp, grupo] of [...porOperacion.entries()].sort((a, b) => a[0] - b[0])) {
    const primera = grupo.filas[0]
    const cab = primera.valores
    const errores = []
    const advertencias = []
    const error = (fila, columna, mensaje) => errores.push({ fila, columna, mensaje })
    const advertir = (fila, columna, mensaje) => advertencias.push({ fila, columna, mensaje })

    // — Fechas —
    const diaEmision = diaDeCelda(cab.FECHA_EMISION)
    if (!diaEmision) {
      error(primera.fila, 'FECHA EMISIÓN', 'Falta la fecha de emisión o no tiene formato dd/mm/aaaa.')
    } else {
      const diff = diasEntre(diaEmision, hoyDia)
      if (diff < 0) error(primera.fila, 'FECHA EMISIÓN', `La fecha ${diaLegible(diaEmision)} es futura.`)
      else if (diff > MAX_DIAS_ATRAS) error(primera.fila, 'FECHA EMISIÓN', `La fecha ${diaLegible(diaEmision)} tiene ${diff} días: fuera del plazo de envío a SUNAT (${MAX_DIAS_ATRAS} días).`)
    }

    const diaTraslado = diaDeCelda(cab.FECHA_TRASLADO)
    if (!diaTraslado) {
      error(primera.fila, 'FECHA TRASLADO', 'Falta la fecha de inicio del traslado (dd/mm/aaaa).')
    } else if (diaEmision && diaANumero(diaTraslado) < diaANumero(diaEmision)) {
      error(primera.fila, 'FECHA TRASLADO', `El traslado ${diaLegible(diaTraslado)} no puede empezar antes de la emisión.`)
    }

    // — Motivo de traslado (viaja a SUNAT) —
    const motivoCrudo = textoDe(cab.MOTIVO_TRASLADO)
    let motivo = MOTIVO_REMITENTE_POR_DEFECTO
    if (motivoCrudo) {
      const reconocido = codigoDeMotivoRemitente(motivoCrudo)
      if (reconocido) motivo = reconocido
      else error(primera.fila, 'MOTIVO DE TRASLADO', `Motivo "${motivoCrudo}" no válido. Elígelo de la lista de la plantilla.`)
    } else {
      advertir(primera.fila, 'MOTIVO DE TRASLADO', 'Sin motivo: se emitirá como Venta (01).')
    }
    const descripcionMotivo = String(cab.DESCRIPCION_MOTIVO ?? '').trim().slice(0, 100)
    if (motivo === MOTIVO_OTROS && !descripcionMotivo) {
      error(primera.fila, 'DESCRIPCIÓN DEL MOTIVO', 'Con el motivo "Otros" la descripción es obligatoria: SUNAT rechaza la guía sin ella.')
    }

    // — Destinatario —
    const tipoDocDest = normalizar(cab.TIPO_DOC_DESTINATARIO)
    const numDocDest = textoDe(cab.NUM_DOC_DESTINATARIO)
    const nombreDest = String(cab.NOMBRE_DESTINATARIO ?? '').trim()
    if (!VALORES_GRE_REMITENTE.TIPO_DOC_DESTINATARIO.includes(tipoDocDest)) {
      error(primera.fila, 'TIPO DOC. DESTINATARIO', cab.TIPO_DOC_DESTINATARIO ? `Tipo "${cab.TIPO_DOC_DESTINATARIO}" no válido: RUC, DNI o CE.` : 'Falta el tipo de documento del destinatario.')
    } else if (!validateDocument(TIPO_DOC_A_SISTEMA[tipoDocDest], numDocDest).isValid) {
      error(primera.fila, 'N° DOC. DESTINATARIO', numDocDest ? `El ${tipoDocDest} "${numDocDest}" no es válido.` : `Falta el ${tipoDocDest} del destinatario.`)
    }
    if (!nombreDest) error(primera.fila, 'NOMBRE DESTINATARIO', 'Falta el nombre o razón social del destinatario.')

    // — Ruta —
    const dirPartida = String(cab.DIRECCION_PARTIDA ?? '').trim()
    const dirLlegada = String(cab.DIRECCION_LLEGADA ?? '').trim()
    if (!dirPartida) error(primera.fila, 'DIRECCIÓN PARTIDA', 'Falta la dirección del punto de partida.')
    if (!dirLlegada) error(primera.fila, 'DIRECCIÓN LLEGADA', 'Falta la dirección del punto de llegada.')

    const ubiPartida = resolverUbigeo(cab.UBIGEO_PARTIDA)
    if (ubiPartida.error) error(primera.fila, 'UBIGEO PARTIDA', ubiPartida.error)
    const ubiLlegada = resolverUbigeo(cab.UBIGEO_LLEGADA)
    if (ubiLlegada.error) error(primera.fila, 'UBIGEO LLEGADA', ubiLlegada.error)

    // — Modalidad y transporte —
    const modalidad = normalizar(cab.MODALIDAD)
    if (!VALORES_GRE_REMITENTE.MODALIDAD.includes(modalidad)) {
      error(primera.fila, 'MODALIDAD DE TRASLADO', cab.MODALIDAD ? `Modalidad "${cab.MODALIDAD}" no válida: PUBLICO o PRIVADO.` : 'Falta la modalidad de traslado (PUBLICO o PRIVADO).')
    }
    const esPublico = modalidad === 'PUBLICO'
    // '01' público (lo lleva un transportista), '02' privado (lo lleva el remitente)
    const transportMode = esPublico ? '01' : '02'

    const rucTransportista = textoDe(cab.RUC_TRANSPORTISTA)
    const razonTransportista = String(cab.RAZON_SOCIAL_TRANSPORTISTA ?? '').trim()
    const placa = normalizar(cab.PLACA).replace(/[^A-Z0-9]/g, '')
    const dniConductor = textoDe(cab.DNI_CONDUCTOR)
    const nombresConductor = String(cab.NOMBRES_CONDUCTOR ?? '').trim()
    const apellidosConductor = String(cab.APELLIDOS_CONDUCTOR ?? '').trim()
    const licencia = normalizar(cab.LICENCIA_CONDUCTOR).replace(/\s/g, '')

    if (esPublico) {
      if (!validateDocument(ID_TYPES.RUC, rucTransportista).isValid) {
        error(primera.fila, 'RUC TRANSPORTISTA', rucTransportista ? `El RUC "${rucTransportista}" no es válido.` : 'Con modalidad PUBLICO hace falta el RUC del transportista.')
      }
      if (!razonTransportista) error(primera.fila, 'RAZÓN SOCIAL TRANSPORTISTA', 'Con modalidad PUBLICO hace falta la razón social del transportista.')
      if (placa || dniConductor) {
        advertir(primera.fila, 'MODALIDAD DE TRASLADO', 'La modalidad es PUBLICO: los datos de placa y conductor se ignoran (los declara el transportista en su propia guía).')
      }
    } else if (modalidad === 'PRIVADO') {
      if (!/^[A-Z0-9]{6,8}$/.test(placa)) {
        error(primera.fila, 'PLACA VEHÍCULO', placa ? `La placa "${cab.PLACA}" no parece válida. Ejemplo: ABC-123` : 'Con modalidad PRIVADO hace falta la placa del vehículo.')
      }
      if (!validateDocument(ID_TYPES.DNI, dniConductor).isValid) {
        error(primera.fila, 'DNI CONDUCTOR', dniConductor ? 'El DNI del conductor debe tener 8 dígitos.' : 'Con modalidad PRIVADO hace falta el DNI del conductor.')
      }
      if (!nombresConductor) error(primera.fila, 'NOMBRES CONDUCTOR', 'Faltan los nombres del conductor.')
      if (!apellidosConductor) error(primera.fila, 'APELLIDOS CONDUCTOR', 'Faltan los apellidos del conductor.')
      if (!/^[A-Z0-9-]{8,12}$/.test(licencia)) {
        error(primera.fila, 'LICENCIA', licencia ? `El brevete "${cab.LICENCIA_CONDUCTOR}" no parece válido. Ejemplo: Q12345678` : 'Falta el brevete del conductor.')
      }
    }

    // — Peso —
    const peso = numeroDe(cab.PESO_TOTAL)
    if (peso === null || peso <= 0) {
      error(primera.fila, 'PESO BRUTO TOTAL', 'Falta el peso bruto total de la guía (mayor a 0), en la primera fila de la operación.')
    }
    const unidadPesoCruda = normalizar(cab.UNIDAD_PESO)
    let weightUnit = 'KGM'
    if (unidadPesoCruda) {
      if (VALORES_GRE_REMITENTE.UNIDAD_PESO.includes(unidadPesoCruda)) weightUnit = unidadPesoCruda
      else error(primera.fila, 'UND. DEL PESO', `Unidad "${cab.UNIDAD_PESO}" no válida: KGM o TNE.`)
    }

    // — Bienes —
    const items = []
    for (const { fila, valores } of grupo.filas) {
      const descripcion = String(valores.DESCRIPCION_BIEN ?? '').trim()
      const cantidad = numeroDe(valores.CANTIDAD)
      if (!descripcion) error(fila, 'DESCRIPCIÓN DEL BIEN', 'Falta la descripción del bien.')
      if (cantidad === null || cantidad <= 0) error(fila, 'CANTIDAD', 'La cantidad debe ser mayor a 0.')

      const unidadTexto = String(valores.UNIDAD ?? '').trim()
      if (unidadTexto && !esUnidadValida(unidadTexto)) {
        error(fila, 'UNIDAD', `Unidad "${valores.UNIDAD}" no válida. Usa el desplegable de la plantilla.`)
      }
      const unidadCodigo = unidadTexto ? normalizeSunatUnit(unidadTexto) : 'NIU'

      const codigoInterno = textoDe(valores.CODIGO_ITEM)
      if (codigoInterno.length > 30) {
        advertir(fila, 'CÓDIGO INTERNO', `El código "${codigoInterno}" tiene más de 30 caracteres: se enviará recortado a los primeros 30.`)
      }

      items.push({
        fila,
        productId: '',
        code: codigoInterno,
        description: descripcion,
        quantity: cantidad ?? 0,
        unit: unidadCodigo,
        weight: null,
      })
    }

    const legiblePartida = partesLegibles(ubiPartida)
    const legibleLlegada = partesLegibles(ubiLlegada)

    operaciones.push({
      nOperacion: nOp,
      filaInicio: primera.fila,
      guia: {
        issueDate: diaISO(diaEmision),
        transferDate: diaISO(diaTraslado),
        transferReason: motivo,
        transferDescription: descripcionMotivo,
        transportMode,
        // Con transporte público SUNAT quiere la fecha de entrega al
        // transportista; sin una columna propia, la del traslado es la
        // respuesta correcta (es cuando la carga sale).
        carrierDeliveryDate: esPublico ? diaISO(diaTraslado) : null,
        totalWeight: peso ?? 0,
        weightUnit,
        isM1LVehicle: false,
        recipient: {
          documentType: TIPO_DOC_A_CODIGO[tipoDocDest] || '6',
          documentNumber: numDocDest,
          name: nombreDest,
          address: dirLlegada,
          email: '',
          ubigeo: ubiLlegada.ubigeo || '',
        },
        // Solo el motivo 02 (Compra) lleva proveedor, y ese dato no se pide en
        // la plantilla: quien lo necesite emite esa guía desde la pantalla.
        supplier: null,
        origin: {
          address: dirPartida,
          ubigeo: ubiPartida.ubigeo || '',
          department: legiblePartida.department,
          province: legiblePartida.province,
          district: legiblePartida.district,
        },
        destination: {
          address: dirLlegada,
          ubigeo: ubiLlegada.ubigeo || '',
          department: legibleLlegada.department,
          province: legibleLlegada.province,
          district: legibleLlegada.district,
        },
        transport: esPublico
          ? {
            carrier: {
              ruc: rucTransportista,
              businessName: razonTransportista,
              mtcNumber: null,
              registerVehiclesAndDrivers: false,
            },
          }
          : {
            driver: {
              documentType: '1',
              documentNumber: dniConductor,
              name: nombresConductor,
              lastName: apellidosConductor,
              license: licencia,
            },
            vehicle: {
              plate: placa,
              tuce: null,
              authorizationEntity: null,
              authorizationNumber: null,
            },
            additionalVehicles: [],
            additionalDrivers: [],
          },
        relatedDocuments: [],
        referencedInvoice: null,
        additionalInfo: String(cab.OBSERVACIONES ?? '').trim(),
        // La guía no lleva el número de fila del Excel (es dato de la vista previa)
        items: items.map((it, i) => {
          const copia = { ...it, lineNumber: i + 1 }
          delete copia.fila
          return copia
        }),
        // El lote no descuenta stock: es una decisión por guía que se toma en
        // la pantalla, y hacerlo en serie sobre cientos sin poder revisarlo
        // sería el peor lugar para equivocarse.
        warehouseId: null,
        warehouseName: null,
        stockDeducted: false,
      },
      resumen: {
        destinatario: nombreDest,
        motivo,
        ruta: `${ubiPartida.legible || cab.UBIGEO_PARTIDA || '?'} → ${ubiLlegada.legible || cab.UBIGEO_LLEGADA || '?'}`,
        modalidad: esPublico ? 'Público' : 'Privado',
        transportista: esPublico ? razonTransportista : `${nombresConductor} ${apellidosConductor}`.trim(),
        placa: esPublico ? '' : (cab.PLACA || ''),
        peso: peso ?? 0,
        unidadPeso: weightUnit,
        bienes: items.length,
      },
      items,
      errores,
      advertencias,
    })
  }

  const errores = [...erroresGlobales, ...operaciones.flatMap((o) => o.errores)]
  const advertencias = operaciones.flatMap((o) => o.advertencias)
  const conErrores = operaciones.filter((o) => o.errores.length > 0).length

  return {
    success: true,
    operaciones,
    errores,
    advertencias,
    resumen: {
      operaciones: operaciones.length,
      items: operaciones.reduce((s, o) => s + o.items.length, 0),
      listas: operaciones.length - conErrores,
      conErrores,
    },
  }
}
