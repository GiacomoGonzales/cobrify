import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'

/**
 * Qué app es esta — 'web' | 'android' | 'ios' — y su número de build (null en
 * la web y mientras el sistema no contesta). Para lo que depende de la versión
 * instalada: el mantenimiento selectivo y el candado de versión mínima.
 *
 * Se le pregunta al sistema una sola vez por sesión; el build no cambia sin
 * reinstalar.
 */
let promesa = null

const leerBuild = () => {
  if (!promesa) {
    promesa = Capacitor.isNativePlatform()
      ? import('@capacitor/app')
        .then(({ App }) => App.getInfo())
        .then(info => Number(info.build) || null)
        .catch(() => null)
      : Promise.resolve(null)
  }
  return promesa
}

export function useAppInstalada() {
  const [build, setBuild] = useState(null)

  useEffect(() => {
    let vivo = true
    leerBuild().then(b => { if (vivo) setBuild(b) })
    return () => { vivo = false }
  }, [])

  return { plataforma: Capacitor.getPlatform(), build }
}
