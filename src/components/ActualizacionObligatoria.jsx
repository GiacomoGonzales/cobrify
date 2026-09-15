import { RefreshCw } from 'lucide-react'
import { useActualizacion } from '@/contexts/ActualizacionContext'
import { useBranding } from '@/contexts/BrandingContext'
import { enlaceWhatsapp } from '@/data/contacto'
import { linkWhatsApp } from '@/utils/mensajeCita'
import { nombreDelSistema, esMarcaPropia } from '@/utils/nombreDelSistema'

/**
 * EL CANDADO: "actualiza la app para seguir".
 *
 * Solo en Android/iPhone y solo cuando la versión instalada quedó por debajo de
 * la mínima que fija el admin (appConfig/version, ver appVersionService). Tapa
 * toda la pantalla y no se puede cerrar: la única salida es la tienda.
 *
 * Se pensó el día que se bloqueó el número de WhatsApp (13-set-2026) y las apps
 * viejas seguían mostrándolo sin que hubiera forma de cerrarlas. Con esto, la
 * próxima vez que una versión vieja sea un problema se cierra desde el admin en
 * vez de rogar que actualicen. La trampa: una app que no trae este componente
 * no lo obedece — el candado solo sirve para las versiones que ya lo llevan.
 *
 * Habla con la marca de quien la usa (utils/nombreDelSistema): el cliente de un
 * reseller lee el nombre de su sistema y, si pide ayuda, le escribe a su
 * proveedor y no a Cobrify. Si el reseller no cargó su WhatsApp, no se ofrece
 * contacto (Ezfactu, 15/09/2026).
 */
export default function ActualizacionObligatoria() {
  const { obligatoria, actualizar } = useActualizacion()
  const { branding, isLoading: cargandoMarca } = useBranding()
  if (!obligatoria) return null

  const tienda = obligatoria.platform === 'ios' ? 'App Store' : 'Play Store'
  // Mientras la marca carga, sin nombre ni contacto: mejor neutro que Cobrify.
  const nombre = cargandoMarca ? null : nombreDelSistema(branding)
  const mensaje = `Hola, no puedo actualizar la app de ${nombre}`
  const numeroDelReseller = String(branding?.whatsapp || '').replace(/\D/g, '')
  const enlaceDeAyuda = !nombre ? null
    : esMarcaPropia(branding)
      ? (numeroDelReseller ? linkWhatsApp(numeroDelReseller, mensaje) : null)
      : enlaceWhatsapp(mensaje)

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-50 px-6"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary-50">
          <RefreshCw className="h-6 w-6 text-primary-600" />
        </div>

        <h1 className="text-xl font-semibold text-gray-900">
          {nombre ? `Actualiza ${nombre} para seguir` : 'Actualiza la app para seguir'}
        </h1>

        <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
          Esta versión de la app ya no es compatible. Actualízala desde {tienda}: toma un minuto y no pierdes nada.
        </p>

        <button
          type="button"
          onClick={actualizar}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
        >
          Abrir {tienda}
        </button>

        {enlaceDeAyuda && (
          <p className="mt-8 text-[13px] text-gray-400">
            ¿Problemas para actualizar?{' '}
            <a
              href={enlaceDeAyuda}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 underline underline-offset-4 hover:text-gray-900"
            >
              Escríbenos por WhatsApp
            </a>
          </p>
        )}
      </div>
    </div>
  )
}
