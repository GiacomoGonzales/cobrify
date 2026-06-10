import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { CHART, CHART_TOOLTIP } from './chartTheme'

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
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
        <XAxis dataKey="day" stroke={CHART.axis} fontSize={12} />
        <YAxis stroke={CHART.axis} fontSize={12} />
        <Tooltip
          contentStyle={CHART_TOOLTIP}
          formatter={formatTooltip}
          labelFormatter={(label) => `Día ${label}`}
        />
        {avgDaily > 0 && (
          <ReferenceLine
            y={avgDaily}
            stroke={CHART.muted}
            strokeDasharray="4 4"
            label={{
              value: `Promedio S/ ${avgDaily.toFixed(0)}`,
              position: 'insideTopRight',
              fill: CHART.axis,
              fontSize: 11,
            }}
          />
        )}
        <Bar dataKey="ventas" fill={CHART.primary} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
