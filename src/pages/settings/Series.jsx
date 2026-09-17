/**
 * PESTAÑA "SERIES Y NUMERACIÓN" DE CONFIGURACIÓN.
 *
 * Las series de los diez tipos de comprobante de la sucursal principal (las
 * globales del negocio, campo `series` del documento) y las de cada sucursal
 * adicional (`branchSeries.{id}`), más el renumerador de comprobantes
 * rechazados por SUNAT.
 *
 * Salió de Settings.jsx con la lógica tal cual y dos cambios de forma:
 *   - La grilla de tipos de documento estaba escrita CUATRO veces (tarjetas
 *     para el celular + tabla para escritorio, por principal y por sucursal).
 *     Ahora es un solo `GrillaDeSeries` responsive.
 *   - El renumerador vivía en la pestaña Documentos detrás de un flag
 *     (`adminTools.enabled`) que nunca se encendía: era inalcanzable. Aquí
 *     lo abre el dueño o el administrador.
 */
import { useState, useEffect, Fragment } from 'react'
import { Edit, Loader2 } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { useGuardado } from '@/components/settings/useGuardado'
import { Seccion, Nota, Separador } from '@/components/settings/kit'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Card, { CardContent, CardHeader } from '@/components/ui/Card'
import { getAllBranchSeriesFS, updateBranchSeriesFS, getAllUserSeriesFS, updateUserSeriesFS, removeUserSeriesFS } from '@/services/firestoreService'
import { getActiveBranches } from '@/services/branchService'
import { getManagedUsers } from '@/services/userManagementService'
import RenumberInvoicesModal from '@/components/RenumberInvoicesModal'
import { duenoDeLaSerie, seriesRepetidas, serieValida, TIPOS_DE_SERIE_DE_EMISOR } from '../../../functions/src/utils/emisorDelComprobante.js'
import { actualizarSeriesDeEmisor } from '@/services/emisoresService'
import { numeroSiguiente } from '@/utils/serieParaNumerar'

// Series de un negocio nuevo. También son el piso de lectura: un tipo que no
// exista todavía en Firestore se muestra con esta serie y el contador en 0.
//
// Las notas de crédito decían FN01/BN01, que fue la convención hasta junio de
// 2026. En julio el alta de cuentas empezó a crearlas como FC01/BC01 y desde
// agosto es lo único que recibe una cuenta nueva (medido el 16-set-2026 sobre
// las 741 cuentas con NC configurada: FN 537 y FC 194, pero las FC son TODAS
// de julio en adelante — 43 en julio, 86 en agosto, 65 en setiembre, contra 10
// y 5 de FN). Mirando solo los totales parece que manda FN; es un promedio que
// tapa el cambio.
//
// Cambiar el piso NO toca a las 537 cuentas FN: ellas tienen el campo guardado
// y mandan sobre esta constante. Solo lo ven las que no tienen ese tipo, que
// son once en toda la base.
const defaultSeries = {
  factura: { serie: 'F001', lastNumber: 0 },
  boleta: { serie: 'B001', lastNumber: 0 },
  nota_venta: { serie: 'N001', lastNumber: 0 },
  cotizacion: { serie: 'C001', lastNumber: 0 },
  nota_credito_factura: { serie: 'FC01', lastNumber: 0 },
  nota_credito_boleta: { serie: 'BC01', lastNumber: 0 },
  nota_debito_factura: { serie: 'FD01', lastNumber: 0 },
  nota_debito_boleta: { serie: 'BD01', lastNumber: 0 },
  guia_remision: { serie: 'T001', lastNumber: 0 },
  guia_transportista: { serie: 'V001', lastNumber: 0 },
}

// Los diez tipos de comprobante en el orden en que se muestran, agrupados
// para que la grilla lleve sus subtítulos. Es la única lista: antes cada una
// de las cuatro copias de la grilla tenía la suya.
const GRUPOS_DE_DOCUMENTOS = [
  {
    titulo: null,
    tipos: [
      { key: 'factura', label: 'Factura Electrónica' },
      { key: 'boleta', label: 'Boleta de Venta' },
      { key: 'nota_venta', label: 'Nota de Venta' },
      { key: 'cotizacion', label: 'Cotización' },
    ],
  },
  {
    titulo: 'Notas de Crédito',
    tipos: [
      { key: 'nota_credito_factura', label: 'NC - Facturas' },
      { key: 'nota_credito_boleta', label: 'NC - Boletas' },
    ],
  },
  {
    titulo: 'Notas de Débito',
    tipos: [
      { key: 'nota_debito_factura', label: 'ND - Facturas' },
      { key: 'nota_debito_boleta', label: 'ND - Boletas' },
    ],
  },
  {
    titulo: 'Guías de Remisión',
    tipos: [
      { key: 'guia_remision', label: 'Guía de Remisión (Remitente)' },
      { key: 'guia_transportista', label: 'Guía de Remisión (Transportista)' },
    ],
  },
]

// "F001-00000013": el correlativo que llevará el próximo comprobante. El
// mismo cálculo que el cobro y que el "Siguiente:" del POS.
const getNextNumber = (serie, lastNumber) => numeroSiguiente({ serie, lastNumber })

// Las series con las que se propone una SUCURSAL nueva. Son las que el sistema
// viene usando (las sedes de JMC llevan F020/FC20 y F030/FC30); acá solo están
// escritas en un lugar, con el número 1, para que `serieConNumero` les ponga el
// de la sucursal sin que nadie vuelva a contar dígitos a mano.
const SERIES_DE_SUCURSAL = {
  factura: 'F001',
  boleta: 'B001',
  nota_venta: 'N001',
  cotizacion: 'C001',
  nota_credito_factura: 'FC01',
  nota_credito_boleta: 'BC01',
  nota_debito_factura: 'FD01',
  nota_debito_boleta: 'BD01',
  guia_remision: 'T001',
  guia_transportista: 'V001',
}

// "F001" con el número 2 → "F002"; "FC01" → "FC02". Una serie son CUATRO
// caracteres: las letras que la identifican y el resto en dígitos, así que el
// relleno depende de cuántas letras trae, no de un ancho fijo.
const serieConNumero = (base, n) => {
  const letras = String(base).replace(/[0-9]+$/, '')
  const digitos = Math.max(String(base).length - letras.length, 1)
  // Si el número no entra en los dígitos que quedan —"FC" solo deja dos, o
  // sea 99— se pasa a base 36, que SUNAT admite porque el formato es
  // alfanumérico (/^F[A-Z0-9]{3}$/). Sin esto, padStart NO recorta y el 100
  // devolvía "FC100", de cinco caracteres: el mismo bug que este helper vino
  // a arreglar, solo que más lejos.
  const cabe = String(n).length <= digitos
  const cuerpo = cabe ? String(n) : Number(n).toString(36).toUpperCase()
  return `${letras}${cuerpo.padStart(digitos, '0').slice(-digitos)}`
}

// Todas las series que ya están tomadas en la cuenta. Una serie no se puede
// repartir entre dos dueños: cada lugar lleva su propio `lastNumber`, así que
// la misma serie en dos sitios significa dos comprobantes con el mismo número
// — y SUNAT rechaza el segundo (código 1033).
const seriesOcupadas = ({ series, branchSeries, userSeries }, exceptoUid = null) => {
  const usadas = new Map()
  const anotar = (mapa, quien) => {
    for (const datos of Object.values(mapa || {})) {
      if (datos?.serie) usadas.set(String(datos.serie).toUpperCase(), quien)
    }
  }
  anotar(series, 'la sucursal principal')
  for (const mapa of Object.values(branchSeries || {})) anotar(mapa, 'otra sucursal')
  for (const [uid, mapa] of Object.entries(userSeries || {})) {
    if (uid !== exceptoUid) anotar(mapa, 'otra persona')
  }
  return usadas
}

// El primer juego de series libre: si la principal usa F001 y una sucursal
// F002, propone F003 y no una que vaya a chocar.
//
// Las letras salen de las series QUE EL NEGOCIO YA TIENE, no de una constante:
// si sus notas de crédito son FC01, se le propone FC02 y no FN02. Cada cuenta
// llegó con la convención de su época y no hay que imponerle otra.
const proponerSeriesLibres = (ocupadas, delNegocio = {}) => {
  for (let n = 1; n <= 999; n++) {
    const candidatas = Object.fromEntries(
      Object.entries(defaultSeries).map(([tipo, d]) => [
        tipo,
        { serie: serieConNumero(delNegocio?.[tipo]?.serie || d.serie, n), lastNumber: 0 },
      ])
    )
    const chocaAlguna = Object.values(candidatas).some((d) => ocupadas.has(d.serie.toUpperCase()))
    if (!chocaAlguna) return candidatas
  }
  return Object.fromEntries(Object.entries(defaultSeries).map(([tipo, d]) => [tipo, { ...d }]))
}

// Columnas de la grilla en escritorio: documento (lo que sobre), serie,
// último número, siguiente. En el celular cada fila se apila en 3 columnas
// con la etiqueta encima de cada celda.
const COLUMNAS = 'md:grid-cols-[minmax(0,1fr)_6rem_8rem_11rem]'

/**
 * La grilla de series de UNA sucursal (principal o adicional). Un solo
 * markup responsive: cabecera solo en escritorio, etiquetas por celda solo
 * en el celular. `onChange(docType, campo, valor)` es el contrato de los
 * dos handlers de cambio, que siguen siendo los de siempre.
 */
// `tiposPermitidos` recorta la grilla a los tipos que ese dueño puede tener: un
// RUC adicional lleva los siete comprobantes de venta y ninguna guía, así que
// sin este filtro se le ofrecerían casillas que al guardar se descartan.
function GrillaDeSeries({ series, editando, onChange, soloLasQueTiene = false, tiposPermitidos = null }) {
  const claseInput = editando ? '' : 'bg-gray-50'
  return (
    <div>
      <div className={`hidden md:grid ${COLUMNAS} gap-3 px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50 rounded-md`}>
        <span>Documento</span>
        <span>Serie</span>
        <span>Último número</span>
        <span>Siguiente</span>
      </div>
      {GRUPOS_DE_DOCUMENTOS.map((grupo) => {
        // Las de otro RUC se muestran tal cual: sin proponerle las que no tiene.
        const delDueno = tiposPermitidos ? grupo.tipos.filter(({ key }) => tiposPermitidos.includes(key)) : grupo.tipos
        const tipos = soloLasQueTiene ? delDueno.filter(({ key }) => series[key]?.serie) : delDueno
        if (tipos.length === 0) return null
        return (
        <Fragment key={grupo.titulo || 'principales'}>
          {grupo.titulo && (
            <p className="px-3 pt-4 pb-1 text-xs font-semibold text-gray-500">{grupo.titulo}</p>
          )}
          {tipos.map(({ key, label }) => {
            const serie = series[key]?.serie || defaultSeries[key].serie
            const lastNumber = series[key]?.lastNumber ?? 0
            return (
              <div
                key={key}
                className={`grid grid-cols-3 ${COLUMNAS} gap-2 md:gap-3 md:items-center px-3 py-3 md:py-2 border-b border-gray-100 last:border-b-0`}
              >
                <span className="col-span-3 md:col-span-1 text-sm font-medium text-gray-700">{label}</span>
                <div>
                  <span className="md:hidden block text-xs text-gray-500 mb-1">Serie</span>
                  <Input
                    value={serie}
                    onChange={(e) => onChange(key, 'serie', e.target.value)}
                    disabled={!editando}
                    className={claseInput}
                    maxLength={4}
                  />
                </div>
                <div>
                  <span className="md:hidden block text-xs text-gray-500 mb-1">Último número</span>
                  <Input
                    type="number"
                    min="0"
                    value={lastNumber}
                    onChange={(e) => onChange(key, 'lastNumber', e.target.value)}
                    disabled={!editando}
                    className={claseInput}
                  />
                </div>
                <div>
                  <span className="md:hidden block text-xs text-gray-500 mb-1">Siguiente</span>
                  <span className="block font-mono text-sm text-gray-600 py-2 truncate">
                    {getNextNumber(serie, lastNumber)}
                  </span>
                </div>
              </div>
            )
          })}
        </Fragment>
        )
      })}
    </div>
  )
}

/**
 * Editar / Cancelar + Guardar de una tarjeta. Los mismos tres botones para
 * la principal y para cada sucursal; solo cambia quién guarda.
 */
function BotonesDeEdicion({ editando, guardando, onEditar, onCancelar, onGuardar, etiqueta = 'Editar series' }) {
  if (!editando) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={onEditar} className="w-full sm:w-auto">
        <Edit className="w-4 h-4 mr-1.5" />
        {etiqueta}
      </Button>
    )
  }
  return (
    <div className="flex gap-2 w-full sm:w-auto">
      <Button type="button" variant="outline" size="sm" onClick={onCancelar} disabled={guardando} className="flex-1 sm:flex-none">
        Cancelar
      </Button>
      <Button type="button" size="sm" onClick={onGuardar} disabled={guardando} className="flex-1 sm:flex-none">
        {guardando ? (
          <>
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            Guardando...
          </>
        ) : (
          'Guardar'
        )}
      </Button>
    </div>
  )
}

/** Un RUC del selector de arriba: el principal y cada RUC adicional. */
function PastillaDeRuc({ activa, onClick, titulo, subtitulo }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
        activa ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <span className={`block max-w-[240px] truncate text-sm font-medium ${activa ? 'text-primary-900' : 'text-gray-900'}`}>
        {titulo}
      </span>
      <span className={`block text-xs ${activa ? 'text-primary-700' : 'text-gray-500'}`}>{subtitulo}</span>
    </button>
  )
}

export default function Series() {
  const { user, getBusinessId, isDemoMode, businessSettings, isBusinessOwner, isAdmin, emisores } = useAppContext()
  const toast = useToast()
  const { guardar, guardando } = useGuardado()

  // Solo lectura aquí: el nombre de la principal se edita en su propia pestaña.
  const mainBranchName = businessSettings?.mainBranchName || 'Sucursal Principal'

  // Series de la sucursal principal. Arrancan con la copia del contexto para
  // pintar algo real de inmediato; `recargarSeries` trae la del servidor al
  // montar y antes de cada edición.
  const [series, setSeries] = useState(() => ({ ...defaultSeries, ...(businessSettings?.series || {}) }))
  const [editingSeries, setEditingSeries] = useState(false)

  // Series por sucursal
  const [branches, setBranches] = useState([])
  const [branchSeries, setBranchSeries] = useState({})
  const [editingBranchId, setEditingBranchId] = useState(null)
  const [loadingBranches, setLoadingBranches] = useState(false)
  // El guardado de una sucursal va por `updateBranchSeriesFS`, no por
  // `guardar` (escribe `branchSeries.{id}`, no `series`), así que lleva su
  // propio "guardando".
  const [isSaving, setIsSaving] = useState(false)

  const [showRenumberModal, setShowRenumberModal] = useState(false)

  // Varios RUC: las series de los otros RUC de la cuenta. Las configura el
  // administrador en la ficha; aquí se consultan y se cuidan.
  const [emisorSeries, setEmisorSeries] = useState(() => businessSettings?.emisorSeries || {})

  // Series por persona: para dos que venden desde el MISMO punto de venta y
  // cada una emite con su serie. Antes solo se lograba creando una sucursal
  // por persona, y los reportes quedaban partidos por locales inventados.
  const [personas, setPersonas] = useState([])
  const [userSeries, setUserSeries] = useState({})
  const [editingUserId, setEditingUserId] = useState(null)

  // Una serie es de UN solo RUC en toda la cuenta: si la del negocio o la de
  // una sede ya la usa otro RUC, sus correlativos se pisarían y el servidor
  // no dejaría firmar esos comprobantes.
  const serieDeOtroRuc = (mapa) => {
    for (const datos of Object.values(mapa || {})) {
      const dueno = duenoDeLaSerie(datos?.serie, { emisorSeries })
      if (dueno) {
        const emisor = (emisores || []).find(e => e.id === dueno.emisorId)
        const quien = emisor ? `${emisor.businessName} (RUC ${emisor.ruc})` : 'otro RUC de la cuenta'
        return `La serie ${String(datos.serie).toUpperCase()} ya la usa ${quien}. Elige otra.`
      }
    }
    return null
  }

  /**
   * Las personas de la cuenta y lo que cada una tenga asignado.
   *
   * El DUEÑO va primero y no es un caso aparte: cuando emite, el comprobante
   * queda con `createdBy` igual al id del negocio, así que se le asigna una
   * serie igual que a cualquiera. Es lo que permite el caso más común — el
   * dueño con la suya y un empleado con otra — sin crear dos sub-usuarios.
   */
  const loadUsersAndSeries = async () => {
    if (!user?.uid || isDemoMode) return
    const businessId = getBusinessId()
    try {
      const [usuarios, asignadas] = await Promise.all([
        getManagedUsers(businessId),
        getAllUserSeriesFS(businessId),
      ])
      const subUsuarios = usuarios.success ? (usuarios.data || []) : []
      setPersonas([
        { id: businessId, nombre: 'Dueño de la cuenta', detalle: businessSettings?.email || '', esDueno: true },
        ...subUsuarios.map((u) => ({
          // `uid || id`, la misma convención que `useUserNames`: la serie se
          // guarda bajo la llave que el comprobante grabará en `createdBy`. Si
          // se guardara bajo otra, la persona seguiría emitiendo con la del
          // negocio y no habría ningún error a la vista.
          id: u.uid || u.id,
          nombre: u.displayName || u.name || u.email || 'Usuario',
          detalle: u.email || '',
          inactivo: u.isActive === false,
        })),
      ])
      if (asignadas.success) setUserSeries(asignadas.data || {})
    } catch (error) {
      console.error('Error al cargar las personas y sus series:', error)
    }
  }

  // Cargar sucursales y sus series
  const loadBranchesAndSeries = async () => {
    if (!user?.uid || isDemoMode) return

    setLoadingBranches(true)
    try {
      // Cargar sucursales activas
      const branchesResult = await getActiveBranches(getBusinessId())
      if (branchesResult.success) {
        setBranches(branchesResult.data || [])
      }

      // Cargar series por sucursal
      const seriesResult = await getAllBranchSeriesFS(getBusinessId())
      if (seriesResult.success) {
        setBranchSeries(seriesResult.data || {})
      }
    } catch (error) {
      console.error('Error al cargar sucursales y series:', error)
    } finally {
      setLoadingBranches(false)
    }
  }

  // Vuelve a leer las series del servidor. Se llama al montar, al entrar en
  // edición, al cancelar y al cerrar el renumerador, porque `series` vive en
  // memoria desde que se abrió la pestaña: si mientras tanto se renumeró un
  // correlativo o se emitió un comprobante desde otra caja, guardar el
  // objeto entero devolvía el contador a su valor viejo y el siguiente
  // comprobante salía repetido. Rechazo de SUNAT por un botón de
  // Configuración.
  const recargarSeries = async () => {
    if (!user?.uid || isDemoMode) return
    try {
      const snap = await getDoc(doc(db, 'businesses', getBusinessId()))
      const guardadas = snap.exists() ? snap.data()?.series : null
      if (guardadas) setSeries(prev => ({ ...prev, ...guardadas }))
      if (snap.exists()) setEmisorSeries(snap.data()?.emisorSeries || {})
    } catch (error) {
      console.error('Error al recargar series:', error)
    }
  }

  // Al montar: la copia fresca de las series globales y las sucursales con
  // las suyas. La dependencia es el id del negocio y no `user`: para un
  // sub-usuario `getBusinessId()` devuelve su propio uid hasta que llegan
  // los permisos con el ownerId, y colgado de `user` se quedaba con la
  // lectura del documento equivocado.
  const businessId = getBusinessId()
  useEffect(() => {
    if (!businessId || isDemoMode) return
    recargarSeries()
    loadBranchesAndSeries()
    loadUsersAndSeries()
    // Los dos cargadores son funciones del componente: como dependencias
    // correrían en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId])

  // Manejar cambio de serie de sucursal
  const handleBranchSeriesChange = (branchId, docType, field, value) => {
    setBranchSeries(prev => ({
      ...prev,
      [branchId]: {
        ...defaultSeries,
        ...(prev[branchId] || {}),
        [docType]: {
          ...(prev[branchId]?.[docType] || defaultSeries[docType]),
          [field]: field === 'lastNumber' ? parseInt(value) || 0 : value.toUpperCase()
        }
      }
    }))
  }

  // Guardar series de una sucursal
  const handleSaveBranchSeries = async (branchId) => {
    if (!user?.uid) return

    const choque = serieDeOtroRuc(branchSeries[branchId] || defaultSeries)
    if (choque) {
      toast.error(choque)
      return
    }

    setIsSaving(true)
    try {
      const seriesToSave = branchSeries[branchId] || defaultSeries
      const result = await updateBranchSeriesFS(getBusinessId(), branchId, seriesToSave)

      if (result.success) {
        toast.success('Series de la sucursal actualizadas')
        setEditingBranchId(null)
      } else {
        toast.error(result.error || 'Error al guardar series')
      }
    } catch (error) {
      console.error('Error al guardar series:', error)
      toast.error('Error al guardar series')
    } finally {
      setIsSaving(false)
    }
  }

  // Inicializar series de una sucursal si no existen
  const initializeBranchSeries = (branchId, branchIndex) => {
    if (!branchSeries[branchId]) {
      // Las series de la sucursal, a partir de su índice. El relleno sale de
      // `serieConNumero` y NO de un padStart fijo: con tres dígitos, las de
      // dos letras salían de CINCO caracteres —"FC001", "BC001", "FD001",
      // "BD001"— y una serie son cuatro. `serieValida` las rechaza
      // (nota_credito_factura: /^F[A-Z0-9]{3}$/), así que eran cuatro de las
      // diez propuestas inválidas para SUNAT. Las sucursales de JMC están a
      // mano en FC20 y FC30, que es la forma correcta.
      const newSeries = Object.fromEntries(
        Object.entries(SERIES_DE_SUCURSAL).map(([tipo, base]) => [
          tipo,
          { serie: serieConNumero(base, branchIndex + 1), lastNumber: 0 },
        ])
      )
      setBranchSeries(prev => ({
        ...prev,
        [branchId]: newSeries
      }))
    }
    setEditingBranchId(branchId)
  }

  const handleUserSeriesChange = (uid, docType, field, value) => {
    setUserSeries(prev => ({
      ...prev,
      [uid]: {
        ...(prev[uid] || {}),
        [docType]: {
          ...(prev[uid]?.[docType] || defaultSeries[docType]),
          [field]: field === 'lastNumber' ? parseInt(value) || 0 : value.toUpperCase()
        }
      }
    }))
  }

  // Le propone a esta persona el primer juego de series que no choque con
  // nada de la cuenta.
  const initializeUserSeries = (uid) => {
    if (!userSeries[uid]) {
      const ocupadas = seriesOcupadas({ series, branchSeries, userSeries }, uid)
      setUserSeries(prev => ({ ...prev, [uid]: proponerSeriesLibres(ocupadas, series) }))
    }
    setEditingUserId(uid)
  }

  const handleSaveUserSeries = async (uid) => {
    if (!user?.uid) return
    const suyas = userSeries[uid] || {}

    const choque = serieDeOtroRuc(suyas)
    if (choque) {
      toast.error(choque)
      return
    }

    // Que no repita una serie que ya lleva su propio contador en otro lado:
    // el mismo número saldría dos veces y SUNAT rechazaría el segundo.
    const ocupadas = seriesOcupadas({ series, branchSeries, userSeries }, uid)
    for (const datos of Object.values(suyas)) {
      const dueno = datos?.serie ? ocupadas.get(String(datos.serie).toUpperCase()) : null
      if (dueno) {
        toast.error(
          `La serie ${String(datos.serie).toUpperCase()} ya la usa ${dueno}. ` +
          'Ponle otra, o deja a esta persona sin serie propia para que emita con esa misma.'
        )
        return
      }
    }

    setIsSaving(true)
    try {
      const result = await updateUserSeriesFS(getBusinessId(), uid, suyas)
      if (result.success) {
        toast.success('Series de la persona actualizadas')
        setEditingUserId(null)
      } else {
        toast.error(result.error || 'Error al guardar series')
      }
    } catch (error) {
      console.error('Error al guardar las series de la persona:', error)
      toast.error('Error al guardar series')
    } finally {
      setIsSaving(false)
    }
  }

  // Quitarle la serie propia: vuelve a emitir con la de su sucursal o la del
  // negocio. No borra nada emitido; solo deja de numerar por su cuenta.
  const handleRemoveUserSeries = async (uid) => {
    setIsSaving(true)
    try {
      const result = await removeUserSeriesFS(getBusinessId(), uid)
      if (result.success) {
        setUserSeries(prev => {
          const copia = { ...prev }
          delete copia[uid]
          return copia
        })
        setEditingUserId(null)
        toast.success('Esta persona vuelve a emitir con las series del negocio')
      } else {
        toast.error(result.error || 'Error al quitar las series')
      }
    } catch (error) {
      console.error('Error al quitar las series de la persona:', error)
      toast.error('Error al quitar las series')
    } finally {
      setIsSaving(false)
    }
  }

  // Escribe SOLO `series` (la regla de `useGuardado`). El hook corta en
  // modo demo, refresca el contexto y avisa con el toast.
  const handleSaveSeries = async () => {
    if (!user?.uid) return
    const choque = serieDeOtroRuc(series)
    if (choque) {
      toast.error(choque)
      return
    }
    const ok = await guardar({ series }, 'Series actualizadas')
    if (ok) setEditingSeries(false)
  }

  // ── Series de los otros RUC de la cuenta ────────────────────────────────
  // El admin las deja configuradas al dar de alta el RUC, pero el dueño tiene
  // que poder corregirlas igual que las suyas y las de sus sucursales: si SUNAT
  // le rechaza una tanda y hay que reanudar en otro correlativo, esperar a que
  // se lo cambien desde afuera le cuesta el día de trabajo.
  const [editandoEmisorId, setEditandoEmisorId] = useState(null)

  // Con varios RUC, el primer nivel de la página es DE CUÁL son las series que
  // se están mirando: cada uno numera por su cuenta y verlos todos en una sola
  // lista larga se presta a tocar la serie equivocada. Con un solo RUC no hay
  // selector y la página queda exactamente como siempre.
  const [rucElegido, setRucElegido] = useState('principal')
  const hayOtrosRuc = Object.keys(emisorSeries).length > 0
  // Si el RUC elegido desaparece (lo quitaron mientras estaba abierto), se
  // vuelve al principal en vez de dejar la pantalla vacía.
  const viendoElPrincipal = !hayOtrosRuc || rucElegido === 'principal' || !emisorSeries[rucElegido]
  const emisorElegido = (emisores || []).find(e => e.id === rucElegido) || null

  const handleEmisorSeriesChange = (eid, tipo, campo, valor) => {
    setEmisorSeries(prev => ({
      ...prev,
      [eid]: {
        ...(prev[eid] || {}),
        [tipo]: {
          ...(prev[eid]?.[tipo] || { serie: '', lastNumber: 0 }),
          [campo]: campo === 'lastNumber' ? parseInt(valor) || 0 : valor.toUpperCase(),
        },
      },
    }))
  }

  const handleSaveEmisorSeries = async (eid) => {
    if (!user?.uid) return
    const suyas = emisorSeries[eid] || {}
    const lista = TIPOS_DE_SERIE_DE_EMISOR
      .map(tipo => ({ tipo, serie: suyas[tipo]?.serie }))
      .filter(({ serie }) => String(serie || '').trim())

    const malFormada = lista.find(({ tipo, serie }) => !serieValida(tipo, serie))
    if (malFormada) {
      toast.error(`La serie ${String(malFormada.serie).toUpperCase()} no sirve: son cuatro caracteres, y las de factura empiezan con F y las de boleta con B.`)
      return
    }
    // Contra toda la cuenta: el negocio, sus sucursales, sus almacenes y los
    // demás RUC (`seriesRepetidas`), y aparte las personas con serie propia,
    // que `duenoDeLaSerie` no mira. `salvo` deja fuera las suyas de ahora.
    const repetidas = seriesRepetidas(
      lista,
      { series, branchSeries, warehouseSeries: businessSettings?.warehouseSeries, emisorSeries },
      { salvo: eid }
    )
    if (repetidas.length > 0) {
      toast.error(`La serie ${repetidas[0].serie} ${repetidas[0].motivo}. Elige otra.`)
      return
    }
    const dePersonas = seriesOcupadas({ userSeries })
    const choque = lista.find(({ serie }) => dePersonas.has(String(serie).toUpperCase()))
    if (choque) {
      toast.error(`La serie ${String(choque.serie).toUpperCase()} ya la usa otra persona de la cuenta. Elige otra.`)
      return
    }

    setIsSaving(true)
    try {
      const r = await actualizarSeriesDeEmisor(getBusinessId(), eid, suyas)
      if (r.success) {
        toast.success('Series actualizadas')
        setEditandoEmisorId(null)
      } else {
        toast.error(r.error || 'No se pudieron guardar las series')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleSeriesChange = (type, field, value) => {
    setSeries(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: field === 'lastNumber' ? parseInt(value) || 0 : value,
      },
    }))
  }

  return (
    <div className="space-y-8">
      {hayOtrosRuc && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">¿De qué RUC son las series?</p>
          <div className="flex flex-wrap gap-2">
            <PastillaDeRuc
              activa={viendoElPrincipal}
              onClick={() => { setRucElegido('principal'); setEditandoEmisorId(null) }}
              titulo={businessSettings?.businessName || 'RUC principal'}
              subtitulo={`RUC ${businessSettings?.ruc || '—'} · principal`}
            />
            {Object.keys(emisorSeries).map(eid => {
              const emisor = (emisores || []).find(e => e.id === eid)
              return (
                <PastillaDeRuc
                  key={eid}
                  activa={!viendoElPrincipal && rucElegido === eid}
                  onClick={() => { setRucElegido(eid); setEditandoEmisorId(null) }}
                  titulo={emisor?.businessName || 'RUC adicional'}
                  subtitulo={`RUC ${emisor?.ruc || '—'}${emisor?.activo === false ? ' · desactivado' : ''}`}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Sucursal principal: las series globales del negocio */}
      {viendoElPrincipal && (
      <Seccion
        id="opcion-series"
        titulo="Sucursal principal"
        descripcion={`Las series globales del negocio: con ellas emite ${mainBranchName}. Cada sucursal adicional tiene las suyas, más abajo.`}
      >
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold text-gray-900 truncate">{mainBranchName}</p>
              <p className="text-xs text-gray-500 mt-0.5">Series globales del negocio</p>
            </div>
            <BotonesDeEdicion
              editando={editingSeries}
              guardando={guardando}
              // Se releen antes de editar y al cancelar (que antes se quedaba
              // con lo tipeado): ver `recargarSeries`.
              onEditar={async () => { await recargarSeries(); setEditingSeries(true) }}
              onCancelar={async () => { setEditingSeries(false); await recargarSeries() }}
              onGuardar={handleSaveSeries}
            />
          </CardHeader>
          <CardContent className="px-1 sm:px-3">
            <GrillaDeSeries series={series} editando={editingSeries} onChange={handleSeriesChange} />
          </CardContent>
        </Card>
      </Seccion>
      )}

      {viendoElPrincipal && loadingBranches && (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando sucursales...
        </p>
      )}

      {/* Sucursales adicionales: cada una con sus propias series */}
      {viendoElPrincipal && !loadingBranches && branches.length > 0 && (
        <>
          <Separador />
          <Seccion
            id="opcion-branchSeries"
            titulo="Sucursales adicionales"
            descripcion="Cada sucursal emite con sus propias series, independientes de las globales."
          >
            <div className="space-y-4">
              {branches.map((branch, index) => {
                const bSeries = branchSeries[branch.id] || {}
                const isEditing = editingBranchId === branch.id

                return (
                  <Card key={branch.id}>
                    <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-gray-900 truncate">{branch.name}</p>
                        {branch.address && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{branch.address}</p>
                        )}
                      </div>
                      <BotonesDeEdicion
                        editando={isEditing}
                        guardando={isSaving}
                        onEditar={() => initializeBranchSeries(branch.id, index)}
                        // Cancelar recarga del servidor: descarta lo tipeado y
                        // las series propuestas a una sucursal que no tenía.
                        onCancelar={() => { setEditingBranchId(null); loadBranchesAndSeries() }}
                        onGuardar={() => handleSaveBranchSeries(branch.id)}
                      />
                    </CardHeader>
                    <CardContent className="px-1 sm:px-3">
                      <GrillaDeSeries
                        series={bSeries}
                        editando={isEditing}
                        onChange={(docType, field, value) => handleBranchSeriesChange(branch.id, docType, field, value)}
                      />
                      {!isEditing && !bSeries.factura && (
                        <div className="mt-3 px-2">
                          <Nota>
                            Esta sucursal todavía no tiene series: emite con las globales. Al pulsar
                            "Editar series" se le proponen unas; revísalas para que no repitan las
                            de otra sucursal antes de guardar.
                          </Nota>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </Seccion>
        </>
      )}

      {/* Series por persona. Quien no tiene asignada nada no muestra grilla:
          con doce personas en la cuenta, doce grillas de series que no usa
          tapan a las dos que sí importan. */}
      {viendoElPrincipal && personas.length > 0 && (
        <>
          <Separador />
          <Seccion
            id="opcion-userSeries"
            titulo="Series por persona"
            descripcion="Para que dos personas emitan con series distintas desde el mismo punto de venta. Quien no tenga una asignada emite con la de su sucursal, o con la del negocio."
          >
            <div className="space-y-4">
              {personas.map((persona) => {
                const suyas = userSeries[persona.id] || {}
                const tieneSerie = Boolean(suyas.factura?.serie)
                const isEditing = editingUserId === persona.id

                return (
                  <Card key={persona.id}>
                    <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-gray-900 truncate">
                          {persona.nombre}
                          {persona.inactivo && <span className="font-normal text-gray-500"> · desactivado</span>}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {persona.esDueno ? 'Dueño de la cuenta' : persona.detalle}
                        </p>
                      </div>
                      <div className="flex gap-2 w-full sm:w-auto">
                        {tieneSerie && !isEditing && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isSaving}
                            onClick={() => handleRemoveUserSeries(persona.id)}
                            className="flex-1 sm:flex-none"
                          >
                            Quitar
                          </Button>
                        )}
                        <BotonesDeEdicion
                          editando={isEditing}
                          guardando={isSaving}
                          etiqueta={tieneSerie ? 'Editar series' : 'Asignarle una serie'}
                          onEditar={() => initializeUserSeries(persona.id)}
                          // Cancelar relee del servidor: descarta lo tipeado y
                          // la propuesta a quien todavía no tenía nada.
                          onCancelar={() => { setEditingUserId(null); loadUsersAndSeries() }}
                          onGuardar={() => handleSaveUserSeries(persona.id)}
                        />
                      </div>
                    </CardHeader>
                    {(tieneSerie || isEditing) && (
                      <CardContent className="px-1 sm:px-3">
                        <GrillaDeSeries
                          series={suyas}
                          editando={isEditing}
                          onChange={(docType, field, value) => handleUserSeriesChange(persona.id, docType, field, value)}
                        />
                      </CardContent>
                    )}
                    {!tieneSerie && !isEditing && (
                      <CardContent className="px-1 sm:px-3">
                        <div className="px-2 pb-1">
                          <Nota>
                            Sin serie propia: emite con las de su sucursal, o con las globales del negocio.
                          </Nota>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                )
              })}
            </div>
          </Seccion>
        </>
      )}

      {/* El RUC elegido arriba, cuando no es el principal. Un RUC adicional no
          tiene sucursales ni personas con serie propia: emite siempre con
          estas, así que su pantalla es una sola tarjeta. */}
      {!viendoElPrincipal && (
        <Seccion
          id="opcion-emisorSeries"
          titulo={emisorElegido?.businessName || 'Otro RUC de la cuenta'}
          descripcion="Este RUC numera con sus propias series y ninguna se puede repetir en la cuenta. Las guías de remisión y las cotizaciones salen siempre con el RUC principal."
        >
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-semibold text-gray-900 truncate">{emisorElegido?.businessName || 'RUC adicional'}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  RUC {emisorElegido?.ruc || '—'}{emisorElegido?.activo === false ? ' · desactivado' : ''}
                </p>
              </div>
              <BotonesDeEdicion
                editando={editandoEmisorId === rucElegido}
                guardando={isSaving}
                onEditar={async () => { await recargarSeries(); setEditandoEmisorId(rucElegido) }}
                onCancelar={async () => { setEditandoEmisorId(null); await recargarSeries() }}
                onGuardar={() => handleSaveEmisorSeries(rucElegido)}
              />
            </CardHeader>
            <CardContent className="px-1 sm:px-3">
              {/* Editando salen los siete comprobantes de venta, aunque este
                  RUC no tenga alguno todavía; de solo mirar, solo los que
                  tiene, para no ofrecer casillas vacías. */}
              <GrillaDeSeries
                series={emisorSeries[rucElegido] || {}}
                editando={editandoEmisorId === rucElegido}
                onChange={(tipo, campo, valor) => handleEmisorSeriesChange(rucElegido, tipo, campo, valor)}
                soloLasQueTiene={editandoEmisorId !== rucElegido}
                tiposPermitidos={TIPOS_DE_SERIE_DE_EMISOR}
              />
            </CardContent>
          </Card>
          <Nota>
            Las sucursales y las personas con serie propia numeran solo con el RUC principal. Lo que se venda con
            este RUC sale siempre con estas series, lo emita quien lo emita y desde donde lo emita.
          </Nota>
        </Seccion>
      )}

      {/* Renumerador: solo el dueño o el administrador. Antes estaba en
          Documentos detrás de `adminTools.enabled`, que nunca se encendía. */}
      {(isBusinessOwner || isAdmin) && (
        <>
          <Separador />
          <Seccion
            id="renumerar-comprobantes"
            titulo="Renumerar comprobantes rechazados"
            descripcion="Para cuando SUNAT rechaza comprobantes porque su serie y número ya existían."
          >
            <Nota>
              Busca comprobantes rechazados o atascados (y los aceptados que SUNAT reportó como
              duplicados), les asigna una serie nueva con numeración correlativa y los vuelve a
              enviar. Al terminar mueve el último número de esa serie; por eso, al cerrar la
              herramienta, las series de arriba se releen del servidor. Es solo para corregir
              rechazos: no sirve para cambiar la numeración de comprobantes aceptados.
            </Nota>
            <div className="flex justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => setShowRenumberModal(true)}>
                Abrir renumerador
              </Button>
            </div>
          </Seccion>
        </>
      )}

      <RenumberInvoicesModal
        isOpen={showRenumberModal}
        // Recarga al cerrar: el modal acaba de mover `lastNumber` en
        // Firestore y la copia en memoria de esta pestaña quedó vieja.
        onClose={() => { setShowRenumberModal(false); recargarSeries() }}
      />
    </div>
  )
}
