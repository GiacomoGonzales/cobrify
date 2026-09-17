import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cargarCuentas } from '@/services/adminCuentasService'
import { PLANS } from '@/services/subscriptionService'
import { estadoDelRuc } from '@/utils/cobroPorRuc'
import { buildSearchHaystack, matchesPrebuilt } from '@/lib/utils'
import {
  Pagina, Seccion, Tabla, Th, Td, Fila, FilaVacia, Filtros, FiltroSelect, Buscador, Boton, Pastilla,
} from '@/components/admin/ui'

// TODOS LOS RUC ADICIONALES DE TODAS LAS CUENTAS, en una sola lista.
//
// Un RUC adicional cobrado aparte vence por su cuenta, y hasta ahora eso solo
// se veia entrando a la ficha de la cuenta: con un cliente era llevadero, con
// varios habria que recordar de memoria a quien le toca. Aca sale cada RUC con
// su cuenta, su mensualidad, hasta cuando esta al dia y cuantos comprobantes
// lleva del mes; ordenado por lo que urge cobrar.
//
// Tambien lista los RUC que NO se cobran aparte (van incluidos en el plan de su
// cuenta) y los que nunca se pagaron, que son justamente los que se escapan.

const ESTADOS = {
  sin_pagar: { etiqueta: 'Sin pago registrado', tono: 'rojo', orden: 0 },
  vencido: { etiqueta: 'Vencido', tono: 'rojo', orden: 1 },
  por_vencer: { etiqueta: 'Por vencer', tono: 'neutro', orden: 2 },
  al_dia: { etiqueta: 'Al día', tono: 'neutro', orden: 3 },
  incluido: { etiqueta: 'Incluido en el plan', tono: 'punteado', orden: 4 },
}

const moneda = v => `S/ ${(Number(v) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const entero = v => (Number(v) || 0).toLocaleString('es-PE')
const aFecha = v => (v?.toDate ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : null)
const fecha = d => (aFecha(d) ? aFecha(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

/** Una fila por cada RUC adicional de cada cuenta, ya con su situacion. */
function filasDeRucs(cuentas) {
  const filas = []
  cuentas.forEach(c => {
    (c.emisores || []).forEach(e => {
      const cobro = c.cobroPorRuc ? c.rucsCobrados?.[e.id] || null : null
      const { clave, dias } = c.cobroPorRuc ? estadoDelRuc(cobro) : { clave: 'incluido', dias: null }
      filas.push({
        id: `${c.id}:${e.id}`,
        cuentaId: c.id,
        cuenta: c.businessName || '—',
        email: c.email || '',
        ruc: e.ruc,
        empresa: e.businessName || 'Sin nombre',
        activo: e.activo,
        cobro,
        clave,
        dias,
        // El cupo es del RUC: el tope de SU plan y SU contador del mes.
        usados: c.usoPorRuc?.[e.id] || 0,
        tope: cobro ? PLANS[cobro.plan]?.limits?.maxInvoicesPerMonth : undefined,
        // Lo que aporta al mes: un plan de 3 meses aporta su tercera parte.
        alMes: cobro && clave !== 'vencido' ? (Number(cobro.precio) || 0) / (Number(cobro.meses) || 1) : 0,
        buscable: buildSearchHaystack(
          e.ruc, String(e.ruc || '').replace(/\D/g, ''), e.businessName,
          c.businessName, c.email, c.ruc, c.codigoCliente,
        ),
      })
    })
  })
  // Primero lo que hay que cobrar, y dentro de cada grupo lo mas urgente.
  return filas.sort((a, b) =>
    ESTADOS[a.clave].orden - ESTADOS[b.clave].orden
    || (aFecha(a.cobro?.vence)?.getTime() || 0) - (aFecha(b.cobro?.vence)?.getTime() || 0)
    || a.empresa.localeCompare(b.empresa)
  )
}

export default function AdminRucs() {
  const [cargando, setCargando] = useState(true)
  const [cuentas, setCuentas] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [situacion, setSituacion] = useState('all')

  const cargar = async () => {
    setCargando(true)
    try {
      const { cuentas } = await cargarCuentas()
      setCuentas(cuentas)
    } catch (error) {
      console.error('Error al cargar los RUC:', error)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const todas = useMemo(() => filasDeRucs(cuentas), [cuentas])

  const filas = useMemo(() => todas.filter(f => {
    if (situacion === 'cobrar' && !['sin_pagar', 'vencido', 'por_vencer'].includes(f.clave)) return false
    if (situacion !== 'all' && situacion !== 'cobrar' && f.clave !== situacion) return false
    if (busqueda && !matchesPrebuilt(busqueda, f.buscable)) return false
    return true
  }), [todas, situacion, busqueda])

  const alMes = filas.reduce((s, f) => s + f.alMes, 0)
  const porCobrar = filas.filter(f => ['sin_pagar', 'vencido', 'por_vencer'].includes(f.clave)).length
  const cuantasCuentas = new Set(filas.map(f => f.cuentaId)).size
  const hayFiltros = Boolean(busqueda) || situacion !== 'all'

  const resumen = cargando
    ? 'Cargando RUC…'
    : `${filas.length} RUC adicional${filas.length === 1 ? '' : 'es'} en ${cuantasCuentas} cuenta${cuantasCuentas === 1 ? '' : 's'}`
      + ` · ${moneda(alMes)} al mes`
      + (porCobrar ? ` · ${porCobrar} por cobrar` : '')
      + (hayFiltros ? ` · de ${todas.length} en total` : '')

  function exportarCSV() {
    const cabeceras = ['RUC', 'Empresa', 'Cuenta', 'Correo', 'Situación', 'Plan', 'Mensualidad', 'Vence', 'Último pago', 'Comprobantes del mes']
    const filasCsv = filas.map(f => [
      f.ruc,
      f.empresa,
      f.cuenta,
      f.email,
      ESTADOS[f.clave].etiqueta,
      f.cobro?.planName || f.cobro?.plan || '',
      f.cobro ? f.cobro.precio : '',
      f.cobro?.vence ? fecha(f.cobro.vence) : '',
      f.cobro?.ultimoPago ? fecha(f.cobro.ultimoPago) : '',
      f.usados,
    ])
    const csv = [cabeceras, ...filasCsv].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `rucs_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Pagina
      resumen={resumen}
      acciones={
        <>
          <Boton tamano="sm" onClick={cargar} disabled={cargando}>{cargando ? 'Cargando…' : 'Recargar'}</Boton>
          <Boton tamano="sm" onClick={exportarCSV} disabled={filas.length === 0}>Exportar CSV</Boton>
        </>
      }
    >
      <Filtros>
        <Buscador ancho="w-full sm:w-80" placeholder="RUC, empresa, cuenta…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <FiltroSelect value={situacion} onChange={e => setSituacion(e.target.value)}>
          <option value="all">Situación</option>
          <option value="cobrar">Por cobrar</option>
          <option value="sin_pagar">Sin pago registrado</option>
          <option value="vencido">Vencidos</option>
          <option value="por_vencer">Vencen en 5 días</option>
          <option value="al_dia">Al día</option>
          <option value="incluido">Incluidos en el plan</option>
        </FiltroSelect>
        {hayFiltros && (
          <button type="button" onClick={() => { setBusqueda(''); setSituacion('all') }} className="h-8 px-2 text-[12.5px] text-gray-500 hover:text-gray-900">
            Limpiar
          </button>
        )}
      </Filtros>

      <Seccion sinRelleno className="overflow-hidden">
        {/* En el celular, una tarjeta por RUC: la tabla de ocho columnas no entra. */}
        <div className="sm:hidden divide-y divide-gray-100">
          {cargando ? (
            <p className="px-3 py-8 text-center text-[12.5px] text-gray-500">Cargando RUC…</p>
          ) : filas.length === 0 ? (
            <p className="px-3 py-8 text-center text-[12.5px] text-gray-500">Ningún RUC coincide con los filtros</p>
          ) : (
            filas.map(f => (
              <Link key={f.id} to={`/app/admin/users/${f.cuentaId}`} className="block px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gray-900">{f.empresa}</div>
                    <div className="truncate text-[11.5px] text-gray-500 tabular-nums">{f.ruc} · {f.cuenta}</div>
                  </div>
                  <Pastilla tono={ESTADOS[f.clave].tono} className="shrink-0">{ESTADOS[f.clave].etiqueta}</Pastilla>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-gray-500">
                  {f.cobro && <span>{f.cobro.planName || f.cobro.plan} · {moneda(f.cobro.precio)}</span>}
                  {f.cobro?.vence && <span className={f.clave === 'vencido' ? 'text-red-600 font-medium' : ''}>{f.clave === 'vencido' ? 'Venció' : 'Al día hasta'} {fecha(f.cobro.vence)}</span>}
                  <span className="tabular-nums">{entero(f.usados)}{typeof f.tope === 'number' && f.tope !== -1 ? ` de ${entero(f.tope)}` : ''} este mes</span>
                </div>
              </Link>
            ))
          )}
        </div>

        <div className="hidden sm:block">
          <Tabla>
            <thead>
              <tr>
                <Th ancho={130}>RUC</Th>
                <Th>Empresa</Th>
                <Th>Cuenta</Th>
                <Th>Situación</Th>
                <Th>Mensualidad</Th>
                <Th>Vence</Th>
                <Th alinear="der">Este mes</Th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <FilaVacia colSpan={7}>Cargando RUC…</FilaVacia>
              ) : filas.length === 0 ? (
                <FilaVacia colSpan={7}>Ningún RUC coincide con los filtros</FilaVacia>
              ) : (
                filas.map(f => (
                  <Fila key={f.id} apagada={f.activo === false}>
                    <Td className="tabular-nums">{f.ruc}</Td>
                    <Td className="font-medium whitespace-normal max-w-[240px]">
                      {f.empresa}
                      {f.activo === false && <span className="text-gray-400 font-normal"> · inactivo</span>}
                    </Td>
                    <Td className="max-w-[220px]">
                      <Link to={`/app/admin/users/${f.cuentaId}`} className="block truncate font-medium hover:underline">{f.cuenta}</Link>
                      <span className="block truncate text-[11.5px] text-gray-500">{f.email}</span>
                    </Td>
                    <Td>
                      <Pastilla tono={ESTADOS[f.clave].tono}>{ESTADOS[f.clave].etiqueta}</Pastilla>
                    </Td>
                    <Td apagado className="whitespace-normal">
                      {f.cobro ? `${f.cobro.planName || f.cobro.plan} · ${moneda(f.cobro.precio)}` : 'El plan de la cuenta'}
                    </Td>
                    <Td apagado className="whitespace-normal">
                      {f.cobro?.vence ? (
                        <>
                          <span className={f.clave === 'vencido' ? 'font-medium text-red-600' : ''}>{fecha(f.cobro.vence)}</span>
                          {f.clave === 'por_vencer' && (
                            <span className="block text-[11.5px] text-amber-700">{f.dias === 0 ? 'vence hoy' : `quedan ${f.dias} d`}</span>
                          )}
                        </>
                      ) : '—'}
                    </Td>
                    <Td numero apagado>
                      {entero(f.usados)}{typeof f.tope === 'number' && f.tope !== -1 ? ` de ${entero(f.tope)}` : ''}
                    </Td>
                  </Fila>
                ))
              )}
            </tbody>
          </Tabla>
        </div>
      </Seccion>
    </Pagina>
  )
}
