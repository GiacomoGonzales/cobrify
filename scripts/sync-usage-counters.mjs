// ============================================================
// RE-CONTAR LOS CONTADORES DE "USO" (comprobantes del mes)
// ------------------------------------------------------------
// Llama a la Cloud Function `syncUsageCounters`, que recuenta los
// comprobantes REALES aceptados de cada usuario en su período actual
// y corrige el contador `usage.invoicesThisMonth` solo si está mal.
//
// Es seguro: no borra nada, no emite nada. Solo ajusta el contador
// al número correcto. Se puede correr las veces que haga falta.
//
// Uso:
//   node scripts/sync-usage-counters.mjs
// ============================================================

const URL = 'https://us-central1-cobrify-395fe.cloudfunctions.net/syncUsageCounters'

console.log('⏳ Llamando al re-contador... (puede tardar varios minutos)')

let res
try {
  res = await fetch(URL, { method: 'POST' })
} catch (e) {
  console.error('❌ No se pudo conectar:', e.message)
  process.exit(1)
}

if (!res.ok) {
  console.error('❌ HTTP', res.status)
  console.error(await res.text())
  process.exit(1)
}

const j = await res.json()
const det = j.details || []
const corregidos = det.filter((x) => x.status === 'updated')
const errores = det.filter((x) => x.status === 'error')

console.log('')
console.log('✅', j.message)
console.log('   Usuarios revisados :', j.stats?.total)
console.log('   Corregidos         :', j.stats?.updated)
console.log('   Con error          :', j.stats?.errors)

if (corregidos.length) {
  console.log('')
  console.log('Corregidos (antes -> ahora):')
  for (const x of corregidos) {
    console.log('  -', (x.email || x.userId) + ':', x.previousCount, '->', x.newCount)
  }
}

if (errores.length) {
  console.log('')
  console.log('Errores:')
  for (const x of errores) {
    console.log('  -', (x.email || x.userId) + ':', x.error)
  }
}
