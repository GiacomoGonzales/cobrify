import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const isNative = Capacitor.isNativePlatform()

/**
 * HAY UNA VERSIÓN NUEVA: el estado, sin pantalla.
 *
 * Antes esto era `UpdateBanner`: una franja azul a todo el ancho, debajo del
 * Navbar, que empujaba el contenido hacia abajo. El problema no era el diseño
 * sino la FRECUENCIA. Cobrify se despliega varias veces al día, así que el
 * cliente que trabaja con la pestaña abierta veía la franja aparecer una y
 * otra vez, tapándole media pantalla para decirle algo que casi nunca es
 * urgente. Un cartel que interrumpe diez veces al día deja de leerse y empieza
 * a estorbar.
 *
 * Ahora el aviso es PASIVO: se queda quieto en el pie del menú lateral, junto
 * al número de versión, que es exactamente donde alguien va a buscar "¿qué
 * versión tengo?". No tapa nada, no mueve nada y no hay que cerrarlo — se
 * queda ahí hasta que la persona quiera actualizar, y no molesta si nunca lo
 * hace. En móvil, donde el menú es un cajón, el botón de menú lleva un punto
 * para que se note que adentro hay algo.
 *
 * Dos casos distintos:
 *  - `tipo: 'web'`: hay un deploy nuevo. Lo detecta el service worker (chequeo
 *    cada 30 min y al volver el foco). Actualizar recarga la página.
 *  - `tipo: 'tienda'` (solo app): la versión instalada quedó atrás de
 *    `appConfig/version`. Actualizar abre Play Store o App Store. Este SÍ es
 *    infrecuente e importante, así que además conserva su franja.
 */
const ActualizacionContext = createContext(null)

const SIN_ACTUALIZACION = {
  hay: false,
  tipo: null,
  actualizando: false,
  actualizar: () => {},
  descartarTienda: () => {},
}

export function ActualizacionProvider({ children }) {
  const swRegistrationRef = useRef(null)
  const [actualizando, setActualizando] = useState(false)
  // Update de tienda (solo app nativa): { build, url, platform }
  const [storeUpdate, setStoreUpdate] = useState(null)
  // La franja de la tienda se puede cerrar; el aviso del menu NO se va por eso.
  const [franjaCerrada, setFranjaCerrada] = useState(false)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      swRegistrationRef.current = r || null
      // EN LA APP NATIVA NO DEBE HABER SERVICE WORKER.
      //
      // Los archivos ya vienen dentro del APK: no hay nada que cachear. Pero el
      // SW se registraba igual y, con `skipWaiting: false`, seguía sirviendo su
      // copia del bundle ANTERIOR hasta que alguien viera y aceptara el cartel
      // "Reiniciar para actualizar". Resultado: se actualizaba desde Play y la
      // app seguía corriendo la versión vieja — un cambio podía no verse nunca.
      //
      // Se desregistra y se borran sus cachés. Va acá y no en un `if` antes del
      // hook porque los hooks no pueden ser condicionales; el SW vive unos
      // milisegundos y se va, y de paso limpia el de quienes ya lo tenían.
      if (r && isNative) {
        r.unregister().catch(() => {})
        caches?.keys?.().then((claves) => {
          for (const clave of claves) caches.delete(clave).catch(() => {})
        }).catch(() => {})
        return
      }
      if (r && !isNative) {
        // Chequeo periódico de actualizaciones (cada 30 min).
        setInterval(() => {
          r.update().catch(() => {})
        }, 30 * 60 * 1000)
      }
    },
    onRegisterError(error) {
      console.error('SW registration error:', error)
    },
  })

  // Buscar actualizaciones cuando el usuario vuelve a la app (foco / pestaña
  // visible). CLAVE para la PWA instalada de escritorio: como se queda abierta
  // días, así detecta un deploy nuevo apenas el usuario la usa.
  useEffect(() => {
    if (isNative) return
    const check = () => {
      if (document.visibilityState !== 'visible') return
      const reg = swRegistrationRef.current
      if (reg) reg.update().catch(() => {})
    }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    check()
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [])

  // App nativa: comparar la versión instalada contra appConfig/version
  // (al abrir y cada vez que la app vuelve a primer plano).
  useEffect(() => {
    if (!isNative) return
    let cancelled = false
    const check = async () => {
      try {
        const [info, snap] = await Promise.all([
          CapApp.getInfo(),
          getDoc(doc(db, 'appConfig', 'version')),
        ])
        if (cancelled || !snap.exists()) return
        const cfg = snap.data()
        const platform = Capacitor.getPlatform() // 'android' | 'ios'
        const latest = Number(platform === 'ios' ? cfg.iosBuild : cfg.androidBuild) || 0
        const current = Number(info.build) || 0
        if (latest > current) {
          const url = platform === 'ios'
            ? (cfg.iosUrl || '')
            : (cfg.androidUrl || `market://details?id=${info.id}`)
          if (url) {
            setStoreUpdate({ build: latest, url, platform })
            setFranjaCerrada(!!sessionStorage.getItem(`storeUpdateDismissed_${platform}_${latest}`))
          }
        }
      } catch (e) {
        console.warn('No se pudo verificar la versión publicada de la app:', e)
      }
    }
    check()
    const listener = CapApp.addListener('resume', check)
    return () => {
      cancelled = true
      Promise.resolve(listener).then(h => h?.remove?.()).catch(() => {})
    }
  }, [])

  // Actualización web/PWA confiable: recargar EXACTAMENTE cuando el SW nuevo
  // toma el control; fallback duro si no lo logra.
  const actualizarWeb = useCallback(async () => {
    if (actualizando) return
    setActualizando(true)
    let reloaded = false
    const reloadOnce = () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    }
    try {
      navigator.serviceWorker?.addEventListener('controllerchange', reloadOnce, { once: true })
    } catch (e) { /* navegador sin SW */ }
    // Fallback duro a los 8s: desregistrar SW + borrar cachés + recargar.
    // Equivale a "desinstalar y volver a instalar" la PWA, pero en un clic.
    setTimeout(async () => {
      if (reloaded) return
      try {
        const regs = (await navigator.serviceWorker?.getRegistrations?.()) || []
        await Promise.all(regs.map(r => r.unregister()))
        if (window.caches?.keys) {
          const keys = await caches.keys()
          await Promise.all(keys.map(k => caches.delete(k)))
        }
      } catch (e) {
        console.warn('Fallback duro de actualización:', e)
      }
      reloadOnce()
    }, 8000)
    try {
      await updateServiceWorker(true)
    } catch (e) {
      console.warn('updateServiceWorker falló, se aplicará el fallback:', e)
    }
  }, [actualizando, updateServiceWorker])

  const abrirTienda = useCallback(() => {
    if (!storeUpdate?.url) return
    // En Capacitor, navegar a market:// / itms-apps: dispara el intent del sistema
    window.location.href = storeUpdate.url
  }, [storeUpdate])

  // Cerrar la franja de la tienda no la apaga para siempre: la app vieja SÍ es
  // un problema real. Solo se calla hasta la próxima vez que abra la app.
  const descartarTienda = useCallback(() => {
    if (!storeUpdate) return
    sessionStorage.setItem(`storeUpdateDismissed_${storeUpdate.platform}_${storeUpdate.build}`, '1')
    setFranjaCerrada(true)
  }, [storeUpdate])

  const hayTienda = isNative && !!storeUpdate
  const hayWeb = !isNative && !!needRefresh

  const valor = useMemo(() => ({
    hay: hayWeb || hayTienda,
    tipo: hayTienda ? 'tienda' : (hayWeb ? 'web' : null),
    actualizando,
    actualizar: hayTienda ? abrirTienda : actualizarWeb,
    descartarTienda,
    // La franja de la app: si ya la cerró en esta sesión, no vuelve hasta que
    // abra la app de nuevo. El aviso del menú se queda igual.
    franjaDeTienda: hayTienda && !franjaCerrada,
    plataformaTienda: storeUpdate?.platform || null,
  }), [hayWeb, hayTienda, actualizando, abrirTienda, actualizarWeb, descartarTienda, franjaCerrada, storeUpdate])

  return (
    <ActualizacionContext.Provider value={valor}>
      {children}
    </ActualizacionContext.Provider>
  )
}

/** Sin proveedor devuelve "no hay nada", para que nadie tenga que preguntar. */
export const useActualizacion = () => useContext(ActualizacionContext) || SIN_ACTUALIZACION
