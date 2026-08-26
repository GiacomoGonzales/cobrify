/**
 * Compila la cáscara de TODOS los resellers, una tras otra.
 *
 * Existe porque la tanda anterior se hizo corriendo `build.mjs` siete veces a
 * mano y en las siete se olvidó el logo: los siete APK salieron con el ícono
 * de Cobrify en el cajón del teléfono. Lo que se repite a mano se olvida a
 * mano; acá la lista está escrita una vez.
 *
 * `appId` y `nombre` viven en este archivo y no en el panel a propósito: son
 * lo que identifica a la app YA instalada. Si cambian, Android la trata como
 * otra app distinta y el reseller pierde las actualizaciones. Lo demás
 * (logo, colores) sale del panel de cada uno, así que basta con que suban un
 * logo nuevo para que el próximo APK lo lleve.
 *
 * Uso:
 *   node scripts/reseller-apk/build-batch.mjs --salida=C:/ruta/apks
 *   node scripts/reseller-apk/build-batch.mjs --salida=... --solo=ezfactu.com
 *
 * Deja un .apk por reseller en --salida, listo para publish-batch.mjs.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marcaDeDominio } from './marca.mjs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const APK = join(RAIZ, 'android/app/build/outputs/apk/release/app-release.apk')

// El nombre es el que ve el usuario bajo el ícono; no siempre coincide con la
// razón social del panel (WIROTECH publica como "WIRO FACT").
const RESELLERS = [
  { dominio: 'charapos.net.pe',           appId: 'com.charapos.app',       nombre: 'CharaPOS',        archivo: 'CharaPOS' },
  { dominio: 'ezfactu.com',               appId: 'com.ezfactu.app',        nombre: 'Ezfactu',         archivo: 'Ezfactu' },
  { dominio: 'facturemosperu.com',        appId: 'com.facturemosperu.app', nombre: 'FACTUREMOS PERU', archivo: 'FACTUREMOS_PERU' },
  { dominio: 'factuvip.com',              appId: 'com.factuvip.app',       nombre: 'FACTUVIP',        archivo: 'FACTUVIP' },
  { dominio: 'facturacion.ferreteros.app', appId: 'com.ferreterosapp.app', nombre: 'Ferreteros.app',  archivo: 'Ferreteros.app' },
  { dominio: 'qamir.pe',                  appId: 'com.qamir.app',          nombre: 'QAMIR',           archivo: 'QAMIR' },
  { dominio: 'wirotechperu.com',          appId: 'com.wirofact.app',       nombre: 'WIRO FACT',       archivo: 'WIRO_FACT' },
]

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const i = a.indexOf('=')
      return i === -1 ? [a.slice(2), 'true'] : [a.slice(2, i), a.slice(i + 1)]
    })
)

const SALIDA = args.salida
if (!SALIDA) {
  console.error('Falta --salida=<carpeta donde dejar los .apk>')
  process.exit(1)
}
mkdirSync(SALIDA, { recursive: true })

const lista = args.solo
  ? RESELLERS.filter(r => args.solo.split(',').includes(r.dominio))
  : RESELLERS

if (!lista.length) {
  console.error(`--solo=${args.solo} no coincide con ningún reseller de la lista`)
  process.exit(1)
}

/**
 * Cada build deja el proyecto android/ pintado con la marca del anterior, así
 * que se limpia antes de cada uno: sin esto el segundo APK sale con restos del
 * primero (el manifiesto y los gráficos son archivos del repo, no copias).
 */
function limpiarAndroid() {
  execFileSync('git', ['checkout', '--', 'android/'], { cwd: RAIZ, stdio: 'inherit' })
  execFileSync('git', ['clean', '-fd', 'android/app/src/main/assets/public'], { cwd: RAIZ, stdio: 'inherit' })
}

const hechos = []
const fallados = []

for (const r of lista) {
  console.log(`\n${'='.repeat(60)}\n${r.nombre} (${r.appId})\n${'='.repeat(60)}`)
  try {
    limpiarAndroid()

    const marca = await marcaDeDominio(r.dominio)
    if (!marca) throw new Error(`no hay reseller con dominio ${r.dominio}`)
    if (!marca.logoUrl) throw new Error(`${r.nombre} no tiene logo en su panel`)

    execFileSync(process.execPath, [
      join(RAIZ, 'scripts/reseller-apk/build.mjs'),
      `--nombre=${r.nombre}`,
      `--appId=${r.appId}`,
      `--dominio=${r.dominio}`,
      `--color=${marca.primaryColor || '#2563EB'}`,
    ], { cwd: RAIZ, stdio: 'inherit' })

    const destino = join(SALIDA, `${r.archivo}.apk`)
    copyFileSync(APK, destino)
    console.log(`\n>> ${destino}`)
    hechos.push(r.nombre)
  } catch (e) {
    console.error(`\n!! ${r.nombre}: ${e.message}`)
    fallados.push(`${r.nombre}: ${e.message}`)
  }
}

limpiarAndroid()

console.log(`\n${'='.repeat(60)}`)
console.log(`Compilados: ${hechos.length}/${lista.length}${hechos.length ? ' — ' + hechos.join(', ') : ''}`)
if (fallados.length) {
  console.log('Fallaron:')
  fallados.forEach(f => console.log(`  - ${f}`))
  process.exit(1)
}
