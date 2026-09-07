import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useToast } from '@/contexts/ToastContext'
import { enlaceDeAlta, enlaceDeAltaLargo } from '@/utils/dominioRegistro'
import {
  Pagina, Seccion, Tabla, Th, Td, Fila, FilaVacia, Filtros, FiltroSelect, Buscador,
  Estado, Boton, Cifras, Cifra,
  useMenuDeFila, BotonDeFila, CajaMenu, ItemMenu,
} from '@/components/admin/ui'

/**
 * Los formularios de alta que se mandaron y todavía no se usaron.
 *
 * Un cliente que pagó y no activó es plata parada y hasta hoy no había forma
 * de verlo: el enlace salía por WhatsApp y ahí se perdía el rastro. Esta lista
 * es el otro extremo de ese hilo.
 *
 * Los tres estados dicen cosas distintas y por eso no se juntan: "enviada" es
 * que ni lo abrió —quizás no vio el mensaje—; "abierta" es que entró y se
 * atascó a medio camino, que es donde vale la pena escribirle; "usada" es que
 * ya tiene su cuenta.
 */

const ESTADOS = {
  enviada: { etiqueta: 'Sin abrir', tono: 'rojo' },
  abierta: { etiqueta: 'Abierta sin terminar', tono: 'normal' },
  usada: { etiqueta: 'Activada', tono: 'tenue' },
}

const fechaHora = (t) => {
  const f = t?.toDate?.()
  if (!f) return '—'
  return f.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const haceCuanto = (t) => {
  const f = t?.toDate?.()
  if (!f) return ''
  const dias = Math.floor((Date.now() - f.getTime()) / 86400000)
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}

const moneda = (v) => (v == null ? '—' : new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(v)))

export default function AdminAltas() {
  const toast = useToast()
  const menu = useMenuDeFila()
  const [altas, setAltas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('pendientes')

  const cargar = () => {
    setCargando(true)
    getDocs(query(collection(db, 'altasPendientes'), orderBy('createdAt', 'desc'), limit(200)))
      .then((snap) => setAltas(snap.docs.map((d) => ({ codigo: d.id, ...d.data() }))))
      .catch((e) => {
        console.error('No se pudieron cargar las altas:', e)
        toast.error('No se pudieron cargar las altas')
      })
      .finally(() => setCargando(false))
  }

  useEffect(cargar, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return altas.filter((a) => {
      if (filtroEstado === 'pendientes' && a.estado === 'usada') return false
      if (filtroEstado !== 'pendientes' && filtroEstado !== 'all' && a.estado !== filtroEstado) return false
      if (!q) return true
      return [a.nombre, a.waId, a.planNombre, a.codigo].some((v) => String(v || '').toLowerCase().includes(q))
    })
  }, [altas, busqueda, filtroEstado])

  const cuenta = useMemo(() => ({
    enviada: altas.filter((a) => a.estado === 'enviada').length,
    abierta: altas.filter((a) => a.estado === 'abierta').length,
    usada: altas.filter((a) => a.estado === 'usada').length,
  }), [altas])

  const copiar = async (a) => {
    menu.cerrar()
    try {
      await navigator.clipboard.writeText(enlaceDeAlta(a.codigo))
      toast.success('Enlace copiado')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  const copiarLargo = async (a) => {
    menu.cerrar()
    try {
      await navigator.clipboard.writeText(enlaceDeAltaLargo(a.codigo))
      toast.success('Enlace largo copiado')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  const recordar = (a) => {
    menu.cerrar()
    if (!a.waId) { toast.error('Esta alta no tiene número de WhatsApp'); return }
    const nombre = (a.nombre || '').split(' ')[0]
    const texto = encodeURIComponent(
      `Hola${nombre ? ` ${nombre}` : ''}, te dejo de nuevo el enlace para activar tu cuenta de Cobrify:\n\n${enlaceDeAlta(a.codigo)}\n\nCualquier cosa me escribes.`
    )
    window.open(`https://wa.me/${String(a.waId).replace(/\D/g, '')}?text=${texto}`, '_blank')
  }

  const resumen = cargando
    ? 'Cargando altas…'
    : `${cuenta.enviada} sin abrir · ${cuenta.abierta} abiertas sin terminar · ${cuenta.usada} activadas`

  return (
    <Pagina
      resumen={resumen}
      acciones={<Boton tamano="sm" onClick={cargar} disabled={cargando}>Recargar</Boton>}
    >
      <Cifras>
        <Cifra etiqueta="Sin abrir" valor={cuenta.enviada} />
        <Cifra etiqueta="Abiertas sin terminar" valor={cuenta.abierta} />
        <Cifra etiqueta="Activadas" valor={cuenta.usada} />
      </Cifras>

      <Seccion>
        <Filtros>
          <Buscador
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre, número, plan o código"
          />
          <FiltroSelect value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="pendientes">Pendientes</option>
            <option value="enviada">Sin abrir</option>
            <option value="abierta">Abiertas sin terminar</option>
            <option value="usada">Activadas</option>
            <option value="all">Todas</option>
          </FiltroSelect>
        </Filtros>

        <Tabla>
          <thead>
            <tr>
              <Th>Cliente</Th>
              <Th>Plan</Th>
              <Th>Enviado</Th>
              <Th>Estado</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <FilaVacia colSpan={5}>Cargando…</FilaVacia>
            ) : filtradas.length === 0 ? (
              <FilaVacia colSpan={5}>
                {altas.length === 0
                  ? 'Todavía no has mandado ningún formulario de alta. Se mandan desde la ficha del cliente en el chat.'
                  : 'Nada que atender con este filtro.'}
              </FilaVacia>
            ) : (
              filtradas.map((a) => {
                const e = ESTADOS[a.estado] || { etiqueta: a.estado, tono: 'normal' }
                return (
                  <Fila key={a.codigo}>
                    <Td>
                      <div className="font-medium text-gray-900">{a.nombre || 'Sin nombre'}</div>
                      <div className="text-[12px] text-gray-500">
                        {a.waId ? `+${a.waId}` : '—'}
                        <span className="ml-2 font-mono text-gray-400">{a.codigo}</span>
                      </div>
                    </Td>
                    <Td>
                      <div>{a.planNombre || a.plan || '—'}</div>
                      <div className="text-[12px] text-gray-500">{moneda(a.precio)}</div>
                    </Td>
                    <Td>
                      <div>{fechaHora(a.createdAt)}</div>
                      <div className="text-[12px] text-gray-500">{haceCuanto(a.createdAt)}</div>
                    </Td>
                    <Td>
                      <Estado valor={a.estado} etiqueta={e.etiqueta} tono={e.tono} />
                      {a.estado === 'usada' && a.uid && (
                        <div className="mt-0.5">
                          <Link to={`/app/admin/users/${a.uid}`} className="text-[12px] text-primary-700 hover:underline">
                            Ver la cuenta
                          </Link>
                        </div>
                      )}
                    </Td>
                    <Td alinear="der">
                      <BotonDeFila onClick={(el) => menu.alternar(a.codigo, el)} />
                      {menu.abiertoEn === a.codigo && (
                        <CajaMenu posicion={menu.posicion} refMenu={menu.refMenu}>
                          {a.estado !== 'usada' && (
                            <>
                              <ItemMenu onClick={() => recordar(a)}>Recordar por WhatsApp</ItemMenu>
                              <ItemMenu onClick={() => copiar(a)}>Copiar enlace</ItemMenu>
                              <ItemMenu onClick={() => copiarLargo(a)}>Copiar enlace largo</ItemMenu>
                            </>
                          )}
                          {a.conversationId && (
                            <ItemMenu onClick={() => { menu.cerrar(); window.open('/chat', '_blank') }}>
                              Abrir el chat
                            </ItemMenu>
                          )}
                        </CajaMenu>
                      )}
                    </Td>
                  </Fila>
                )
              })
            )}
          </tbody>
        </Tabla>
      </Seccion>

      {menu.abiertoEn && <div className="fixed inset-0 z-40" onClick={menu.cerrar} />}
    </Pagina>
  )
}
