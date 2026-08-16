import { useLocation } from 'react-router-dom'
import { HelpCircle } from 'lucide-react'
import { getGuideByPath } from '@/data/guides/registry'

/**
 * Enlace "¿Cómo funciona esta página?" para poner AL LADO del título de una
 * página. Mucho más descubrible que el ícono del header (pedido de Giacomo):
 * el usuario entiende de un vistazo que ahí se le explica todo.
 *
 * Se auto-oculta si la página no tiene guía. Abre el MISMO panel lateral del
 * Navbar vía un evento global — así no hay que cablear contexto por toda la
 * app para un botón.
 */
export const ABRIR_GUIA_EVENT = 'cobrify:abrir-guia'

export default function GuideLink({ className = '' }) {
  const location = useLocation()
  if (!getGuideByPath(location.pathname)) return null
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(ABRIR_GUIA_EVENT))}
      className={`inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline ${className}`}
    >
      <HelpCircle className="w-4 h-4" />
      ¿Cómo funciona esta página?
    </button>
  )
}
