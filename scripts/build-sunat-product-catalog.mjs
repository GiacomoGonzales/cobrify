/**
 * Genera el dataset del Código de Producto SUNAT (catálogo 25 / UNSPSC) a partir
 * del archivo oficial publicado por SUNAT.
 *
 *   node scripts/build-sunat-product-catalog.mjs
 *
 * Salida: public/data/catalogo-producto-sunat-v14.json
 *
 * Por qué existe: desde el 01/01/2027 SUNAT rechaza el comprobante (ERR-3496)
 * si el tag cac:CommodityClassification viene con un código que no tiene 8
 * dígitos o que no está en el catálogo. Ojo: el error solo se dispara SI EL TAG
 * EXISTE; omitirlo no se castiga. Validar contra este dataset al guardar el
 * producto hace que ese rechazo sea imposible por construcción: nunca llega al
 * XML un código que SUNAT no reconozca.
 *
 * El archivo de origen es un .xlsm (Excel con macros). Solo se leen sus datos;
 * las macros no se ejecutan ni se conservan (bookVBA: false).
 *
 * Formato de salida: mapas {código: descripción} por nivel, en vez de una lista
 * de objetos {code, description, nivel}. Pesa la mitad y el nivel no hace falta
 * guardarlo porque se deduce del código —está verificado que ningún producto
 * termina en "00" y que ninguna clase choca con un producto—:
 *
 *   10000000  segmento    (termina en 000000)   NO emitible: 1er nivel
 *   10100000  familia     (termina en 0000)     NO emitible: 2do nivel
 *   10101500  clase       (termina en 00)       emitible
 *   10101501  producto                          emitible
 *
 * Los dos primeros niveles se guardan igual, pero solo para armar la ruta que se
 * le muestra al usuario ("Material Vivo... > Animales vivos > Animales de granja").
 * Emitirlos sería incumplir OBS-4337, que exige al menos el tercer nivel.
 */
import XLSX from 'xlsx'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ORIGEN = 'https://cpe.sunat.gob.pe/sites/default/files/inline-files/CCNU_MOD_2.xlsm'
const HOJA = 'Bienes y Servicios'
const VERSION = '14'
const CABECERAS = ['ID SEGMENTO', 'SEGMENTO', 'ID FAMILIA', 'FAMILIA', 'ID CLASE', 'CLASE', 'ID PRODUCTO', 'PRODUCTO']

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const destino = path.join(raiz, 'public', 'data', `catalogo-producto-sunat-v${VERSION}.json`)

const log = (...a) => console.log(...a)

async function descargar() {
  log(`Descargando ${ORIGEN}`)
  const res = await fetch(ORIGEN)
  if (!res.ok) throw new Error(`SUNAT respondió ${res.status} ${res.statusText}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex')
  log(`  ${(buf.length / 1024 / 1024).toFixed(2)} MB | sha256 ${sha256}`)
  return { buf, sha256 }
}

function extraer(buf) {
  const wb = XLSX.read(buf, { type: 'buffer', bookVBA: false })
  if (!wb.SheetNames.includes(HOJA)) {
    throw new Error(`El archivo no trae la hoja "${HOJA}". Hojas: ${wb.SheetNames.join(', ')}`)
  }
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[HOJA], { header: 1, defval: '' })

  // La cabecera está unas filas abajo (título y versión ocupan las primeras).
  // La buscamos en vez de asumir su posición: si SUNAT agrega una fila de aviso,
  // el script sigue funcionando en vez de generar un dataset corrido.
  const iCab = filas.findIndex(f => CABECERAS.every((c, i) => String(f[i] || '').trim().toUpperCase() === c))
  if (iCab === -1) {
    throw new Error(`No se encontró la fila de cabeceras esperada (${CABECERAS.join(' | ')}). El formato del archivo cambió; revisar antes de confiar en la salida.`)
  }
  log(`  cabecera en la fila ${iCab + 1}`)

  const segmentos = {}, familias = {}, clases = {}, productos = {}
  let descartadas = 0
  for (const fila of filas.slice(iCab + 1)) {
    const [idSeg, nSeg, idFam, nFam, idCla, nCla, idPro, nPro] = fila.map(v => String(v ?? '').trim())
    if (!/^\d{8}$/.test(idPro) || !nPro) { if (fila.some(Boolean)) descartadas++; continue }
    segmentos[idSeg.slice(0, 2)] = nSeg
    familias[idFam.slice(0, 4)] = nFam
    clases[idCla.slice(0, 6)] = nCla
    productos[idPro] = nPro
  }
  if (descartadas) log(`  filas descartadas por no tener código de 8 dígitos: ${descartadas}`)
  return { segmentos, familias, clases, productos }
}

function validar({ segmentos, familias, clases, productos }) {
  const errores = []
  const nProd = Object.keys(productos).length
  if (nProd < 40000) errores.push(`Solo ${nProd} productos; se esperaban ~49 mil. ¿Se truncó la lectura?`)

  // Si un producto terminara en "00" chocaría con el código de 8 dígitos de una
  // clase y el nivel dejaría de deducirse del código. Nunca ha pasado, pero si
  // SUNAT lo cambia hay que enterarse acá y no en producción.
  const term00 = Object.keys(productos).filter(c => c.endsWith('00'))
  if (term00.length) errores.push(`${term00.length} productos terminan en "00" (ej. ${term00.slice(0, 3).join(', ')}): el nivel ya no se puede deducir del código`)

  const claseComo8 = new Set(Object.keys(clases).map(c => `${c}00`))
  const choques = Object.keys(productos).filter(c => claseComo8.has(c))
  if (choques.length) errores.push(`${choques.length} códigos existen a la vez como clase y como producto (ej. ${choques.slice(0, 3).join(', ')})`)

  const huerfanos = Object.keys(productos).filter(c => !clases[c.slice(0, 6)])
  if (huerfanos.length) errores.push(`${huerfanos.length} productos sin su clase (ej. ${huerfanos.slice(0, 3).join(', ')})`)

  for (const [nivel, largo, mapa] of [['segmento', 2, segmentos], ['familia', 4, familias], ['clase', 6, clases]]) {
    const malos = Object.keys(mapa).filter(c => !new RegExp(`^\\d{${largo}}$`).test(c))
    if (malos.length) errores.push(`${malos.length} códigos de ${nivel} no tienen ${largo} dígitos (ej. ${malos.slice(0, 3).join(', ')})`)
  }

  if (errores.length) throw new Error(`El archivo de SUNAT no cumple lo esperado:\n  - ${errores.join('\n  - ')}`)
}

const { buf, sha256 } = await descargar()
const datos = extraer(buf)
validar(datos)

const salida = {
  version: VERSION,
  fuente: ORIGEN,
  sha256Origen: sha256,
  generado: new Date().toISOString().slice(0, 10),
  totales: Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, Object.keys(v).length])),
  ...datos,
}

fs.mkdirSync(path.dirname(destino), { recursive: true })
fs.writeFileSync(destino, JSON.stringify(salida))

const kb = (fs.statSync(destino).size / 1024).toFixed(0)
log(`\n${path.relative(raiz, destino)}  ${kb} KB`)
log(`  ${salida.totales.segmentos} segmentos · ${salida.totales.familias} familias · ${salida.totales.clases} clases · ${salida.totales.productos} productos`)
log(`  emitibles (clase + producto): ${salida.totales.clases + salida.totales.productos}`)
