import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export default function SalesChart({ data }) {
  // Formateador para el tooltip - redondea a 2 decimales
  const formatTooltipValue = (value, name) => {
    const label = name === 'ventas' ? 'Esta semana' : 'Semana anterior'
    return [`S/ ${Number(value).toFixed(2)}`, label]
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
        <YAxis stroke="#6b7280" fontSize={12} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
          }}
          formatter={formatTooltipValue}
          labelStyle={{ fontWeight: 'bold' }}
        />
        <Legend
          formatter={(value) => value === 'ventas' ? 'Esta semana' : 'Semana anterior'}
        />
        <Line
          type="monotone"
          dataKey="ventas"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ fill: '#3b82f6', r: 4 }}
          activeDot={{ r: 6 }}
        />
        <Line
          type="monotone"
          dataKey="ventasAnterior"
          stroke="#9ca3af"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={{ fill: '#9ca3af', r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
