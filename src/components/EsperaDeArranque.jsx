import { useEffect, useState } from 'react'
import SplashMarca from '@/components/SplashMarca'

/**
 * Cuánto esperar antes de admitir que está tardando. Con buena conexión el
 * arranque pinta en uno o dos segundos; con mala señal, en cuatro o cinco. A
 * los seis ya no es normal, y quien espera merece saberlo.
 */
const AVISO_A_LOS_MS = 6000

/**
 * LA ESPERA DEL ARRANQUE, CON MARCA Y CON VOZ.
 *
 * Antes, en la web, mientras se resolvía la sesión no se pintaba NADA
 * (MainLayout y Login devolvían null): la página quedaba en blanco todo lo que
 * tardara el arranque. Con buena conexión es un parpadeo; en una lenta son
 * veinte segundos o más mirando una página blanca sin saber si cargaba o se
 * había colgado. Lo grabó en video MULTIMARC (15-set-2026): "tengo que estar
 * insistiendo porque si no no aparece". Recargar le funcionaba porque la
 * segunda vez la conexión ya está caliente.
 *
 * Esto pinta el splash de la marca (el mismo fondo del login) con un texto de
 * qué está pasando y, si pasan más de seis segundos, lo dice y ofrece
 * Reintentar. No acelera el arranque: le da una cara.
 *
 * @param {string} texto  "Cargando..." mientras baja el código de la app;
 *                        "Entrando..." mientras se resuelve la sesión.
 */
export default function EsperaDeArranque({ texto = 'Cargando...' }) {
  const [tarda, setTarda] = useState(false)

  useEffect(() => {
    const temporizador = setTimeout(() => setTarda(true), AVISO_A_LOS_MS)
    return () => clearTimeout(temporizador)
  }, [])

  // La marca `data-espera-arranque` es la que mira OcultarSplashAlCargar: en
  // la app nativa, el splash no se retira mientras una espera esté a la vista.
  return (
    <div data-espera-arranque="" style={{ display: 'contents' }}>
      <SplashMarca
        mensaje={texto}
        aviso={tarda}
        onReintentar={() => window.location.reload()}
      />
    </div>
  )
}
