import { useEffect, useState } from 'react'
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getEmissionSecrets, saveEmissionSecrets } from '@/services/emissionSecretsService'
import { useToast } from '@/contexts/ToastContext'
import { Modal, Boton, Campo, Entrada, Selector, Casilla, Opcion } from '@/components/admin/ui'

// Configuracion de emision electronica de una cuenta: regimen de IGV, metodo
// (QPse o SUNAT directo) y credenciales. Las credenciales viven en la
// subcoleccion PROTEGIDA (emissionSecretsService); al doc publico solo van
// el metodo y el regimen.

const FORM_VACIO = {
  emissionMethod: 'none',
  qpseUsuario: '',
  qpsePassword: '',
  qpseEnvironment: 'demo',
  solUser: '',
  solPassword: '',
  clientId: '',
  clientSecret: '',
  certificatePassword: '',
  certificateName: '',
  sunatEnvironment: 'beta',
  igvExempt: false,
  igvRate: 18,
  // 'standard' 18% · 'reduced' 10.5% Ley 31556 · 'exempt' 0% Ley 27037 · 'nrus' boleta 0113 con IGV 0
  taxType: 'standard',
  // Override admin: permitir boleta/factura en el POS aunque NO haya conexion SUNAT.
  allowInvoicingWithoutSunat: false,
}

const normalizarQpse = env => (env === 'production' || env === 'produccion' ? 'production' : env || 'demo')
const normalizarSunat = env => (env === 'production' || env === 'produccion' ? 'production' : env || 'beta')

// igvExempt e igvRate segun el regimen. Ley 31556: 8% IGV + 2.5% IPM = 10.5%.
// NRUS lleva igvExempt=true A PROPOSITO: para el POS, los PDFs y las notas de
// credito se comporta EXACTAMENTE como un exonerado (precios finales, sin
// desglose de IGV). La diferencia vive solo en el XML de la boleta, donde el
// generador ve taxType='nrus' y emite tipo de operacion 0113 con lineas
// GRAVADAS (afectacion 10) a tasa 0, que es lo que exige SUNAT para este
// regimen (no confundir con exonerado: eso es afectacion 20).
const REGIMENES = {
  standard: { igvExempt: false, igvRate: 18 },
  reduced: { igvExempt: false, igvRate: 10.5 },
  exempt: { igvExempt: true, igvRate: 0 },
  nrus: { igvExempt: true, igvRate: 0 },
}

function Clave({ etiqueta, valor, onChange, visible, onVer, placeholder = '••••••••' }) {
  return (
    <Campo etiqueta={etiqueta} como="div">
      <div className="flex gap-2">
        <Entrada type={visible ? 'text' : 'password'} value={valor} onChange={onChange} placeholder={placeholder} autoComplete="off" />
        <Boton tamano="md" onClick={onVer} className="shrink-0">{visible ? 'Ocultar' : 'Ver'}</Boton>
      </div>
    </Campo>
  )
}

export default function SunatModal({ cuenta, onClose, onGuardado }) {
  const toast = useToast()
  const [form, setForm] = useState(FORM_VACIO)
  const [ver, setVer] = useState({ qpse: false, sol: false, cert: false, api: false })
  const [archivoCertificado, setArchivoCertificado] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))
  const alternarVer = campo => setVer(v => ({ ...v, [campo]: !v[campo] }))

  useEffect(() => {
    let vivo = true
    async function cargar() {
      try {
        const snap = await getDoc(doc(db, 'businesses', cuenta.id))
        if (!snap.exists()) {
          if (vivo) setForm(FORM_VACIO)
          return
        }
        const negocio = snap.data()
        const em = await getEmissionSecrets(cuenta.id, negocio)

        let metodo = 'none'
        if (em.qpse?.enabled || em.qpse?.usuario) metodo = 'qpse'
        else if (em.sunat?.enabled || em.sunat?.solUser) metodo = 'sunat_direct'
        else if (em.emissionConfig?.method) metodo = em.emissionConfig.method
        else if (em.emissionConfig?.qpse?.enabled || em.emissionConfig?.qpse?.usuario) metodo = 'qpse'
        else if (em.emissionConfig?.sunat?.enabled || em.emissionConfig?.sunat?.solUser) metodo = 'sunat_direct'
        else if (negocio.emissionMethod) metodo = negocio.emissionMethod

        const qpse = em.qpse || em.emissionConfig?.qpse || {}
        const sunat = em.sunat || em.emissionConfig?.sunat || {}
        const tax = em.emissionConfig?.taxConfig || negocio.taxConfig || {}

        if (!vivo) return
        setForm({
          emissionMethod: metodo,
          qpseUsuario: qpse.usuario || '',
          qpsePassword: qpse.password || '',
          qpseEnvironment: normalizarQpse(qpse.environment),
          solUser: sunat.solUser || '',
          solPassword: sunat.solPassword || '',
          clientId: sunat.clientId || '',
          clientSecret: sunat.clientSecret || '',
          certificatePassword: sunat.certificatePassword || '',
          certificateName: sunat.certificateName || '',
          sunatEnvironment: normalizarSunat(sunat.environment),
          igvExempt: tax.igvExempt || false,
          igvRate: tax.igvRate || 18,
          // taxType guardado manda (un 'nrus' tambien tiene igvExempt=true y
          // derivarlo lo confundiria con 'exempt'); derivar solo en configs
          // antiguas sin taxType. Ley 31556: 10, 10.5 y 8 valen como 'reduced'.
          taxType:
            tax.taxType ||
            (tax.igvExempt ? 'exempt' : tax.igvRate === 10 || tax.igvRate === 10.5 || tax.igvRate === 8 ? 'reduced' : 'standard'),
          allowInvoicingWithoutSunat: negocio.allowInvoicingWithoutSunat === true,
        })
      } catch (error) {
        console.error('Error cargando la configuración de emisión:', error)
        if (vivo) setForm(FORM_VACIO)
      } finally {
        if (vivo) setCargando(false)
      }
    }
    cargar()
    return () => { vivo = false }
  }, [cuenta.id])

  const subirCertificado = e => {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    if (!archivo.name.endsWith('.pfx') && !archivo.name.endsWith('.p12')) {
      toast.error('El certificado debe ser un archivo .pfx o .p12')
      return
    }
    setArchivoCertificado(archivo)
    set('certificateName', archivo.name)
  }

  const quitarCertificado = () => {
    setArchivoCertificado(null)
    setForm(f => ({ ...f, certificateName: '', certificatePassword: '' }))
  }

  async function guardar() {
    setGuardando(true)
    try {
      const ref = doc(db, 'businesses', cuenta.id)
      const actual = await getDoc(ref)
      const datosActuales = actual.exists() ? actual.data() : {}
      // Config actual desde la subcoleccion protegida (para conservar cert/firmas al re-guardar)
      const secretos = await getEmissionSecrets(cuenta.id, datosActuales)

      const cambios = { updatedAt: Timestamp.now() }
      const regimen = REGIMENES[form.taxType] || REGIMENES.standard

      // Un NRUS no puede emitir facturas: se le deja Boleta y Nota de Venta en
      // el POS. Solo se escribe al MARCAR nrus; al desmarcar no se toca, para
      // no pisar una configuracion que el dueno haya afinado por su cuenta.
      if (form.taxType === 'nrus') cambios.enabledDocumentTypes = ['boleta', 'nota_venta']

      const emissionConfig = {
        method: form.emissionMethod,
        taxConfig: { igvExempt: regimen.igvExempt, igvRate: regimen.igvRate, includeIgv: !regimen.igvExempt, taxType: form.taxType },
      }

      if (form.emissionMethod === 'qpse') {
        emissionConfig.qpse = {
          enabled: true,
          usuario: form.qpseUsuario,
          password: form.qpsePassword,
          environment: form.qpseEnvironment,
          firmasDisponibles: secretos.qpse?.firmasDisponibles ?? secretos.emissionConfig?.qpse?.firmasDisponibles ?? 500,
          firmasUsadas: secretos.qpse?.firmasUsadas ?? secretos.emissionConfig?.qpse?.firmasUsadas ?? 0,
        }
        emissionConfig.sunat = { enabled: false }
      } else if (form.emissionMethod === 'sunat_direct') {
        const sunat = {
          enabled: true,
          solUser: form.solUser,
          solPassword: form.solPassword,
          clientId: form.clientId,
          clientSecret: form.clientSecret,
          certificatePassword: form.certificatePassword,
          environment: form.sunatEnvironment,
          homologated: form.sunatEnvironment === 'production',
          certificateName: form.certificateName || secretos.sunat?.certificateName || secretos.emissionConfig?.sunat?.certificateName || '',
          certificateData: secretos.sunat?.certificateData || secretos.emissionConfig?.sunat?.certificateData || null,
        }
        if (archivoCertificado) {
          // Solo la parte base64 (sin el prefijo data:...)
          sunat.certificateData = await new Promise((resolve, reject) => {
            const lector = new FileReader()
            lector.onload = () => resolve(lector.result.split(',')[1])
            lector.onerror = () => reject(new Error('No se pudo leer el certificado digital'))
            lector.readAsDataURL(archivoCertificado)
          })
        } else if (!form.certificateName) {
          sunat.certificateData = null
        }
        emissionConfig.sunat = sunat
        emissionConfig.qpse = { enabled: false }
      } else {
        emissionConfig.qpse = { enabled: false }
        emissionConfig.sunat = { enabled: false }
      }

      // Credenciales → subcoleccion protegida; al doc publico solo lo no secreto.
      await saveEmissionSecrets(cuenta.id, {
        sunat: emissionConfig.sunat,
        qpse: emissionConfig.qpse,
        emissionConfig: { qpse: emissionConfig.qpse, sunat: emissionConfig.sunat },
      })
      cambios.emissionConfig = { method: emissionConfig.method, taxConfig: emissionConfig.taxConfig }
      cambios.emissionMethod = form.emissionMethod
      cambios.allowInvoicingWithoutSunat = !!form.allowInvoicingWithoutSunat
      await updateDoc(ref, cambios)

      // EL PLAN NO SE TOCA. Antes, si el metodo elegido no coincidia con el
      // `emissionMethod` del plan, esta pantalla le CAMBIABA el plan a un
      // `qpse_1_month` o `sunat_direct_1_month` (planes viejos) y le pisaba los
      // limites. Es decir: a un cliente que pago el Anual y al que le pones
      // SUNAT directo, le borraba lo que compro.
      //
      // La premisa era falsa. Cualquier plan puede emitir por cualquiera de los
      // dos metodos; lo que se usa se decide POR CUENTA y se pacta con el
      // cliente. El servidor tampoco mira el plan: `determineEmissionRouter`
      // resuelve por `businessData.emissionMethod`.

      toast.success('Configuración de emisión guardada')
      onGuardado?.()
      onClose()
    } catch (error) {
      console.error('Error guardando la configuración de emisión:', error)
      toast.error(error.message || 'No se pudo guardar la configuración')
    } finally {
      setGuardando(false)
    }
  }

  const pie = (
    <>
      <Boton onClick={onClose} disabled={guardando}>Cancelar</Boton>
      <Boton variante="primario" onClick={guardar} disabled={guardando || cargando}>
        {guardando ? 'Guardando…' : 'Guardar'}
      </Boton>
    </>
  )

  return (
    <Modal titulo="Emisión electrónica" subtitulo={cuenta.businessName} onClose={onClose} pie={pie} ancho="lg">
      {cargando ? (
        <p className="py-8 text-center text-gray-500">Cargando configuración…</p>
      ) : (
        <div className="space-y-5">
          <Casilla
            etiqueta="Permitir boletas y facturas sin conexión SUNAT"
            ayuda="Sin método de emisión, el POS solo emite notas de venta. Con esto puede emitir boletas y facturas igual."
            checked={!!form.allowInvoicingWithoutSunat}
            onChange={e => set('allowInvoicingWithoutSunat', e.target.checked)}
          />

          <fieldset className="space-y-2">
            <legend className="mb-1 text-[12px] font-medium text-gray-700">Régimen de IGV</legend>
            <Opcion name="taxType" value="standard" checked={form.taxType === 'standard'} onChange={() => set('taxType', 'standard')}
              etiqueta="IGV estándar (18 %)" ayuda="Régimen general para la mayoría de empresas." />
            <Opcion name="taxType" value="reduced" checked={form.taxType === 'reduced'} onChange={() => set('taxType', 'reduced')}
              etiqueta="IGV reducido (10,5 %) · Ley 31556"
              ayuda="MYPES de restaurantes, hoteles y alojamientos turísticos (ventas ≤ S/ 7,8 M anuales). 8 % IGV + 2,5 % IPM. Vigente hasta el 31/12/2026." />
            <Opcion name="taxType" value="exempt" checked={form.taxType === 'exempt'} onChange={() => set('taxType', 'exempt')}
              etiqueta="Exonerado (0 %) · Ley 27037"
              ayuda="Promoción de la inversión en la Amazonía: Loreto, Ucayali, Madre de Dios, Amazonas y San Martín." />
            <Opcion name="taxType" value="nrus" checked={form.taxType === 'nrus'} onChange={() => set('taxType', 'nrus')}
              etiqueta="NRUS · Nuevo RUS (boletas con IGV 0 %)"
              ayuda="Cuota fija mensual, no declara IGV. Las boletas salen como venta interna NRUS (0113), gravadas con IGV en cero. Al guardar se desactiva la factura en el POS." />
          </fieldset>

          <Campo etiqueta="Método de emisión">
            <Selector value={form.emissionMethod} onChange={e => set('emissionMethod', e.target.value)}>
              <option value="none">Sin configurar</option>
              {/* El metodo dice QUIEN firma, no cuantos comprobantes entran:
                  el tope del mes es `limits.maxInvoicesPerMonth`, que viene del
                  PLAN (100 el basico, 1000 el mensual…) y se cambia desde la
                  ficha. Decir "QPse (500 al mes)" mezclaba las dos cosas y
                  ademas era falso para casi todos los planes. */}
              <option value="qpse">QPse (firma nuestro proveedor)</option>
              <option value="sunat_direct">SUNAT directo (con su propio certificado)</option>
            </Selector>
          </Campo>

          {form.emissionMethod === 'qpse' && (
            <div className="space-y-3 rounded-md border border-gray-200 p-3">
              <p className="text-[12.5px] font-medium text-gray-900">QPse</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo etiqueta="Ambiente">
                  <Selector value={form.qpseEnvironment} onChange={e => set('qpseEnvironment', e.target.value)}>
                    <option value="demo">Demo (pruebas)</option>
                    <option value="production">Producción</option>
                  </Selector>
                </Campo>
                <Campo etiqueta="Usuario QPse">
                  <Entrada value={form.qpseUsuario} onChange={e => set('qpseUsuario', e.target.value)} placeholder="usuario@empresa.com" autoComplete="off" />
                </Campo>
              </div>
              <Clave etiqueta="Contraseña QPse" valor={form.qpsePassword} onChange={e => set('qpsePassword', e.target.value)} visible={ver.qpse} onVer={() => alternarVer('qpse')} />
              <p className="text-[11.5px] text-gray-500">
                Estado: {form.qpseEnvironment === 'production' ? 'homologado' : 'en pruebas'}
              </p>
            </div>
          )}

          {form.emissionMethod === 'sunat_direct' && (
            <div className="space-y-3 rounded-md border border-gray-200 p-3">
              <p className="text-[12.5px] font-medium text-gray-900">SUNAT directo</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo etiqueta="Ambiente">
                  <Selector value={form.sunatEnvironment} onChange={e => set('sunatEnvironment', e.target.value)}>
                    <option value="beta">Beta (pruebas)</option>
                    <option value="production">Producción</option>
                  </Selector>
                </Campo>
                <Campo etiqueta="Usuario SOL">
                  <Entrada value={form.solUser} onChange={e => set('solUser', e.target.value)} placeholder="MODDATOS" autoComplete="off" />
                </Campo>
              </div>
              <Clave etiqueta="Clave SOL" valor={form.solPassword} onChange={e => set('solPassword', e.target.value)} visible={ver.sol} onVer={() => alternarVer('sol')} />

              <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-3">
                <div>
                  <p className="text-[12.5px] font-medium text-gray-900">Credenciales API REST (guías de remisión)</p>
                  <p className="text-[11.5px] text-gray-500">Se generan en el menú SOL → Empresa → Credenciales API.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Campo etiqueta="Client ID">
                    <Entrada value={form.clientId} onChange={e => set('clientId', e.target.value)} placeholder="12345678901-abc123…" autoComplete="off" />
                  </Campo>
                  <Clave etiqueta="Client secret" valor={form.clientSecret} onChange={e => set('clientSecret', e.target.value)} visible={ver.api} onVer={() => alternarVer('api')} />
                </div>
              </div>

              <Clave etiqueta="Contraseña del certificado" valor={form.certificatePassword} onChange={e => set('certificatePassword', e.target.value)} visible={ver.cert} onVer={() => alternarVer('cert')} />

              <Campo etiqueta="Certificado digital (.pfx / .p12)" como="div">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={form.certificateName ? 'text-gray-900' : 'text-gray-500'}>
                    {form.certificateName || 'Sin certificado'}
                  </span>
                  <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-gray-300 bg-white px-3 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50">
                    {form.certificateName ? 'Cambiar' : 'Subir'}
                    <input type="file" accept=".pfx,.p12" onChange={subirCertificado} className="hidden" />
                  </label>
                  {form.certificateName && (
                    <Boton variante="peligro" onClick={quitarCertificado}>Quitar</Boton>
                  )}
                </div>
              </Campo>
              <p className="text-[11.5px] text-gray-500">
                Estado: {form.sunatEnvironment === 'production' ? 'homologado' : 'en pruebas'}
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
