import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Pagina, Seccion, Tabla, Th, Td, Fila, FilaVacia,
  Cifras, Cifra, Estado, Aviso, Filtros, FiltroSelect, useTituloAdmin,
} from '@/components/admin/ui'
import { cargarPruebas, embudo, EN_CURSO, CONVIRTIO, SE_PERDIO } from '@/services/adminPruebasService'
import { DIAS_DE_PRUEBA } from '@/data/prueba'

/**
 * LAS PRUEBAS Y DÓNDE SE CAEN.
 *
 * No es una lista de cuentas: es un embudo. La pregunta no es cuántas pruebas
 * diste sino en qué paso se pierde la gente, porque cada paso se arregla de
 * una forma distinta:
 *
 *   - Se crean pero no la usan  → no saben por dónde empezar
 *   - La usan pero no compran   → es el precio, o el producto
 *
 * Sin separar esas dos cosas, la única respuesta posible es adivinar.
 */

const fecha = (d) => (d ? d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) : '—')

/** El estado, con el tono que le toca. */
// Los tonos del kit: rojo solo para lo que pide acción, gris para lo
// provisional. Una prueba que corre es provisional; una que se perdió es lo
// único que exige mirar.
const TONO = { [CONVIRTIO]: 'normal', [EN_CURSO]: 'tenue', [SE_PERDIO]: 'rojo' }
const ETIQUETA = { [CONVIRTIO]: 'Compró', [EN_CURSO]: 'Probando', [SE_PERDIO]: 'Se perdió' }

export default function AdminPruebas() {
  useTituloAdmin('Pruebas')
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [filtro, setFiltro] = useState('')

  useEffect(() => {
    let vivo = true
    cargarPruebas()
      .then((f) => { if (vivo) setFilas(f) })
      .catch((e) => { if (vivo) setError(e.message || 'No se pudieron cargar las pruebas') })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [])

  const n = useMemo(() => embudo(filas), [filas])
  const visibles = useMemo(
    () => (filtro ? filas.filter((f) => f.estado === filtro) : filas),
    [filas, filtro],
  )

  return (
    <Pagina
      resumen={cargando ? 'Cargando…' : `${n.total} prueba${n.total === 1 ? '' : 's'} en total`}
    >
      {error && <Aviso tono="error">{error}</Aviso>}

      {!cargando && n.total === 0 && (
        <Aviso tono="info" titulo="Todavía no has dado ninguna prueba">
          Se crean desde el chat: en la conversación, «Enviar formulario de alta» y eliges
          «Prueba gratuita». Dura {DIAS_DE_PRUEBA} días, no cobra nada y sus comprobantes
          salen marcados como sin validez.
        </Aviso>
      )}

      {n.total > 0 && (
        <Seccion titulo="El embudo">
          <Cifras>
            <Cifra etiqueta="Pruebas dadas" valor={n.total} />
            <Cifra etiqueta="La usaron" valor={n.usaron} />
            <Cifra etiqueta="Compraron" valor={n.convirtieron} />
            <Cifra etiqueta="Todavía probando" valor={n.enCurso} />
          </Cifras>

          {/* Las tasas van aparte de los conteos y con su explicación al lado:
              un porcentaje suelto invita a leerlo mal, y estos dos se leen muy
              distinto según sobre qué se calculen. */}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-gray-200 px-3 py-2">
              <p className="text-[12px] text-gray-500">De las que ya terminaron, compraron</p>
              <p className="text-[19px] font-semibold text-gray-900 tabular-nums">
                {n.tasa === null ? '—' : `${n.tasa}%`}
                <span className="ml-1.5 text-[12px] font-normal text-gray-500">
                  ({n.convirtieron} de {n.terminadas})
                </span>
              </p>
              <p className="mt-0.5 text-[11.5px] text-gray-500">
                Las que siguen corriendo no cuentan: todavía no se sabe.
              </p>
            </div>
            <div className="rounded-md border border-gray-200 px-3 py-2">
              <p className="text-[12px] text-gray-500">De las que la usaron de verdad, compraron</p>
              <p className="text-[19px] font-semibold text-gray-900 tabular-nums">
                {n.tasaDeLasQueUsaron === null ? '—' : `${n.tasaDeLasQueUsaron}%`}
                <span className="ml-1.5 text-[12px] font-normal text-gray-500">
                  ({n.convirtieron} de {n.usaron})
                </span>
              </p>
              <p className="mt-0.5 text-[11.5px] text-gray-500">
                Si este número es alto y el de al lado bajo, el problema es que no arrancan.
              </p>
            </div>
          </div>
        </Seccion>
      )}

      {n.total > 0 && (
        <Seccion
          titulo="Una por una"
          sinRelleno
          acciones={
            <Filtros>
              <FiltroSelect value={filtro} onChange={(e) => setFiltro(e.target.value)}>
                <option value="">Todas</option>
                <option value={EN_CURSO}>Probando</option>
                <option value={CONVIRTIO}>Compraron</option>
                <option value={SE_PERDIO}>Se perdieron</option>
              </FiltroSelect>
            </Filtros>
          }
        >
          <Tabla>
            <thead>
              <tr>
                <Th>Negocio</Th>
                <Th>Empezó</Th>
                <Th>Termina</Th>
                <Th alinear="der">Comprobantes</Th>
                <Th alinear="der">Productos</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 && <FilaVacia colSpan={6}>Ninguna con ese filtro.</FilaVacia>}
              {visibles.map((f) => (
                <Fila key={f.id}>
                  <Td>
                    <Link to={`/app/admin/cuenta/${f.id}`} className="font-medium text-blue-600 hover:underline">
                      {f.negocio}
                    </Link>
                    {f.email && <p className="text-[11.5px] text-gray-500">{f.email}</p>}
                  </Td>
                  <Td>{fecha(f.creada)}</Td>
                  <Td>
                    {fecha(f.vence)}
                    {f.estado === EN_CURSO && f.dias !== null && (
                      <span className="ml-1.5 text-[11.5px] text-gray-500">
                        {f.dias === 0 ? 'hoy' : `en ${f.dias} d`}
                      </span>
                    )}
                  </Td>
                  {/* Cero en gris: lo que importa de esta columna es distinguir
                      de un vistazo al que hizo algo del que no tocó nada. */}
                  <Td alinear="der" numero>
                    <span className={f.comprobantes > 0 ? 'font-medium text-gray-900' : 'text-gray-400'}>
                      {f.comprobantes}
                    </span>
                  </Td>
                  <Td alinear="der" numero>
                    <span className={f.productos > 0 ? 'font-medium text-gray-900' : 'text-gray-400'}>
                      {f.productos}
                    </span>
                  </Td>
                  <Td>
                    <Estado tono={TONO[f.estado]} etiqueta={ETIQUETA[f.estado]} />
                    {f.estado === CONVIRTIO && f.pago != null && (
                      <span className="ml-1.5 text-[11.5px] text-gray-500 tabular-nums">S/ {f.pago}</span>
                    )}
                  </Td>
                </Fila>
              ))}
            </tbody>
          </Tabla>
        </Seccion>
      )}

      {n.total > 0 && (
        <p className="text-[11.5px] text-gray-500">
          «La usaron» significa que emitieron algún comprobante o cargaron algún producto.
          Todavía no se puede saber si solo entraron a mirar: el sistema no guarda la fecha
          del último acceso de nadie.
        </p>
      )}
    </Pagina>
  )
}
