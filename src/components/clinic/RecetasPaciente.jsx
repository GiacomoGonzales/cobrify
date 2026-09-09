/**
 * RECETAS de un paciente: las ya emitidas (con su PDF) y escribir una nueva.
 *
 * Con el vocabulario de la clínica (ver utils/receta): cada línea es una
 * INDICACIÓN con el producto, cómo usarlo, cada cuánto y por cuánto tiempo, y
 * debajo indicaciones generales. Sin campo de profesional: el negocio va en la
 * cabecera del PDF y la firma se pone a mano.
 *
 * Compartir usa el mismo camino que todos los PDF del sistema: en el celular
 * abre la hoja de compartir (WhatsApp, Gmail, lo que haya) con el PDF adjunto;
 * en la computadora lo descarga.
 */
import { useEffect, useState } from 'react'
import { FileText, Loader2, Plus, Trash2, Share2, Eye, X } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Button from '@/components/ui/Button'
import { getPrescriptions, addPrescription, deletePrescription } from '@/services/prescriptionService'
import { lineaVacia, resumenDeReceta, nombreDeArchivoReceta } from '@/utils/receta'
import { fechaCorta, hoyYMD } from '@/utils/fichaAtencion'
import { downloadBlob } from '@/utils/nativeDownload'

const CAMPO = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500'

const formVacio = () => ({ date: hoyYMD(), items: [lineaVacia()], notes: '' })

export default function RecetasPaciente({ customer }) {
  const { getBusinessId, user, businessSettings } = useAppContext()
  const toast = useToast()

  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(false)
  const [nueva, setNueva] = useState(false)
  const [form, setForm] = useState(formVacio)
  const [guardando, setGuardando] = useState(false)
  const [ocupado, setOcupado] = useState(null)

  const customerId = customer?.id

  useEffect(() => {
    if (!customerId) return
    let vivo = true
    setCargando(true)
    setNueva(false)
    getPrescriptions(getBusinessId(), customerId)
      .then(l => { if (vivo) setLista(l) })
      .catch(e => { console.error('Error al cargar las recetas:', e); if (vivo) toast.error('No se pudieron cargar las recetas') })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  const abrirNueva = () => { setForm(formVacio()); setNueva(true) }

  const cambiarLinea = (i, campo, valor) =>
    setForm(f => ({ ...f, items: f.items.map((it, k) => (k === i ? { ...it, [campo]: valor } : it)) }))
  const agregarLinea = () => setForm(f => ({ ...f, items: [...f.items, lineaVacia()] }))
  const quitarLinea = (i) => setForm(f => ({ ...f, items: f.items.length > 1 ? f.items.filter((_, k) => k !== i) : f.items }))

  const guardar = async () => {
    setGuardando(true)
    try {
      const guardada = await addPrescription(getBusinessId(), customerId, {
        ...form,
        customerName: customer?.name || '',
        customerDocument: customer?.documentNumber || '',
        createdBy: user?.uid || null,
      })
      setLista(prev => [guardada, ...prev])
      setNueva(false)
      toast.success('Receta guardada')
    } catch (e) {
      console.error('Error al guardar la receta:', e)
      toast.error(e?.message || 'No se pudo guardar la receta')
    } finally {
      setGuardando(false)
    }
  }

  const pdfDe = async (r) => {
    const { generarPdfReceta } = await import('@/utils/recetaPdf')
    return generarPdfReceta(r, businessSettings || {})
  }

  const compartir = async (r) => {
    setOcupado(r.id)
    try {
      const doc = await pdfDe(r)
      await downloadBlob(doc.output('blob'), nombreDeArchivoReceta(r, customer?.name), {
        title: 'Receta',
        dialogTitle: 'Compartir receta',
      })
    } catch (e) {
      console.error('Error al generar el PDF de la receta:', e)
      toast.error('No se pudo generar el PDF')
    } finally {
      setOcupado(null)
    }
  }

  const ver = async (r) => {
    setOcupado(r.id)
    try {
      const doc = await pdfDe(r)
      window.open(doc.output('bloburl'), '_blank')
    } catch (e) {
      toast.error('No se pudo abrir el PDF')
    } finally {
      setOcupado(null)
    }
  }

  const borrar = async (r) => {
    if (!confirm(`¿Eliminar la receta del ${fechaCorta(r.date)}? No se puede deshacer.`)) return
    setOcupado(r.id)
    try {
      await deletePrescription(getBusinessId(), customerId, r.id)
      setLista(prev => prev.filter(x => x.id !== r.id))
      toast.success('Receta eliminada')
    } catch (e) {
      toast.error('No se pudo eliminar')
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          {lista.length === 0 ? 'Sin recetas.' : `${lista.length} ${lista.length === 1 ? 'receta' : 'recetas'}`}
        </p>
        {!nueva && (
          <Button size="sm" onClick={abrirNueva} className="gap-1">
            <FileText className="w-4 h-4" /> Nueva receta
          </Button>
        )}
      </div>

      {nueva && (
        <div className="border border-primary-200 bg-primary-50/40 rounded-lg p-3 sm:p-4 space-y-3">
          <div className="max-w-[200px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={CAMPO} />
          </div>

          <div className="space-y-2">
            {form.items.map((it, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-700">Indicación {i + 1}</p>
                  {form.items.length > 1 && (
                    <button type="button" onClick={() => quitarLinea(i)} className="p-1 text-gray-400 hover:text-red-600 rounded" title="Quitar esta indicación">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={it.producto}
                  onChange={e => cambiarLinea(i, 'producto', e.target.value)}
                  placeholder="Producto o crema (ej: Crema regeneradora)"
                  className={CAMPO}
                  autoFocus={i === form.items.length - 1}
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input type="text" value={it.uso} onChange={e => cambiarLinea(i, 'uso', e.target.value)} placeholder="Cómo usarlo (capa fina en la zona)" className={CAMPO} />
                  <input type="text" value={it.frecuencia} onChange={e => cambiarLinea(i, 'frecuencia', e.target.value)} placeholder="Cada cuánto (2 veces al día)" className={CAMPO} />
                  <input type="text" value={it.duracion} onChange={e => cambiarLinea(i, 'duracion', e.target.value)} placeholder="Por cuánto tiempo (15 días)" className={CAMPO} />
                </div>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={agregarLinea} className="gap-1">
              <Plus className="w-4 h-4" /> Agregar indicación
            </Button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Indicaciones generales</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Evitar el sol directo, usar protector solar, no frotar la zona..."
              rows={3}
              className={CAMPO}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNueva(false)} disabled={guardando}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando} className="gap-1">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Guardar receta
            </Button>
          </div>
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
      ) : lista.length === 0 ? (
        !nueva && (
          <div className="text-center py-8 text-gray-500">
            <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Todavía no tiene recetas.</p>
            <p className="text-xs text-gray-400 mt-1">Escribe las indicaciones y compártela por WhatsApp o correo en PDF.</p>
          </div>
        )
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
          {lista.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{resumenDeReceta(r) || 'Receta'}</p>
                <p className="text-xs text-gray-500 truncate">
                  {fechaCorta(r.date)} · {(r.items || []).length} {(r.items || []).length === 1 ? 'indicación' : 'indicaciones'}
                  {r.notes && ` · ${r.notes}`}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button type="button" onClick={() => ver(r)} disabled={ocupado === r.id} className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded" title="Ver PDF">
                  <Eye className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => compartir(r)} disabled={ocupado === r.id} className="p-1.5 text-primary-600 hover:bg-primary-50 rounded" title="Compartir por WhatsApp o correo">
                  {ocupado === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                </button>
                <button type="button" onClick={() => borrar(r)} disabled={ocupado === r.id} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Eliminar">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
