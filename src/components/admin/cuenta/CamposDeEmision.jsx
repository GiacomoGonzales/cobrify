import { useToast } from '@/contexts/ToastContext'
import { Boton, Campo, Entrada, Selector, Opcion } from '@/components/admin/ui'

// Los campos en pantalla del formulario de emisión electrónica de un RUC
// (régimen, método y credenciales). La lógica de cargar y guardar está en
// `emision.js`; los dos modales que los usan (SunatModal y EmisoresModal)
// tienen el estado y le pasan `form`/`set` más lo de `useCamposDeEmision`.

export function Clave({ etiqueta, valor, onChange, visible, onVer, placeholder = '••••••••' }) {
  return (
    <Campo etiqueta={etiqueta} como="div">
      <div className="flex gap-2">
        <Entrada type={visible ? 'text' : 'password'} value={valor} onChange={onChange} placeholder={placeholder} autoComplete="off" />
        <Boton tamano="md" onClick={onVer} className="shrink-0">{visible ? 'Ocultar' : 'Ver'}</Boton>
      </div>
    </Campo>
  )
}

/**
 * Régimen, método y credenciales. `form`/`set` son del modal; lo demás sale
 * de `useCamposDeEmision`.
 */
export function CamposDeEmision({ form, set, ver, alternarVer, archivoCertificado, setArchivoCertificado, notaRegimen }) {
  const toast = useToast()

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
    set('certificateName', '')
    set('certificatePassword', '')
  }

  return (
    <>
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
          ayuda={notaRegimen || 'Cuota fija mensual, no declara IGV. Las boletas salen como venta interna NRUS (0113), gravadas con IGV en cero. Al guardar se desactiva la factura en el POS.'} />
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
          {archivoCertificado && (
            <p className="text-[11.5px] text-gray-500">Se sube al guardar: {archivoCertificado.name}</p>
          )}
          <p className="text-[11.5px] text-gray-500">
            Estado: {form.sunatEnvironment === 'production' ? 'homologado' : 'en pruebas'}
          </p>
        </div>
      )}
    </>
  )
}
