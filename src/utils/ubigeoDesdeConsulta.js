/**
 * De lo que devuelve la consulta de RUC a los tres códigos del selector.
 *
 * ── Por qué manda el CÓDIGO y no el nombre ───────────────────────────────────
 * El ubigeo ES un código: los dos primeros dígitos son el departamento, los dos
 * siguientes la provincia y los dos últimos el distrito. Es lo que SUNAT emite
 * y no admite interpretación.
 *
 * El alta de cuenta buscaba por NOMBRE, comparando el texto de SUNAT contra el
 * catálogo. Eso acierta casi siempre y falla EN SILENCIO el resto de las veces,
 * que es justo lo reportado: "a veces no jala y lo tengo que poner a mano".
 * Dos motivos, los dos verificados:
 *
 *   1. Las TILDES. El catálogo dice "APURÍMAC", "ÁNCASH", "HUÁNUCO", "JUNÍN";
 *      SUNAT los manda sin tilde. No son iguales ni uno contiene al otro, así
 *      que un negocio de Junín se quedaba siempre sin ubigeo.
 *   2. El `includes` al revés. "SAN JUAN" está adentro de "SAN JUAN DE
 *      LURIGANCHO" y de "SAN JUAN DE MIRAFLORES": se tomaba el primero que
 *      apareciera, que es peor que no completar nada.
 *
 * Acá el nombre es el último recurso, sin tildes y exigiendo que la coincidencia
 * parcial sea ÚNICA. Si hay dos candidatos se prefiere dejarlo vacío: que el
 * usuario elija es mejor que ponerle el distrito equivocado en el comprobante.
 */
import { DEPARTAMENTOS, PROVINCIAS, DISTRITOS, resolveUbigeoParts } from '@/data/peruUbigeos'

const VACIO = { departamento: '', provincia: '', distrito: '' }

/** MAYÚSCULAS, sin tildes, sin espacios de más. */
const normalizar = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Busca un nombre en una lista del catálogo.
 * Exacto primero; si no, parcial SOLO si hay un único candidato.
 */
const porNombre = (lista, nombre) => {
  const buscado = normalizar(nombre)
  if (!buscado || !Array.isArray(lista)) return ''

  const exacto = lista.find(x => normalizar(x.name) === buscado)
  if (exacto) return exacto.code

  const parciales = lista.filter(x => {
    const n = normalizar(x.name)
    return n.includes(buscado) || buscado.includes(n)
  })
  return parciales.length === 1 ? parciales[0].code : ''
}

/**
 * Los tres códigos que esperan los selectores de ubicación.
 *
 * @param {object} datos  lo que devuelve consultarRUC: { ubigeo, departamento,
 *                        provincia, distrito }
 * @returns {{departamento: string, provincia: string, distrito: string}}
 *          códigos de 2 dígitos; '' en los que no se hayan podido resolver
 */
export function codigosDeUbigeo(datos) {
  if (!datos) return { ...VACIO }

  // 1. El código, si vino y es de verdad. La validación contra el catálogo la
  //    hace resolveUbigeoParts, la misma que ya usan las guías de remisión.
  const codigo = String(datos.ubigeo || '').trim()
  const partes = resolveUbigeoParts(codigo)
  if (partes.valid) {
    return { departamento: partes.departamento, provincia: partes.provincia, distrito: partes.distrito }
  }
  // Un código que no cierra del todo todavía sirve a medias: se deja puesto lo
  // que sí existe y el usuario completa el resto.
  if (/^\d{6}$/.test(codigo)) {
    const dep = codigo.slice(0, 2)
    const prov = codigo.slice(2, 4)
    const existeDep = DEPARTAMENTOS.some(d => d.code === dep)
    const existeProv = (PROVINCIAS[dep] || []).some(p => p.code === prov)
    if (existeDep && existeProv) return { departamento: dep, provincia: prov, distrito: '' }
    if (existeDep) return { departamento: dep, provincia: '', distrito: '' }
  }

  // 2. Sin código utilizable, los nombres.
  const dep = porNombre(DEPARTAMENTOS, datos.departamento)
  if (!dep) return { ...VACIO }
  const prov = porNombre(PROVINCIAS[dep], datos.provincia)
  if (!prov) return { departamento: dep, provincia: '', distrito: '' }
  const dist = porNombre(DISTRITOS[`${dep}${prov}`], datos.distrito)
  return { departamento: dep, provincia: prov, distrito: dist }
}

/** El código de 6 dígitos armado desde los tres, o '' si falta alguno. */
export const ubigeoDeCodigos = ({ departamento, provincia, distrito } = {}) =>
  departamento && provincia && distrito ? `${departamento}${provincia}${distrito}` : ''
