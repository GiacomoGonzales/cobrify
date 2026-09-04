import { Capacitor } from '@capacitor/core'

/**
 * La versión de Cobrify que está corriendo ahora mismo en este navegador.
 *
 * Los tres valores los escribe vite.config.js al compilar, así que cambian con
 * cada push sin que nadie tenga que acordarse de subir un número a mano.
 *
 * Para qué sirve: cuando un cliente reporta algo raro, lo primero es saber qué
 * versión tiene abierta. Un navegador puede quedarse pegado a una compilación
 * vieja en caché, y entonces el problema no está en el sistema sino en su
 * copia. El commit desempata dos despliegues del mismo día.
 */

export const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''
export const COMMIT = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : ''
export const FECHA_BUILD = typeof __APP_BUILD_DATE__ !== 'undefined' ? __APP_BUILD_DATE__ : ''

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']

const fecha = () => {
  if (!FECHA_BUILD) return null
  const d = new Date(FECHA_BUILD)
  return isNaN(d) ? null : d
}

/** Lo que se muestra: "v4.7.0 · 3 set". Corto, para un pie de menú. */
export function versionCorta() {
  const d = fecha()
  return d ? `v${VERSION} · ${d.getDate()} ${MESES[d.getMonth()]}` : `v${VERSION}`
}

/** Lo que sale al pasar el mouse, para soporte: fecha completa y commit. */
export function versionDetallada() {
  const d = fecha()
  const cuando = d
    ? `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    : null
  return [`Cobrify v${VERSION}`, cuando && `Actualizado el ${cuando}`, COMMIT && `Build ${COMMIT}`]
    .filter(Boolean)
    .join('\n')
}

/**
 * QUÉ VERSIÓN LE IMPORTA A CADA UNO.
 *
 * En la web hay una sola: la compilación que sirve Vercel.
 *
 * En Android y iPhone hay DOS, y las dos importan. La de la tienda —la que el
 * usuario ve en Play Store o App Store, y la que decide si tiene que
 * actualizar— y la web que va empaquetada dentro, que es la que trae los
 * cambios de pantallas. Se despliegan por caminos distintos: la web sale con
 * cada push y la nativa solo cuando se sube una versión nueva a la tienda. Por
 * eso pueden no coincidir, y por eso soporte necesita las dos.
 *
 * Es asíncrona porque en nativo hay que preguntarle al sistema operativo.
 */
export async function versionDeEstaApp() {
  const plataforma = Capacitor.getPlatform() // 'web' | 'android' | 'ios'
  const web = { etiqueta: `Web ${versionCorta()}`, version: VERSION, commit: COMMIT }

  if (plataforma === 'web') return { plataforma, nombre: 'Navegador', principal: web, web: null }

  const nombre = plataforma === 'ios' ? 'iPhone' : 'Android'
  try {
    const { App } = await import('@capacitor/app')
    const info = await App.getInfo()
    return {
      plataforma,
      nombre,
      principal: { etiqueta: `${nombre} ${info.version} (${info.build})`, version: info.version, build: info.build },
      web,
    }
  } catch {
    // Si el sistema no contesta, al menos se dice la web: es peor no mostrar nada.
    return { plataforma, nombre, principal: web, web: null }
  }
}
