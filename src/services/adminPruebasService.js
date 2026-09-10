import { collection, getDocs, getDoc, doc, orderBy, query, where } from 'firebase/firestore'
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

/** ¿Hizo ALGO con la cuenta, o solo la abrió? */
const laUso = (sub) => {
  const u = sub?.usage || {}
  return (u.invoicesThisMonth || 0) > 0 || (u.totalProducts || 0) > 0
}

function armarPrueba(id, sub, negocio) {
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
    comprobantes: sub.usage?.invoicesThisMonth || 0,
    productos: sub.usage?.totalProducts || 0,
    laUso: laUso(sub),
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
    let negocio = null
    try {
      const b = await getDoc(doc(db, 'businesses', id))
      negocio = b.exists() ? b.data() : null
    } catch { /* una ficha sin negocio se muestra igual, con lo que haya */ }
    return armarPrueba(id, sub, negocio)
  }))

  // Las más recientes arriba: es lo que se mira al abrir.
  return filas.sort((a, b) => (b.creada?.getTime() || 0) - (a.creada?.getTime() || 0))
}

/** El embudo, que es para lo que existe esta pantalla. */
export function embudo(filas) {
  const total = filas.length
  const usaron = filas.filter((f) => f.laUso).length
  const convirtieron = filas.filter((f) => f.estado === CONVIRTIO).length
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
    /** De las que la usaron de verdad, cuántas compraron. */
    tasaDeLasQueUsaron: usaron > 0 ? Math.round((convirtieron / usaron) * 100) : null,
  }
}
