import { useState, useMemo } from 'react'
import peruGeo from '@/data/peruDepartments.json'

// Normalizar nombres para comparar
const norm = s => s.toUpperCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const DEPT_MAP = {}
peruGeo.features.forEach(f => {
  DEPT_MAP[norm(f.properties.NOMBDEP)] = f.properties.NOMBDEP
})

const matchDept = (name) => {
  if (!name) return null
  const n = norm(name)
  // Coincidencia directa
  if (DEPT_MAP[n]) return DEPT_MAP[n]
  // Parcial
  for (const [key, val] of Object.entries(DEPT_MAP)) {
    if (n.includes(key) || key.includes(n)) return val
  }
  return null
}

// Proyección Mercator simple
const project = (lon, lat) => [(lon + 82) * 28, (lat + 0.5) * -28 + 14]

const geoToPath = (geometry) => {
  const rings = geometry.type === 'MultiPolygon'
    ? geometry.coordinates.flat()
    : geometry.coordinates
  return rings.map(ring => {
    const pts = ring.map(([lon, lat]) => project(lon, lat))
    return 'M' + pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L') + 'Z'
  }).join(' ')
}

const getColor = (value, max) => {
  if (!value || !max) return '#f1f5f9'
  const t = value / max
  if (t < 0.1) return '#e0e7ff'
  if (t < 0.2) return '#c7d2fe'
  if (t < 0.35) return '#a5b4fc'
  if (t < 0.5) return '#818cf8'
  if (t < 0.7) return '#6366f1'
  if (t < 0.85) return '#4f46e5'
  return '#3730a3'
}

export default function PeruUsersMap({ users = [] }) {
  const [selected, setSelected] = useState(null)

  const deptData = useMemo(() => {
    const data = {}
    users.forEach(u => {
      const deptName = matchDept(u.department)
      if (!deptName) return
      if (!data[deptName]) data[deptName] = { total: 0, active: 0, trial: 0, expired: 0, suspended: 0 }
      data[deptName].total += 1
      const status = u.status || 'expired'
      if (data[deptName][status] !== undefined) data[deptName][status] += 1
    })
    return data
  }, [users])

  const maxUsers = useMemo(() => Math.max(...Object.values(deptData).map(d => d.total), 1), [deptData])

  const paths = useMemo(() =>
    peruGeo.features.map(f => ({
      name: f.properties.NOMBDEP,
      d: geoToPath(f.geometry),
    })),
  [])

  const selectedData = selected ? deptData[selected] : null
  const totalMapped = Object.values(deptData).reduce((s, d) => s + d.total, 0)

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start">
      {/* Mapa */}
      <div className="w-44 sm:w-52 flex-shrink-0 mx-auto sm:mx-0">
        <svg viewBox="0 0 380 520" className="w-full h-auto">
          {paths.map((p, i) => {
            const data = deptData[p.name]
            const isActive = selected === p.name
            return (
              <path
                key={i}
                d={p.d}
                fill={isActive ? '#f59e0b' : getColor(data?.total, maxUsers)}
                stroke={isActive ? '#d97706' : '#94a3b8'}
                strokeWidth={isActive ? 1.5 : 0.5}
                className="transition-colors duration-150 cursor-pointer"
                onClick={() => setSelected(selected === p.name ? null : p.name)}
                onMouseEnter={() => setSelected(p.name)}
                onMouseLeave={() => setSelected(null)}
              />
            )
          })}
        </svg>
      </div>

      {/* Panel */}
      <div className="flex-1 min-w-0 space-y-3 w-full">
        {/* Detalle */}
        {selected && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
            <p className="font-semibold text-sm text-indigo-900">{selected}</p>
            {selectedData ? (
              <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-xs text-indigo-500">Total</p>
                  <p className="text-sm font-bold text-indigo-900">{selectedData.total}</p>
                </div>
                <div>
                  <p className="text-xs text-green-500">Activos</p>
                  <p className="text-sm font-bold text-green-700">{selectedData.active}</p>
                </div>
                <div>
                  <p className="text-xs text-blue-500">Trial</p>
                  <p className="text-sm font-bold text-blue-700">{selectedData.trial}</p>
                </div>
                <div>
                  <p className="text-xs text-yellow-500">Vencidos</p>
                  <p className="text-sm font-bold text-yellow-700">{selectedData.expired}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-indigo-400 mt-1">Sin usuarios registrados</p>
            )}
          </div>
        )}

        {/* Escala */}
        <div>
          <div className="flex gap-0.5">
            {['#f1f5f9','#e0e7ff','#c7d2fe','#a5b4fc','#818cf8','#6366f1','#4f46e5','#3730a3'].map((c, i) => (
              <div key={i} className="flex-1 h-3 rounded-sm" style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
            <span>0 usuarios</span>
            <span>Más usuarios</span>
          </div>
        </div>

        {/* Top departamentos */}
        {Object.keys(deptData).length > 0 && (
          <div className="space-y-1">
            {Object.entries(deptData)
              .sort(([, a], [, b]) => b.total - a.total)
              .slice(0, 8)
              .map(([dept, data]) => (
                <div key={dept} className="flex justify-between text-sm">
                  <span className="text-gray-600 truncate">{dept}</span>
                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-xs text-green-600">{data.active}a</span>
                    <span className="text-xs text-blue-600">{data.trial}t</span>
                    <span className="font-semibold text-gray-900">{data.total}</span>
                  </div>
                </div>
              ))}
          </div>
        )}

        <p className="text-xs text-gray-400">{totalMapped} de {users.length} usuarios mapeados</p>
      </div>
    </div>
  )
}
