import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { CHART, CHART_TOOLTIP } from './chartTheme'

export default function SalesChart({ data }) {
  // Formateador para el tooltip - redondea a 2 decimales
  const formatTooltipValue = (value, name) => {
    const label = name === 'ventas' ? 'Esta semana' : 'Semana anterior'
    return [`S/ ${Number(value).toFixed(2)}`, label]
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
        <XAxis dataKey="name" stroke={CHART.axis} fontSize={12} />
        <YAxis stroke={CHART.axis} fontSize={12} />
        <Tooltip
          contentStyle={CHART_TOOLTIP}
          formatter={formatTooltipValue}
          labelStyle={{ fontWeight: 'bold' }}
        />
        <Legend
          formatter={(value) => value === 'ventas' ? 'Esta semana' : 'Semana anterior'}
        />
        <Line
          type="monotone"
          dataKey="ventas"
          stroke={CHART.primary}
          strokeWidth={2}
          dot={{ fill: CHART.primary, r: 4 }}
          activeDot={{ r: 6 }}
        />
        <Line
          type="monotone"
          dataKey="ventasAnterior"
          stroke={CHART.muted}
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={{ fill: CHART.muted, r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
