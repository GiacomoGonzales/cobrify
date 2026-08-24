import { MessageCircle, Phone, MapPin, Clock, Store, Mail } from 'lucide-react'
import { optimizeImageUrl } from '@/utils/cloudinary'
import { getCatalogAccent } from '@/themes/catalogThemes'
import { useCatalogTheme } from '@/components/catalog/CatalogThemeProvider'
import { DAY_SHORT, isBusinessOpen } from '@/components/catalog/catalogHelpers'

/**
 * Footer del catálogo (port del StoreFooter de shopifree-v2): tres columnas —
 * marca (logo + lema), contacto (WhatsApp, teléfono, dirección con Maps y el
 * horario semanal) y "Síguenos" (redes sociales configuradas en Mi Catálogo
 * Online, business.catalogSocial) — más la barra inferior con el © y el
 * powered-by. Se pinta con los tokens del tema, así que en bold es oscuro.
 *
 * Los iconos de Instagram/Facebook/TikTok van como SVG inline (TikTok no
 * existe en lucide y los de marca de lucide están deprecados).
 */

// Acepta @usuario, usuario o URL completa; devuelve la URL final.
function socialUrl(base, value) {
  const v = String(value || '').trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  return base + v.replace(/^@/, '')
}

const SOCIAL_ICONS = {
  instagram: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  ),
  facebook: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  ),
  tiktok: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
    </svg>
  ),
}

const SOCIAL_URLS = {
  instagram: 'https://instagram.com/',
  facebook: 'https://facebook.com/',
  tiktok: 'https://tiktok.com/@',
}

export default function CatalogFooter({ business, sidebarNav = false }) {
  const { classes: th, tokens, theme } = useCatalogTheme()
  // El logo cuadrado usa el MISMO recorte que en el header: no puede ser
  // circular abajo y recto arriba. Boutique lo pide redondo; Bauhaus, recto.
  const radioLogo = theme?.chrome?.headerLogoRound ? '9999px' : tokens.radius.lg
  const accent = getCatalogAccent(business)
  const social = business?.catalogSocial || {}
  const redes = ['instagram', 'facebook', 'tiktok']
    .map(red => ({ red, url: socialUrl(SOCIAL_URLS[red], social[red]) }))
    .filter(x => x.url)
  const waNumber = business?.catalogWhatsapp || business?.whatsapp || business?.phone
  const footerLogo = business?.catalogLogoLandscape || business?.catalogLogoUrl || business?.logoUrl
  const footerIsLandscape = !!business?.catalogLogoLandscape

  return (
    <footer className={`${th.borderColor || 'border-gray-200'} border-t mt-12 ${sidebarNav ? 'md:hidden' : ''}`}>
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">

          {/* Columna 1: marca */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {footerLogo ? (
                <img
                  src={optimizeImageUrl(footerLogo, footerIsLandscape ? 'logo_landscape' : 'logo_square')}
                  alt={business?.name}
                  className={`${footerIsLandscape ? 'h-11 max-w-[220px]' : 'w-12 h-12'} object-contain`}
                  style={footerIsLandscape ? undefined : { borderRadius: radioLogo }}
                />
              ) : (
                <div
                  className="w-12 h-12 flex items-center justify-center"
                  style={{ backgroundColor: accent, borderRadius: radioLogo }}
                >
                  <Store className="w-6 h-6 text-white" />
                </div>
              )}
              {!footerIsLandscape && (
                <span className={`font-semibold text-lg ${th.text || 'text-gray-900'}`}>
                  {business?.name || business?.businessName}
                </span>
              )}
            </div>
            {(business?.catalogTagline || business?.catalogWelcome) && (
              <p className={`text-sm leading-relaxed ${th.textMuted || 'text-gray-500'}`}>
                {business?.catalogTagline || business?.catalogWelcome}
              </p>
            )}
          </div>

          {/* Columna 2: contacto + horario */}
          <div className="space-y-4">
            <h3 className={`text-sm font-semibold uppercase tracking-wide ${th.text || 'text-gray-900'}`}>
              Contacto
            </h3>
            <div className="space-y-3">
              {waNumber && (
                <a
                  href={`https://wa.me/${String(waNumber).replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-3 text-sm hover:underline ${th.textMuted || 'text-gray-500'}`}
                >
                  <MessageCircle className={`w-5 h-5 ${th.textFaint || 'text-gray-400'}`} />
                  WhatsApp {business?.catalogWhatsapp || business?.whatsapp || business?.phone}
                </a>
              )}
              {business?.phone && (
                <a
                  href={`tel:${business.phone}`}
                  className={`flex items-center gap-3 text-sm hover:underline ${th.textMuted || 'text-gray-500'}`}
                >
                  <Phone className={`w-5 h-5 ${th.textFaint || 'text-gray-400'}`} />
                  {business.phone}
                </a>
              )}
              {business?.email && (
                <a
                  href={`mailto:${business.email}`}
                  className={`flex items-center gap-3 text-sm hover:underline ${th.textMuted || 'text-gray-500'}`}
                >
                  <Mail className={`w-5 h-5 ${th.textFaint || 'text-gray-400'}`} />
                  {business.email}
                </a>
              )}
              {business?.address && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-start gap-3 text-sm hover:underline ${th.textMuted || 'text-gray-500'}`}
                >
                  <MapPin className={`w-5 h-5 flex-shrink-0 mt-0.5 ${th.textFaint || 'text-gray-400'}`} />
                  <span>{business.address}</span>
                </a>
              )}

              {/* Horario semanal (se conserva del footer anterior) */}
              {business?.businessHours?.enabled && (
                <div className={`pt-2 ${th.textFaint || 'text-gray-400'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4" />
                    <span className={`text-sm font-semibold ${th.textMuted || 'text-gray-500'}`}>Horario</span>
                    {(() => {
                      const status = isBusinessOpen(business.businessHours)
                      return (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.open ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {status.open ? 'Abierto' : 'Cerrado'}
                        </span>
                      )
                    })()}
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs max-w-xs">
                    {[1, 2, 3, 4, 5, 6, 0].map(day => {
                      const config = business.businessHours.days?.[day]
                      const isToday = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' })).getDay() === day
                      return (
                        <div key={day} className={`flex justify-between gap-2 ${isToday ? 'font-bold' : ''}`}>
                          <span>{DAY_SHORT[day]}</span>
                          <span className={config?.open ? '' : 'text-red-400'}>
                            {config?.open ? `${config.from} - ${config.to}` : 'Cerrado'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Columna 3: redes sociales (solo si el negocio configuro alguna) */}
          {redes.length > 0 && (
            <div className="space-y-4">
              <h3 className={`text-sm font-semibold uppercase tracking-wide ${th.text || 'text-gray-900'}`}>
                Síguenos
              </h3>
              <div className="flex gap-3">
                {redes.map(({ red, url }) => (
                  <a
                    key={red}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={red.charAt(0).toUpperCase() + red.slice(1)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${th.textMuted || 'text-gray-500'}`}
                    style={{ backgroundColor: tokens.colors.surfaceHover }}
                  >
                    {SOCIAL_ICONS[red]}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Barra inferior */}
        <div className={`mt-12 pt-6 border-t flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${th.borderColor || 'border-gray-200'}`}>
          <p className={`text-sm ${th.footerPowered || 'text-gray-400'}`}>
            © {new Date().getFullYear()} {business?.name || business?.businessName}
          </p>
          <p className={`text-sm ${th.footerPowered || 'text-gray-400'}`}>
            Catálogo powered by <a href="https://cobrifyperu.com" className={`hover:underline ${th.footerLink || 'text-gray-600'}`}>Cobrify</a>
          </p>
        </div>
      </div>
    </footer>
  )
}
