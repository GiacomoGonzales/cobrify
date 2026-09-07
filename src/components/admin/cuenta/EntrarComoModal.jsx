import { useState } from 'react'
import { auth } from '@/lib/firebase'
import { useToast } from '@/contexts/ToastContext'
import { Modal, Boton, Aviso } from '@/components/admin/ui'

const URL_ENTRAR = 'https://us-central1-cobrify-395fe.cloudfunctions.net/entrarComoCliente'

/**
 * Prepara un pase para entrar a la cuenta de un cliente sin saber su clave.
 *
 * El pase va en la PARTE DE ATRÁS del enlace (después del `#`): eso no viaja
 * al servidor ni queda en los registros de nadie. Dura una hora y sirve una
 * sola entrada.
 *
 * Se entrega como enlace para copiar y no entrando de una: el navegador guarda
 * una sola sesión por sitio, así que entrar aquí mismo cerraría la sesión de
 * admin. Abriéndolo en una ventana de incógnito, las dos conviven.
 */
export default function EntrarComoModal({ cuenta, onClose }) {
  const toast = useToast()
  const [preparando, setPreparando] = useState(false)
  const [enlace, setEnlace] = useState(null)
  const [fallo, setFallo] = useState(null)

  async function preparar() {
    setPreparando(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const r = await fetch(URL_ENTRAR, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ targetUid: cuenta.id }),
      })
      const datos = await r.json()
      if (!datos.success) {
        toast.error(datos.error || 'No se pudo preparar el acceso')
        // El `motivo` es el mensaje crudo de Google: dice a qué cuenta de
        // servicio exacta le falta el permiso. Sin verlo hay que adivinar, y
        // adivinar con permisos sale caro.
        if (datos.motivo) setFallo(datos.motivo)
        return
      }
      setFallo(null)
      setEnlace(`${window.location.origin}/entrar-como#t=${datos.token}`)
    } catch (error) {
      console.error('Error preparando la sesión de soporte:', error)
      toast.error('No se pudo preparar el acceso')
    } finally {
      setPreparando(false)
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace)
      toast.success('Enlace copiado. Pégalo en una ventana de incógnito.')
    } catch {
      toast.error('No se pudo copiar. Selecciona el enlace y cópialo a mano.')
    }
  }

  return (
    <Modal
      titulo="Entrar como este cliente"
      subtitulo={cuenta.businessName}
      onClose={onClose}
      ancho="sm"
      pie={
        <>
          <Boton onClick={onClose}>{enlace ? 'Listo' : 'Cancelar'}</Boton>
          {!enlace && (
            <Boton variante="primario" onClick={preparar} disabled={preparando}>
              {preparando ? 'Preparando…' : 'Preparar acceso'}
            </Boton>
          )}
          {enlace && <Boton variante="primario" onClick={copiar}>Copiar enlace</Boton>}
        </>
      }
    >
      <div className="space-y-3">
        {fallo && (
          <Aviso tono="rojo" titulo="Lo que respondió Google">
            <p className="break-words font-mono text-[11px] leading-relaxed">{fallo}</p>
          </Aviso>
        )}
        {!enlace ? (
          <>
            <p className="text-[12.5px] text-gray-700">
              Entras viendo lo mismo que ve el cliente, sin tocar ni conocer su contraseña.
              Sirve para subirle productos o revisar cómo le quedó su catálogo.
            </p>
            <Aviso tono="neutro" titulo="Queda registrado">
              Se anota quién entró, a qué cuenta y cuándo, y el cliente puede verlo. El pase
              vence en una hora.
            </Aviso>
          </>
        ) : (
          <>
            <Aviso tono="neutro" titulo="Ábrelo en una ventana de incógnito">
              El navegador guarda una sola sesión por sitio. Si lo abres aquí mismo, se cierra
              tu sesión de admin. En incógnito ({navigator.platform?.startsWith('Mac') ? '⌘⇧N' : 'Ctrl+Shift+N'})
              las dos conviven.
            </Aviso>
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="break-all font-mono text-[11px] leading-relaxed text-gray-600">{enlace}</p>
            </div>
            <p className="text-[12.5px] text-gray-500">
              Cuando termines, cierra esa ventana: la sesión se va con ella.
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}
