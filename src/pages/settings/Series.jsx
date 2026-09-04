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
import { getAllBranchSeriesFS, updateBranchSeriesFS } from '@/services/firestoreService'
import { getActiveBranches } from '@/services/branchService'
import RenumberInvoicesModal from '@/components/RenumberInvoicesModal'

// Series de un negocio nuevo. También son el piso de lectura: un tipo que no
// exista todavía en Firestore se muestra con esta serie y el contador en 0.
const defaultSeries = {
  factura: { serie: 'F001', lastNumber: 0 },
  boleta: { serie: 'B001', lastNumber: 0 },
  nota_venta: { serie: 'N001', lastNumber: 0 },
  cotizacion: { serie: 'C001', lastNumber: 0 },
  nota_credito_factura: { serie: 'FN01', lastNumber: 0 },
  nota_credito_boleta: { serie: 'BN01', lastNumber: 0 },
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

// "F001-00000013": el correlativo que llevará el próximo comprobante.
const getNextNumber = (serie, lastNumber) => {
  return `${serie}-${String(lastNumber + 1).padStart(8, '0')}`
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
function GrillaDeSeries({ series, editando, onChange }) {
  const claseInput = editando ? '' : 'bg-gray-50'
  return (
    <div>
      <div className={`hidden md:grid ${COLUMNAS} gap-3 px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50 rounded-md`}>
        <span>Documento</span>
        <span>Serie</span>
        <span>Último número</span>
        <span>Siguiente</span>
      </div>
      {GRUPOS_DE_DOCUMENTOS.map((grupo) => (
        <Fragment key={grupo.titulo || 'principales'}>
          {grupo.titulo && (
            <p className="px-3 pt-4 pb-1 text-xs font-semibold text-gray-500">{grupo.titulo}</p>
          )}
          {grupo.tipos.map(({ key, label }) => {
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
      ))}
    </div>
  )
}

/**
 * Editar / Cancelar + Guardar de una tarjeta. Los mismos tres botones para
 * la principal y para cada sucursal; solo cambia quién guarda.
 */
function BotonesDeEdicion({ editando, guardando, onEditar, onCancelar, onGuardar }) {
  if (!editando) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={onEditar} className="w-full sm:w-auto">
        <Edit className="w-4 h-4 mr-1.5" />
        Editar series
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

export default function Series() {
  const { user, getBusinessId, isDemoMode, businessSettings, isBusinessOwner, isAdmin } = useAppContext()
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
      // Generar series únicas basadas en el índice de la sucursal
      const suffix = String(branchIndex + 1).padStart(3, '0')
      const newSeries = {
        factura: { serie: `F${suffix}`, lastNumber: 0 },
        boleta: { serie: `B${suffix}`, lastNumber: 0 },
        nota_venta: { serie: `N${suffix}`, lastNumber: 0 },
        cotizacion: { serie: `C${suffix}`, lastNumber: 0 },
        nota_credito_factura: { serie: `FC${suffix}`, lastNumber: 0 },
        nota_credito_boleta: { serie: `BC${suffix}`, lastNumber: 0 },
        nota_debito_factura: { serie: `FD${suffix}`, lastNumber: 0 },
        nota_debito_boleta: { serie: `BD${suffix}`, lastNumber: 0 },
        guia_remision: { serie: `T${suffix}`, lastNumber: 0 },
        guia_transportista: { serie: `V${suffix}`, lastNumber: 0 },
      }
      setBranchSeries(prev => ({
        ...prev,
        [branchId]: newSeries
      }))
    }
    setEditingBranchId(branchId)
  }

  // Escribe SOLO `series` (la regla de `useGuardado`). El hook corta en
  // modo demo, refresca el contexto y avisa con el toast.
  const handleSaveSeries = async () => {
    if (!user?.uid) return
    const ok = await guardar({ series }, 'Series actualizadas')
    if (ok) setEditingSeries(false)
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
      {/* Sucursal principal: las series globales del negocio */}
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

      {loadingBranches && (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando sucursales...
        </p>
      )}

      {/* Sucursales adicionales: cada una con sus propias series */}
      {!loadingBranches && branches.length > 0 && (
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
