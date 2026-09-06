/**
 * El ancho de papel configurado para la ticketera del negocio, en milímetros.
 *
 * Lo necesita cualquier pantalla que imprima o descargue un ticket, para que el
 * papel salga del ancho real del rollo (80 mm de mostrador o 58 mm chico). Sin
 * esto habría que repetir en cada pantalla la lectura de la configuración de la
 * impresora, y una que se olvide imprime en el ancho que no es.
 *
 * Mientras carga devuelve 80, que es el caso más común: es preferible eso a no
 * poder imprimir hasta que responda Firestore.
 */
import { useState, useEffect } from 'react'
import { useAppContext } from '@/hooks/useAppContext'

export function useAnchoDeTicket() {
  const { user, getBusinessId } = useAppContext()
  const [ancho, setAncho] = useState(80)

  useEffect(() => {
    let vigente = true
    const cargar = async () => {
      if (!user?.uid) return
      try {
        const { getPrinterConfig } = await import('@/services/thermalPrinterService')
        const resultado = await getPrinterConfig(getBusinessId())
        if (vigente && resultado.success && resultado.config?.paperWidth) {
          setAncho(resultado.config.paperWidth)
        }
      } catch (error) {
        // Sin configuración se imprime en 80: que no se pueda leer la impresora
        // no puede impedir sacar el ticket.
        console.warn('No se pudo leer el ancho de la ticketera:', error)
      }
    }
    cargar()
    return () => { vigente = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])

  return ancho
}
