import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { CHART_SERIES, CHART_TOOLTIP } from './chartTheme'

/**
 * Gráfico de torta con la distribución de ventas por método de pago.
 *
 * data: [{ name: 'Efectivo', value: 1200, percent: 35 }, ...]
 */

// Paleta unificada de la marca (familia azul/cian) — ver chartTheme.js
const COLORS = CHART_SERIES

export default function PaymentMethodsPieChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[260px] text-sm text-gray-500">
        Sin datos de pagos este mes
      </div>
    )
  }

  const formatTooltip = (value, name, props) => {
    const pct = props?.payload?.percent ?? 0
    return [`S/ ${Number(value).toFixed(2)} (${pct.toFixed(1)}%)`, name]
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={85}
          innerRadius={45}
          paddingAngle={2}
        >
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={CHART_TOOLTIP}
          formatter={formatTooltip}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          iconType="circle"
          wrapperStyle={{ fontSize: '12px' }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
