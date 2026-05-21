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
  { value: '4B',  label: '4B - Barriles' },
  { value: 'BG',  label: 'BG - Bolsa' },
  { value: 'BJ',  label: 'BJ - Balde' },
  { value: 'BLL', label: 'BLL - Barril' },
  { value: 'BO',  label: 'BO - Botellas' },
  { value: 'BX',  label: 'BX - Caja' },
  { value: 'CA',  label: 'CA - Lata' },
  { value: 'CEN', label: 'CEN - Ciento de unidades' },
  { value: 'CMK', label: 'CMK - Centímetro cuadrado' },
  { value: 'CMQ', label: 'CMQ - Centímetro cúbico' },
  { value: 'CMT', label: 'CMT - Centímetro lineal' },
  { value: 'CT',  label: 'CT - Cartones' },
  { value: 'DR',  label: 'DR - Tambor' },
  { value: 'DZN', label: 'DZN - Docena' },
  { value: 'DZP', label: 'DZP - Docena por 10⁶' },
  { value: 'FT3', label: 'FT3 - Pie cúbico' },
  { value: 'GLI', label: 'GLI - Galón inglés (4.545 dm³)' },
  { value: 'GLL', label: 'GLL - Galón (3.785 dm³)' },
  { value: 'GRM', label: 'GRM - Gramo' },
  { value: 'GRO', label: 'GRO - Gruesa' },
  { value: 'HUR', label: 'HUR - Hora' },
  { value: 'INH', label: 'INH - Pulgada' },
  { value: 'KGM', label: 'KGM - Kilogramo' },
  { value: 'KTM', label: 'KTM - Kilómetro' },
  { value: 'KWH', label: 'KWH - Kilovatio hora' },
  { value: 'LBR', label: 'LBR - Libra' },
  { value: 'LTR', label: 'LTR - Litro' },
  { value: 'MGM', label: 'MGM - Miligramo' },
  { value: 'MLT', label: 'MLT - Mililitro' },
  { value: 'MMK', label: 'MMK - Milímetro cuadrado' },
  { value: 'MMQ', label: 'MMQ - Milímetro cúbico' },
  { value: 'MMT', label: 'MMT - Milímetro' },
  { value: 'MTK', label: 'MTK - Metro cuadrado' },
  { value: 'MTQ', label: 'MTQ - Metro cúbico' },
  { value: 'MTR', label: 'MTR - Metro' },
  { value: 'NIU', label: 'NIU - Unidad' },
  { value: 'ONZ', label: 'ONZ - Onza' },
  { value: 'PF',  label: 'PF - Palet' },
  { value: 'PG',  label: 'PG - Placa' },
  { value: 'PK',  label: 'PK - Paquete' },
  { value: 'PR',  label: 'PR - Par' },
  { value: 'RM',  label: 'RM - Resma' },
  { value: 'RO',  label: 'RO - Rollo' },
  { value: 'SET', label: 'SET - Conjunto' },
  { value: 'ST',  label: 'ST - Hoja' },
  { value: 'STN', label: 'STN - Tonelada corta (2000 lb)' },
  { value: 'TNE', label: 'TNE - Tonelada métrica' },
  { value: 'TU',  label: 'TU - Tubo' },
  { value: 'ZZ',  label: 'ZZ - Servicios' },
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
  'M2': 'MTK', 'METRO2': 'MTK', 'METROCUADRADO': 'MTK',
  'CM2': 'CMK', 'MM2': 'MMK',
  // Volumen cúbico
  'M3': 'MTQ', 'METRO3': 'MTQ', 'METROCUBICO': 'MTQ',
  'CM3': 'CMQ', 'MM3': 'MMQ',
  // Empaque
  'CAJA': 'BX', 'CAJAS': 'BX', 'CJ': 'BX',
  'BOLSA': 'BG', 'BOLSAS': 'BG', 'BLS': 'BG',
  'PAQUETE': 'PK', 'PAQUETES': 'PK', 'PAQ': 'PK', 'PKT': 'PK',
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
  if (!input) return 'NIU'
  const trimmed = String(input).trim()
  if (!trimmed) return 'NIU'

  // 1. Match exacto contra código válido
  if (VALID_UNIT_CODES.has(trimmed)) return trimmed

  // 2. Match case-insensitive contra códigos válidos
  const upper = trimmed.toUpperCase()
  if (VALID_UNIT_CODES.has(upper)) return upper

  // 3. Alias exacto en uppercase
  if (UNIT_ALIASES[upper]) return UNIT_ALIASES[upper]

  // 4. Alias sin puntos / espacios / acentos
  const clean = upper.replace(/[\s.,]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (UNIT_ALIASES[clean]) return UNIT_ALIASES[clean]
  if (VALID_UNIT_CODES.has(clean)) return clean

  return 'NIU'
}

export default SUNAT_UNITS
