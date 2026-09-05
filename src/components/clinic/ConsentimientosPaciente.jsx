/**
 * CONSENTIMIENTOS INFORMADOS de un paciente: los ya firmados (con su PDF) y
 * firmar uno nuevo en pantalla.
 *
 * Firmar es: elegir la plantilla, decir el tratamiento y quién atiende, que
 * el paciente lea el texto ya con sus datos, firme con el dedo y se guarde.
 * El PDF se genera cuando se pide, a partir de lo guardado.
 */
import { useEffect, useMemo, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { FileSignature, FileDown, ExternalLink, Trash2, Loader2, Plus } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Button from '@/components/ui/Button'
import { getSellers } from '@/services/sellerService'
import { getProducts } from '@/services/firestoreService'
import { esVendible } from '@/utils/productSale'
import { getConsents, addConsent, deleteConsent } from '@/services/consentService'
import { plantillasDisponibles, textoDelConsentimiento, firmaValida, nombreDeArchivoConsentimiento } from '@/utils/consentimiento'
import { edadDesde, fechaCorta, hoyYMD } from '@/utils/fichaAtencion'
import { downloadBlob } from '@/utils/nativeDownload'
import FirmaCanvas from './FirmaCanvas'

const CAMPO = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500'

export default function ConsentimientosPaciente({ customer }) {
  const { getBusinessId, user, businessSettings } = useAppContext()
  const toast = useToast()

  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(false)
  const [nuevo, setNuevo] = useState(false)
  const plantillas = useMemo(() => plantillasDisponibles(businessSettings), [businessSettings])
  const [form, setForm] = useState({ templateId: '', treatment: '', professional: '' })
  const [firma, setFirma] = useState(null)
  const [acepta, setAcepta] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [ocupado, setOcupado] = useState(null)
  const [profesionales, setProfesionales] = useState([])
  const [tratamientos, setTratamientos] = useState([])

  const customerId = customer?.id

  useEffect(() => {
    if (!customerId) return
    let vivo = true
    setCargando(true)
    setNuevo(false)
    getConsents(getBusinessId(), customerId)
      .then(l => { if (vivo) setLista(l) })
      .catch(e => { console.error('Error al cargar los consentimientos:', e); if (vivo) toast.error('No se pudieron cargar los consentimientos') })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  // Profesionales y tratamientos para autocompletar, recién al abrir el formulario.
  useEffect(() => {
    if (!nuevo) return
    const businessId = getBusinessId()
    if (profesionales.length === 0) {
      getSellers(businessId)
        .then(r => setProfesionales(r?.success ? (r.data || []).filter(v => v.status !== 'inactive').map(v => v.name).filter(Boolean) : []))
        .catch(() => {})
    }
    if (tratamientos.length === 0) {
      getProducts(businessId)
        .then(r => setTratamientos(r?.success ? (r.data || []).filter(esVendible).map(p => p.name).filter(Boolean).sort() : []))
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nuevo])

  const abrirNuevo = () => {
    setForm({ templateId: plantillas[0]?.id || '', treatment: '', professional: '' })
    setFirma(null)
    setAcepta(false)
    setNuevo(true)
  }

  const plantilla = plantillas.find(p => p.id === form.templateId) || plantillas[0]
  const documento = customer?.documentNumber ? `${customer.documentType || 'DNI'} ${customer.documentNumber}` : ''
  const texto = useMemo(() => textoDelConsentimiento(plantilla, {
    paciente: customer?.name,
    dni: documento,
    edad: edadDesde(customer?.birthDate),
    tratamiento: form.treatment,
    profesional: form.professional,
    fecha: fechaCorta(hoyYMD()),
    negocio: businessSettings?.tradeName || businessSettings?.businessName || '',
  }), [plantilla, customer, documento, form.treatment, form.professional, businessSettings])

  const guardar = async () => {
    if (!firmaValida(firma)) { toast.error('Falta la firma del paciente'); return }
    if (!acepta) { toast.error('Marca que el paciente leyó y acepta el documento'); return }
    setGuardando(true)
    try {
      const guardado = await addConsent(getBusinessId(), customerId, {
        templateId: plantilla.id,
        templateName: plantilla.nombre,
        text: texto,
        treatment: form.treatment,
        professional: form.professional,
        customerName: customer.name,
        customerDocument: documento,
        signatureDataUrl: firma,
        createdBy: user?.uid || null,
      })
      setLista(prev => [guardado, ...prev])
      setNuevo(false)
      toast.success('Consentimiento firmado y guardado')
    } catch (e) {
      console.error('Error al guardar el consentimiento:', e)
      toast.error(e?.message || 'No se pudo guardar el consentimiento')
    } finally {
      setGuardando(false)
    }
  }

  const pdfDe = async (c) => {
    const { generarPdfConsentimiento } = await import('@/utils/consentimientoPdf')
    return generarPdfConsentimiento(c, businessSettings || {})
  }

  const descargar = async (c) => {
    setOcupado(c.id)
    try {
      const doc = await pdfDe(c)
      await downloadBlob(doc.output('blob'), nombreDeArchivoConsentimiento(c), {
        title: 'Consentimiento informado',
        dialogTitle: 'Guardar o compartir PDF',
      })
    } catch (e) {
      console.error('Error al generar el PDF:', e)
      toast.error('No se pudo generar el PDF')
    } finally {
      setOcupado(null)
    }
  }

  const ver = async (c) => {
    setOcupado(c.id)
    try {
      const doc = await pdfDe(c)
      window.open(doc.output('bloburl'), '_blank')
    } catch (e) {
      toast.error('No se pudo abrir el PDF')
    } finally {
      setOcupado(null)
    }
  }

  const borrar = async (c) => {
    if (!confirm(`¿Eliminar el consentimiento del ${fechaCorta(c.signedDate)}? No se puede deshacer.`)) return
    setOcupado(c.id)
    try {
      await deleteConsent(getBusinessId(), customerId, c.id)
      setLista(prev => prev.filter(x => x.id !== c.id))
      toast.success('Consentimiento eliminado')
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
          {lista.length === 0 ? 'Sin consentimientos firmados.' : `${lista.length} ${lista.length === 1 ? 'consentimiento firmado' : 'consentimientos firmados'}`}
        </p>
        {!nuevo && (
          <Button size="sm" onClick={abrirNuevo} className="gap-1">
            <FileSignature className="w-4 h-4" /> Nuevo consentimiento
          </Button>
        )}
      </div>

      {nuevo && (
        <div className="border border-primary-200 bg-primary-50/40 rounded-lg p-3 sm:p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select value={form.templateId} onChange={e => setForm(f => ({ ...f, templateId: e.target.value }))} className={CAMPO}>
              {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <input
              type="text"
              list="consent-tratamientos"
              value={form.treatment}
              onChange={e => setForm(f => ({ ...f, treatment: e.target.value }))}
              placeholder="Tratamiento (ej: Láser axilas)"
              className={CAMPO}
            />
            <datalist id="consent-tratamientos">
              {tratamientos.map(t => <option key={t} value={t} />)}
            </datalist>
            <input
              type="text"
              list="consent-profesionales"
              value={form.professional}
              onChange={e => setForm(f => ({ ...f, professional: e.target.value }))}
              placeholder="Profesional que atiende"
              className={CAMPO}
            />
            <datalist id="consent-profesionales">
              {profesionales.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>

          {/* Lo que el paciente lee, ya con sus datos */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 max-h-64 overflow-y-auto">
            <p className="text-sm font-semibold text-gray-900 mb-2">{plantilla?.nombre}</p>
            <div className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">{texto}</div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Firma del paciente</p>
            <FirmaCanvas onChange={setFirma} />
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-800 cursor-pointer">
            <input
              type="checkbox"
              checked={acepta}
              onChange={e => setAcepta(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            El paciente leyó el documento completo y lo firma de forma libre y voluntaria.
          </label>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNuevo(false)} disabled={guardando}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando || !firmaValida(firma) || !acepta} className="gap-1">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />} Guardar firmado
            </Button>
          </div>
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
      ) : lista.length === 0 ? (
        !nuevo && (
          <div className="text-center py-8 text-gray-500">
            <FileSignature className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Todavía no firmó ningún consentimiento.</p>
            <p className="text-xs text-gray-400 mt-1">Las plantillas se arman en Configuración &gt; Punto de venta; sin plantillas propias se usa una general.</p>
          </div>
        )
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
          {lista.map(c => (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2">
              <img src={c.signatureDataUrl} alt="Firma" className="w-16 h-8 object-contain bg-white border border-gray-100 rounded flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{c.templateName}{c.treatment && ` · ${c.treatment}`}</p>
                <p className="text-xs text-gray-500 truncate">
                  {fechaCorta(c.signedDate)}{c.professional && ` · ${c.professional}`}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {!Capacitor.isNativePlatform() && (
                  <button type="button" onClick={() => ver(c)} disabled={ocupado === c.id} className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg" title="Ver PDF">
                    <ExternalLink className="w-4 h-4" />
                  </button>
                )}
                <button type="button" onClick={() => descargar(c)} disabled={ocupado === c.id} className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg" title="Descargar PDF">
                  {ocupado === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                </button>
                <button type="button" onClick={() => borrar(c)} disabled={ocupado === c.id} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Eliminar">
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
