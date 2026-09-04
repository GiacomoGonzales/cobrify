/**
 * SUMINISTROS (cobranza de servicios).
 *
 * El padrón: quién paga, por qué medidor y en qué orden se camina el pueblo.
 *
 * ── Por qué el maestro es el suministro y no el cliente ─────────────────────
 * En el padrón real hay titulares con dos y tres medidores —la casa, la tienda,
 * el taller— y cada uno se lee, se cobra y se reclama por separado. Si el
 * maestro fuera el cliente habría que inventar un sub-registro para el segundo
 * medidor; así, cada medidor es una fila y el nombre se repite, que es
 * exactamente como el negocio lo viene llevando.
 *
 * ── Los observados ──────────────────────────────────────────────────────────
 * La importación no rechaza filas incompletas: las marca. Un suministro sin
 * número igual consume y se le cobra, y frenar la cobranza de 179 casas por 13
 * datos faltantes sería peor. El filtro "Para revisar" los junta para irlos
 * corrigiendo sin buscarlos.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search, Plus, Upload, Loader2, Pencil, Gauge, Coins, AlertTriangle, Power,
} from 'lucide-react'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import GuideLink from '@/components/guide/GuideLink'
import ImportSuppliesModal from '@/components/ImportSuppliesModal'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import {
  getSupplies, createSupply, updateSupply, deactivateSupply,
} from '@/services/serviceBillingService'
import { CON_MEDIDOR, SIN_MEDIDOR, r2 } from '@/utils/cobranzaServicios'
import { buildSearchHaystack, matchesPrebuilt } from '@/lib/utils'

const soles = (n) => `S/ ${(Number(n) || 0).toFixed(2)}`

const VACIO = {
  tipo: CON_MEDIDOR,
  nombre: '',
  documento: '',
  telefono: '',
  numeroSuministro: '',
  direccion: '',
  referencia: '',
  orden: '',
  cuotaFija: '',
  ultimaLectura: '',
  notas: '',
}

export default function ServiceSupplies() {
  const { getBusinessId, isDemoMode } = useAppContext()
  const toast = useToast()

  const [cargando, setCargando] = useState(true)
  const [suministros, setSuministros] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todos')   // todos | medidor | fijo | revisar
  const [mostrarImportar, setMostrarImportar] = useState(false)
  const [editando, setEditando] = useState(null)  // null | { ...datos, id? }
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    const businessId = getBusinessId()
    if (!businessId) return
    setCargando(true)
    const r = await getSupplies(businessId)
    if (r.success) setSuministros(r.data)
    else toast.error('No se pudieron cargar los suministros')
    setCargando(false)
    // `toast` fuera de las dependencias a propósito: el provider devuelve un
    // objeto nuevo en cada render, así que un error acá mostraría un toast, que
    // recrearía `cargar`, que volvería a cargar y a fallar. Bucle infinito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getBusinessId])

  useEffect(() => { cargar() }, [cargar])

  /** Lo que le falta a un suministro para poder cobrarle sin dudas. */
  const observacionesDe = useCallback((s) => {
    const faltas = []
    if (s.tipo === CON_MEDIDOR) {
      if (!s.numeroSuministro) faltas.push('Sin N° de suministro')
      if (s.ultimaLectura === null || s.ultimaLectura === undefined) faltas.push('Sin lectura inicial')
    } else if (!(Number(s.cuotaFija) > 0)) {
      faltas.push('Sin cuota mensual')
    }
    if (!s.direccion) faltas.push('Sin dirección para el recibo')
    return faltas
  }, [])

  // Los números repetidos se detectan sobre TODO el padrón, no fila por fila:
  // el importador solo ve el archivo que se sube, y un número puede chocar con
  // uno cargado a mano meses después.
  const repetidos = useMemo(() => {
    const cuenta = new Map()
    for (const s of suministros) {
      const n = String(s.numeroSuministro || '').trim()
      if (n) cuenta.set(n, (cuenta.get(n) || 0) + 1)
    }
    return new Set([...cuenta.entries()].filter(([, c]) => c > 1).map(([n]) => n))
  }, [suministros])

  const filas = useMemo(() => suministros.map(s => {
    const faltas = observacionesDe(s)
    if (s.numeroSuministro && repetidos.has(String(s.numeroSuministro).trim())) {
      faltas.push('N° de suministro repetido')
    }
    return { ...s, faltas }
  }), [suministros, observacionesDe, repetidos])

  const pajar = useMemo(() => {
    const m = new Map()
    for (const s of suministros) {
      m.set(s.id, buildSearchHaystack(s.nombre, s.numeroSuministro, s.referencia, s.direccion, s.documento, s.telefono))
    }
    return m
  }, [suministros])

  const visibles = useMemo(() => {
    let lista = filas
    if (filtro === 'medidor') lista = lista.filter(s => s.tipo === CON_MEDIDOR)
    else if (filtro === 'fijo') lista = lista.filter(s => s.tipo === SIN_MEDIDOR)
    else if (filtro === 'revisar') lista = lista.filter(s => s.faltas.length > 0)
    const q = busqueda.trim()
    if (!q) return lista
    return lista.filter(s => matchesPrebuilt(q, pajar.get(s.id)))
  }, [filas, filtro, busqueda, pajar])

  const resumen = useMemo(() => ({
    total: filas.length,
    conMedidor: filas.filter(s => s.tipo === CON_MEDIDOR).length,
    sinMedidor: filas.filter(s => s.tipo === SIN_MEDIDOR).length,
    porRevisar: filas.filter(s => s.faltas.length > 0).length,
    cuotasFijas: r2(filas.filter(s => s.tipo === SIN_MEDIDOR).reduce((a, s) => a + (Number(s.cuotaFija) || 0), 0)),
  }), [filas])

  // ───────────────────────────────────────────────────────── alta y edición

  const abrirNuevo = () => setEditando({ ...VACIO, orden: String(suministros.length + 1) })

  const abrirEdicion = (s) => setEditando({
    id: s.id,
    tipo: s.tipo || CON_MEDIDOR,
    nombre: s.nombre || '',
    documento: s.documento || '',
    telefono: s.telefono || '',
    numeroSuministro: s.numeroSuministro || '',
    direccion: s.direccion || '',
    referencia: s.referencia || '',
    orden: s.orden === null || s.orden === undefined ? '' : String(s.orden),
    cuotaFija: s.cuotaFija ? String(s.cuotaFija) : '',
    ultimaLectura: s.ultimaLectura === null || s.ultimaLectura === undefined ? '' : String(s.ultimaLectura),
    notas: s.notas || '',
    activo: s.activo,
  })

  const guardar = async () => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    if (!editando?.nombre.trim()) { toast.error('Falta el nombre del usuario'); return }
    const businessId = getBusinessId()
    if (!businessId) return

    setGuardando(true)
    const datos = {
      ...editando,
      orden: editando.orden === '' ? null : Number(editando.orden),
      cuotaFija: editando.tipo === SIN_MEDIDOR ? Number(editando.cuotaFija) || 0 : 0,
      ultimaLectura: editando.tipo === CON_MEDIDOR
        ? (editando.ultimaLectura === '' ? 0 : Number(editando.ultimaLectura))
        : null,
    }
    const r = editando.id
      ? await updateSupply(businessId, editando.id, datos)
      : await createSupply(businessId, datos)
    setGuardando(false)

    if (!r.success) { toast.error(r.error || 'No se pudo guardar'); return }
    toast.success(editando.id ? 'Suministro actualizado' : 'Suministro agregado')
    setEditando(null)
    cargar()
  }

  const darDeBaja = async (s) => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    const businessId = getBusinessId()
    if (!businessId) return
    // No se borra: sus recibos de meses anteriores tienen que seguir existiendo.
    const r = await deactivateSupply(businessId, s.id)
    if (!r.success) { toast.error('No se pudo dar de baja'); return }
    toast.success(`${s.nombre} dado de baja. Sus recibos anteriores se conservan.`)
    setEditando(null)
    cargar()
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Cargando suministros...</p>
        </div>
      </div>
    )
  }

  const esMedidor = editando?.tipo === CON_MEDIDOR

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900">Suministros</h1>
          <GuideLink />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setMostrarImportar(true)} disabled={isDemoMode}>
            <Upload className="w-4 h-4 mr-2" />
            Importar padrón
          </Button>
          <Button onClick={abrirNuevo} disabled={isDemoMode}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo suministro
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600">
        <span>Total <strong className="ml-1 text-base text-gray-900 tabular-nums">{resumen.total}</strong></span>
        <span>Con medidor <strong className="ml-1 text-base text-gray-900 tabular-nums">{resumen.conMedidor}</strong></span>
        <span>Cuota fija <strong className="ml-1 text-base text-gray-900 tabular-nums">{resumen.sinMedidor}</strong></span>
        <span>Cuotas al mes <strong className="ml-1 text-base text-gray-900 tabular-nums">{soles(resumen.cuotasFijas)}</strong></span>
        {resumen.porRevisar > 0 && (
          <span className="sm:ml-auto">
            Para revisar <strong className="ml-1 text-base text-amber-600 tabular-nums">{resumen.porRevisar}</strong>
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, suministro o referencia"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="flex bg-gray-100 rounded-md p-0.5">
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'medidor', label: 'Con medidor' },
            { id: 'fijo', label: 'Cuota fija' },
            { id: 'revisar', label: `Para revisar (${resumen.porRevisar})` },
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              className={`px-3 py-1 text-sm font-semibold rounded-[5px] transition-colors ${
                filtro === f.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0 divide-y divide-gray-100">
          {visibles.length === 0 && (
            <div className="px-4 py-12 text-center">
              <p className="text-gray-500">
                {suministros.length === 0
                  ? 'Todavía no hay suministros.'
                  : 'Ninguno coincide con la búsqueda.'}
              </p>
              {suministros.length === 0 && (
                <p className="text-sm text-gray-400 mt-1">
                  Importa el Excel con el que llevas la cobranza y se cargan todos de una vez.
                </p>
              )}
            </div>
          )}
          {visibles.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="w-8 shrink-0 text-sm text-gray-400 tabular-nums">{s.orden ?? '—'}</span>
              <span
                className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-md ${
                  s.tipo === CON_MEDIDOR ? 'bg-sky-50 text-sky-600' : 'bg-gray-100 text-gray-500'
                }`}
                title={s.tipo === CON_MEDIDOR ? 'Con medidor' : 'Cuota fija'}
              >
                {s.tipo === CON_MEDIDOR ? <Gauge className="w-4 h-4" /> : <Coins className="w-4 h-4" />}
              </span>

              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 leading-snug truncate">{s.nombre}</p>
                <p className="text-xs text-gray-500 truncate">
                  {s.numeroSuministro || 'Sin N° de suministro'}
                  {s.referencia && <span> · {s.referencia}</span>}
                </p>
              </div>

              {s.faltas.length > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-md chip-aviso"
                  title={s.faltas.join(' · ')}
                >
                  <AlertTriangle className="w-3 h-3" />
                  {s.faltas.length === 1 ? s.faltas[0] : `${s.faltas.length} pendientes`}
                </span>
              )}

              <div className="text-right w-28 shrink-0">
                <span className="block text-[11px] text-gray-500">
                  {s.tipo === CON_MEDIDOR ? 'Última lectura' : 'Cuota mensual'}
                </span>
                <span className="block font-semibold text-gray-900 tabular-nums">
                  {s.tipo === CON_MEDIDOR
                    ? (s.ultimaLectura ?? '—')
                    : soles(s.cuotaFija)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => abrirEdicion(s)}
                className="w-9 h-9 shrink-0 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                title="Editar"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      <ImportSuppliesModal
        isOpen={mostrarImportar}
        onClose={() => setMostrarImportar(false)}
        onImported={cargar}
        direccionPorDefecto={suministros.find(s => s.direccion)?.direccion || ''}
      />

      <Modal
        isOpen={!!editando}
        onClose={() => setEditando(null)}
        title={editando?.id ? 'Editar suministro' : 'Nuevo suministro'}
      >
        {editando && (
          <div className="space-y-4">
            <div className="flex bg-gray-100 rounded-md p-0.5">
              {[
                { id: CON_MEDIDOR, label: 'Con medidor' },
                { id: SIN_MEDIDOR, label: 'Cuota fija' },
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setEditando(e => ({ ...e, tipo: t.id }))}
                  className={`flex-1 px-3 py-1.5 text-sm font-semibold rounded-[5px] transition-colors ${
                    editando.tipo === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Usuario *</span>
              <input
                type="text" autoFocus
                value={editando.nombre}
                onChange={(e) => setEditando(v => ({ ...v, nombre: e.target.value }))}
                placeholder="Apellidos, Nombre"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">
                  {esMedidor ? 'N° de suministro' : 'N° de suministro (opcional)'}
                </span>
                <input
                  type="text"
                  value={editando.numeroSuministro}
                  onChange={(e) => setEditando(v => ({ ...v, numeroSuministro: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">Orden de ruta</span>
                <input
                  type="number" inputMode="numeric" min="1"
                  value={editando.orden}
                  onChange={(e) => setEditando(v => ({ ...v, orden: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-right tabular-nums focus:ring-2 focus:ring-primary-500"
                />
              </label>
            </div>

            {esMedidor ? (
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">Última lectura</span>
                <input
                  type="number" inputMode="decimal" step="0.1" min="0"
                  value={editando.ultimaLectura}
                  onChange={(e) => setEditando(v => ({ ...v, ultimaLectura: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-right tabular-nums focus:ring-2 focus:ring-primary-500"
                />
                <span className="block text-xs text-gray-500 mt-1">
                  Es la que marca el medidor hoy. El mes que viene se usa como lectura anterior.
                </span>
              </label>
            ) : (
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">Cuota mensual (S/)</span>
                <input
                  type="number" inputMode="decimal" step="0.10" min="0"
                  value={editando.cuotaFija}
                  onChange={(e) => setEditando(v => ({ ...v, cuotaFija: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-right tabular-nums focus:ring-2 focus:ring-primary-500"
                />
              </label>
            )}

            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Dirección (sale en el recibo)</span>
              <input
                type="text"
                value={editando.direccion}
                onChange={(e) => setEditando(v => ({ ...v, direccion: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
              />
            </label>

            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Referencia (para ubicar la casa)</span>
              <input
                type="text"
                value={editando.referencia}
                onChange={(e) => setEditando(v => ({ ...v, referencia: e.target.value }))}
                placeholder="Tienda 1, Carretera, 3-Jun"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
              />
              <span className="block text-xs text-gray-500 mt-1">
                Solo para ti: no se imprime en el recibo.
              </span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">DNI</span>
                <input
                  type="text" inputMode="numeric"
                  value={editando.documento}
                  onChange={(e) => setEditando(v => ({ ...v, documento: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">Teléfono</span>
                <input
                  type="tel" inputMode="tel"
                  value={editando.telefono}
                  onChange={(e) => setEditando(v => ({ ...v, telefono: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                />
              </label>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              {editando.id && editando.activo !== false ? (
                <button
                  type="button"
                  onClick={() => darDeBaja(editando)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
                >
                  <Power className="w-4 h-4" />
                  Dar de baja
                </button>
              ) : <span />}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
                <Button onClick={guardar} disabled={guardando}>
                  {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
