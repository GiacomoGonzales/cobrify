import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'

/**
 * Gráfico de área que muestra las ventas mensuales de los últimos 12 meses.
 * Útil para ver la curva de crecimiento del negocio.
 *
 * data: [{ month: 'ene 25', ventas: 12000 }, ...]
 */
export default function YearlyMonthlyChart({ data }) {
  const formatTooltip = (value) => [`S/ ${Number(value).toFixed(2)}`, 'Ventas']

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
        <YAxis stroke="#6b7280" fontSize={12} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
          }}
          formatter={formatTooltip}
          labelStyle={{ fontWeight: 'bold' }}
        />
        <Area
          type="monotone"
          dataKey="ventas"
          stroke="#3b82f6"
          strokeWidth={2.5}
          fill="url(#colorVentas)"
          dot={{ fill: '#3b82f6', r: 3 }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
