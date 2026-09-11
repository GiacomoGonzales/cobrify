import { useEffect, useState } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { Modal, Boton, Campo, Entrada, Selector, Casilla, Aviso, Pastilla } from '@/components/admin/ui'
import { validateRUC } from '@/utils/peruUtils'
import { consultarRUC } from '@/services/documentLookupService'
import { codigosDeUbigeo, ubigeoDeCodigos } from '@/utils/ubigeoDesdeConsulta'
import { DEPARTAMENTOS, PROVINCIAS, DISTRITOS } from '@/data/peruUbigeos'
import { BANCOS, TIPOS_CUENTA, MONEDAS, CUENTA_VACIA, etiquetaTipoCuenta } from '@/data/cuentasBancarias'
import {
  getEmisores, nuevoIdDeEmisor, guardarEmisor, cambiarActivoDeEmisor, getSecretosDeEmisor, getSeriesDelNegocio,
} from '@/services/emisoresService'
import {
  FORM_EMISION_VACIO, NOMBRE_DE_REGIMEN, NOMBRE_DE_METODO, formDesdeConfiguracion, emissionConfigDesdeForm, useCamposDeEmision,
} from './emision'
import { CamposDeEmision } from './CamposDeEmision'
import {
  TIPOS_DE_SERIE_DE_EMISOR, seriesSugeridas, serieValida, seriesRepetidas,
} from '../../../../functions/src/utils/emisorDelComprobante.js'

/**
 * Los RUC adicionales de una cuenta ("Varios RUC").
 *
 * Un local, un stock, más de un RUC: cada emisor adicional es una empresa
 * distinta ante SUNAT y ante el banco, así que se configura como el negocio
 * mismo (identidad, régimen, credenciales, cuentas) y además con sus series,
 * que tienen que ser únicas en toda la cuenta. El RUC principal es el negocio
 * y se configura donde siempre: Emisión electrónica y Configuración › Series.
 *
 * El formulario abre EN la tarjeta del emisor, igual que las sucursales: se ve
 * cuál se está tocando y el botón de guardar queda al lado de lo que cambió.
 */

const ETIQUETA_DE_SERIE = {
  factura: 'Factura',
  boleta: 'Boleta',
  nota_venta: 'Nota de venta',
  nota_credito_factura: 'NC de factura',
  nota_credito_boleta: 'NC de boleta',
  nota_debito_factura: 'ND de factura',
  nota_debito_boleta: 'ND de boleta',
}

const TIPOS_DE_COMPROBANTE = [
  ['boleta', 'Boleta'],
  ['factura', 'Factura'],
  ['nota_venta', 'Nota de venta'],
]

const FORM_VACIO = {
  ruc: '',
  businessName: '',
  tradeName: '',
  address: '',
  phone: '',
  email: '',
  // Códigos de ubigeo en el formulario; al guardar se traducen a NOMBRES, que
  // es como los guarda el negocio y como los lee el XML.
  department: '',
  province: '',
  district: '',
  ubigeo: '',
  bankAccountsList: [],
  enabledDocumentTypes: ['boleta', 'factura', 'nota_venta'],
  activo: true,
  series: {},
  ...FORM_EMISION_VACIO,
}

const nombreDe = (lista, codigo) => (lista || []).find(x => x.code === codigo)?.name || ''

/** Los códigos de un emisor guardado con nombres (y quizá el ubigeo). */
function codigosDelEmisor(emisor) {
  return codigosDeUbigeo({
    ubigeo: emisor.ubigeo,
    departamento: emisor.department,
    provincia: emisor.province,
    distrito: emisor.district,
  })
}

/** Un juego de series que no choque con nada de la cuenta. */
function seriesLibres(negocio, desde = 1) {
  for (let n = desde; n < desde + 30; n++) {
    const juego = seriesSugeridas(n)
    const lista = Object.entries(juego).map(([tipo, serie]) => ({ tipo, serie }))
    if (seriesRepetidas(lista, negocio).length === 0) return juego
  }
  return seriesSugeridas(desde)
}

export default function EmisoresModal({ cuenta, onClose }) {
  const toast = useToast()
  const [emisores, setEmisores] = useState([])
  const [negocio, setNegocio] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [form, setForm] = useState(FORM_VACIO)
  const [seriesGuardadas, setSeriesGuardadas] = useState({})
  const [editando, setEditando] = useState(null)
  const [creando, setCreando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [buscandoRuc, setBuscandoRuc] = useState(false)
  const [cuentaNueva, setCuentaNueva] = useState(CUENTA_VACIA)
  const { ver, alternarVer, archivoCertificado, setArchivoCertificado } = useCamposDeEmision()
  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))
  const setSerie = (tipo, valor) => setForm(f => ({ ...f, series: { ...f.series, [tipo]: valor.toUpperCase() } }))

  const formAbierto = creando || Boolean(editando)

  async function recargar() {
    const [lista, series] = await Promise.all([getEmisores(cuenta.id), getSeriesDelNegocio(cuenta.id)])
    if (lista.success) setEmisores(lista.data)
    setNegocio(series)
    return series
  }

  useEffect(() => {
    let vivo = true
    Promise.all([getEmisores(cuenta.id), getSeriesDelNegocio(cuenta.id)])
      .then(([lista, series]) => {
        if (!vivo) return
        if (lista.success) setEmisores(lista.data)
        setNegocio(series)
      })
      .catch(e => { console.error('Error cargando los emisores:', e); toast.error('No se pudieron cargar los emisores') })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuenta.id])

  const provincias = PROVINCIAS[form.department] || []
  const distritos = DISTRITOS[`${form.department}${form.province}`] || []

  const cambiarUbigeo = (campo, valor) => {
    const nuevo = { ...form, [campo]: valor }
    if (campo === 'department') Object.assign(nuevo, { province: '', district: '', ubigeo: '' })
    else if (campo === 'province') Object.assign(nuevo, { district: '', ubigeo: '' })
    else if (campo === 'district') nuevo.ubigeo = ubigeoDeCodigos({ departamento: nuevo.department, provincia: nuevo.province, distrito: valor })
    setForm(nuevo)
  }

  function cerrarFormulario() {
    setEditando(null)
    setCreando(false)
    setForm(FORM_VACIO)
    setSeriesGuardadas({})
    setArchivoCertificado(null)
    setCuentaNueva(CUENTA_VACIA)
  }

  function abrirNuevo() {
    setEditando(null)
    setCreando(true)
    setSeriesGuardadas({})
    setForm({ ...FORM_VACIO, series: seriesLibres(negocio, emisores.length + 1) })
  }

  async function abrirEdicion(emisor) {
    setCreando(false)
    setEditando(emisor)
    const codigos = codigosDelEmisor(emisor)
    const guardadas = negocio?.emisorSeries?.[emisor.id] || {}
    setSeriesGuardadas(guardadas)
    const series = {}
    for (const tipo of TIPOS_DE_SERIE_DE_EMISOR) series[tipo] = guardadas[tipo]?.serie || ''
    let emision = FORM_EMISION_VACIO
    try {
      emision = formDesdeConfiguracion(await getSecretosDeEmisor(cuenta.id, emisor.id), emisor)
    } catch (e) {
      console.error('Error cargando las credenciales del emisor:', e)
      toast.error('No se pudieron cargar las credenciales del emisor')
    }
    setForm({
      ...FORM_VACIO,
      ...emision,
      ruc: emisor.ruc || '',
      businessName: emisor.businessName || '',
      tradeName: emisor.tradeName || '',
      address: emisor.address || '',
      phone: emisor.phone || '',
      email: emisor.email || '',
      department: codigos.departamento,
      province: codigos.provincia,
      district: codigos.distrito,
      ubigeo: ubigeoDeCodigos(codigos),
      bankAccountsList: Array.isArray(emisor.bankAccountsList) ? emisor.bankAccountsList : [],
      enabledDocumentTypes: Array.isArray(emisor.enabledDocumentTypes) && emisor.enabledDocumentTypes.length > 0
        ? emisor.enabledDocumentTypes
        : ['boleta', 'factura', 'nota_venta'],
      activo: emisor.activo !== false,
      series,
    })
  }

  async function buscarRuc() {
    const ruc = form.ruc.replace(/\D/g, '')
    if (ruc.length !== 11) {
      toast.error('El RUC debe tener 11 dígitos')
      return
    }
    setBuscandoRuc(true)
    try {
      const result = await consultarRUC(ruc)
      if (!result.success) {
        toast.error(result.error || 'No se encontraron datos para este RUC')
        return
      }
      const codigos = codigosDeUbigeo(result.data)
      setForm(f => ({
        ...f,
        ruc,
        businessName: result.data.razonSocial || f.businessName,
        tradeName: result.data.nombreComercial || f.tradeName,
        address: result.data.direccion || f.address,
        ...(codigos.departamento
          ? { department: codigos.departamento, province: codigos.provincia, district: codigos.distrito, ubigeo: ubigeoDeCodigos(codigos) }
          : {}),
      }))
      toast.success(`Datos encontrados: ${result.data.razonSocial}`)
    } catch (error) {
      console.error('Error al consultar el RUC:', error)
      toast.error('No se pudo consultar el RUC')
    } finally {
      setBuscandoRuc(false)
    }
  }

  const alternarTipo = (tipo, marcado) => {
    const actuales = form.enabledDocumentTypes || []
    set('enabledDocumentTypes', marcado ? [...new Set([...actuales, tipo])] : actuales.filter(t => t !== tipo))
  }

  const agregarCuenta = () => {
    if (!cuentaNueva.bank || !cuentaNueva.accountNumber.trim()) {
      toast.error('Ingresa el banco y el número de cuenta')
      return
    }
    set('bankAccountsList', [...form.bankAccountsList, { ...cuentaNueva, accountNumber: cuentaNueva.accountNumber.trim(), cci: cuentaNueva.cci.trim() }])
    setCuentaNueva(CUENTA_VACIA)
  }
  const quitarCuenta = indice => set('bankAccountsList', form.bankAccountsList.filter((_, i) => i !== indice))

  /** Lo que impide guardar, o null. Todo se revisa ANTES de escribir nada. */
  function problemaDelFormulario() {
    const ruc = form.ruc.replace(/\D/g, '')
    if (!validateRUC(ruc)) return 'RUC inválido: revisa que los 11 dígitos estén bien copiados'
    if (String(cuenta.ruc || '') === ruc) return 'Ese es el RUC principal de la cuenta; se configura en Emisión electrónica'
    if (emisores.some(e => e.id !== editando?.id && String(e.ruc) === ruc)) return 'Ese RUC ya está cargado como emisor'
    if (!form.businessName.trim()) return 'La razón social es obligatoria'
    for (const tipo of TIPOS_DE_SERIE_DE_EMISOR) {
      if (!serieValida(tipo, form.series[tipo])) {
        return `Serie de ${ETIQUETA_DE_SERIE[tipo].toLowerCase()}: cuatro caracteres, ${tipo.includes('boleta') ? 'empieza con B' : tipo === 'nota_venta' ? 'letras o números' : 'empieza con F'}`
      }
    }
    const repetidas = seriesRepetidas(
      TIPOS_DE_SERIE_DE_EMISOR.map(tipo => ({ tipo, serie: form.series[tipo] })),
      negocio,
      { salvo: editando?.id }
    )
    if (repetidas.length > 0) {
      return `Series repetidas: ${repetidas.map(r => `${r.serie} (${r.motivo})`).join('; ')}. Una serie pertenece a un solo RUC.`
    }
    const tipos = form.taxType === 'nrus' ? ['boleta', 'nota_venta'] : form.enabledDocumentTypes
    if (!tipos || tipos.length === 0) return 'Deja al menos un tipo de comprobante'
    return null
  }

  async function guardar() {
    const problema = problemaDelFormulario()
    if (problema) {
      toast.error(problema, 6000)
      return
    }
    // Cambiar una serie que ya emitió arranca otra numeración desde 1: se
    // avisa, porque no se deshace.
    const cambiadas = TIPOS_DE_SERIE_DE_EMISOR.filter(t => {
      const g = seriesGuardadas[t]
      return g && (g.lastNumber || 0) > 0 && g.serie !== form.series[t]
    })
    if (cambiadas.length > 0 && !window.confirm(
      `Vas a cambiar ${cambiadas.map(t => `${ETIQUETA_DE_SERIE[t]} (${seriesGuardadas[t].serie}, ya emitió ${seriesGuardadas[t].lastNumber})`).join(', ')}. La serie nueva empieza en 1. ¿Continuar?`
    )) return

    setGuardando(true)
    try {
      const emisorId = editando?.id || nuevoIdDeEmisor(cuenta.id)
      const secretosActuales = editando ? await getSecretosDeEmisor(cuenta.id, editando.id) : {}
      const ec = await emissionConfigDesdeForm(form, secretosActuales, archivoCertificado)
      const tipos = form.taxType === 'nrus' ? ['boleta', 'nota_venta'] : form.enabledDocumentTypes

      const datos = {
        ruc: form.ruc.replace(/\D/g, ''),
        businessName: form.businessName.trim(),
        tradeName: form.tradeName.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        department: nombreDe(DEPARTAMENTOS, form.department),
        province: nombreDe(PROVINCIAS[form.department], form.province),
        district: nombreDe(DISTRITOS[`${form.department}${form.province}`], form.district),
        ubigeo: form.ubigeo || '',
        bankAccountsList: form.bankAccountsList,
        emissionMethod: ec.method,
        emissionConfig: { method: ec.method, taxConfig: ec.taxConfig },
        enabledDocumentTypes: tipos,
        activo: form.activo !== false,
        orden: editando?.orden ?? emisores.length + 1,
      }
      const secretos = {
        sunat: ec.sunat,
        qpse: ec.qpse,
        emissionConfig: { qpse: ec.qpse, sunat: ec.sunat },
      }
      const result = await guardarEmisor(cuenta.id, emisorId, datos, secretos, form.series)
      if (!result.success) throw new Error(result.error || 'No se pudo guardar el emisor')
      toast.success(editando ? 'Emisor actualizado' : 'Emisor creado')
      await recargar()
      cerrarFormulario()
    } catch (error) {
      console.error('Error guardando el emisor:', error)
      toast.error(error.message || 'No se pudo guardar el emisor')
    } finally {
      setGuardando(false)
    }
  }

  async function alternarActivo(emisor) {
    const activar = emisor.activo === false
    if (!activar && !window.confirm(`¿Desactivar ${emisor.businessName}? Deja de aparecer en el POS; sus comprobantes se conservan.`)) return
    const result = await cambiarActivoDeEmisor(cuenta.id, emisor.id, activar)
    if (!result.success) {
      toast.error('No se pudo cambiar el estado')
      return
    }
    toast.success(activar ? 'Emisor activado' : 'Emisor desactivado')
    await recargar()
  }

  const activos = emisores.filter(e => e.activo !== false).length

  return (
    <Modal
      titulo="Emisores"
      subtitulo={`${cuenta.businessName} · ${activos + 1} RUC activo${activos + 1 === 1 ? '' : 's'}`}
      onClose={onClose}
      ancho="lg"
      pie={<Boton onClick={onClose}>Cerrar</Boton>}
    >
      <div className="space-y-3">
        <TarjetaEmisor
          nombre={cuenta.businessName}
          ruc={cuenta.ruc}
          esPrincipal
          nota="Es el negocio. Su emisión y sus series se configuran en Emisión electrónica y en Configuración › Series."
          datos={[
            ['Método', NOMBRE_DE_METODO[cuenta.emissionMethod] || cuenta.emissionMethod],
            ['Régimen', NOMBRE_DE_REGIMEN[cuenta.taxType] || cuenta.taxType],
          ]}
        />

        {cargando ? (
          <p className="text-[12.5px] text-gray-500 py-3">Cargando emisores…</p>
        ) : (
          emisores.map(em => (
            editando?.id === em.id ? (
              <Editor
                key={em.id}
                titulo={`Editar ${em.businessName || em.ruc}`}
                form={form}
                set={set}
                setSerie={setSerie}
                seriesGuardadas={seriesGuardadas}
                cambiarUbigeo={cambiarUbigeo}
                provincias={provincias}
                distritos={distritos}
                buscarRuc={buscarRuc}
                buscandoRuc={buscandoRuc}
                alternarTipo={alternarTipo}
                cuentaNueva={cuentaNueva}
                setCuentaNueva={setCuentaNueva}
                agregarCuenta={agregarCuenta}
                quitarCuenta={quitarCuenta}
                ver={ver}
                alternarVer={alternarVer}
                archivoCertificado={archivoCertificado}
                setArchivoCertificado={setArchivoCertificado}
                guardando={guardando}
                onGuardar={guardar}
                onCancelar={cerrarFormulario}
              />
            ) : (
              <TarjetaEmisor
                key={em.id}
                nombre={em.businessName}
                ruc={em.ruc}
                inactivo={em.activo === false}
                datos={[
                  ['Nombre comercial', em.tradeName],
                  ['Dirección', em.address],
                  ['Método', NOMBRE_DE_METODO[em.emissionMethod] || 'Sin configurar'],
                  ['Régimen', NOMBRE_DE_REGIMEN[em.emissionConfig?.taxConfig?.taxType] || 'General · IGV 18 %'],
                  ['Comprobantes', (em.enabledDocumentTypes || []).map(t => TIPOS_DE_COMPROBANTE.find(([v]) => v === t)?.[1] || t).join(', ')],
                  ['Series', TIPOS_DE_SERIE_DE_EMISOR.map(t => negocio?.emisorSeries?.[em.id]?.[t]?.serie).filter(Boolean).join(' · ')],
                  ['Cuentas', em.bankAccountsList?.length ? `${em.bankAccountsList.length}` : ''],
                ]}
                onEditar={() => abrirEdicion(em)}
                onAlternar={() => alternarActivo(em)}
                deshabilitado={formAbierto}
              />
            )
          ))
        )}

        {creando && (
          <Editor
            titulo="Nuevo RUC"
            form={form}
            set={set}
            setSerie={setSerie}
            seriesGuardadas={seriesGuardadas}
            cambiarUbigeo={cambiarUbigeo}
            provincias={provincias}
            distritos={distritos}
            buscarRuc={buscarRuc}
            buscandoRuc={buscandoRuc}
            alternarTipo={alternarTipo}
            cuentaNueva={cuentaNueva}
            setCuentaNueva={setCuentaNueva}
            agregarCuenta={agregarCuenta}
            quitarCuenta={quitarCuenta}
            ver={ver}
            alternarVer={alternarVer}
            archivoCertificado={archivoCertificado}
            setArchivoCertificado={setArchivoCertificado}
            guardando={guardando}
            onGuardar={guardar}
            onCancelar={cerrarFormulario}
          />
        )}

        {!cargando && !formAbierto && (
          <Boton variante="primario" onClick={abrirNuevo}>Agregar RUC</Boton>
        )}
      </div>
    </Modal>
  )
}

function TarjetaEmisor({ nombre, ruc, esPrincipal = false, inactivo = false, nota, datos = [], onEditar, onAlternar, deshabilitado = false }) {
  const filas = datos.filter(([, v]) => v)
  return (
    <div className={`rounded-md border p-3 ${inactivo ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[13px] font-medium truncate ${inactivo ? 'text-gray-500' : 'text-gray-900'}`}>
            {nombre || 'Sin razón social'}
            {esPrincipal && <span className="ml-1.5 text-[11.5px] font-normal text-gray-400">· principal</span>}
            {inactivo && <Pastilla className="ml-1.5">Inactivo</Pastilla>}
          </p>
          <p className="text-[12px] text-gray-500 tabular-nums">RUC {ruc || '—'}</p>
          {nota && <p className="mt-0.5 text-[11.5px] text-gray-500">{nota}</p>}
        </div>
        {!esPrincipal && (
          <div className="flex shrink-0 gap-1">
            <Boton tamano="sm" onClick={onEditar} disabled={deshabilitado}>Editar</Boton>
            <Boton tamano="sm" variante={inactivo ? 'secundario' : 'peligro'} onClick={onAlternar} disabled={deshabilitado}>
              {inactivo ? 'Activar' : 'Desactivar'}
            </Boton>
          </div>
        )}
      </div>
      {filas.length > 0 && (
        <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          {filas.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="flex gap-2 text-[12px] min-w-0">
              <dt className="w-28 shrink-0 text-gray-500">{etiqueta}</dt>
              <dd className="min-w-0 flex-1 text-gray-900 break-words">{valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

function Titulo({ children }) {
  return <p className="text-[12.5px] font-medium text-gray-900 border-b border-primary-100 pb-1">{children}</p>
}

function Editor({
  titulo, form, set, setSerie, seriesGuardadas, cambiarUbigeo, provincias, distritos, buscarRuc, buscandoRuc, alternarTipo,
  cuentaNueva, setCuentaNueva, agregarCuenta, quitarCuenta, ver, alternarVer, archivoCertificado, setArchivoCertificado,
  guardando, onGuardar, onCancelar,
}) {
  const esNrus = form.taxType === 'nrus'
  const tipos = esNrus ? ['boleta', 'nota_venta'] : form.enabledDocumentTypes || []

  return (
    <div className="rounded-md border border-primary-500 bg-primary-50 p-3 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-gray-900 truncate">{titulo}</p>
        <div className="flex shrink-0 gap-1">
          <Boton tamano="sm" onClick={onCancelar} disabled={guardando}>Cancelar</Boton>
          <Boton tamano="sm" variante="primario" onClick={onGuardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Boton>
        </div>
      </div>

      <div className="space-y-3">
        <Titulo>Identidad</Titulo>
        <Campo etiqueta="RUC" como="div">
          <div className="flex gap-2">
            <Entrada
              autoFocus
              inputMode="numeric"
              maxLength={11}
              value={form.ruc}
              onChange={e => set('ruc', e.target.value.replace(/\D/g, ''))}
              placeholder="20123456789"
              className="tabular-nums"
            />
            <Boton onClick={buscarRuc} disabled={buscandoRuc || form.ruc.length !== 11} className="shrink-0">
              {buscandoRuc ? 'Buscando…' : 'Buscar en SUNAT'}
            </Boton>
          </div>
        </Campo>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo etiqueta="Razón social">
            <Entrada value={form.businessName} onChange={e => set('businessName', e.target.value)} />
          </Campo>
          <Campo etiqueta="Nombre comercial (opcional)" ayuda="Sin uno propio, el comprobante lleva el nombre de la tienda.">
            <Entrada value={form.tradeName} onChange={e => set('tradeName', e.target.value)} />
          </Campo>
        </div>
        <Campo etiqueta="Dirección" ayuda="La del RUC en SUNAT. Sale en el XML y en el comprobante.">
          <Entrada value={form.address} onChange={e => set('address', e.target.value)} />
        </Campo>
        <div>
          <p className="mb-1 text-[12px] font-medium text-gray-700">
            Ubicación{form.ubigeo ? <span className="ml-2 font-normal text-gray-500">{form.ubigeo}</span> : null}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Selector value={form.department} onChange={e => cambiarUbigeo('department', e.target.value)}>
              <option value="">Departamento</option>
              {DEPARTAMENTOS.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
            </Selector>
            <Selector value={form.province} onChange={e => cambiarUbigeo('province', e.target.value)} disabled={!form.department}>
              <option value="">Provincia</option>
              {provincias.map(pr => <option key={pr.code} value={pr.code}>{pr.name}</option>)}
            </Selector>
            <Selector value={form.district} onChange={e => cambiarUbigeo('district', e.target.value)} disabled={!form.province}>
              <option value="">Distrito</option>
              {distritos.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
            </Selector>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo etiqueta="Teléfono (opcional)" ayuda="Vacío: el de la tienda.">
            <Entrada value={form.phone} onChange={e => set('phone', e.target.value)} />
          </Campo>
          <Campo etiqueta="Correo (opcional)" ayuda="Vacío: el de la tienda.">
            <Entrada type="email" value={form.email} onChange={e => set('email', e.target.value)} />
          </Campo>
        </div>
      </div>

      <div className="space-y-3">
        <Titulo>Cuentas bancarias</Titulo>
        <p className="text-[11.5px] text-gray-500">
          Son de este RUC y salen en sus facturas. Las del negocio no se heredan: si no cargas ninguna, la factura sale sin cuentas.
        </p>
        {form.bankAccountsList.length > 0 && (
          <ul className="divide-y divide-gray-200 rounded-md border border-gray-200 bg-white">
            {form.bankAccountsList.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[12px]">
                <span className="min-w-0 truncate">
                  <span className="font-medium text-gray-900">{c.bank}</span>
                  <span className="text-gray-500"> · {etiquetaTipoCuenta(c.accountType)} · {c.currency === 'USD' ? 'Dólares' : 'Soles'} · </span>
                  <span className="font-mono">{c.accountNumber}</span>
                  {c.cci && <span className="text-gray-500 font-mono"> · CCI {c.cci}</span>}
                </span>
                <Boton tamano="sm" variante="peligro" onClick={() => quitarCuenta(i)}>Quitar</Boton>
              </li>
            ))}
          </ul>
        )}
        {/* Cuenta nueva: en tres filas y con sus etiquetas. En una sola fila de
            seis los desplegables quedaban cortados ("Ban", "Cor", "Sol"). */}
        <div className="space-y-3 rounded-md border border-gray-200 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Campo etiqueta="Banco">
              <Selector value={cuentaNueva.bank} onChange={e => setCuentaNueva({ ...cuentaNueva, bank: e.target.value })}>
                <option value="">Elige el banco</option>
                {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
              </Selector>
            </Campo>
            <Campo etiqueta="Tipo de cuenta">
              <Selector value={cuentaNueva.accountType} onChange={e => setCuentaNueva({ ...cuentaNueva, accountType: e.target.value })}>
                {TIPOS_CUENTA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Selector>
            </Campo>
            <Campo etiqueta="Moneda">
              <Selector value={cuentaNueva.currency} onChange={e => setCuentaNueva({ ...cuentaNueva, currency: e.target.value })}>
                {MONEDAS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Selector>
            </Campo>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta="N° de cuenta">
              <Entrada value={cuentaNueva.accountNumber} onChange={e => setCuentaNueva({ ...cuentaNueva, accountNumber: e.target.value })} className="font-mono" />
            </Campo>
            <Campo etiqueta="CCI (opcional)">
              <Entrada value={cuentaNueva.cci} onChange={e => setCuentaNueva({ ...cuentaNueva, cci: e.target.value })} className="font-mono" />
            </Campo>
          </div>
          <div className="flex justify-end">
            <Boton onClick={agregarCuenta}>Agregar cuenta</Boton>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Titulo>Emisión</Titulo>
        <CamposDeEmision
          form={form}
          set={set}
          ver={ver}
          alternarVer={alternarVer}
          archivoCertificado={archivoCertificado}
          setArchivoCertificado={setArchivoCertificado}
          notaRegimen="Cuota fija mensual, no declara IGV. Las boletas salen como venta interna NRUS (0113), gravadas con IGV en cero. Este RUC queda solo con boleta y nota de venta."
        />
        {form.emissionMethod === 'none' && (
          <Aviso>Sin método de emisión, con este RUC solo se podrán emitir notas de venta.</Aviso>
        )}
        <div>
          <p className="mb-1 text-[12px] font-medium text-gray-700">Comprobantes que puede emitir</p>
          <div className="flex flex-wrap gap-4">
            {TIPOS_DE_COMPROBANTE.map(([valor, nombre]) => (
              <Casilla
                key={valor}
                etiqueta={nombre}
                checked={tipos.includes(valor)}
                disabled={esNrus && valor === 'factura'}
                onChange={e => alternarTipo(valor, e.target.checked)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Titulo>Series</Titulo>
        <p className="text-[11.5px] text-gray-500">
          Cuatro caracteres. Una serie pertenece a un solo RUC en toda la cuenta: no puede repetir las del negocio, de sus sucursales ni de otro emisor.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TIPOS_DE_SERIE_DE_EMISOR.map(tipo => {
            const guardada = seriesGuardadas[tipo]
            return (
              <Campo
                key={tipo}
                etiqueta={ETIQUETA_DE_SERIE[tipo]}
                ayuda={guardada && (guardada.lastNumber || 0) > 0 ? `${guardada.serie}: ya emitió ${guardada.lastNumber}` : undefined}
              >
                <Entrada
                  value={form.series[tipo] || ''}
                  maxLength={4}
                  onChange={e => setSerie(tipo, e.target.value)}
                  className="font-mono uppercase"
                />
              </Campo>
            )
          })}
        </div>
      </div>

      <Casilla
        etiqueta="Activo"
        ayuda="Inactivo no aparece en el POS. Los comprobantes ya emitidos siguen siendo suyos."
        checked={form.activo !== false}
        onChange={e => set('activo', e.target.checked)}
      />
    </div>
  )
}
