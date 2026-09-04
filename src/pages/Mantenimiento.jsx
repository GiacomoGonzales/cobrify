import { Wrench } from 'lucide-react'

/**
 * Lo que ve un cliente mientras el sistema está en mantenimiento.
 *
 * No tiene botón de "reintentar" a propósito: el candado escucha el
 * interruptor en vivo, así que en cuanto se apaga, esta pantalla desaparece
 * sola y el cliente sigue donde estaba. Un botón sugeriría que hay algo que
 * hacer, y no lo hay.
 */
export default function Mantenimiento({ mensaje }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
          <Wrench className="h-6 w-6 text-gray-500" />
        </div>

        <h1 className="text-xl font-semibold text-gray-900">Estamos en mantenimiento</h1>

        <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
          {mensaje || 'Estamos haciendo unos ajustes en Cobrify. Volvemos en un rato.'}
        </p>

        <p className="mt-6 text-[13px] text-gray-400">
          No cierres esta ventana: en cuanto terminemos, vuelve sola.
        </p>

        <a
          href="https://wa.me/51900434988"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-block text-[13px] text-gray-500 underline underline-offset-4 hover:text-gray-900"
        >
          Escríbenos por WhatsApp
        </a>
      </div>
    </div>
  )
}
