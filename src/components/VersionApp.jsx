import { useEffect, useState } from 'react'
import { versionDeEstaApp, versionDetallada } from '@/utils/versionApp'

/**
 * La versión que está corriendo, escrita para que el usuario la pueda leer por
 * teléfono cuando soporte se la pida.
 *
 * `compacta` es para el pie del menú: una línea gris y nada más.
 * Sin ella muestra el detalle completo, que es lo que va en Configuración.
 */
export default function VersionApp({ compacta = false, className = '' }) {
  const [v, setV] = useState(null)

  useEffect(() => {
    let vivo = true
    versionDeEstaApp().then(r => { if (vivo) setV(r) })
    return () => { vivo = false }
  }, [])

  if (!v) return null

  if (compacta) {
    return (
      <div className={`text-[11px] text-gray-400 select-text ${className}`} title={versionDetallada()}>
        {v.principal.etiqueta}
      </div>
    )
  }

  return (
    <div className={`text-sm ${className}`}>
      <div className="flex items-center justify-between py-1.5">
        <span className="text-gray-500">Versión de la app</span>
        <span className="font-mono text-gray-900 select-text">{v.principal.etiqueta}</span>
      </div>

      {/* En nativo la web va empaquetada dentro y se actualiza por su cuenta:
          son dos números distintos y soporte necesita los dos. */}
      {v.web && (
        <div className="flex items-center justify-between py-1.5">
          <span className="text-gray-500">Contenido</span>
          <span className="font-mono text-gray-900 select-text">{v.web.etiqueta}</span>
        </div>
      )}
    </div>
  )
}
