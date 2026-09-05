/**
 * PAQUETES DE SESIONES de un paciente.
 *
 * Qué compró (6 sesiones de láser), cuántas usó y cuántas le quedan. Desde acá
 * se descuenta una sesión a mano (para quien no pasa por la Agenda), se
 * deshace un descuento equivocado y se carga un paquete que viene de otro
 * sistema. Los que nacen de una venta llegan solos (ver packageService).
 *
 * Vive en dos lugares: como pestaña de la ficha del paciente (Clínica) y,
 * en General con la ficha de atención, como modal desde la lista (el botón
 * del paquete). Por eso el CONTENIDO (PaquetesPaciente) va aparte del modal.
 */
import { useEffect, useMemo, useState } from 'react'
import { Package, Loader2, Trash2, Plus, Undo2, Check } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { getProducts } from '@/services/firestoreService'
import { esVendible } from '@/utils/productSale'
import {
  getPackages, addPackage, usarSesion, deshacerUltimoUso, deletePackage, sesionesDisponibles, estaActivo,
} from '@/services/packageService'
import { fechaCorta } from '@/utils/fichaAtencion'

const CAMPO = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500'

export function PaquetesPaciente({ customer, onChanged, activo = true }) {
  const { getBusinessId, user } = useAppContext()
  const toast = useToast()

  // Todos los hooks antes de cualquier return (React #310).
  const [paquetes, setPaquetes] = useState([])
  const [cargando, setCargando] = useState(false)
  const [ocupado, setOcupado] = useState(null) // id del paquete en operación
  const [agregando, setAgregando] = useState(false)
  const [productos, setProductos] = useState(null) // null = sin cargar
  const [form, setForm] = useState({ productId: '', productName: '', sessionsTotal: '', sessionsUsed: '', notes: '' })
  const [guardando, setGuardando] = useState(false)
  const [usosAbiertos, setUsosAbiertos] = useState(null)

  const customerId = customer?.id

  useEffect(() => {
    if (!activo || !customerId) return
    let vivo = true
    setCargando(true)
    setAgregando(false)
    setUsosAbiertos(null)
    getPackages(getBusinessId(), customerId)
      .then(lista => { if (vivo) setPaquetes(lista) })
      .catch(e => { console.error('Error al cargar los paquetes:', e); if (vivo) toast.error('No se pudieron cargar los paquetes') })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, customerId])

  // El catálogo se pide recién al abrir "Agregar paquete".
  useEffect(() => {
    if (!agregando || productos !== null) return
    getProducts(getBusinessId())
      .then(r => setProductos(r?.success ? (r.data || []).filter(esVendible).sort((a, b) => (a.name || '').localeCompare(b.name || '')) : []))
      .catch(() => setProductos([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agregando])

  const conSesiones = useMemo(() => (productos || []).filter(p => Number(p.sessions) > 1), [productos])
  const activos = paquetes.filter(estaActivo)
  const terminados = paquetes.filter(p => !estaActivo(p))

  const refrescar = async () => {
    const lista = await getPackages(getBusinessId(), customerId)
    setPaquetes(lista)
    onChanged?.()
  }

  const elegirProducto = (id) => {
    const p = (productos || []).find(x => x.id === id)
    setForm(f => ({
      ...f,
      productId: id,
      productName: p ? p.name : f.productName,
      sessionsTotal: p && Number(p.sessions) > 1 ? String(p.sessions) : f.sessionsTotal,
    }))
  }

  const guardarPaquete = async () => {
    if (!form.productName.trim()) { toast.error('Escribe el nombre del paquete'); return }
    if (!(parseInt(form.sessionsTotal) > 0)) { toast.error('Indica cuántas sesiones incluye'); return }
    setGuardando(true)
    try {
      await addPackage(getBusinessId(), customerId, {
        productId: form.productId || null,
        productName: form.productName,
        sessionsTotal: parseInt(form.sessionsTotal),
        sessionsUsed: parseInt(form.sessionsUsed) || 0,
        notes: form.notes,
        createdBy: user?.uid || null,
      })
      toast.success('Paquete agregado')
      setAgregando(false)
      setForm({ productId: '', productName: '', sessionsTotal: '', sessionsUsed: '', notes: '' })
      await refrescar()
    } catch (e) {
      console.error('Error al agregar el paquete:', e)
      toast.error('No se pudo agregar el paquete')
    } finally {
      setGuardando(false)
    }
  }

  const usar = async (p) => {
    setOcupado(p.id)
    try {
      const r = await usarSesion(getBusinessId(), customerId, p.id)
      toast.success(`Sesión descontada: quedan ${sesionesDisponibles(r)} de ${r.sessionsTotal}`)
      await refrescar()
    } catch (e) {
      toast.error(e?.message || 'No se pudo descontar la sesión')
    } finally {
      setOcupado(null)
    }
  }

  const deshacer = async (p) => {
    setOcupado(p.id)
    try {
      await deshacerUltimoUso(getBusinessId(), customerId, p.id)
      toast.success('Se devolvió la última sesión')
      await refrescar()
    } catch (e) {
      toast.error(e?.message || 'No se pudo deshacer')
    } finally {
      setOcupado(null)
    }
  }

  const borrar = async (p) => {
    if (!confirm(`¿Eliminar el paquete "${p.productName}"? No se puede deshacer.`)) return
    setOcupado(p.id)
    try {
      await deletePackage(getBusinessId(), customerId, p.id)
      toast.success('Paquete eliminado')
      await refrescar()
    } catch (e) {
      toast.error('No se pudo eliminar el paquete')
    } finally {
      setOcupado(null)
    }
  }

  const Paquete = ({ p }) => {
    const total = Number(p.sessionsTotal) || 0
    const usadas = Number(p.sessionsUsed) || 0
    const quedan = sesionesDisponibles(p)
    const activo = estaActivo(p)
    const pct = total > 0 ? Math.min(100, Math.round((usadas / total) * 100)) : 0
    const enCurso = ocupado === p.id
    return (
      <div className={`border rounded-lg p-3 ${activo ? 'border-gray-200' : 'border-gray-100 bg-gray-50/60'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold truncate ${activo ? 'text-gray-900' : 'text-gray-500'}`}>{p.productName}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {usadas} de {total} {total === 1 ? 'sesión usada' : 'sesiones usadas'}
              {p.invoiceNumber && ` · ${p.invoiceNumber}`}
              {p.notes && ` · ${p.notes}`}
            </p>
          </div>
          <span className={`${activo ? 'chip-ok' : 'chip-neutro'} px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0`}>
            {activo ? `${quedan} ${quedan === 1 ? 'disponible' : 'disponibles'}` : 'Terminado'}
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
          <div className={`h-full rounded-full ${activo ? 'bg-primary-500' : 'bg-gray-300'}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {activo && (
            <Button size="sm" onClick={() => usar(p)} disabled={enCurso} className="gap-1">
              {enCurso ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Usar sesión
            </Button>
          )}
          {usadas > 0 && (
            <Button size="sm" variant="outline" onClick={() => deshacer(p)} disabled={enCurso} className="gap-1">
              <Undo2 className="w-3.5 h-3.5" /> Deshacer última
            </Button>
          )}
          {(p.uses || []).length > 0 && (
            <button
              type="button"
              onClick={() => setUsosAbiertos(u => (u === p.id ? null : p.id))}
              className="text-xs text-gray-500 hover:text-gray-800 ml-auto"
            >
              {usosAbiertos === p.id ? 'Ocultar usos' : `Ver usos (${p.uses.length})`}
            </button>
          )}
          <button
            type="button"
            onClick={() => borrar(p)}
            disabled={enCurso}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            title="Eliminar paquete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {usosAbiertos === p.id && (
          <ul className="mt-2 text-xs text-gray-600 space-y-0.5">
            {p.uses.map((u, i) => (
              <li key={i}>
                Sesión {i + 1}: {fechaCorta(u.date) || '-'}
                {u.appointmentId ? ' (desde la Agenda)' : ' (a mano)'}
                {u.note && ` · ${u.note}`}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-gray-600">
            Paquetes de <strong>{customer?.name || 'la paciente'}</strong>
          </p>
          {!agregando && (
            <Button size="sm" variant="outline" onClick={() => setAgregando(true)} className="gap-1">
              <Plus className="w-4 h-4" /> Agregar paquete
            </Button>
          )}
        </div>

        {agregando && (
          <div className="border border-primary-200 bg-primary-50/40 rounded-lg p-3 space-y-2">
            <p className="text-xs text-gray-600">
              Para un paquete que ya venía de antes o que se regala. Los que se cobran en el Punto de Venta llegan solos.
            </p>
            {productos === null ? (
              <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando tratamientos...</div>
            ) : conSesiones.length > 0 && (
              <select value={form.productId} onChange={e => elegirProducto(e.target.value)} className={CAMPO}>
                <option value="">Elegir un tratamiento con sesiones...</option>
                {conSesiones.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.sessions} sesiones)</option>
                ))}
              </select>
            )}
            <input
              type="text"
              value={form.productName}
              onChange={e => setForm(f => ({ ...f, productName: e.target.value }))}
              placeholder="Nombre del paquete (ej: Láser axilas x6)"
              className={CAMPO}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min="1"
                value={form.sessionsTotal}
                onChange={e => setForm(f => ({ ...f, sessionsTotal: e.target.value }))}
                placeholder="Sesiones que incluye"
                className={CAMPO}
              />
              <input
                type="number"
                min="0"
                value={form.sessionsUsed}
                onChange={e => setForm(f => ({ ...f, sessionsUsed: e.target.value }))}
                placeholder="Ya usadas (opcional)"
                className={CAMPO}
              />
            </div>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Nota (opcional): comprado en junio, pagó en dos partes..."
              className={CAMPO}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setAgregando(false)} disabled={guardando}>Cancelar</Button>
              <Button size="sm" onClick={guardarPaquete} disabled={guardando} className="gap-1">
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Guardar paquete
              </Button>
            </div>
          </div>
        )}

        {cargando ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
        ) : paquetes.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            <Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Sin paquetes todavía.</p>
            <p className="text-xs text-gray-400 mt-1">Al cobrar un tratamiento con "Sesiones incluidas" a este paciente, el paquete aparece acá solo.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activos.map(p => <Paquete key={p.id} p={p} />)}
            {terminados.length > 0 && (
              <>
                <p className="text-[10px] font-medium tracking-wider text-gray-400 uppercase pt-2">Terminados</p>
                {terminados.map(p => <Paquete key={p.id} p={p} />)}
              </>
            )}
          </div>
        )}
      </div>
  )
}

/** Los paquetes como modal, para la lista de Clientes en General con la ficha de atención. */
export default function PaquetesPacienteModal({ isOpen, onClose, customer, onChanged }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Paquetes de sesiones" size="lg">
      <PaquetesPaciente customer={customer} onChanged={onChanged} activo={isOpen} />
    </Modal>
  )
}
