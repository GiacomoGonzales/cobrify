import { esDominioReseller } from '@/utils/resellerDomain'
import { leerMarcaCache } from '@/utils/marcaCache'

/**
 * EL splash de pantalla completa de la app nativa. Único y compartido.
 *
 * Había CUATRO copias del mismo splash azul con el logo de Cobrify
 * (BrandingContext, MainLayout, Login y un par de componentes muertos), y se
 * fueron cazando una por una porque cada pantalla tenía la suya — la del
 * Login fue la que sobrevivió hasta el final del reporte de QAMIR. Con una
 * sola pieza, la próxima pantalla de carga no puede divergir.
 *
 * En dominio de reseller pinta SU marca desde la memoria local
 * (utils/marcaCache); sin memoria aún, fondo neutro — Cobrify no aparece
 * NUNCA en el dominio de otro. En dominios propios, el logo de siempre.
 */
export default function SplashMarca() {
  if (esDominioReseller()) {
    const marca = leerMarcaCache()
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ backgroundColor: marca?.primaryColor || '#ffffff' }}
      >
        {marca?.logoUrl ? (
          <img src={marca.logoUrl} alt="" className="w-[140px] h-[140px] object-contain" />
        ) : marca?.companyName ? (
          <span className="text-white text-3xl font-bold tracking-wide">{marca.companyName}</span>
        ) : (
          <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-gray-400" />
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-[#2563EB] flex items-center justify-center">
      <img src="/logo.png" alt="Cobrify" className="w-[140px] h-[140px] object-contain" />
    </div>
  )
}
