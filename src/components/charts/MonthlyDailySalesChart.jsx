import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'

/**
 * Gráfico de barras con las ventas día a día del mes actual.
 * Incluye una línea de referencia con el promedio diario.
 *
 * data: [{ day: 1, ventas: 1200, isFuture: false }, ...]
 * avgDaily: promedio diario hasta hoy
 */
export default function MonthlyDailySalesChart({ data, avgDaily }) {
  const formatTooltip = (value) => [`S/ ${Number(value).toFixed(2)}`, 'Ventas']

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="day" stroke="#6b7280" fontSize={12} />
        <YAxis stroke="#6b7280" fontSize={12} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
          }}
          formatter={formatTooltip}
          labelFormatter={(label) => `Día ${label}`}
        />
        {avgDaily > 0 && (
          <ReferenceLine
            y={avgDaily}
            stroke="#9ca3af"
            strokeDasharray="4 4"
            label={{
              value: `Promedio S/ ${avgDaily.toFixed(0)}`,
              position: 'insideTopRight',
              fill: '#6b7280',
              fontSize: 11,
            }}
          />
        )}
        <Bar dataKey="ventas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
