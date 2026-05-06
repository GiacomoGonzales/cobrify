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

export default SUNAT_UNITS
