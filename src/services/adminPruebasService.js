import { collection, getDocs, getDoc, getCountFromServer, doc, orderBy, query, where, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * LAS PRUEBAS Y EN QUÉ ACABARON.
 *
 * La pregunta que tiene que responder esta pantalla no es "cuántas pruebas
 * diste" —eso se cuenta solo— sino DÓNDE SE CAEN. Si entran y no hacen nada,
 * el problema es que no saben por dónde empezar. Si la usan y no compran, el
 * problema es el precio o el producto. Son dos arreglos muy distintos, y sin
 * separarlos se adivina.
 *
 * LO QUE HOY NO SE PUEDE MEDIR: si el cliente llegó a ENTRAR. El sistema no
 * guarda la fecha del último acceso de nadie. Se puede agregar, pero conviene
 * saber que "entró y no hizo nada" y "no entró" van a contar igual acá.
 *
 * Tampoco se mide si contestó el seguimiento: eso vive en la bandeja del chat
 * y es otra pregunta.
 */

/** Una prueba que ya no está activa y no se convirtió: se perdió. */
export const SE_PERDIO = 'perdida'
/** Sigue corriendo. */
export const EN_CURSO = 'en curso'
/** Pagó: es el final del embudo. */
export const CONVIRTIO = 'convertida'

const aFecha = (v) => v?.toDate?.() || (v ? new Date(v) : null)

/**
 * ¿Hizo ALGO con la cuenta DURANTE LA PRUEBA, o solo la abrió?
 *
 * Se mide solo lo de la prueba, no lo de después:
 *
 * - `usage.invoicesThisMonth` no sirve: al convertir la prueba en cuenta real
 *   se pone en CERO, y quien emitió durante la prueba y después pagó salía
 *   como si nunca la hubiera usado (MOKA CAFETERÍA, el embudo daba 150%,
 *   16-set-2026).
 * - Contar TODOS los comprobantes del negocio tampoco: MOHAMED compró y a los
 *   pocos días llevaba 66, casi todos ya como cliente (17-set-2026). La fila
 *   decía que había usado mucho la prueba, y un cliente que no la tocó pero
 *   emitió después de comprar contaba como que "la usó".
 *
 * Por eso: los comprobantes con `esPrueba` —la marca "sin validez" que lleva
 * todo lo emitido durante una prueba desde el 10-set-2026, el día en que
 * nacieron las pruebas— y los productos cargados hasta el fin de la prueba.
 * El contador `usage.totalProducts` que se miraba antes no lo escribe nadie:
 * daba cero siempre.
 */
const laUso = (comprobantes, productos) => comprobantes > 0 || productos > 0

/** Hasta cuándo fue prueba: el día que compró o el día que venció. Mientras corre, sin tope. */
function finDeLaPrueba(sub) {
  const convertida = aFecha(sub.pruebaConvertidaEn)
  if (convertida) return convertida
  const vence = aFecha(sub.trialEndsAt) || aFecha(sub.pruebaVencia)
  return vence && vence < new Date() ? vence : null
}

/** El conteo lo hace el servidor: no se descarga ni un documento. null si falla. */
const contar = (consulta) => getCountFromServer(consulta).then((r) => r.data().count).catch(() => null)

function armarPrueba(id, sub, negocio, { comprobantes, productos }) {
  const convertida = aFecha(sub.pruebaConvertidaEn)
  // Una prueba convertida ya no tiene `trialEndsAt` (se borra al convertir),
  // así que su fecha de fin se guardó aparte en `pruebaVencia`.
  const vence = aFecha(sub.trialEndsAt) || aFecha(sub.pruebaVencia)
  const dias = vence ? Math.ceil((vence - new Date()) / 86400000) : null

  const estado = convertida ? CONVIRTIO
    : (dias !== null && dias < 0) ? SE_PERDIO
    : EN_CURSO

  return {
    id,
    negocio: negocio?.businessName || sub.businessName || negocio?.name || '(sin nombre)',
    rubro: negocio?.rubro || null,
    email: sub.email || null,
    creada: aFecha(sub.createdAt) || aFecha(sub.startDate),
    vence,
    dias,
    estado,
    convertida,
    plan: sub.plan || null,
    // Solo los de la prueba (ver el comentario de `laUso`). null = no se pudo contar.
    comprobantes,
    productos,
    laUso: laUso(comprobantes || 0, productos || 0),
    /** Lo que pagó al convertir, si convirtió. */
    pago: convertida ? (sub.renewalPrice ?? null) : null,
  }
}

/**
 * Todas las pruebas: las que corren, las que se perdieron y las que pagaron.
 *
 * Son DOS consultas porque una prueba convertida ya no tiene `plan: 'trial'`
 * —justo por eso se marca con `pruebaConvertidaEn` al convertirla—. Sin la
 * segunda, la pantalla mostraría solo fracasos y la tasa de conversión daría
 * cero para siempre.
 */
export async function cargarPruebas() {
  const subs = collection(db, 'subscriptions')
  const [enCurso, convertidas] = await Promise.all([
    getDocs(query(subs, where('plan', '==', 'trial'))),
    // `orderBy` sobre un campo devuelve SOLO los documentos que lo tienen, que
    // es exactamente lo que hace falta y no necesita un índice compuesto.
    getDocs(query(subs, orderBy('pruebaConvertidaEn', 'desc'))).catch(() => ({ docs: [] })),
  ])

  const porId = new Map()
  for (const d of [...enCurso.docs, ...convertidas.docs]) porId.set(d.id, d.data())

  const filas = await Promise.all([...porId.entries()].map(async ([id, sub]) => {
    // La ficha del negocio y lo que hizo en la prueba, en paralelo. Las
    // pruebas son pocas y cada conteo es una consulta; si algo falla, la fila
    // se muestra igual con lo que haya.
    const fin = finDeLaPrueba(sub)
    const productos = collection(db, 'businesses', id, 'products')
    const [fichaDelNegocio, comprobantes, cargados] = await Promise.all([
      getDoc(doc(db, 'businesses', id)).catch(() => null),
      contar(query(collection(db, 'businesses', id, 'invoices'), where('esPrueba', '==', true))),
      // Los productos no llevan marca: cuentan los creados hasta el fin.
      contar(fin ? query(productos, where('createdAt', '<=', Timestamp.fromDate(fin))) : productos),
    ])
    const negocio = fichaDelNegocio?.exists?.() ? fichaDelNegocio.data() : null
    return armarPrueba(id, sub, negocio, { comprobantes, productos: cargados })
  }))

  // Las más recientes arriba: es lo que se mira al abrir.
  return filas.sort((a, b) => (b.creada?.getTime() || 0) - (a.creada?.getTime() || 0))
}

/** El embudo, que es para lo que existe esta pantalla. */
export function embudo(filas) {
  const total = filas.length
  const usaron = filas.filter((f) => f.laUso).length
  const convirtieron = filas.filter((f) => f.estado === CONVIRTIO).length
  // Las que la usaron Y ADEMÁS compraron. Es el numerador honesto del segundo
  // porcentaje: tiene que estar dentro de su propio denominador.
  const compraronDeLasQueUsaron = filas.filter((f) => f.laUso && f.estado === CONVIRTIO).length
  const enCurso = filas.filter((f) => f.estado === EN_CURSO).length
  // La tasa se calcula sobre las TERMINADAS, no sobre el total: una prueba que
  // todavía corre no es un fracaso, y meterla en el denominador hunde el
  // número y hace parecer que no funciona cuando aún no se sabe.
  const terminadas = total - enCurso
  return {
    total,
    usaron,
    convirtieron,
    enCurso,
    terminadas,
    tasa: terminadas > 0 ? Math.round((convirtieron / terminadas) * 100) : null,
    compraronDeLasQueUsaron,
    /**
     * De las que la usaron de verdad, cuántas compraron.
     *
     * El numerador va DENTRO del denominador. Antes dividía TODAS las que
     * compraron entre las que la usaron —dos grupos distintos—, así que una
     * que compró sin figurar como usuaria daba 150% (16-set-2026).
     */
    tasaDeLasQueUsaron: usaron > 0 ? Math.round((compraronDeLasQueUsaron / usaron) * 100) : null,
  }
}
