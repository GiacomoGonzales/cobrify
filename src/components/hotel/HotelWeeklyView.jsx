import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Download, CalendarDays } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * Vista semanal de reservas tipo planificador: habitaciones (filas) x 7 días
 * (columnas). Cada celda muestra la reserva que ocupa esa habitación esa noche
 * (precio de la noche, nº de huéspedes, nombre y método de pago si existe).
 * Exportable a PDF (tabla nativa con jspdf-autotable) para enviar por WhatsApp.
 *
 * Una reserva de varias noches aparece en CADA noche que ocupa (checkIn <= día < checkOut).
 */

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const ROOM_TYPE_LABELS = {
  estandar: 'Estándar', 'estándar': 'Estándar', suite: 'Suite', domo: 'Domo',
  matrimonial: 'Matrimonial', doble: 'Doble', simple: 'Simple', familiar: 'Familiar', deluxe: 'Deluxe',
}
const typeLabel = (t) => {
  const k = String(t || '').toLowerCase()
  return ROOM_TYPE_LABELS[k] || (t ? String(t).charAt(0).toUpperCase() + String(t).slice(1) : '')
}

const toISO = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const startOfWeekMonday = (d) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = x.getDay() // 0=Dom..6=Sáb
  return addDays(x, dow === 0 ? -6 : 1 - dow)
}
const fmtShort = (iso) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }

export default function HotelWeeklyView({ rooms = [], reservations = [] }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()))

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => toISO(addDays(weekStart, i))), [weekStart])

  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) =>
      String(a.number || a.name || '').localeCompare(String(b.number || b.name || ''), 'es', { numeric: true })),
    [rooms]
  )

  // Reservas relevantes (no canceladas ni no-show).
  const relevant = useMemo(
    () => reservations.filter(r => !['cancelled', 'no_show'].includes(r.status)),
    [reservations]
  )

  const occupies = (r, dayIso) => {
    const ci = r.checkInDate || r.checkIn
    const co = r.checkOutDate || r.checkOut
    if (!ci) return false
    if (r.pricingMode === 'hourly') return ci === dayIso
    if (!co) return ci === dayIso
    return ci <= dayIso && dayIso < co
  }
  const matchesRoom = (r, room) =>
    (r.roomId && r.roomId === room.id) || (r.roomName && r.roomName === (room.name || room.number))

  const nightPrice = (r) => r.pricingMode === 'hourly'
    ? Number(r.totalAmount ?? r.total ?? 0)
    : Number(r.ratePerNight ?? 0)

  const cellFor = (room, dayIso) => relevant.filter(r => matchesRoom(r, room) && occupies(r, dayIso))

  const dailyTotal = (dayIso) =>
    sortedRooms.reduce((sum, room) => sum + cellFor(room, dayIso).reduce((s, r) => s + nightPrice(r), 0), 0)

  const weekTotal = useMemo(() => days.reduce((s, d) => s + dailyTotal(d), 0), [days, sortedRooms, relevant])

  const roomLabel = (room) => `${room.number ? room.number + '. ' : ''}${room.name || room.number || 'Habitación'}`

  const statusCellClass = (status) => {
    switch (status) {
      case 'checked_in': return 'bg-green-50 border-green-200'
      case 'checked_out': return 'bg-gray-50 border-gray-200'
      case 'confirmed': return 'bg-blue-50 border-blue-200'
      default: return 'bg-white border-gray-200'
    }
  }

  const isToday = (iso) => iso === toISO(new Date())

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    doc.setFontSize(13)
    doc.text(`Reservas — Semana del ${fmtShort(days[0])} al ${fmtShort(days[6])}`, 14, 13)

    const head = [['Habitación', ...days.map((d, i) => `${DAY_NAMES[i]}\n${fmtShort(d)}`)]]
    const body = sortedRooms.map(room => {
      const label = `${roomLabel(room)}${room.type ? `\n${typeLabel(room.type)}` : ''}`
      const cells = days.map(d => {
        const list = cellFor(room, d)
        if (!list.length) return ''
        return list.map(r => {
          const guestsLine = `${r.guests || 1} huésp.${Number(r.pets) > 0 ? ` · ${r.pets} masc.` : ''}`
          const parts = [formatCurrency(nightPrice(r)), guestsLine, r.guestName || '']
          if (r.paymentMethod) parts.push(String(r.paymentMethod))
          return parts.filter(Boolean).join('\n')
        }).join('\n––\n')
      })
      return [label, ...cells]
    })
    const foot = [['Total', ...days.map(d => formatCurrency(dailyTotal(d)))]]

    autoTable(doc, {
      head, body, foot, startY: 18,
      styles: { fontSize: 7, cellPadding: 1.5, valign: 'top', lineColor: [220, 220, 220], lineWidth: 0.1 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 7, halign: 'center' },
      footStyles: { fillColor: [243, 244, 246], textColor: 17, fontStyle: 'bold', halign: 'right' },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 34 } },
      theme: 'grid',
    })
    doc.save(`Reservas_${days[0]}_a_${days[6]}.pdf`)
  }

  return (
    <div className="space-y-3">
      {/* Navegación de semana + export */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(w => addDays(w, -7))}
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
            title="Semana anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setWeekStart(startOfWeekMonday(new Date()))}
            className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700"
          >
            Esta semana
          </button>
          <button
            onClick={() => setWeekStart(w => addDays(w, 7))}
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
            title="Semana siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="ml-1 text-sm font-medium text-gray-800 flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4 text-gray-400" />
            {fmtShort(days[0])} — {fmtShort(days[6])}
          </span>
        </div>
        <button
          onClick={exportPDF}
          className="inline-flex items-center gap-2 px-3 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700"
        >
          <Download className="w-4 h-4" />
          Descargar PDF
        </button>
      </div>

      {/* Grilla */}
      {sortedRooms.length === 0 ? (
        <p className="text-sm text-gray-400 py-10 text-center">No hay habitaciones registradas.</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-600 border-b border-r min-w-[120px]">
                  Habitación
                </th>
                {days.map((d, i) => (
                  <th key={d} className={`px-2 py-2 text-center font-semibold border-b min-w-[110px] ${isToday(d) ? 'bg-amber-100 text-amber-800' : 'text-gray-600'}`}>
                    <div>{DAY_NAMES[i]}</div>
                    <div className="text-[10px] font-normal text-gray-500">{fmtShort(d)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRooms.map(room => (
                <tr key={room.id} className="border-b last:border-0">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r align-top">
                    <div className="font-semibold text-gray-900">{roomLabel(room)}</div>
                    {room.type && <div className="text-[10px] text-gray-500">{typeLabel(room.type)}</div>}
                  </td>
                  {days.map(d => {
                    const list = cellFor(room, d)
                    return (
                      <td key={d} className={`px-1.5 py-1.5 align-top border-l ${isToday(d) ? 'bg-amber-50/40' : ''}`}>
                        <div className="space-y-1">
                          {list.map((r, idx) => (
                            <div key={r.id || idx} className={`rounded border px-1.5 py-1 ${statusCellClass(r.status)}`}>
                              <div className="font-bold text-gray-900">{formatCurrency(nightPrice(r))}</div>
                              <div className="text-[10px] text-gray-600">
                                {r.guests || 1} huésp.{Number(r.pets) > 0 ? ` · ${r.pets} masc.` : ''}
                              </div>
                              <div className="text-[10px] text-gray-800 truncate" title={r.guestName}>{r.guestName || '—'}</div>
                              {r.paymentMethod && <div className="text-[9px] text-gray-500 uppercase">{r.paymentMethod}</div>}
                            </div>
                          ))}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
              {/* Totales */}
              <tr className="bg-gray-50 font-semibold">
                <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2 border-r border-t text-gray-700">Total</td>
                {days.map(d => (
                  <td key={d} className="px-2 py-2 border-t border-l text-right text-gray-900">
                    {dailyTotal(d) > 0 ? formatCurrency(dailyTotal(d)) : ''}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 text-right">Total de la semana: <span className="font-semibold text-gray-700">{formatCurrency(weekTotal)}</span></p>
    </div>
  )
}
