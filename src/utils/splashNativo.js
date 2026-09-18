import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'

/**
 * EL SPLASH DE LA APP NATIVA: UNO SOLO, HASTA QUE LA APP ESTÁ LISTA.
 *
 * Al abrir la app de iPhone se veían cuatro cosas seguidas (Giacomo,
 * 18-set-2026): el splash nativo con el logo grande sobre claro; a los 2 s, la
 * espera web con otro fondo, el logo más chico y un spinner ("Cargando..." y
 * después "Entrando..."); un parpadeo; y recién la app. El plugin se ocultaba
 * solo a los 2 s, estuviera o no lista la web.
 *
 * Ahora el splash nativo (ios/App/App/Base.lproj/LaunchScreen.storyboard, que
 * el plugin reusa) se queda hasta que la web avisa que ya pintó su primera
 * pantalla de verdad (`OcultarSplashAlCargar`), y sale con un fundido. Si la
 * web no llegara a avisar, el plugin se oculta solo a los 10 s
 * (capacitor.config.ts). Las esperas web que puedan verse debajo —la de la
 * sesión, y el puente de index.html tras una recarga— son el MISMO dibujo:
 * este fondo y este logo, en el mismo lugar, sin spinner.
 */

/** El fondo del splash. Igual en LaunchScreen.storyboard (SplashFondo) y en index.html. */
export const FONDO_SPLASH = 'linear-gradient(180deg, #FFFFFF 0%, #E6EFFF 100%)'

/** El lado del logo, en puntos. Igual en LaunchScreen.storyboard y en index.html. */
export const LADO_LOGO_SPLASH = 104

let oculto = false

/** ¿Ya se ocultó el splash nativo en esta carga de la app? */
export function splashYaSeOculto() {
  return oculto
}

/** Retira el splash nativo con un fundido. Una sola vez; en la web no hace nada. */
export function ocultarSplashNativo() {
  if (oculto || !Capacitor.isNativePlatform()) return
  oculto = true
  // Dos cuadros de espera: que la pantalla de la app ya esté PINTADA debajo
  // cuando el splash empiece a desvanecerse, y no a medio dibujar.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {})
  }))
}
