// ============================================================
// GUARDAR CLAVES DE CLOUDFLARE R2 EN .r2.env
// ------------------------------------------------------------
// Pegas tus claves AQUI EN LA TERMINAL (no en el chat) y este
// programa las guarda en el archivo .r2.env por ti.
//
// Como correrlo:
//   node scripts/set-r2-keys.mjs
//
// Las claves NO se suben a Git ni pasan por el chat.
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.r2.env')

const rl = createInterface({ input: process.stdin, output: process.stdout })
const preguntar = (q) => new Promise((res) => rl.question(q, (a) => res((a || '').trim())))

console.log('\n=== Guardar claves de Cloudflare R2 ===')
console.log('Pega cada valor aqui en la terminal y presiona Enter.\n')

const accessKeyId = await preguntar('1) ACCESS KEY ID (la clave corta):\n   > ')
const secret = await preguntar('\n2) SECRET ACCESS KEY (la clave larga, secreta):\n   > ')
rl.close()

if (!accessKeyId || !secret) {
  console.error('\nFalto alguna clave. No se guardo nada. Vuelve a correr el programa.')
  process.exit(1)
}

let raw
try {
  raw = readFileSync(envPath, 'utf8')
} catch (e) {
  console.error('No encontre el archivo .r2.env:', e.message)
  process.exit(1)
}

let foundAccess = false
let foundSecret = false
const lines = raw.split('\n').map((line) => {
  const t = line.trim()
  if (t.startsWith('R2_ACCESS_KEY_ID=')) {
    foundAccess = true
    return `R2_ACCESS_KEY_ID=${accessKeyId}`
  }
  if (t.startsWith('R2_SECRET_ACCESS_KEY=')) {
    foundSecret = true
    return `R2_SECRET_ACCESS_KEY=${secret}`
  }
  return line
})
if (!foundAccess) lines.push(`R2_ACCESS_KEY_ID=${accessKeyId}`)
if (!foundSecret) lines.push(`R2_SECRET_ACCESS_KEY=${secret}`)

writeFileSync(envPath, lines.join('\n'), 'utf8')

console.log('\n✅ Claves guardadas en .r2.env (no se muestran por seguridad).')
console.log('   Ahora avisale "listo" para correr la prueba.')
