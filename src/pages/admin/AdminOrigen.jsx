import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useToast } from '@/contexts/ToastContext'
import { NOMBRE_CANAL, CANALES } from '@/data/origen'
import {
  Pagina, Seccion, Tabla, Th, Td, Fila, FilaVacia, Filtros, FiltroSelect,
  Cifras, Cifra, Aviso, Boton,
} from '@/components/admin/ui'

/**
 * DE DÓNDE VIENEN LOS CLIENTES QUE PAGAN.
 *
 * La pregunta que decide dónde va el presupuesto no es cuántos leads trae un
 * canal, es cuántos SOLES. Un anuncio que trae 200 conversaciones y 2 pagos es
 * peor que uno que trae 20 y 8, y con una tabla de leads se ve al revés. Por
 * eso la columna que manda —y por la que se ordena— es lo cobrado.
 *
 * Se lee de tres sitios y ninguno se toca:
 *   - `businesses.origen`: el canal con el que nació cada cuenta.
 *   - `subscriptions.paymentHistory`: lo que pagó, que es la misma fuente que
 *     usa Admin > Pagos. No se recalcula nada acá.
 *
 *     OJO con lo que significa el periodo: filtra CUÁNDO ENTRÓ la cuenta, y lo
 *     cobrado es TODO lo que esa cuenta pagó desde entonces, no solo lo que
 *     pagó dentro de la ventana. Para atribución es lo correcto —lo que se
 *     quiere saber es cuánto vale un cliente que trajo ese canal— pero por eso
 *     este total NUNCA va a coincidir con el de Admin > Pagos, que suma pagos
 *     por fecha de pago. Son dos preguntas distintas.
 *   - `whatsappConversations.origenAnuncio`: los leads que llegaron por un
 *     anuncio y TODAVÍA no son cuenta. Es la mitad que faltaba: sin ellos, un
 *     anuncio que trae mucha gente que no compra parece que no trae nada.
 */

const MESES = [
  { id: '1', label: 'Último mes' },
  { id: '3', label: 'Últimos 3 meses' },
  { id: '12', label: 'Último año' },
  { id: 'all', label: 'Desde siempre' },
]

const moneda = (v) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(v || 0))
const fecha = (t) => (t?.toDate?.() || null)

/** Sin origen guardado no es un canal más: es que no se midió. */
const SIN_MEDIR = '__sin_medir__'

export default function AdminOrigen() {
  const toast = useToast()
  const [cargando, setCargando] = useState(true)
  const [negocios, setNegocios] = useState([])
  const [pagos, setPagos] = useState({})
  const [leads, setLeads] = useState([])
  const [rango, setRango] = useState('3')

  useEffect(() => {
    let vivo = true
    setCargando(true)
    Promise.all([
      getDocs(collection(db, 'businesses')),
      getDocs(collection(db, 'subscriptions')),
      getDocs(collection(db, 'whatsappConversations')),
    ])
      .then(([bs, ss, cs]) => {
        if (!vivo) return
        setNegocios(bs.docs.map((d) => ({ id: d.id, ...d.data() })))
        // Lo cobrado por cuenta, de la MISMA fuente que Admin > Pagos.
        const porCuenta = {}
        ss.docs.forEach((d) => {
          const total = (d.data().paymentHistory || []).reduce((a, p) => a + (Number(p.amount) || 0), 0)
          porCuenta[d.id] = total
        })
        setPagos(porCuenta)
        setLeads(cs.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.origenAnuncio))
      })
      .catch((e) => {
        console.error('No se pudo cargar el origen de los clientes:', e)
        toast.error('No se pudieron cargar los datos')
      })
      .finally(() => vivo && setCargando(false))
    return () => { vivo = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const desde = useMemo(() => {
    if (rango === 'all') return null
    const d = new Date()
    d.setMonth(d.getMonth() - Number(rango))
    return d
  }, [rango])

  const enRango = (f) => !desde || (f && f >= desde)

  /** Una fila por canal: leads, cuentas y lo cobrado. */
  const porCanal = useMemo(() => {
    const filas = {}
    const fila = (canal) => (filas[canal] = filas[canal] || { canal, leads: 0, cuentas: 0, cobrado: 0 })

    negocios.forEach((n) => {
      if (!enRango(fecha(n.createdAt))) return
      const f = fila(n.origen?.canal || SIN_MEDIR)
      f.cuentas++
      f.cobrado += pagos[n.id] || 0
    })

    // Los leads que aún no son cuenta. Los que YA lo son se cuentan arriba: si
    // no, el mismo cliente sumaría dos veces en su canal.
    leads.forEach((c) => {
      if (c.linkedBusinessId) return
      if (!enRango(fecha(c.ultimoMensajeAt) || fecha(c.origenAnuncio?.recibidoAt))) return
      fila(CANALES.META_ADS).leads++
    })

    return Object.values(filas).sort((a, b) => b.cobrado - a.cobrado || b.cuentas - a.cuentas)
  }, [negocios, pagos, leads, desde]) // eslint-disable-line react-hooks/exhaustive-deps

  /** El mismo corte, pero por anuncio o campaña: donde se mueve el presupuesto. */
  const porDetalle = useMemo(() => {
    const filas = {}
    negocios.forEach((n) => {
      const o = n.origen
      if (!o?.canal || o.canal === CANALES.DIRECTO || !enRango(fecha(n.createdAt))) return
      const clave = `${o.canal}|${o.detalle || o.id || '—'}`
      const f = (filas[clave] = filas[clave] || { canal: o.canal, detalle: o.detalle || o.id || '—', cuentas: 0, cobrado: 0 })
      f.cuentas++
      f.cobrado += pagos[n.id] || 0
    })
    return Object.values(filas).sort((a, b) => b.cobrado - a.cobrado || b.cuentas - a.cuentas)
  }, [negocios, pagos, desde]) // eslint-disable-line react-hooks/exhaustive-deps

  const totales = useMemo(() => ({
    cuentas: porCanal.reduce((a, f) => a + f.cuentas, 0),
    medidas: porCanal.filter((f) => f.canal !== SIN_MEDIR).reduce((a, f) => a + f.cuentas, 0),
    leads: porCanal.reduce((a, f) => a + f.leads, 0),
    cobrado: porCanal.reduce((a, f) => a + f.cobrado, 0),
  }), [porCanal])

  const nombre = (canal) => (canal === SIN_MEDIR ? 'Sin medir' : NOMBRE_CANAL[canal] || canal)

  return (
    <Pagina
      resumen={cargando ? 'Cargando…' : `${totales.cuentas} cuentas nuevas · ${totales.medidas} con origen conocido · ${moneda(totales.cobrado)} cobrado`}
      acciones={<Boton onClick={() => window.location.reload()}>Recargar</Boton>}
    >
      <Filtros>
        <FiltroSelect value={rango} onChange={(e) => setRango(e.target.value)}>
          {MESES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </FiltroSelect>
      </Filtros>

      <Cifras>
        <Cifra etiqueta="Cuentas nuevas" valor={totales.cuentas} />
        <Cifra etiqueta="Con origen conocido" valor={totales.medidas} />
        <Cifra etiqueta="Leads sin cuenta" valor={totales.leads} />
        <Cifra etiqueta="Cobrado" valor={moneda(totales.cobrado)} nota="Todo lo que pagaron esas cuentas" />
      </Cifras>

      {/* El aviso solo mientras la medición esté arrancando. Sin él, una tabla
          vacía parece un error del sistema y no lo que es: que todavía no hay
          cuentas nuevas desde que se empezó a medir. */}
      {!cargando && totales.medidas === 0 && (
        <Aviso tono="neutro" titulo="Todavía no hay nada que mostrar, y es lo esperado">
          El origen se empezó a guardar el 9 de setiembre de 2026. Las cuentas anteriores
          no lo tienen y no se puede recuperar: ese dato no quedó en ningún lado.
          Esta página se llena sola con las cuentas que entren de ahora en adelante.
        </Aviso>
      )}

      <Seccion
        titulo="Por canal"
        descripcion="Ordenado por lo cobrado, que es lo que decide dónde poner el presupuesto. El periodo filtra CUÁNDO ENTRÓ la cuenta; lo cobrado es todo lo que pagó desde entonces, no solo lo del periodo."
      >
        <Tabla>
          <thead>
            <tr>
              <Th>Canal</Th>
              <Th alinear="der">Leads sin cuenta</Th>
              <Th alinear="der">Cuentas</Th>
              <Th alinear="der">Cobrado</Th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <FilaVacia colSpan={4}>Cargando…</FilaVacia>
            ) : porCanal.length === 0 ? (
              <FilaVacia colSpan={4}>No hay cuentas nuevas en este periodo.</FilaVacia>
            ) : (
              porCanal.map((f) => (
                <Fila key={f.canal}>
                  <Td>
                    {nombre(f.canal)}
                    {f.canal === SIN_MEDIR && (
                      <div className="text-[12px] text-gray-500">Cuentas creadas antes de que se midiera</div>
                    )}
                  </Td>
                  <Td alinear="der">{f.leads || '—'}</Td>
                  <Td alinear="der">{f.cuentas}</Td>
                  <Td alinear="der">{f.cobrado ? moneda(f.cobrado) : '—'}</Td>
                </Fila>
              ))
            )}
          </tbody>
        </Tabla>
      </Seccion>

      <Seccion
        titulo="Por anuncio y campaña"
        descripcion="El mismo corte, abierto por la fuente exacta. Lo directo no aparece: no tiene fuente que abrir."
      >
        <Tabla>
          <thead>
            <tr>
              <Th>Canal</Th>
              <Th>Anuncio o campaña</Th>
              <Th alinear="der">Cuentas</Th>
              <Th alinear="der">Cobrado</Th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <FilaVacia colSpan={4}>Cargando…</FilaVacia>
            ) : porDetalle.length === 0 ? (
              <FilaVacia colSpan={4}>Todavía ninguna cuenta llegó por un anuncio o campaña.</FilaVacia>
            ) : (
              porDetalle.map((f) => (
                <Fila key={`${f.canal}|${f.detalle}`}>
                  <Td>{nombre(f.canal)}</Td>
                  <Td>{f.detalle}</Td>
                  <Td alinear="der">{f.cuentas}</Td>
                  <Td alinear="der">{f.cobrado ? moneda(f.cobrado) : '—'}</Td>
                </Fila>
              ))
            )}
          </tbody>
        </Tabla>
      </Seccion>

      <p className="text-[12px] text-gray-500">
        Los leads sin cuenta salen de la bandeja de WhatsApp; los que ya se hicieron cliente se cuentan
        en Cuentas y no se repiten acá. <Link to="/app/admin/altas" className="text-primary-700 hover:underline">Altas</Link> muestra
        los que están a medio camino.
      </p>
    </Pagina>
  )
}
