import { useState, useEffect } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { PLANS, classifyPlan } from '@/services/subscriptionService'
import { Loader2, RefreshCw, Package, Users, Building2, UserCheck } from 'lucide-react'

/**
 * Reporte de DISTRIBUCIÓN DE PLANES (solo lectura).
 * Cuenta cuántos clientes hay parados en cada plan, separando por origen
 * (directo de Cobrify / reseller / vendedor) y clasificando cada plan como
 * vendible / sistema / legacy / desconocido. Base de la Fase 0 (ordenar planes)
 * para decidir qué planes legacy importan y cómo migrarlos.
 */
export default function AdminPlanDistribution() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [totals, setTotals] = useState({ total: 0, directo: 0, reseller: 0, vendedor: 0, legacy: 0, planesEnUso: 0 })

  const load = async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'subscriptions'))
      const byPlan = {}
      const t = { total: 0, directo: 0, reseller: 0, vendedor: 0, legacy: 0 }

      snap.forEach(d => {
        const data = d.data()
        // Excluir sub-usuarios no aplica: la suscripción vive en el doc del dueño.
        const planId = data.plan || 'desconocido'
        const origin = data.resellerId ? 'reseller' : (data.vendedorId ? 'vendedor' : 'directo')
        const active = data.status === 'active' && data.accessBlocked !== true

        if (!byPlan[planId]) {
          byPlan[planId] = { planId, total: 0, directo: 0, reseller: 0, vendedor: 0, activos: 0 }
        }
        const r = byPlan[planId]
        r.total++
        r[origin]++
        if (active) r.activos++

        t.total++
        t[origin]++
        if (classifyPlan(planId) === 'legacy') t.legacy++
      })

      const list = Object.values(byPlan)
        .map(r => ({
          ...r,
          name: PLANS[r.planId]?.name || (r.planId === 'desconocido' ? '(sin plan)' : r.planId),
          price: PLANS[r.planId]?.totalPrice,
          clase: classifyPlan(r.planId),
        }))
        .sort((a, b) => b.total - a.total)

      setRows(list)
      setTotals({ ...t, planesEnUso: list.length })
    } catch (e) {
      console.error('Error cargando distribución de planes:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const claseBadge = (clase) => {
    const map = {
      vendible: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      sistema: 'bg-blue-100 text-blue-700 border-blue-200',
      legacy: 'bg-amber-100 text-amber-700 border-amber-200',
      desconocido: 'bg-red-100 text-red-700 border-red-200',
    }
    return map[clase] || 'bg-gray-100 text-gray-600 border-gray-200'
  }

  const Card = ({ icon: Icon, label, value, sub, tone = 'text-gray-900' }) => (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
          <Icon className="w-5 h-5 text-gray-600" />
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">{label}</p>
          <p className={`text-xl font-bold ${tone}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Distribución de planes</h1>
          <p className="text-sm text-gray-600">Cuántos clientes hay en cada plan, por origen y clasificación. Base para ordenar el catálogo.</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card icon={Users} label="Total clientes" value={totals.total} />
        <Card icon={UserCheck} label="Directos (Cobrify)" value={totals.directo} sub="elegibles a pasarela" tone="text-emerald-700" />
        <Card icon={Building2} label="De reseller" value={totals.reseller} />
        <Card icon={Building2} label="De vendedor" value={totals.vendedor} />
        <Card icon={Package} label="En planes legacy" value={totals.legacy} tone="text-amber-700" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Planes en uso ({rows.length})</h2>
          <span className="text-xs text-gray-500">Ordenado por nº de clientes</span>
        </div>
        {loading ? (
          <div className="p-10 text-center text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Cargando suscripciones...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="px-4 py-2 font-medium">Plan</th>
                  <th className="px-4 py-2 font-medium">ID</th>
                  <th className="px-4 py-2 font-medium">Clase</th>
                  <th className="px-4 py-2 font-medium text-right">Precio</th>
                  <th className="px-4 py-2 font-medium text-right">Total</th>
                  <th className="px-4 py-2 font-medium text-right">Activos</th>
                  <th className="px-4 py-2 font-medium text-right">Directos</th>
                  <th className="px-4 py-2 font-medium text-right">Reseller</th>
                  <th className="px-4 py-2 font-medium text-right">Vendedor</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.planId} className={`border-b border-gray-100 last:border-0 ${r.clase === 'legacy' ? 'bg-amber-50/40' : r.clase === 'desconocido' ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-2 font-medium text-gray-900">{r.name}</td>
                    <td className="px-4 py-2 text-gray-400 font-mono text-xs">{r.planId}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 text-xs rounded-full border ${claseBadge(r.clase)}`}>{r.clase}</span>
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">{r.price != null ? `S/ ${r.price.toFixed(2)}` : '—'}</td>
                    <td className="px-4 py-2 text-right font-semibold text-gray-900">{r.total}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{r.activos}</td>
                    <td className="px-4 py-2 text-right text-emerald-700">{r.directo}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{r.reseller}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{r.vendedor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Clases: <span className="text-emerald-700">vendible</span> = catálogo actual ·
        <span className="text-blue-700"> sistema</span> = trial/enterprise ·
        <span className="text-amber-700"> legacy</span> = plan viejo a migrar ·
        <span className="text-red-700"> desconocido</span> = id no reconocido (revisar).
      </p>
    </div>
  )
}
