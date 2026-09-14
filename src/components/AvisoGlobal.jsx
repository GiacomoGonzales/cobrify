import { useEffect, useState } from 'react'
import { MessageCircle, Copy, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { escucharAviso, AVISO_APAGADO } from '@/services/avisoService'

/**
 * La tarjeta del aviso para todos (ver avisoService). Va debajo de la barra,
 * antes del contenido, y se cierra con la X: el cierre se recuerda en este
 * navegador por id de aviso, así que un texto nuevo se vuelve a ver.
 *
 * A los clientes de un reseller no se les muestra salvo que el admin lo pida:
 * ellos tratan con su reseller, y un aviso de Cobrify ("cambiamos de número")
 * los mandaría a escribirle a quien no es su proveedor.
 */

/** 51955778215 -> +51 955 778 215 (otros países, +número pelado). */
const legible = digitos => {
  const d = String(digitos || '').replace(/\D/g, '')
  if (/^51\d{9}$/.test(d)) return `+51 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`
  return d ? `+${d}` : ''
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    // WebViews viejos sin clipboard: el truco del textarea sigue funcionando.
    try {
      const ta = document.createElement('textarea')
      ta.value = texto
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

export default function AvisoGlobal() {
  const { isAuthenticated, subscription } = useAuth()
  const toast = useToast()
  const [aviso, setAviso] = useState(AVISO_APAGADO)
  const [cerrado, setCerrado] = useState(false)

  // Solo con sesión: sin ella las reglas rechazan la lectura.
  useEffect(() => {
    if (!isAuthenticated) return undefined
    return escucharAviso(setAviso)
  }, [isAuthenticated])

  useEffect(() => {
    try {
      setCerrado(localStorage.getItem(`avisoCerrado:${aviso.id}`) === '1')
    } catch {
      setCerrado(false)
    }
  }, [aviso.id])

  if (!aviso.activo || cerrado) return null
  if (!aviso.titulo && !aviso.mensaje) return null
  if (subscription?.resellerId && !aviso.paraResellers) return null

  const cerrar = () => {
    setCerrado(true)
    try {
      localStorage.setItem(`avisoCerrado:${aviso.id}`, '1')
    } catch { /* sin localStorage se vuelve a ver, que es el lado seguro */ }
  }

  const numero = legible(aviso.whatsapp)
  const copiarNumero = async () => {
    if (await copiar(numero)) toast.success('Número copiado')
    else toast.error(`No se pudo copiar. Anótalo: ${numero}`)
  }

  return (
    <div className="bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5 flex-shrink-0">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {aviso.titulo && <p className="text-sm font-semibold text-gray-900">{aviso.titulo}</p>}
          {aviso.mensaje && <p className="text-sm text-gray-600 whitespace-pre-line">{aviso.mensaje}</p>}
          {(aviso.whatsapp || aviso.enlace) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {aviso.whatsapp && (
                <>
                  <a
                    href={`https://wa.me/${aviso.whatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Escribir al {numero}
                  </a>
                  <button
                    type="button"
                    onClick={copiarNumero}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copiar número
                  </button>
                </>
              )}
              {aviso.enlace && (
                <a
                  href={aviso.enlace}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-primary-700 underline underline-offset-2"
                >
                  Ver más
                </a>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={cerrar}
          className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors"
          title="Cerrar"
          aria-label="Cerrar aviso"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
