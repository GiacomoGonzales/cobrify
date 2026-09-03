/**
 * Catálogo 03 SUNAT — Unidades de medida.
 * Lista completa de las unidades más usadas en facturación electrónica peruana.
 *
 * Fuente: Anexo 03 de la Resolución de Superintendencia 097-2012/SUNAT y
 * actualizaciones posteriores.
 *
 * Cada entry tiene { value: codigo SUNAT, label: "CODIGO - Nombre" }.
 * Ordenadas por nombre legible para que sea fácil buscar visualmente.
 */
const SUNAT_UNITS = [
  { value: 'BJ',  label: 'BJ - Balde' },
  { value: 'BLL', label: 'BLL - Barril' },
  { value: '4B',  label: '4B - Barriles' },
  { value: 'BG',  label: 'BG - Bolsa' },
  { value: 'BO',  label: 'BO - Botellas' },
  { value: 'BX',  label: 'BX - Caja' },
  { value: 'CT',  label: 'CT - Cartones' },
  { value: 'CMK', label: 'CMK - Centímetro cuadrado' },
  { value: 'CMQ', label: 'CMQ - Centímetro cúbico' },
  { value: 'CMT', label: 'CMT - Centímetro lineal' },
  { value: 'CEN', label: 'CEN - Ciento de unidades' },
  { value: 'CY',  label: 'CY - Cilindro' },
  { value: 'SET', label: 'SET - Conjunto' },
  { value: 'QD',  label: 'QD - Cuarto de docena' },
  { value: 'AV',  label: 'AV - Cápsula' },
  { value: 'DZN', label: 'DZN - Docena' },
  { value: 'DZP', label: 'DZP - Docena por 10⁶' },
  { value: 'CH',  label: 'CH - Envase' },
  { value: 'BE',  label: 'BE - Fardo' },
  { value: 'JR',  label: 'JR - Frasco' },
  { value: 'GLL', label: 'GLL - Galón (3.785 dm³)' },
  { value: 'GLI', label: 'GLI - Galón inglés (4.545 dm³)' },
  { value: 'GRM', label: 'GRM - Gramo' },
  { value: 'GRO', label: 'GRO - Gruesa' },
  { value: 'ST',  label: 'ST - Hoja' },
  { value: 'LEF', label: 'LEF - Hoja' },
  { value: 'HUR', label: 'HUR - Hora' },
  { value: 'JG',  label: 'JG - Jarra' },
  { value: 'KGM', label: 'KGM - Kilogramo' },
  { value: 'KWH', label: 'KWH - Kilovatio hora' },
  { value: 'KTM', label: 'KTM - Kilómetro' },
  { value: 'KT',  label: 'KT - Kit' },
  { value: 'CA',  label: 'CA - Lata' },
  { value: 'LBR', label: 'LBR - Libra' },
  { value: 'LTR', label: 'LTR - Litro' },
  { value: 'HD',  label: 'HD - Media docena' },
  { value: 'MWH', label: 'MWH - Megavatio hora' },
  { value: 'MTR', label: 'MTR - Metro' },
  { value: 'MTK', label: 'MTK - Metro cuadrado' },
  { value: 'MTQ', label: 'MTQ - Metro cúbico' },
  { value: 'MGM', label: 'MGM - Miligramo' },
  { value: 'MLT', label: 'MLT - Mililitro' },
  { value: 'MIL', label: 'MIL - Millar' },
  { value: 'UM',  label: 'UM - Millón de unidades' },
  { value: 'MMT', label: 'MMT - Milímetro' },
  { value: 'MMK', label: 'MMK - Milímetro cuadrado' },
  { value: 'MMQ', label: 'MMQ - Milímetro cúbico' },
  { value: 'ONZ', label: 'ONZ - Onza' },
  { value: 'PF',  label: 'PF - Palet' },
  { value: 'PK',  label: 'PK - Paquete' },
  // PACK y PAQUETE son lo mismo para SUNAT (código PK), pero NO para quien
  // lee la cotización: una municipalidad le rechazó una a A&S COPIERS porque
  // decía "PAQUETE" y sus bases pedían "PACK". Se ofrece como unidad propia
  // —imprime PACK— y al emitir viaja como PK igual que su hermana.
  { value: 'PACK', label: 'PACK - Pack' },
  { value: 'PR',  label: 'PR - Par' },
  { value: 'FOT', label: 'FOT - Pie' },
  { value: 'FTK', label: 'FTK - Pie cuadrado' },
  { value: 'FT3', label: 'FT3 - Pie cúbico' },
  { value: 'FTQ', label: 'FTQ - Pie cúbico' },
  { value: 'C62', label: 'C62 - Pieza' },
  { value: 'PG',  label: 'PG - Placa' },
  { value: 'INH', label: 'INH - Pulgada' },
  { value: 'RM',  label: 'RM - Resma' },
  { value: 'RO',  label: 'RO - Rollo' },
  { value: 'SA',  label: 'SA - Saco' },
  { value: 'ZZ',  label: 'ZZ - Servicios' },
  { value: 'U2',  label: 'U2 - Tableta/Blister' },
  { value: 'DR',  label: 'DR - Tambor' },
  { value: 'STN', label: 'STN - Tonelada corta (2000 lb)' },
  { value: 'TNE', label: 'TNE - Tonelada métrica' },
  { value: 'BT',  label: 'BT - Tornillo' },
  { value: 'TU',  label: 'TU - Tubo' },
  { value: 'NIU', label: 'NIU - Unidad' },
  { value: 'YRD', label: 'YRD - Yarda' },
]

// Set de códigos válidos para validación rápida (case-insensitive vía toUpperCase)
const VALID_UNIT_CODES = new Set(SUNAT_UNITS.map(u => u.value.toUpperCase()))

/**
 * Mapeo de aliases comunes (texto libre) → código SUNAT del Catálogo 03.
 * Cubre variantes históricas que aparecen en datos de productos viejos.
 */
const UNIT_ALIASES = {
  // Unidad
  'UNIDAD': 'NIU', 'UNIDADES': 'NIU', 'UND': 'NIU', 'UNDS': 'NIU',
  'UN': 'NIU', 'UNI': 'NIU', 'U': 'NIU', 'UNI.': 'NIU', 'UND.': 'NIU',
  'UNIT': 'NIU', 'PZA': 'NIU', 'PZ': 'NIU', 'PIEZA': 'NIU', 'PIEZAS': 'NIU',
  // Peso
  'KG': 'KGM', 'KGS': 'KGM', 'KILO': 'KGM', 'KILOS': 'KGM', 'KILOGRAMO': 'KGM', 'KILOGRAMOS': 'KGM',
  'G': 'GRM', 'GR': 'GRM', 'GRS': 'GRM', 'GRAMO': 'GRM', 'GRAMOS': 'GRM',
  'MG': 'MGM', 'MILIGRAMO': 'MGM', 'MILIGRAMOS': 'MGM',
  'TN': 'TNE', 'TON': 'TNE', 'TONELADA': 'TNE', 'TONELADAS': 'TNE',
  'LB': 'LBR', 'LIBRA': 'LBR', 'LIBRAS': 'LBR',
  'OZ': 'ONZ', 'ONZA': 'ONZ', 'ONZAS': 'ONZ',
  // Volumen / capacidad
  'L': 'LTR', 'LT': 'LTR', 'LTS': 'LTR', 'LITRO': 'LTR', 'LITROS': 'LTR',
  'ML': 'MLT', 'MILILITRO': 'MLT', 'MILILITROS': 'MLT',
  'GL': 'GLL', 'GAL': 'GLL', 'GALON': 'GLL', 'GALONES': 'GLL',
  // Longitud
  'M': 'MTR', 'MT': 'MTR', 'MTS': 'MTR', 'METRO': 'MTR', 'METROS': 'MTR',
  'CM': 'CMT', 'CENTIMETRO': 'CMT', 'CENTIMETROS': 'CMT',
  'MM': 'MMT', 'MILIMETRO': 'MMT', 'MILIMETROS': 'MMT',
  'KM': 'KTM', 'KILOMETRO': 'KTM', 'KILOMETROS': 'KTM',
  'PULG': 'INH', 'PULGADA': 'INH', 'PULGADAS': 'INH',
  // Área
  'M2': 'MTK', 'METRO2': 'MTK', 'METROCUADRADO': 'MTK', 'METROSCUADRADOS': 'MTK',
  'CM2': 'CMK', 'MM2': 'MMK',
  // Volumen cúbico
  'M3': 'MTQ', 'METRO3': 'MTQ', 'METROCUBICO': 'MTQ', 'METROSCUBICOS': 'MTQ',
  'CM3': 'CMQ', 'MM3': 'MMQ',
  // Empaque
  'CAJA': 'BX', 'CAJAS': 'BX', 'CJ': 'BX',
  // "Display" = caja expendedora con varias unidades del mismo producto. SUNAT
  // no tiene codigo propio; se mapea a BX (Caja) para que el XML sea valido.
  'DISPLAY': 'BX', 'DISPLAYS': 'BX', 'DISP': 'BX',
  'BOLSA': 'BG', 'BOLSAS': 'BG', 'BLS': 'BG',
  'PAQUETE': 'PK', 'PAQUETES': 'PK', 'PAQ': 'PK', 'PKT': 'PK',
  // 'PACK' se resuelve solo por ser un código válido del catálogo; el alias
  // cubre los plurales y lo que venga de un Excel.
  'PACKS': 'PACK', 'PACKS.': 'PACK',
  'BOTELLA': 'BO', 'BOTELLAS': 'BO', 'BOT': 'BO',
  'LATA': 'CA', 'LATAS': 'CA',
  'BARRIL': 'BLL', 'BARRILES': 'BLL',
  'CARTON': 'CT', 'CARTONES': 'CT', 'CTN': 'CT',
  'CIENTO': 'CEN', 'CIENTOS': 'CEN',
  'DOCENA': 'DZN', 'DOCENAS': 'DZN', 'DOC': 'DZN',
  'PAR': 'PR', 'PARES': 'PR',
  'TAMBOR': 'DR', 'TAMBORES': 'DR',
  'BALDE': 'BJ', 'BALDES': 'BJ', 'BLD': 'BJ',
  'PALET': 'PF', 'PALETS': 'PF', 'PALETA': 'PF',
  'PLACA': 'PG', 'PLACAS': 'PG',
  'ROLLO': 'RO', 'ROLLOS': 'RO',
  'RESMA': 'RM', 'RESMAS': 'RM',
  'TUBO': 'TU', 'TUBOS': 'TU',
  'HOJA': 'ST', 'HOJAS': 'ST',
  'CONJUNTO': 'SET', 'KIT': 'SET', 'JUEGO': 'SET',
  'GRUESA': 'GRO',
  // Tiempo / energía
  'H': 'HUR', 'HORA': 'HUR', 'HORAS': 'HUR',
  'KWH': 'KWH', 'KW/H': 'KWH',
  // Servicio
  'SERVICIO': 'ZZ', 'SERVICIOS': 'ZZ', 'SERV': 'ZZ', 'SRV': 'ZZ',
}

/**
 * Normaliza cualquier texto de unidad (libre o código SUNAT) a un código válido
 * del Catálogo 03. Si no se puede mapear, devuelve 'NIU' (Unidad) por defecto.
 *
 *   normalizeSunatUnit('NIU')      → 'NIU'
 *   normalizeSunatUnit('niu')      → 'NIU'   (case-insensitive)
 *   normalizeSunatUnit('UNIDAD')   → 'NIU'
 *   normalizeSunatUnit('und')      → 'NIU'
 *   normalizeSunatUnit('kg')       → 'KGM'
 *   normalizeSunatUnit('Litro')    → 'LTR'
 *   normalizeSunatUnit('')         → 'NIU'
 *   normalizeSunatUnit('xxx')      → 'NIU'
 */
export function normalizeSunatUnit(input) {
  return resolverUnidad(input) || 'NIU'
}

/**
 * ¿Este texto corresponde a una unidad que el sistema reconoce?
 *
 * `normalizeSunatUnit` no sirve para preguntarlo: devuelve 'NIU' tanto para
 * "unidad" como para cualquier cosa que no entendió. Quien VALIDA una entrada
 * del usuario (una celda de Excel, por ejemplo) necesita distinguir las dos
 * cosas para poder avisarle en vez de emitir "unidad" por lo bajo.
 */
export function esUnidadValida(input) {
  return resolverUnidad(input) !== null
}

/** El núcleo compartido: devuelve el código, o null si no reconoce el texto. */
function resolverUnidad(input) {
  if (!input) return null
  const trimmed = String(input).trim()
  if (!trimmed) return null

  // Acepta la etiqueta completa de los desplegables: "MTQ - METRO CÚBICO"
  const soloCodigo = trimmed.split(' - ')[0].trim()

  for (const candidato of [trimmed, soloCodigo]) {
    // 1. Match exacto contra código válido
    if (VALID_UNIT_CODES.has(candidato)) return candidato

    // 2. Match case-insensitive contra códigos válidos
    const upper = candidato.toUpperCase()
    if (VALID_UNIT_CODES.has(upper)) return upper

    // 3. Alias exacto en uppercase
    if (UNIT_ALIASES[upper]) return UNIT_ALIASES[upper]

    // 4. Alias sin puntos / espacios / acentos
    const clean = upper.replace(/[\s.,]/g, '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
    if (UNIT_ALIASES[clean]) return UNIT_ALIASES[clean]
    if (VALID_UNIT_CODES.has(clean)) return clean

    // 5. El nombre tal como aparece en el propio catálogo. UNIT_ALIASES se
    //    mantiene a mano y se le escapaban nombres que el desplegable SÍ
    //    ofrece: "Saco" no resolvía a nada aunque está en la lista.
    if (ALIAS_DESDE_CATALOGO[clean]) return ALIAS_DESDE_CATALOGO[clean]
  }

  return null
}

// Mapa codigo SUNAT -> nombre legible (ej. 'NIU' -> 'UNIDAD', 'KGM' -> 'KILOGRAMO')
const CODE_TO_NAME = SUNAT_UNITS.reduce((acc, u) => {
  const name = (u.label.split(' - ')[1] || u.value).trim()
  acc[u.value.toUpperCase()] = name.toUpperCase()
  return acc
}, {})

/**
 * Nombre legible de una unidad para mostrar en tickets/documentos.
 * Si recibe un codigo SUNAT (NIU, KGM, BX...) devuelve su nombre (UNIDAD, KILOGRAMO, CAJA).
 * Si recibe texto ya legible o custom (UNIDAD, CAJA, SACO...) lo devuelve tal cual en mayusculas.
 *   unitDisplayName('NIU')    -> 'UNIDAD'
 *   unitDisplayName('UNIDAD') -> 'UNIDAD'
 *   unitDisplayName('CAJA')   -> 'CAJA'
 */
export function unitDisplayName(input) {
  if (!input) return 'UNIDAD'
  const raw = String(input).trim()
  if (!raw) return 'UNIDAD'
  const upper = raw.toUpperCase()
  return CODE_TO_NAME[upper] || upper
}

/**
 * Unidades para los DESPLEGABLES del sistema (productos, cotizaciones, órdenes
 * de compra). Etiqueta simple, sin el código adelante: acá el usuario elige
 * "Caja", no "BX - Caja".
 *
 * Es la UNIÓN de las listas que vivían sueltas en cada pantalla. Cada una se
 * había armado por su cuenta y a todas les faltaban cosas distintas: la orden
 * de compra ofrecía 10 unidades, productos 64, cotizaciones 68 — y ninguna las
 * tenía todas. El usuario que pedía una unidad la encontraba en una pantalla y
 * no en la otra.
 *
 * OJO: incluye 5 códigos que NO están en el catálogo 03 de arriba (marcados
 * abajo). Se conservan porque ya hay productos guardados con ellos; sacarlos
 * dejaría esos productos con la unidad en blanco. Al emitir, `normalizeSunatUnit`
 * resuelve DISPLAY → BX (caja) por alias, y los otros cuatro → NIU.
 *
 * ⚠️ PENDIENTE: HT (media hora), RD (varilla), RL (carrete) y SEC (segundo)
 * parecen códigos legítimos de UN/ECE Rec 20, que es la base del catálogo 03.
 * Si lo son, deberían sumarse a SUNAT_UNITS para que al emitir viajen tal cual
 * en vez de degradarse a "unidad". No se agregaron acá porque meter un código
 * inválido en la lista que arma el XML se paga con comprobantes rechazados:
 * hay que confirmarlos contra el anexo de SUNAT antes.
 */
export const UNIDADES_SELECT = [
  { value: 'BJ',     label: 'Balde' },
  { value: 'BLL',    label: 'Barril' },
  { value: '4B',     label: 'Barriles' },
  { value: 'BG',     label: 'Bolsa' },
  { value: 'BO',     label: 'Botellas' },
  { value: 'BX',     label: 'Caja' },
  { value: 'RL',     label: 'Carrete' },  // no es codigo SUNAT
  { value: 'CT',     label: 'Cartones' },
  { value: 'CMK',    label: 'Centímetro cuadrado' },
  { value: 'CMQ',    label: 'Centímetro cúbico' },
  { value: 'CMT',    label: 'Centímetro lineal' },
  { value: 'CEN',    label: 'Ciento de unidades' },
  { value: 'CY',     label: 'Cilindro' },
  { value: 'SET',    label: 'Conjunto' },
  { value: 'QD',     label: 'Cuarto de docena' },
  { value: 'AV',     label: 'Cápsula' },
  { value: 'DISPLAY',label: 'Display' },  // no es codigo SUNAT
  { value: 'DZN',    label: 'Docena' },
  { value: 'DZP',    label: 'Docena por 10⁶' },
  { value: 'CH',     label: 'Envase' },
  { value: 'BE',     label: 'Fardo' },
  { value: 'JR',     label: 'Frasco' },
  { value: 'GLL',    label: 'Galón (3.785 dm³)' },
  { value: 'GLI',    label: 'Galón inglés (4.545 dm³)' },
  { value: 'GRM',    label: 'Gramo' },
  { value: 'GRO',    label: 'Gruesa' },
  // ST y LEF son los DOS "Hoja" del catálogo 03 y se ofrecían con la misma
  // etiqueta: no había forma de saber cuál se estaba eligiendo. Se conserva la
  // pareja —las dos son válidas— y se desempata mostrando el código. LEF va
  // sin código por ser a la que resuelve el alias "hoja" desde siempre.
  { value: 'LEF',    label: 'Hoja' },
  { value: 'ST',     label: 'Hoja (ST)' },
  { value: 'HUR',    label: 'Hora' },
  { value: 'JG',     label: 'Jarra' },
  { value: 'KGM',    label: 'Kilogramo' },
  { value: 'KWH',    label: 'Kilovatio hora' },
  { value: 'KTM',    label: 'Kilómetro' },
  { value: 'KT',     label: 'Kit' },
  { value: 'CA',     label: 'Lata' },
  { value: 'LBR',    label: 'Libra' },
  { value: 'LTR',    label: 'Litro' },
  { value: 'HD',     label: 'Media docena' },
  { value: 'HT',     label: 'Media hora' },  // no es codigo SUNAT
  { value: 'MWH',    label: 'Megavatio hora' },
  { value: 'MTR',    label: 'Metro' },
  { value: 'MTK',    label: 'Metro cuadrado' },
  { value: 'MTQ',    label: 'Metro cúbico' },
  { value: 'MGM',    label: 'Miligramo' },
  { value: 'MLT',    label: 'Mililitro' },
  { value: 'MIL',    label: 'Millar' },
  { value: 'UM',     label: 'Millón de unidades' },
  { value: 'MMT',    label: 'Milímetro' },
  { value: 'MMK',    label: 'Milímetro cuadrado' },
  { value: 'MMQ',    label: 'Milímetro cúbico' },
  { value: 'ONZ',    label: 'Onza' },
  { value: 'PF',     label: 'Palet' },
  { value: 'PK',     label: 'Paquete' },
  { value: 'PACK',   label: 'Pack' },
  { value: 'PR',     label: 'Par' },
  { value: 'FOT',    label: 'Pie' },
  { value: 'FTK',    label: 'Pie cuadrado' },
  // FT3 NO es del catálogo 03 —el código de pie cúbico es FTQ— y se ofrecían
  // los dos con la misma etiqueta, sin forma de saber cuál elegir. Se deja
  // solo el bueno; FT3 sigue reconociéndose para los productos que ya lo
  // tienen guardado, y al emitir se traduce a FTQ.
  { value: 'FTQ',    label: 'Pie cúbico' },
  { value: 'C62',    label: 'Pieza' },
  { value: 'PG',     label: 'Placa' },
  { value: 'INH',    label: 'Pulgada' },
  { value: 'RM',     label: 'Resma' },
  { value: 'RO',     label: 'Rollo' },
  { value: 'SA',     label: 'Saco' },
  { value: 'SEC',    label: 'Segundo' },  // no es codigo SUNAT
  { value: 'ZZ',     label: 'Servicios' },
  { value: 'U2',     label: 'Tableta/Blister' },
  { value: 'DR',     label: 'Tambor' },
  { value: 'STN',    label: 'Tonelada corta (2000 lb)' },
  { value: 'TNE',    label: 'Tonelada métrica' },
  { value: 'BT',     label: 'Tornillo' },
  { value: 'TU',     label: 'Tubo' },
  { value: 'NIU',    label: 'Unidad' },
  { value: 'RD',     label: 'Varilla' },  // no es codigo SUNAT
  { value: 'YRD',    label: 'Yarda' },
]

/**
 * Las que casi todos usan a diario. Van primero en los desplegables largos:
 * un Excel con 69 unidades en orden alfabético obliga a scrollear hasta para
 * elegir "unidad".
 */
const UNIDADES_FRECUENTES = [
  'NIU', 'ZZ', 'KGM', 'GRM', 'TNE', 'LTR', 'MLT', 'GLL',
  'MTR', 'MTK', 'MTQ', 'BX', 'PK', 'DZN', 'CEN', 'MIL', 'SA', 'BG', 'BO',
]

/**
 * Unidades para los desplegables de las PLANTILLAS EXCEL, como
 * `'MTQ - METRO CÚBICO'`: ahí el usuario necesita ver el código, porque es el
 * que termina en el XML, y el nombre, porque el código solo no dice nada.
 *
 * Sale del catálogo 03 entero y no de una lista propia. Las plantillas traían
 * 16 y 12 unidades escritas a mano y faltaba, por ejemplo, el metro cúbico:
 * quien facturaba servicios ambientales no tenía cómo poner su unidad y la
 * fila le quedaba rechazada.
 */
/**
 * Los NOMBRES del propio catálogo como alias, derivados automáticamente.
 *
 * `UNIT_ALIASES` se escribe a mano y por eso se le escapan nombres: el
 * desplegable ofrecía "Saco" pero escribir "Saco" en un Excel no resolvía a
 * nada. Derivarlo de las dos listas hace que todo lo que el sistema OFRECE sea
 * también algo que el sistema ENTIENDE, sin tener que acordarse de sumarlo en
 * dos lugares. Los alias escritos a mano se consultan antes, así que mandan.
 */
const ALIAS_DESDE_CATALOGO = (() => {
  const mapa = {}
  const normalizar = (t) => String(t || '').trim().toUpperCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[\s.,]/g, '')
  const agregar = (nombre, code) => {
    const k = normalizar(nombre)
    if (k && !mapa[k]) mapa[k] = code
  }
  for (const u of SUNAT_UNITS) agregar(u.label.split(' - ')[1] || '', u.value)
  for (const u of UNIDADES_SELECT) agregar(u.label, u.value)
  return mapa
})()

export function etiquetasParaExcel() {
  const porCodigo = new Map(SUNAT_UNITS.map(u => [u.value, u]))
  // FT3 y FTQ son los dos "pie cúbico"; en un desplegable dos opciones con el
  // mismo nombre solo confunden. Se ofrece FTQ, que es el código de UN/ECE.
  porCodigo.delete('FT3')

  const etiqueta = (u) => `${u.value} - ${(u.label.split(' - ')[1] || u.value).trim().toUpperCase()}`

  const frecuentes = UNIDADES_FRECUENTES.map(c => porCodigo.get(c)).filter(Boolean)
  const puestas = new Set(frecuentes.map(u => u.value))
  const resto = [...porCodigo.values()]
    .filter(u => !puestas.has(u.value))
    .sort((a, b) => etiqueta(a).localeCompare(etiqueta(b), 'es'))

  return [...frecuentes, ...resto].map(etiqueta)
}

export default SUNAT_UNITS
