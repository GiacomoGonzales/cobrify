import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { registrarPagoDeRuc } from '@/services/adminCuentasService'
import { textoDelCobro } from '@/utils/cobroPorRuc'
import { matchesPrebuilt } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import PagoDeRucModal from '@/components/admin/cuenta/PagoDeRucModal'
import { ESTADOS, filasDeRucs } from './filasDeRucs'
import {
  Pagina, Seccion, Tabla, Th, Td, Fila, FilaVacia, Filtros, FiltroSelect, Buscador, Boton, Pastilla,
  useMenuDeFila, CajaMenu, ItemMenu,
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
//
// Es una pestaña de Usuarios y no una pagina suelta (17-set-2026, a pedido de
// Giacomo): usa las cuentas que Usuarios ya cargo, y el pago se registra desde
// aca mismo con el boton azul, igual que en la ficha.

const moneda = v => `S/ ${(Number(v) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const entero = v => (Number(v) || 0).toLocaleString('es-PE')
const aFecha = v => (v?.toDate ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : null)
const fecha = d => (aFecha(d) ? aFecha(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

/**
 * @param cuentas       las de Usuarios, ya con sus RUC (`adjuntarEmisores`)
 * @param onCuentaCambiada (id, cuenta => cambios): pone al dia una cuenta de la lista
 * @param pestanas      el selector de pestañas, que va debajo del resumen
 */
export default function RucsAdicionales({ cuentas, cargando, onRecargar, onCuentaCambiada, pestanas }) {
  const toast = useToast()
  const [busqueda, setBusqueda] = useState('')
  const [situacion, setSituacion] = useState('all')
  const menuPago = useMenuDeFila()
  const [aPagar, setAPagar] = useState(null)
  const [procesando, setProcesando] = useState(false)

  const todas = useMemo(() => filasDeRucs(cuentas), [cuentas])

  const filas = useMemo(() => todas.filter(f => {
    if (situacion === 'cobrar' && !f.porCobrar) return false
    if (situacion !== 'all' && situacion !== 'cobrar' && f.clave !== situacion) return false
    if (busqueda && !matchesPrebuilt(busqueda, f.buscable)) return false
    return true
  }), [todas, situacion, busqueda])

  // El desplegable de pago lista lo que se ve: si buscas una cuenta, salen
  // solo sus RUC. Los incluidos en el plan no pagan aparte y los apagados no
  // emiten, asi que no estan.
  const pagables = filas.filter(f => f.activo !== false && f.clave !== 'incluido')

  const alMes = filas.reduce((s, f) => s + f.alMes, 0)
  const porCobrar = filas.filter(f => f.porCobrar).length
  const cuantasCuentas = new Set(filas.map(f => f.cuenta.id)).size
  const hayFiltros = Boolean(busqueda) || situacion !== 'all'

  const resumen = cargando
    ? 'Cargando RUC…'
    : `${filas.length} RUC adicional${filas.length === 1 ? '' : 'es'} en ${cuantasCuentas} cuenta${cuantasCuentas === 1 ? '' : 's'}`
      + ` · ${moneda(alMes)} al mes`
      + (porCobrar ? ` · ${porCobrar} por cobrar` : '')
      + (hayFiltros ? ` · de ${todas.length} en total` : '')

  const vacia = todas.length === 0 ? 'Ninguna cuenta tiene RUC adicionales' : 'Ningún RUC coincide con los filtros'

  async function registrarPago({ planId, monto, metodo }) {
    const { cuenta, emisor } = aPagar
    setProcesando(true)
    try {
      const r = await registrarPagoDeRuc(cuenta.id, emisor, { planId, monto, metodo })
      // La fila se pone al dia con lo mismo que se guardo, sin recargar las
      // cientos de cuentas de la lista.
      onCuentaCambiada(cuenta.id, c => ({
        rucsCobrados: { ...c.rucsCobrados, [emisor.id]: r.cobro },
        usoPorRuc: { ...c.usoPorRuc, [emisor.id]: 0 },
      }))
      toast.success(`Pago del RUC registrado: al día hasta el ${r.vence.toLocaleDateString('es-PE')}`)
      setAPagar(null)
    } catch (error) {
      console.error('Error registrando el pago del RUC:', error)
      toast.error(error.message || 'No se pudo registrar el pago')
    } finally {
      setProcesando(false)
    }
  }

  function exportarCSV() {
    const cabeceras = ['RUC', 'Empresa', 'Cuenta', 'Correo', 'Situación', 'Plan', 'Mensualidad', 'Vence', 'Último pago', 'Comprobantes del mes']
    const filasCsv = filas.map(f => [
      f.ruc,
      f.empresa,
      f.cuenta.businessName || '',
      f.cuenta.email || '',
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
          {/* Igual que en la ficha: primero de que empresa es el pago. */}
          <Boton
            tamano="sm"
            variante="primario"
            onClick={e => menuPago.alternar('pago', e.currentTarget)}
            disabled={cargando || pagables.length === 0}
            title={!cargando && pagables.length === 0 ? 'Ningún RUC de la lista se cobra aparte' : undefined}
          >
            Registrar pago ▾
          </Boton>
          <Boton tamano="sm" onClick={onRecargar} disabled={cargando}>{cargando ? 'Cargando…' : 'Recargar'}</Boton>
          <Boton tamano="sm" onClick={exportarCSV} disabled={filas.length === 0}>Exportar CSV</Boton>
        </>
      }
    >
      {pestanas}

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
        {/* En el celular, una tarjeta por RUC: la tabla de siete columnas no entra. */}
        <div className="sm:hidden divide-y divide-gray-100">
          {cargando ? (
            <p className="px-3 py-8 text-center text-[12.5px] text-gray-500">Cargando RUC…</p>
          ) : filas.length === 0 ? (
            <p className="px-3 py-8 text-center text-[12.5px] text-gray-500">{vacia}</p>
          ) : (
            filas.map(f => (
              <Link key={f.id} to={`/app/admin/users/${f.cuenta.id}`} className={`block px-3 py-2.5 ${f.activo === false ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gray-900">
                      {f.empresa}
                      {f.activo === false && <span className="text-gray-400 font-normal"> · inactivo</span>}
                    </div>
                    <div className="truncate text-[11.5px] text-gray-500 tabular-nums">{f.ruc} · {f.cuenta.businessName || '—'}</div>
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
                <FilaVacia colSpan={7}>{vacia}</FilaVacia>
              ) : (
                filas.map(f => (
                  <Fila key={f.id} apagada={f.activo === false}>
                    <Td className="tabular-nums">{f.ruc}</Td>
                    <Td className="font-medium whitespace-normal max-w-[240px]">
                      {f.empresa}
                      {f.activo === false && <span className="text-gray-400 font-normal"> · inactivo</span>}
                    </Td>
                    <Td className="max-w-[220px]">
                      <Link to={`/app/admin/users/${f.cuenta.id}`} className="block truncate font-medium hover:underline">{f.cuenta.businessName || '—'}</Link>
                      <span className="block truncate text-[11.5px] text-gray-500">{f.cuenta.email || ''}</span>
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

      {/* De qué empresa es el pago: todas las de la lista que pagan aparte,
          con lo más urgente arriba, como en el desplegable de la ficha. */}
      {menuPago.abiertoEn && (
        <CajaMenu posicion={menuPago.posicion} refMenu={menuPago.refMenu}>
          <p className="px-3 py-1.5 text-[11.5px] text-gray-500">¿De qué empresa es el pago?</p>
          {pagables.map(f => {
            const { texto, rojo } = textoDelCobro(f.cobro)
            return (
              <ItemMenu key={f.id} onClick={() => { menuPago.cerrar(); setAPagar(f) }}>
                <span className="block font-medium text-gray-900">{f.empresa}</span>
                <span className="block text-[11.5px] text-gray-500">{f.ruc} · {f.cuenta.businessName || '—'}</span>
                <span className={`block text-[11.5px] ${rojo ? 'text-red-600' : 'text-gray-500'}`}>{texto}</span>
              </ItemMenu>
            )
          })}
        </CajaMenu>
      )}

      {aPagar && (
        <PagoDeRucModal
          cuenta={aPagar.cuenta}
          emisor={aPagar.emisor}
          cobro={aPagar.cobro}
          procesando={procesando}
          onClose={() => setAPagar(null)}
          onRegistrar={registrarPago}
        />
      )}
    </Pagina>
  )
}
