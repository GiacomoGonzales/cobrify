import { useEffect, useState } from 'react'
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase'
import { Seccion, Nota } from '@/components/settings/kit'

/**
 * Las veces que soporte de Cobrify entró a esta cuenta.
 *
 * Existe porque el equipo PUEDE entrar sin saber la contraseña —hace falta
 * para subir productos o revisar un catálogo cuando el cliente lo pide—, y
 * quien tiene esa llave tiene que rendir cuentas de cuándo la usa. Enseñarlo
 * es lo que separa una herramienta de soporte de una puerta trasera.
 *
 * El registro lo escribe SOLO el servidor: desde aquí no se puede alterar ni
 * borrar, ni por el cliente ni por nosotros.
 */
export default function AccesosSoporte() {
  const [accesos, setAccesos] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) { setAccesos([]); return }
    let vivo = true
    getDocs(query(
      collection(db, 'accesosSoporte'),
      where('targetUid', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(20),
    ))
      .then((snap) => {
        if (!vivo) return
        setAccesos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      })
      .catch((e) => {
        console.error('No se pudieron leer los accesos de soporte:', e)
        if (vivo) setError(true)
      })
    return () => { vivo = false }
  }, [])

  const cuando = (t) => {
    const f = t?.toDate?.()
    if (!f) return '—'
    return f.toLocaleString('es-PE', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <Seccion
      titulo="Accesos de soporte"
      descripcion="Cada vez que el equipo de Cobrify entra a tu cuenta para ayudarte, queda anotado aquí."
    >
      {error ? (
        <Nota>No se pudo cargar el registro ahora mismo. Vuelve a intentarlo en un momento.</Nota>
      ) : accesos === null ? (
        <Nota>Cargando…</Nota>
      ) : accesos.length === 0 ? (
        <Nota>
          Nadie de Cobrify ha entrado a tu cuenta. Si alguna vez pasa —siempre porque tú lo
          pidas—, lo verás aquí con la fecha y quién fue.
        </Nota>
      ) : (
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {accesos.map((a) => (
            <div key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5">
              <span className="text-sm text-gray-900">{a.adminEmail || 'Soporte de Cobrify'}</span>
              <span className="text-[12.5px] text-gray-500 tabular-nums">{cuando(a.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </Seccion>
  )
}
