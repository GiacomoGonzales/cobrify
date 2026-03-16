import { useState, useMemo } from 'react'
import peruGeo from '@/data/peruDepartments.json'
import { formatCurrency } from '@/lib/utils'

// Aliases para detectar departamentos desde direcciones
const DEPT_ALIASES = {
  'LIMA': 'LIMA', 'LIMA METROPOLITANA': 'LIMA', 'LIMA PROVINCIAS': 'LIMA',
  'CALLAO': 'CALLAO', 'AREQUIPA': 'AREQUIPA', 'LA LIBERTAD': 'LA LIBERTAD',
  'TRUJILLO': 'LA LIBERTAD', 'PIURA': 'PIURA', 'LAMBAYEQUE': 'LAMBAYEQUE',
  'CHICLAYO': 'LAMBAYEQUE', 'CAJAMARCA': 'CAJAMARCA', 'CUSCO': 'CUSCO',
  'CUZCO': 'CUSCO', 'JUNIN': 'JUNIN', 'HUANCAYO': 'JUNIN', 'ANCASH': 'ANCASH',
  'ICA': 'ICA', 'TACNA': 'TACNA', 'PUNO': 'PUNO', 'AYACUCHO': 'AYACUCHO',
  'HUANUCO': 'HUANUCO', 'SAN MARTIN': 'SAN MARTIN', 'LORETO': 'LORETO',
  'UCAYALI': 'UCAYALI', 'MADRE DE DIOS': 'MADRE DE DIOS', 'AMAZONAS': 'AMAZONAS',
  'APURIMAC': 'APURIMAC', 'MOQUEGUA': 'MOQUEGUA', 'PASCO': 'PASCO',
  'TUMBES': 'TUMBES', 'HUANCAVELICA': 'HUANCAVELICA',
}

const norm = s => s.toUpperCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const normalizeDept = (name) => {
  if (!name) return null
  const n = norm(name)
  for (const [alias, dept] of Object.entries(DEPT_ALIASES)) {
    if (n === norm(alias) || n.includes(norm(alias))) return dept
  }
  return null
}

export const extractDepartment = (address) => {
  if (!address) return null
  const parts = address.split(',').map(p => p.trim()).filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i--) {
    const d = normalizeDept(parts[i])
    if (d) return d
  }
  return normalizeDept(address)
}

// Proyección Mercator simple: lon/lat → x/y en el SVG
const project = (lon, lat) => {
  const x = (lon + 82) * 28          // offset y escala horizontal
  const y = (lat + 0.5) * -28 + 14   // offset y escala vertical (invertir Y)
  return [x, y]
}

// Convertir coordenadas GeoJSON a path SVG
const geoToPath = (geometry) => {
  const rings = geometry.type === 'MultiPolygon'
    ? geometry.coordinates.flat()
    : geometry.coordinates

  return rings.map(ring => {
    const points = ring.map(([lon, lat]) => project(lon, lat))
    return 'M' + points.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L') + 'Z'
  }).join(' ')
}

// Colores: gris (sin data) → verde claro → verde oscuro
const getColor = (value, max) => {
  if (!value || !max) return '#f1f5f9'
  const t = value / max
  if (t < 0.15) return '#dcfce7'
  if (t < 0.3) return '#bbf7d0'
  if (t < 0.45) return '#86efac'
  if (t < 0.6) return '#4ade80'
  if (t < 0.75) return '#22c55e'
  if (t < 0.9) return '#16a34a'
  return '#15803d'
}

export default function PeruHeatMap({ salesByZone = [] }) {
  const [hovered, setHovered] = useState(null)

  const deptData = useMemo(() => {
    const data = {}
    salesByZone.forEach(z => {
      const dept = extractDepartment(z.zone)
      if (!dept) return
      if (!data[dept]) data[dept] = { revenue: 0, orders: 0, customers: 0 }
      data[dept].revenue += z.totalRevenue
      data[dept].orders += z.ordersCount
      data[dept].customers += z.uniqueCustomers
    })
    return data
  }, [salesByZone])

  const maxRev = useMemo(() => Math.max(...Object.values(deptData).map(d => d.revenue), 1), [deptData])

  const paths = useMemo(() =>
    peruGeo.features.map(f => ({
      name: f.properties.NOMBDEP,
      d: geoToPath(f.geometry),
      dept: normalizeDept(f.properties.NOMBDEP),
    })),
  [])

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start">
      {/* Mapa SVG */}
      <div className="w-full sm:w-56 flex-shrink-0">
        <svg viewBox="0 0 380 520" className="w-full h-auto">
          {paths.map((p, i) => {
            const data = p.dept ? deptData[p.dept] : null
            const isHovered = hovered === p.name
            return (
              <path
                key={i}
                d={p.d}
                fill={isHovered ? '#3b82f6' : getColor(data?.revenue, maxRev)}
                stroke="#94a3b8"
                strokeWidth={isHovered ? 1.5 : 0.5}
                className="transition-colors duration-150 cursor-pointer"
                onMouseEnter={() => setHovered(p.name)}
                onMouseLeave={() => setHovered(null)}
              />
            )
          })}
        </svg>
      </div>

      {/* Panel lateral */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Tooltip */}
        <div className="bg-gray-50 rounded-lg p-3 min-h-[80px]">
          {hovered ? (() => {
            const dept = normalizeDept(hovered)
            const data = dept ? deptData[dept] : null
            return (
              <>
                <p className="font-semibold text-sm">{hovered}</p>
                {data ? (
                  <div className="mt-1 text-sm text-gray-600 space-y-0.5">
                    <p>Ventas: <span className="font-semibold text-gray-900">{formatCurrency(data.revenue)}</span></p>
                    <p>Pedidos: <span className="font-semibold text-gray-900">{data.orders}</span></p>
                    <p>Clientes: <span className="font-semibold text-gray-900">{data.customers}</span></p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">Sin ventas en este período</p>
                )}
              </>
            )
          })() : (
            <p className="text-xs text-gray-400 italic">Pasa el cursor sobre un departamento</p>
          )}
        </div>

        {/* Escala */}
        <div>
          <div className="flex gap-0.5">
            {['#f1f5f9','#dcfce7','#bbf7d0','#86efac','#4ade80','#22c55e','#16a34a','#15803d'].map((c, i) => (
              <div key={i} className="flex-1 h-3 rounded-sm" style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
            <span>Sin datos</span>
            <span>Mayor venta</span>
          </div>
        </div>

        {/* Top departamentos */}
        {Object.keys(deptData).length > 0 && (
          <div className="space-y-1">
            {Object.entries(deptData)
              .sort(([, a], [, b]) => b.revenue - a.revenue)
              .slice(0, 6)
              .map(([dept, data]) => (
                <div key={dept} className="flex justify-between text-sm">
                  <span className="text-gray-600 truncate">{dept}</span>
                  <span className="font-medium text-gray-900 ml-2 whitespace-nowrap">{formatCurrency(data.revenue)}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
