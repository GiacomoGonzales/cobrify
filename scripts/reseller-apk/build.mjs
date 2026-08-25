/**
 * Arma la CÁSCARA Android de marca blanca de un reseller.
 *
 * La cáscara no lleva el sistema dentro: carga la web desde el dominio del
 * reseller (`server.url`). Por eso cada despliegue le llega solo y un APK
 * nuevo solo hace falta cuando cambia algo nativo (impresora, escáner,
 * permisos).
 *
 * Se ejecuta dentro del repo, así que las rutas relativas a node_modules que
 * usa Capacitor funcionan tal cual — al copiar el proyecto fuera del repo se
 * rompían, que fue lo primero que falló armando esto a mano.
 *
 * Uso:
 *   node scripts/reseller-apk/build.mjs \
 *     --id=abc123 --nombre="QAMIR" --appId=com.qamir.app \
 *     --dominio=qamir.pe --color=#2563EB [--logo=/ruta/logo.png]
 *
 * Deja el APK firmado en android/app/build/outputs/apk/release/.
 *
 * OJO en local: MODIFICA el proyecto android/ del repo (manifiesto, config,
 * gráficos). En CI da igual porque el checkout es efímero; si lo corres en tu
 * máquina, después:  git checkout android/
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ANDROID = join(RAIZ, 'android')

// ---------------------------------------------------------------- argumentos
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const i = a.indexOf('=')
      return i === -1 ? [a.slice(2), 'true'] : [a.slice(2, i), a.slice(i + 1)]
    })
)

const requerido = (k) => {
  if (!args[k]) {
    console.error(`Falta --${k}`)
    process.exit(1)
  }
  return args[k]
}

const NOMBRE = requerido('nombre')
const APP_ID = requerido('appId')
const DOMINIO = requerido('dominio').replace(/^https?:\/\//, '').replace(/\/$/, '')
const COLOR = (args.color || '#2563EB').toUpperCase()
const LOGO = args.logo || ''

if (!/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(APP_ID)) {
  console.error(`appId inválido: ${APP_ID} (debe ser tipo com.marca.app, solo minúsculas)`)
  process.exit(1)
}
if (!/^#[0-9A-F]{6}$/.test(COLOR)) {
  console.error(`color inválido: ${COLOR} (debe ser #RRGGBB)`)
  process.exit(1)
}

const log = (m) => console.log(`  ${m}`)

// ------------------------------------------------------- host canónico
/**
 * A qué URL apunta la app. El apex que redirige a www es una trampa conocida:
 * la WebView trata el salto de host como navegación externa y abre el
 * navegador del sistema en vez de la app. Se resuelve la redirección una vez,
 * acá, y se guarda el destino final.
 */
async function hostCanonico(dominio) {
  for (const intento of [`https://www.${dominio}`, `https://${dominio}`]) {
    try {
      const res = await fetch(intento, { redirect: 'follow' })
      if (res.ok) return new URL(res.url).host
    } catch { /* sigue con el otro */ }
  }
  // Sin red o dominio caído: se asume www, que es lo más común.
  console.warn(`  ! No se pudo resolver ${dominio}, se asume www.${dominio}`)
  return `www.${dominio}`
}

// ------------------------------------------------------------------ pasos
function escribir(rel, contenido) {
  const ruta = join(ANDROID, rel)
  mkdirSync(dirname(ruta), { recursive: true })
  writeFileSync(ruta, contenido, 'utf8')
}

function leer(rel) {
  return readFileSync(join(ANDROID, rel), 'utf8')
}

function reemplazar(rel, viejo, nuevo, nombre) {
  const s = leer(rel)
  const veces = s.split(viejo).length - 1
  if (veces !== 1) throw new Error(`${rel} > ${nombre}: esperaba 1 coincidencia, hay ${veces}`)
  escribir(rel, s.replace(viejo, nuevo))
  log(`ok ${nombre}`)
}

/** El lector de notificaciones de Yape sale del manifiesto. */
function quitarLectorNotificaciones() {
  const rel = 'app/src/main/AndroidManifest.xml'
  const s = leer(rel)
  const re = /\s*<!-- Notification Listener Service[\s\S]*?<\/service>\n/
  if (!re.test(s)) {
    log('! el lector de notificaciones no estaba (¿ya se quitó?)')
    return
  }
  escribir(rel, s.replace(re, `
        <!-- El lector de notificaciones de Yape/Plin va FUERA de la cáscara:
             Google BLOQUEA la instalación por fuera de Play Store de toda app
             que declare BIND_NOTIFICATION_LISTENER_SERVICE (protección
             antifraude, activa en Perú). Con el servicio declarado el APK ni
             siquiera se puede instalar. -->
`))
  log('ok lector de Yape fuera (Play Protect)')
}

/** El bundle web sale; queda una pantalla de sin-conexión con la marca. */
function sacarBundleWeb() {
  const pub = join(ANDROID, 'app/src/main/assets/public')
  rmSync(pub, { recursive: true, force: true })
  mkdirSync(pub, { recursive: true })
  escribir('app/src/main/assets/public/index.html',
    `<!doctype html><meta charset="utf-8"><title>${NOMBRE}</title>`)
  escribir('app/src/main/assets/public/error.html', `<!doctype html>
<html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sin conexión</title>
<style>
  body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
       font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:${COLOR};color:#fff;text-align:center}
  .c{padding:32px;max-width:320px}
  h1{font-size:20px;margin:0 0 8px}
  p{opacity:.85;font-size:14px;line-height:1.5;margin:0 0 24px}
  button{background:#fff;color:${COLOR};border:0;border-radius:10px;padding:12px 24px;font-size:15px;font-weight:600}
</style>
<div class="c">
  <h1>Sin conexión</h1>
  <p>${NOMBRE} necesita internet para funcionar. Revisa tus datos o el Wi-Fi y vuelve a intentar.</p>
  <button onclick="location.reload()">Reintentar</button>
</div>
`)
  log('ok bundle web fuera + pantalla sin conexión')
}

function configurarCapacitor(host) {
  const rel = 'app/src/main/assets/capacitor.config.json'
  const cfg = JSON.parse(leer(rel))
  cfg.appId = APP_ID
  cfg.appName = NOMBRE
  cfg.server = {
    androidScheme: 'https',
    url: `https://${host}`,
    hostname: host,
    allowNavigation: [
      DOMINIO, `*.${DOMINIO}`,
      // Sin estos, el inicio de sesión con Google se abriría fuera de la app
      // y la sesión no volvería.
      'cobrify-395fe.firebaseapp.com', '*.firebaseapp.com', 'accounts.google.com',
    ],
    cleartext: false,
    errorPath: 'error.html',
  }
  cfg.plugins = cfg.plugins || {}
  cfg.plugins.SplashScreen = { ...(cfg.plugins.SplashScreen || {}), backgroundColor: COLOR }
  escribir(rel, JSON.stringify(cfg, null, 2) + '\n')
  log(`ok capacitor.config → https://${host}`)
}

function ponerIdentidad() {
  reemplazar('app/build.gradle',
    'applicationId "com.factuya.cobrify"',
    `applicationId "${APP_ID}"`,
    'applicationId')

  escribir('app/src/main/res/values/strings.xml', `<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">${NOMBRE}</string>
    <string name="title_activity_main">${NOMBRE}</string>
    <string name="package_name">${APP_ID}</string>
    <string name="custom_url_scheme">${APP_ID}</string>

    <!-- Push Notifications Icon -->
    <string name="default_notification_channel_id">default</string>
    <string name="default_notification_channel_name">Notificaciones</string>
</resources>
`)
  log('ok identidad (nombre y paquete)')

  // Tema nativo: es el color que se ve tras el status bar mientras arranca,
  // antes de que exista la WebView.
  const oscuro = '#' + [1, 3, 5].map(i =>
    Math.round(parseInt(COLOR.slice(i, i + 2), 16) * 0.72).toString(16).padStart(2, '0')
  ).join('').toUpperCase()
  escribir('app/src/main/res/values/colors.xml', `<?xml version='1.0' encoding='utf-8'?>
<resources>
    <color name="colorPrimary">${COLOR}</color>
    <color name="colorPrimaryDark">${oscuro}</color>
    <color name="colorAccent">${COLOR}</color>
</resources>
`)
  log('ok tema nativo')
}

/**
 * Registra el paquete en google-services.json.
 *
 * Sin un cliente que calce, el plugin de Google Services CORTA la
 * compilación. Clonar el bloque alcanza para compilar y correr; para que el
 * PUSH funcione de verdad la app tiene que estar dada de alta en Firebase
 * (paso aparte del pipeline).
 */
function registrarPaquete() {
  const rel = 'app/google-services.json'
  const gs = JSON.parse(leer(rel))
  const yaEsta = gs.client.some(c => c.client_info.android_client_info.package_name === APP_ID)
  if (yaEsta) { log('ok google-services (el paquete ya estaba)'); return }

  const base = gs.client.find(c => c.client_info.android_client_info.package_name === 'com.factuya.cobrify')
  if (!base) throw new Error('no se encontró el client base en google-services.json')
  const nuevo = JSON.parse(JSON.stringify(base))
  nuevo.client_info.android_client_info.package_name = APP_ID
  gs.client.push(nuevo)
  escribir(rel, JSON.stringify(gs, null, 2) + '\n')
  log('ok google-services (paquete registrado; push real pendiente)')
}

/** Íconos y splash desde el logo del reseller, con @capacitor/assets. */
function generarGraficos() {
  if (!LOGO || !existsSync(LOGO)) {
    log('! sin logo: se conservan los gráficos actuales')
    return
  }
  const dir = join(RAIZ, '.assets-reseller')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  // @capacitor/assets espera logo.png y genera ícono adaptativo y splash en
  // todas las densidades — la parte que a mano eran 26 carpetas.
  writeFileSync(join(dir, 'logo.png'), readFileSync(LOGO))

  execFileSync('npx', [
    '@capacitor/assets', 'generate',
    '--android',
    '--assetPath', dir,
    '--androidProject', 'android',
    '--iconBackgroundColor', COLOR,
    '--iconBackgroundColorDark', COLOR,
    '--splashBackgroundColor', COLOR,
    '--splashBackgroundColorDark', COLOR,
  ], { cwd: RAIZ, stdio: 'inherit', shell: process.platform === 'win32' })

  rmSync(dir, { recursive: true, force: true })
  log('ok íconos y splash desde el logo')
}

function compilar() {
  // Ruta absoluta: en Windows, 'gradlew.bat' a secas no se resuelve aunque el
  // cwd sea la carpeta que lo contiene.
  const gradlew = join(ANDROID, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')
  execFileSync(gradlew, ['assembleRelease', '--no-daemon'], {
    cwd: ANDROID,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  log('ok APK compilado')
}

// -------------------------------------------------------------------- main
console.log(`\nCáscara de ${NOMBRE} (${APP_ID}) → ${DOMINIO}\n`)

const host = await hostCanonico(DOMINIO)
quitarLectorNotificaciones()
sacarBundleWeb()
configurarCapacitor(host)
ponerIdentidad()
registrarPaquete()
generarGraficos()
compilar()

console.log(`\nListo: android/app/build/outputs/apk/release/app-release.apk\n`)
