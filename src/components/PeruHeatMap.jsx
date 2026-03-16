import { useState, useMemo } from 'react'
import {
  ComposableMap,
  Geographies,
  Geography,
} from 'react-simple-maps'
import peruGeo from '@/data/peruDepartments.json'
import { formatCurrency } from '@/lib/utils'

// Mapa de nombres de departamentos para normalización
const DEPARTMENT_ALIASES = {
  'LIMA': 'LIMA',
  'LIMA METROPOLITANA': 'LIMA',
  'LIMA PROVINCIAS': 'LIMA',
  'CALLAO': 'CALLAO',
  'AREQUIPA': 'AREQUIPA',
  'LA LIBERTAD': 'LA LIBERTAD',
  'TRUJILLO': 'LA LIBERTAD',
  'PIURA': 'PIURA',
  'LAMBAYEQUE': 'LAMBAYEQUE',
  'CHICLAYO': 'LAMBAYEQUE',
  'CAJAMARCA': 'CAJAMARCA',
  'CUSCO': 'CUSCO',
  'CUZCO': 'CUSCO',
  'JUNIN': 'JUNIN',
  'JUNÍN': 'JUNIN',
  'HUANCAYO': 'JUNIN',
  'ANCASH': 'ANCASH',
  'ÁNCASH': 'ANCASH',
  'ICA': 'ICA',
  'TACNA': 'TACNA',
  'PUNO': 'PUNO',
  'AYACUCHO': 'AYACUCHO',
  'HUANUCO': 'HUANUCO',
  'HUÁNUCO': 'HUANUCO',
  'SAN MARTIN': 'SAN MARTIN',
  'SAN MARTÍN': 'SAN MARTIN',
  'LORETO': 'LORETO',
  'UCAYALI': 'UCAYALI',
  'MADRE DE DIOS': 'MADRE DE DIOS',
  'AMAZONAS': 'AMAZONAS',
  'APURIMAC': 'APURIMAC',
  'APURÍMAC': 'APURIMAC',
  'MOQUEGUA': 'MOQUEGUA',
  'PASCO': 'PASCO',
  'TUMBES': 'TUMBES',
  'HUANCAVELICA': 'HUANCAVELICA',
}

// Normalizar nombre de departamento
const normalizeDepartment = (name) => {
  if (!name) return null
  const upper = name.toUpperCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quitar tildes
  // Buscar coincidencia directa
  for (const [alias, dept] of Object.entries(DEPARTMENT_ALIASES)) {
    const aliasNorm = alias.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (upper === aliasNorm || upper.includes(aliasNorm)) return dept
  }
  return null
}

// Extraer departamento de una dirección
export const extractDepartment = (address) => {
  if (!address) return null
  const parts = address.split(',').map(p => p.trim()).filter(Boolean)
  // Buscar de derecha a izquierda (la dirección suele terminar con distrito, provincia o departamento)
  for (let i = parts.length - 1; i >= 0; i--) {
    const dept = normalizeDepartment(parts[i])
    if (dept) return dept
  }
  // Si no se encontró, buscar en toda la cadena
  return normalizeDepartment(address)
}

// Escala de colores (de claro a intenso)
const COLOR_SCALE = [
  '#f0fdf4', // 0 - casi blanco
  '#bbf7d0', // 1
  '#86efac', // 2
  '#4ade80', // 3
  '#22c55e', // 4
  '#16a34a', // 5
  '#15803d', // 6
  '#166534', // 7 - muy intenso
]

const getColor = (value, maxValue) => {
  if (!value || !maxValue) return '#f3f4f6' // gris claro si no hay data
  const ratio = value / maxValue
  const index = Math.min(Math.floor(ratio * (COLOR_SCALE.length - 1)), COLOR_SCALE.length - 1)
  return COLOR_SCALE[index]
}

export default function PeruHeatMap({ salesByZone = [] }) {
  const [tooltip, setTooltip] = useState(null)

  // Agregar ventas por departamento
  const departmentData = useMemo(() => {
    const data = {}

    salesByZone.forEach(zone => {
      const dept = extractDepartment(zone.zone)
      if (!dept) return

      if (!data[dept]) {
        data[dept] = { revenue: 0, orders: 0, customers: 0 }
      }
      data[dept].revenue += zone.totalRevenue
      data[dept].orders += zone.ordersCount
      data[dept].customers += zone.uniqueCustomers
    })

    return data
  }, [salesByZone])

  const maxRevenue = useMemo(() => {
    const values = Object.values(departmentData).map(d => d.revenue)
    return Math.max(...values, 1)
  }, [departmentData])

  const totalMapped = useMemo(() => {
    return Object.values(departmentData).reduce((sum, d) => sum + d.revenue, 0)
  }, [departmentData])

  const totalAll = useMemo(() => {
    return salesByZone.reduce((sum, z) => sum + z.totalRevenue, 0)
  }, [salesByZone])

  return (
    <div className="relative">
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Mapa */}
        <div className="flex-1 min-h-[400px]">
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{
              center: [-75.5, -9.5],
              scale: 1800,
            }}
            width={400}
            height={500}
            style={{ width: '100%', height: 'auto' }}
          >
            <Geographies geography={peruGeo}>
              {({ geographies }) =>
                geographies.map(geo => {
                  const deptName = geo.properties.NOMBDEP
                  const deptNorm = normalizeDepartment(deptName)
                  const data = deptNorm ? departmentData[deptNorm] : null

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={getColor(data?.revenue, maxRevenue)}
                      stroke="#94a3b8"
                      strokeWidth={0.5}
                      style={{
                        default: { outline: 'none' },
                        hover: { outline: 'none', fill: '#3b82f6', cursor: 'pointer' },
                        pressed: { outline: 'none' },
                      }}
                      onMouseEnter={() => {
                        setTooltip({
                          name: deptName,
                          revenue: data?.revenue || 0,
                          orders: data?.orders || 0,
                          customers: data?.customers || 0,
                        })
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  )
                })
              }
            </Geographies>
          </ComposableMap>
        </div>

        {/* Leyenda y stats */}
        <div className="lg:w-64 space-y-4">
          {/* Tooltip / Detalle */}
          <div className="bg-gray-50 rounded-lg p-4 min-h-[120px]">
            {tooltip ? (
              <>
                <p className="font-semibold text-gray-900 text-sm">{tooltip.name}</p>
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-gray-600">
                    Ventas: <span className="font-semibold text-gray-900">{formatCurrency(tooltip.revenue)}</span>
                  </p>
                  <p className="text-sm text-gray-600">
                    Pedidos: <span className="font-semibold text-gray-900">{tooltip.orders}</span>
                  </p>
                  <p className="text-sm text-gray-600">
                    Clientes: <span className="font-semibold text-gray-900">{tooltip.customers}</span>
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400 italic">Pasa el cursor sobre un departamento para ver detalles</p>
            )}
          </div>

          {/* Escala de colores */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Volumen de ventas</p>
            <div className="flex items-center gap-1">
              {COLOR_SCALE.map((color, i) => (
                <div
                  key={i}
                  className="flex-1 h-4 rounded-sm"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-gray-400">Menor</span>
              <span className="text-xs text-gray-400">Mayor</span>
            </div>
          </div>

          {/* Top departamentos */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Top departamentos</p>
            <div className="space-y-1.5">
              {Object.entries(departmentData)
                .sort(([, a], [, b]) => b.revenue - a.revenue)
                .slice(0, 8)
                .map(([dept, data]) => (
                  <div key={dept} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 truncate">{dept}</span>
                    <span className="font-medium text-gray-900 ml-2 whitespace-nowrap">{formatCurrency(data.revenue)}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Cobertura */}
          {totalAll > 0 && (
            <div className="text-xs text-gray-500">
              {Math.round((totalMapped / totalAll) * 100)}% de las ventas mapeadas a departamentos
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
