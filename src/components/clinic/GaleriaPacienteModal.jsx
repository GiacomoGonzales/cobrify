/**
 * Galería de ANTES y DESPUÉS de un paciente.
 *
 * Es lo que una clínica estética le enseña a la paciente para que vea el
 * resultado, así que la pantalla gira alrededor de eso: subir la foto con
 * su etiqueta, y **Comparar** una de antes con una de después lado a lado.
 * Lo demás (filtro por tratamiento, ver grande, borrar) es lo mínimo.
 *
 * Vive en dos lugares: como pestaña de la ficha del paciente (Clínica) y,
 * en General con la ficha de atención, como modal desde la lista (el botón
 * de la cámara). Por eso el CONTENIDO (GaleriaPaciente) va aparte del modal.
 * Las fotos viven en la subcolección `photos` del cliente: ver
 * patientPhotoService.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Loader2, Trash2, X, Columns2, Plus } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import {
  getPatientPhotos, addPatientPhoto, deletePatientPhoto, ETIQUETAS_FOTO, nombreEtiqueta,
} from '@/services/patientPhotoService'
import { hoyYMD, fechaCorta } from '@/utils/fichaAtencion'

const CAMPO = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500'

const chipDeEtiqueta = (label) =>
  label === 'despues' ? 'chip-ok' : 'chip-neutro'

export function GaleriaPaciente({ customer, activo = true }) {
  const { getBusinessId, user } = useAppContext()
  const toast = useToast()

  // Todos los hooks van ANTES de cualquier return: un hook detrás de un
  // `if (!isOpen) return null` es el error #310 de React.
  const [fotos, setFotos] = useState([])
  const [cargando, setCargando] = useState(false)
  const [filtro, setFiltro] = useState('')
  // Subida: el archivo elegido y sus datos, en un solo bloque
  const [archivo, setArchivo] = useState(null)
  const [preview, setPreview] = useState('')
  const [form, setForm] = useState({ label: 'antes', takenAt: hoyYMD(), treatment: '', note: '' })
  const [subiendo, setSubiendo] = useState(false)
  // Ver grande / comparar
  const [grande, setGrande] = useState(null)
  const [comparando, setComparando] = useState(false)
  const [par, setPar] = useState({ antes: null, despues: null })
  const [borrando, setBorrando] = useState(null)
  const inputRef = useRef(null)

  const customerId = customer?.id

  useEffect(() => {
    if (!activo || !customerId) return
    let vivo = true
    setCargando(true)
    setFiltro('')
    setComparando(false)
    setPar({ antes: null, despues: null })
    setGrande(null)
    getPatientPhotos(getBusinessId(), customerId)
      .then(lista => { if (vivo) setFotos(lista) })
      .catch(e => { console.error('Error al cargar la galería:', e); if (vivo) toast.error('No se pudo cargar la galería') })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, customerId])

  // El preview local se libera al cambiar de archivo o cerrar.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const tratamientos = useMemo(
    () => [...new Set(fotos.map(f => f.treatment).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [fotos],
  )
  const visibles = useMemo(
    () => (filtro ? fotos.filter(f => f.treatment === filtro) : fotos),
    [fotos, filtro],
  )
  const fotoAntes = fotos.find(f => f.id === par.antes) || null
  const fotoDespues = fotos.find(f => f.id === par.despues) || null

  const elegirArchivo = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setArchivo(f)
    setPreview(URL.createObjectURL(f))
    setForm(prev => ({ ...prev, takenAt: hoyYMD(), treatment: prev.treatment || filtro || '' }))
  }

  const cancelarSubida = () => {
    setArchivo(null)
    setPreview('')
  }

  const subir = async () => {
    if (!archivo || !customerId) return
    setSubiendo(true)
    try {
      const foto = await addPatientPhoto(getBusinessId(), customerId, archivo, { ...form, createdBy: user?.uid || null })
      setFotos(prev => [foto, ...prev])
      toast.success('Foto guardada')
      cancelarSubida()
    } catch (e) {
      console.error('Error al subir la foto:', e)
      toast.error(e?.message || 'No se pudo subir la foto')
    } finally {
      setSubiendo(false)
    }
  }

  const borrar = async (foto) => {
    if (!confirm('¿Eliminar esta foto? No se puede deshacer.')) return
    setBorrando(foto.id)
    try {
      await deletePatientPhoto(getBusinessId(), customerId, foto.id)
      setFotos(prev => prev.filter(f => f.id !== foto.id))
      setPar(prev => ({
        antes: prev.antes === foto.id ? null : prev.antes,
        despues: prev.despues === foto.id ? null : prev.despues,
      }))
      if (grande?.id === foto.id) setGrande(null)
      toast.success('Foto eliminada')
    } catch (e) {
      console.error('Error al eliminar la foto:', e)
      toast.error('No se pudo eliminar la foto')
    } finally {
      setBorrando(null)
    }
  }

  // En modo comparar, tocar una foto la pone en su lado según su etiqueta.
  const tocarFoto = (foto) => {
    if (!comparando) { setGrande(foto); return }
    setPar(prev => foto.label === 'despues'
      ? { ...prev, despues: prev.despues === foto.id ? null : foto.id }
      : { ...prev, antes: prev.antes === foto.id ? null : foto.id })
  }

  const Leyenda = ({ foto }) => (
    <div className="flex items-center gap-1.5 flex-wrap text-xs text-gray-600">
      <span className={`${chipDeEtiqueta(foto.label)} px-1.5 py-0.5 rounded font-medium`}>{nombreEtiqueta(foto.label)}</span>
      <span>{fechaCorta(foto.takenAt)}</span>
      {foto.treatment && <span className="truncate">· {foto.treatment}</span>}
    </div>
  )

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-sm text-gray-600">
            Fotos de <strong>{customer?.name || 'la paciente'}</strong>
            {fotos.length > 0 && <span className="text-gray-400"> · {fotos.length} {fotos.length === 1 ? 'foto' : 'fotos'}</span>}
          </p>
          <div className="flex items-center gap-2">
            {fotos.length > 1 && (
              <Button
                size="sm"
                variant={comparando ? undefined : 'outline'}
                onClick={() => { setComparando(v => !v); setPar({ antes: null, despues: null }) }}
                className="gap-1"
              >
                <Columns2 className="w-4 h-4" /> {comparando ? 'Dejar de comparar' : 'Comparar'}
              </Button>
            )}
            <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={elegirArchivo} />
            {!archivo && (
              <Button size="sm" onClick={() => inputRef.current?.click()} className="gap-1">
                <Camera className="w-4 h-4" /> Agregar foto
              </Button>
            )}
          </div>
        </div>

        {/* Formulario de subida: aparece recién con una foto elegida */}
        {archivo && (
          <div className="border border-primary-200 bg-primary-50/40 rounded-lg p-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <img src={preview} alt="Foto elegida" className="w-full sm:w-32 h-32 object-cover rounded-lg bg-gray-100 flex-shrink-0" />
              <div className="flex-1 space-y-2 min-w-0">
                <div className="flex gap-2">
                  {ETIQUETAS_FOTO.map(e => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, label: e.id }))}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                        form.label === e.id ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      {e.nombre}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={form.takenAt}
                    onChange={e => setForm(f => ({ ...f, takenAt: e.target.value }))}
                    className={CAMPO}
                  />
                  <input
                    type="text"
                    list="galeria-tratamientos"
                    value={form.treatment}
                    onChange={e => setForm(f => ({ ...f, treatment: e.target.value }))}
                    placeholder="Tratamiento (ej: Botox frente)"
                    className={CAMPO}
                  />
                  <datalist id="galeria-tratamientos">
                    {tratamientos.map(t => <option key={t} value={t} />)}
                  </datalist>
                </div>
                <input
                  type="text"
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Nota (opcional)"
                  className={CAMPO}
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={cancelarSubida} disabled={subiendo}>Cancelar</Button>
                  <Button size="sm" onClick={subir} disabled={subiendo} className="gap-1">
                    {subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Subir
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Comparación lado a lado */}
        {comparando && (
          <div className="border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-2">
              Toca una foto de <strong>Antes</strong> y una de <strong>Después</strong> en la galería para verlas juntas.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[['antes', fotoAntes], ['despues', fotoDespues]].map(([lado, foto]) => (
                <div key={lado} className="min-w-0">
                  {foto ? (
                    <>
                      <img src={foto.url} alt={nombreEtiqueta(lado)} className="w-full aspect-square object-cover rounded-lg bg-gray-100" />
                      <div className="mt-1"><Leyenda foto={foto} /></div>
                    </>
                  ) : (
                    <div className="w-full aspect-square rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-sm text-gray-400">
                      {nombreEtiqueta(lado)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filtro por tratamiento, solo si hay más de uno */}
        {tratamientos.length > 1 && (
          <select value={filtro} onChange={e => setFiltro(e.target.value)} className={`${CAMPO} sm:w-64`}>
            <option value="">Todos los tratamientos</option>
            {tratamientos.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}

        {/* La galería */}
        {cargando ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        ) : visibles.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Camera className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">{fotos.length === 0 ? 'Sin fotos todavía.' : 'Sin fotos de ese tratamiento.'}</p>
            {fotos.length === 0 && !archivo && (
              <Button size="sm" className="mt-3 gap-1" onClick={() => inputRef.current?.click()}>
                <Camera className="w-4 h-4" /> Agregar la primera foto
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {visibles.map(foto => {
              const elegida = par.antes === foto.id || par.despues === foto.id
              return (
                <div key={foto.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => tocarFoto(foto)}
                    className={`block w-full aspect-square rounded-lg overflow-hidden bg-gray-100 ring-offset-2 transition-shadow ${
                      elegida ? 'ring-2 ring-primary-600' : comparando ? 'hover:ring-2 hover:ring-primary-300' : ''
                    }`}
                    title={comparando ? 'Elegir para comparar' : 'Ver grande'}
                  >
                    <img src={foto.url} alt={foto.treatment || nombreEtiqueta(foto.label)} loading="lazy" className="w-full h-full object-cover" />
                  </button>
                  <div className="mt-1"><Leyenda foto={foto} /></div>
                  <button
                    type="button"
                    onClick={() => borrar(foto)}
                    disabled={borrando === foto.id}
                    className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-white/90 text-gray-500 hover:text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    title="Eliminar foto"
                  >
                    {borrando === foto.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Ver grande: por encima del modal */}
      {grande && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex flex-col items-center justify-center p-4" onClick={() => setGrande(null)}>
          <button
            type="button"
            onClick={() => setGrande(null)}
            className="absolute top-3 right-3 p-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={grande.url}
            alt={grande.treatment || nombreEtiqueta(grande.label)}
            className="max-w-full max-h-[80vh] object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
          <div className="mt-3 text-sm text-white/90 text-center" onClick={e => e.stopPropagation()}>
            {nombreEtiqueta(grande.label)} · {fechaCorta(grande.takenAt)}
            {grande.treatment && ` · ${grande.treatment}`}
            {grande.note && <p className="text-white/70 text-xs mt-1">{grande.note}</p>}
          </div>
        </div>
      )}
    </>
  )
}

/** La galería como modal, para la lista de Clientes en General con la ficha de atención. */
export default function GaleriaPacienteModal({ isOpen, onClose, customer }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Galería antes y después" size="4xl">
      <GaleriaPaciente customer={customer} activo={isOpen} />
    </Modal>
  )
}
