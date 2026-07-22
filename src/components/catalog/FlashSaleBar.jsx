// Barra de oferta con cuenta regresiva (F2.5 del plan de rediseño).
// Feature activable: banner con countdown hacia una fecha/hora límite, para
// empujar urgencia de compra. Config en el doc del negocio:
//   catalogFlashSale = { enabled, text, endDate (ISO), backgroundColor, textColor }
// Cuando el countdown llega a cero, la barra desaparece sola (oferta vencida).
import { useState, useEffect, useCallback } from 'react'
import { Clock } from 'lucide-react'

function diffParts(endMs, nowMs) {
  const total = Math.max(0, endMs - nowMs)
  const days = Math.floor(total / 86400000)
  const hours = Math.floor((total % 86400000) / 3600000)
  const minutes = Math.floor((total % 3600000) / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  return { total, days, hours, minutes, seconds }
}

const pad = (n) => String(n).padStart(2, '0')

export default function FlashSaleBar({ config }) {
  const endMs = config?.endDate ? new Date(config.endDate).getTime() : 0
  const compute = useCallback(() => diffParts(endMs, Date.now()), [endMs])
  const [parts, setParts] = useState(compute)

  useEffect(() => {
    if (!config?.enabled || !endMs) return
    setParts(compute())
    const timer = setInterval(() => setParts(compute()), 1000)
    return () => clearInterval(timer)
  }, [config?.enabled, endMs, compute])

  if (!config?.enabled || !endMs || parts.total <= 0) return null

  const bg = config.backgroundColor || '#DC2626'
  const color = config.textColor || '#FFFFFF'
  const text = (config.text || '').trim() || 'Oferta por tiempo limitado'

  const Box = ({ value, label }) => (
    <span className="flex flex-col items-center leading-none">
      <span className="text-sm font-bold tabular-nums" style={{ color }}>{pad(value)}</span>
      <span className="text-[9px] uppercase opacity-70" style={{ color }}>{label}</span>
    </span>
  )

  return (
    <div className="py-2 px-4" style={{ backgroundColor: bg }}>
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-3 flex-wrap">
        <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color }}>
          <Clock className="w-4 h-4" />
          {text}
        </span>
        <span className="flex items-center gap-1.5">
          {parts.days > 0 && (<><Box value={parts.days} label="días" /><span className="font-bold" style={{ color }}>:</span></>)}
          <Box value={parts.hours} label="hrs" />
          <span className="font-bold" style={{ color }}>:</span>
          <Box value={parts.minutes} label="min" />
          <span className="font-bold" style={{ color }}>:</span>
          <Box value={parts.seconds} label="seg" />
        </span>
      </div>
    </div>
  )
}
