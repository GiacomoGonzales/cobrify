import { Search, FileText, Tag } from 'lucide-react'
import Card, { CardContent } from '@/components/ui/Card'
import { PRESETS_DE_FECHA, ESTADOS_DE_GUIA, FILTROS_INICIALES, hayFiltrosActivos } from '@/utils/filtroGuias'

/**
 * Barra de filtros de las dos páginas de guías (Remitente y Transportista):
 * búsqueda, fecha por accesos rápidos o Desde/Hasta, estado y motivo.
 *
 * Qué pasa el filtro se decide en utils/filtroGuias.js; esto es solo la caja,
 * con el mismo diseño que la barra de Cotizaciones.
 *
 * - busqueda / onBusqueda: el texto del buscador (vive en la página porque el
 *   índice de búsqueda se arma ahí)
 * - filtros / onFiltros: { fecha, desde, hasta, estado, motivo }
 * - estados: opciones del desplegable de estado (por defecto, todos)
 * - motivos: [{ value, label }]; si viene vacío, el desplegable no se muestra
 */
const CAMPO_FECHA = 'px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500'
const DESPLEGABLE = 'text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer'

export default function FiltrosDeGuias({
  busqueda,
  onBusqueda,
  placeholder = 'Buscar...',
  filtros,
  onFiltros,
  estados = ESTADOS_DE_GUIA,
  motivos = [],
}) {
  const cambiar = (cambios) => onFiltros({ ...filtros, ...cambios })
  const hayAlgo = hayFiltrosActivos(filtros) || !!busqueda

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
            <Search className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <input
              type="text"
              placeholder={placeholder}
              value={busqueda}
              onChange={e => onBusqueda(e.target.value)}
              className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESETS_DE_FECHA.map((opcion) => (
              <button
                key={opcion.value}
                type="button"
                onClick={() => cambiar({ fecha: opcion.value })}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  filtros.fecha === opcion.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {opcion.label}
              </button>
            ))}
          </div>

          {filtros.fecha === 'custom' && (
            <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Desde:</label>
                <input type="date" value={filtros.desde} onChange={e => cambiar({ desde: e.target.value })} className={CAMPO_FECHA} />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Hasta:</label>
                <input type="date" value={filtros.hasta} onChange={e => cambiar({ hasta: e.target.value })} className={CAMPO_FECHA} />
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                <FileText className="w-4 h-4 text-gray-500" />
                <select value={filtros.estado} onChange={e => cambiar({ estado: e.target.value })} className={DESPLEGABLE}>
                  <option value="all">Todos los estados</option>
                  {estados.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>
              {motivos.length > 0 && (
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <Tag className="w-4 h-4 text-gray-500" />
                  <select value={filtros.motivo} onChange={e => cambiar({ motivo: e.target.value })} className={DESPLEGABLE}>
                    <option value="all">Todos los motivos</option>
                    {motivos.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              )}
            </div>

            {hayAlgo && (
              <button
                type="button"
                onClick={() => { onFiltros({ ...FILTROS_INICIALES }); onBusqueda('') }}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
