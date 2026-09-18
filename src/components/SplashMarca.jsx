import { Capacitor } from '@capacitor/core'
import AuthShell from '@/components/AuthShell'
import { FONDO_SPLASH, LADO_LOGO_SPLASH, splashYaSeOculto } from '@/utils/splashNativo'
import { esDominioReseller } from '@/utils/resellerDomain'
import { estaEnElChat, MARCA_CHAT } from '@/utils/dominioChat'
import { leerMarcaCache } from '@/utils/marcaCache'

/**
 * LA pantalla de espera con marca. Única y compartida.
 *
 * Había CUATRO copias del mismo splash azul con el logo de Cobrify
 * (BrandingContext, MainLayout, Login y un par de componentes muertos), y se
 * fueron cazando una por una porque cada pantalla tenía la suya. Con una sola
 * pieza, la próxima pantalla de carga no puede divergir.
 *
 * 15-set-2026: deja de ser el lienzo azul entero. Era muy fuerte, y además no
 * decía nada: uno no sabía si estaba cargando o colgado. Ahora es el mismo
 * fondo del login (AuthShell) con el logo y, si se pide, un spinner con texto
 * y el aviso de que está tardando. En la web reemplaza al `null` que dejaba la
 * página EN BLANCO mientras entraba la sesión (ver EsperaDeArranque).
 *
 * Tres marcas, en este orden:
 *  - Dominio de reseller: SU marca desde la memoria local (utils/marcaCache);
 *    sin memoria aún, fondo neutro. Cobrify no aparece NUNCA en el dominio de
 *    otro.
 *  - Dominio del chat: el tejido verde y el icono del chat, como su login.
 *  - Dominios propios: el tejido azul claro y el logo, como el login.
 *
 * @param {string|null} mensaje        texto bajo el logo, con spinner ("Entrando...")
 * @param {boolean} aviso              mostrar "está tardando más de lo normal"
 * @param {Function|null} onReintentar qué hace el botón Reintentar del aviso
 */
export default function SplashMarca({ mensaje = null, aviso = false, onReintentar = null }) {
  // En la app nativa, el MISMO dibujo que el splash de iOS (ver utils/splashNativo).
  if (Capacitor.isNativePlatform()) {
    return <SplashNativo mensaje={mensaje} aviso={aviso} onReintentar={onReintentar} />
  }

  if (esDominioReseller()) {
    const marca = leerMarcaCache()
    const conColor = !!marca?.primaryColor
    const conMarca = !!(marca?.logoUrl || marca?.companyName)
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center p-4 text-center"
        style={{ backgroundColor: marca?.primaryColor || '#ffffff' }}
      >
        {marca?.logoUrl ? (
          <img src={marca.logoUrl} alt="" className="w-[140px] h-[140px] object-contain" />
        ) : marca?.companyName ? (
          <span className="text-white text-3xl font-bold tracking-wide">{marca.companyName}</span>
        ) : null}
        <Espera
          mensaje={mensaje}
          aviso={aviso}
          onReintentar={onReintentar}
          claro={!conColor}
          // Sin logo ni nombre en memoria, el spinner es lo único que dice
          // "estoy cargando": va aunque no haya mensaje.
          siempreSpinner={!conMarca}
          colorSpinner={conColor ? '#ffffff' : '#9CA3AF'}
          colorBoton={conColor ? null : '#0A2540'}
        />
      </div>
    )
  }

  // Con la misma regla que la pestaña (utils/dominioChat): la bandeja carga
  // con el chat y el panel abierto desde ella, con la marca de Cobrify.
  if (estaEnElChat()) {
    return (
      <AuthShell tono="chat" className="max-w-sm">
        <div className="text-center">
          <img
            src={MARCA_CHAT.icono}
            alt={MARCA_CHAT.nombre}
            className="w-24 h-24 mx-auto object-contain drop-shadow-lg"
            width="96"
            height="96"
          />
          <Espera
            mensaje={mensaje}
            aviso={aviso}
            onReintentar={onReintentar}
            claro
            colorSpinner={MARCA_CHAT.color}
            colorBoton={MARCA_CHAT.color}
          />
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell className="max-w-sm">
      <div className="text-center">
        <img
          src="/logo.png"
          alt="Cobrify"
          className="w-24 h-24 mx-auto object-contain"
          width="96"
          height="96"
        />
        <Espera
          mensaje={mensaje}
          aviso={aviso}
          onReintentar={onReintentar}
          claro
          colorSpinner="#2563EB"
          colorBoton="#2563EB"
        />
      </div>
    </AuthShell>
  )
}

/**
 * La espera en la app nativa: el fondo y el logo del splash de iOS, en el mismo
 * lugar, para que al pasar de uno a otro no se note nada.
 *
 * Sin spinner al arrancar: esa carga la tapa el splash nativo, y un spinner
 * sobre el logo era justo una de las pantallas de más (18-set-2026). Solo gira
 * si el splash ya se fue —entrar desde el login—, porque ahí la persona acaba
 * de tocar un botón y tiene que ver que algo pasa. Lo de abajo va fuera del
 * flujo, así el logo no se mueve cuando aparece.
 */
function SplashNativo({ mensaje, aviso, onReintentar }) {
  const gira = !!mensaje && !aviso && splashYaSeOculto()
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: FONDO_SPLASH }}>
      <img
        src="/logo.png"
        alt="Cobrify"
        width={LADO_LOGO_SPLASH}
        height={LADO_LOGO_SPLASH}
        style={{ width: LADO_LOGO_SPLASH, height: LADO_LOGO_SPLASH }}
        className="object-contain"
      />
      {(gira || (mensaje && aviso)) && (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-x-0 flex flex-col items-center gap-3 px-6 text-center"
          style={{ top: `calc(50% + ${LADO_LOGO_SPLASH / 2 + 28}px)` }}
        >
          {gira && (
            <div
              className="animate-spin rounded-full h-7 w-7 border-2 border-transparent"
              style={{ borderBottomColor: '#2563EB' }}
            />
          )}
          {aviso && (
            <div className="max-w-xs">
              <p className="text-sm leading-snug" style={{ color: '#425466' }}>
                Está tardando más de lo normal. Puede ser la conexión a internet:
                puedes seguir esperando o volver a intentar.
              </p>
              {onReintentar && (
                <button
                  type="button"
                  onClick={onReintentar}
                  className="mt-3 px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: '#2563EB' }}
                >
                  Reintentar
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Lo que va debajo de la marca: el spinner con su texto, y el aviso cuando
 * tarda. `claro` = fondo claro (textos oscuros); si no, va sobre el color del
 * reseller (textos blancos). `colorBoton` null = botón translúcido blanco.
 */
function Espera({ mensaje, aviso, onReintentar, claro, siempreSpinner = false, colorSpinner, colorBoton }) {
  if (!mensaje && !siempreSpinner) return null

  return (
    <div role="status" aria-live="polite" className="mt-6 flex flex-col items-center gap-3">
      <div
        className="animate-spin rounded-full h-7 w-7 border-2 border-transparent"
        style={{ borderBottomColor: colorSpinner }}
      />
      {mensaje && (
        <p className="text-sm font-medium" style={{ color: claro ? '#0A2540' : '#ffffff' }}>
          {mensaje}
        </p>
      )}
      {mensaje && aviso && (
        <div className="mt-1 max-w-xs">
          <p className="text-sm leading-snug" style={{ color: claro ? '#425466' : 'rgba(255,255,255,.9)' }}>
            Está tardando más de lo normal. Puede ser la conexión a internet:
            puedes seguir esperando o volver a intentar.
          </p>
          {onReintentar && (
            <button
              type="button"
              onClick={onReintentar}
              className={`mt-3 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 ${colorBoton ? '' : 'bg-white/20 border border-white/50'}`}
              style={colorBoton ? { backgroundColor: colorBoton } : undefined}
            >
              Reintentar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
