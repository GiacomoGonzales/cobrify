import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { useAuth } from '@/contexts/AuthContext'
import { actualizoSolaHacePoco } from '@/utils/actualizacionSola'
import {
  CLAVE_FOTO, CLAVE_RECARGA_PROPIA,
  guardar, leerYBorrar, tipoDeNavegacion, clasificarArranque, debeRegistrarse, diferencias, leerEstadoDelPOS,
} from '@/utils/diagnosticoApp'
import { registrarEventoDeDiagnostico } from '@/services/diagnosticoAppService'

// Lo que se espera antes de mirar el POS al volver: tiene que restaurar su
// borrador y terminar de cargar la configuración. Mirar antes daría un "no
// había nada" que en realidad era "todavía no había llegado".
const ESPERA_TRAS_RECARGA_MS = 5000
const ESPERA_TRAS_DESPERTAR_MS = 1500

/**
 * Escucha cuándo la app se duerme y cuándo vuelve, y deja registrado lo que
 * le pasó al POS entremedio. La lógica vive en utils/diagnosticoApp.js; acá
 * solo se engancha a los eventos. No pinta nada.
 */
export default function DiagnosticoApp() {
  const { user, getBusinessId } = useAuth()
  const location = useLocation()
  const rutaRef = useRef(location.pathname)
  const arranqueRevisadoRef = useRef(false)
  const nativa = Capacitor.isNativePlatform()

  useEffect(() => { rutaRef.current = location.pathname }, [location.pathname])

  // El negocio y el usuario se leen AL ESCRIBIR, no al programar. Un
  // sub-usuario empieza con su propio id como negocio y recién cambia al del
  // dueño cuando cargan sus permisos (AuthContext.getBusinessId): con el valor
  // de ese primer instante, el evento iría a parar a un negocio que no existe,
  // y cancelarlo cuando el valor cambia lo perdería. Los cajeros, que son los
  // que más importan acá, son justamente sub-usuarios.
  const businessId = user ? getBusinessId() : null
  const negocioRef = useRef(businessId)
  negocioRef.current = businessId
  const uidRef = useRef(user?.uid || null)
  uidRef.current = user?.uid || null

  // ── Al ARRANCAR: ¿venimos de una recarga o de un relanzamiento? ──────────
  // Una sola vez por carga. La foto y la marca se leen enseguida (son de este
  // arranque); lo del POS y el negocio, pasados unos segundos.
  useEffect(() => {
    if (!user || arranqueRevisadoRef.current) return
    arranqueRevisadoRef.current = true

    const foto = leerYBorrar(CLAVE_FOTO)
    const marca = leerYBorrar(CLAVE_RECARGA_PROPIA)
    const clasificacion = clasificarArranque({
      navegacion: tipoDeNavegacion(),
      foto,
      marca,
      actualizacionAutomatica: actualizoSolaHacePoco(60 * 1000),
      ahora: Date.now(),
    })
    if (!debeRegistrarse(clasificacion, { nativa, foto })) return

    setTimeout(() => {
      const despues = leerEstadoDelPOS()
      registrarEventoDeDiagnostico(negocioRef.current, {
        ...clasificacion,
        usuario: uidRef.current,
        rutaAntes: foto?.ruta || null,
        rutaDespues: rutaRef.current,
        antes: foto?.pos || null,
        despues,
        cambios: diferencias(foto?.pos || null, despues),
        navegacion: tipoDeNavegacion(),
      })
    }, ESPERA_TRAS_RECARGA_MS)
  }, [user, nativa])

  // ── Al DORMIRSE y al DESPERTAR sin recargar ──────────────────────────────
  // Se engancha una vez por sesión; el negocio se lee al escribir (ver arriba).
  const conSesion = Boolean(user)
  useEffect(() => {
    if (!conSesion) return undefined

    // Si al despertar la app decide recargarse (AppLifecycleManager lo hace
    // tras 5 min en iOS), la página muere antes de que venza la espera y la
    // foto sigue guardada para el arranque siguiente, que es quien la lee. Por
    // eso la foto se borra DESPUÉS de la espera, y no al despertar.
    let espera = null

    const alDormir = () => {
      // Una comparación todavía pendiente de la vuelta anterior no debe
      // leerse la foto nueva (cambiar de pestaña rápido, dos veces seguidas).
      clearTimeout(espera)
      guardar(CLAVE_FOTO, { at: Date.now(), ruta: rutaRef.current, pos: leerEstadoDelPOS() })
    }

    const alDespertar = () => {
      clearTimeout(espera)
      espera = setTimeout(() => {
        const foto = leerYBorrar(CLAVE_FOTO)
        if (!foto?.at) return
        const despues = leerEstadoDelPOS()
        const cambios = diferencias(foto.pos || null, despues)
        if (cambios.length === 0) return
        registrarEventoDeDiagnostico(negocioRef.current, {
          tipo: 'vuelta-con-cambios',
          motivo: null,
          segundosDormida: Math.round((Date.now() - foto.at) / 1000),
          usuario: uidRef.current,
          rutaAntes: foto.ruta || null,
          rutaDespues: rutaRef.current,
          antes: foto.pos || null,
          despues,
          cambios,
        })
      }, ESPERA_TRAS_DESPERTAR_MS)
    }

    // En la app nativa manda appStateChange; en el navegador, la visibilidad.
    // Uno solo por plataforma: los dos a la vez contarían cada vuelta doble.
    // addListener es asíncrono: si el efecto se limpia antes de que resuelva,
    // la manija se suelta en cuanto llega en vez de quedar escuchando suelta.
    let manija = null
    let limpiado = false
    if (nativa) {
      CapacitorApp.addListener('appStateChange', ({ isActive }) => (isActive ? alDespertar() : alDormir()))
        .then(h => { if (limpiado) h.remove?.(); else manija = h })
        .catch(() => {})
    }
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'hidden') alDormir()
      else alDespertar()
    }
    if (!nativa) document.addEventListener('visibilitychange', alCambiarVisibilidad)

    return () => {
      limpiado = true
      clearTimeout(espera)
      manija?.remove?.()
      if (!nativa) document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [conSesion, nativa])

  return null
}
