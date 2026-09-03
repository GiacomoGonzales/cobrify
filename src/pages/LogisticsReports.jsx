import { useState, useEffect, useMemo } from 'react'
import { BarChart3, Search, Loader2, ArrowUpFromLine, ArrowDownToLine, HardHat, Package, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp, Download, Calendar, ShoppingCart } from 'lucide-react'
import Card, { CardContent } from '@/components/ui/Card'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { getWarehouseExits } from '@/services/warehouseExitService'
import { getWarehouseReturns } from '@/services/warehouseReturnService'
import { getProjects } from '@/services/projectService'
import { getPurchases } from '@/services/firestoreService'
import { formatCurrency } from '@/lib/utils'

export default function LogisticsReports() {
  const { user, getBusinessId, isDemoMode, demoData } = useAppContext()
  const toast = useToast()

  const [exits, setExits] = useState([])
  const [returns, setReturns] = useState([])
  const [projects, setProjects] = useState([])
  const [purchases, setPurchases] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [filterProject, setFilterProject] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [expandedProject, setExpandedProject] = useState(null)

  useEffect(() => {
    loadData()
  }, [user])

  const loadData = async () => {
    if (!user?.uid) return
    setIsLoading(true)
    try {
      if (isDemoMode) {
        setExits(demoData?.warehouseExits || [])
        setReturns(demoData?.warehouseReturns || [])
        setProjects(demoData?.projects || [])
        setPurchases(demoData?.purchases || [])
        setIsLoading(false)
        return
      }
      const businessId = getBusinessId()
      const [exitsResult, returnsResult, projectsResult, purchasesResult] = await Promise.all([
        getWarehouseExits(businessId),
        getWarehouseReturns(businessId),
        getProjects(businessId),
        getPurchases(businessId),
      ])
      if (exitsResult.success) setExits(exitsResult.data || [])
      if (returnsResult.success) setReturns(returnsResult.data || [])
      if (projectsResult.success) setProjects(projectsResult.data || [])
      // Solo las compras ASIGNADAS a una obra. Las generales —oficina, flota—
      // no son de nadie y sumarlas inflaria el costo de alguna obra.
      if (purchasesResult.success) {
        setPurchases((purchasesResult.data || []).filter(c => c.projectId))
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const toDate = (ts) => {
    if (!ts) return null
    if (ts.toDate) return ts.toDate()
    if (ts.seconds) return new Date(ts.seconds * 1000)
    return null
  }

  const formatDate = (ts) => {
    const d = toDate(ts)
    if (!d) return '-'
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  // Filtrar por fecha
  const filterByDate = (items) => {
    return items.filter(item => {
      const d = toDate(item.createdAt)
      if (!d) return true
      if (filterDateFrom && d < new Date(filterDateFrom + 'T00:00:00')) return false
      if (filterDateTo && d > new Date(filterDateTo + 'T23:59:59')) return false
      return true
    })
  }

  const filteredExits = filterByDate(filterProject === 'all' ? exits : exits.filter(e => e.projectId === filterProject))
  const filteredReturns = filterByDate(filterProject === 'all' ? returns : returns.filter(r => r.projectId === filterProject))
  const filteredPurchases = filterByDate(filterProject === 'all' ? purchases : purchases.filter(c => c.projectId === filterProject))

  // ===== STATS GENERALES =====
  const generalStats = useMemo(() => {
    const totalExitItems = filteredExits.reduce((s, e) => s + (e.totalItems || 0), 0)
    const totalReturnItems = filteredReturns.reduce((s, r) => s + (r.totalItems || 0), 0)
    const totalGood = filteredReturns.reduce((s, r) => s + (r.goodItems || 0), 0)
    const totalDamaged = filteredReturns.reduce((s, r) => s + (r.damagedItems || 0), 0)
    const totalLost = filteredReturns.reduce((s, r) => s + (r.lostItems || 0), 0)
    const pendingInField = totalExitItems - totalReturnItems

    // Lo COMPRADO para obras: unidades y plata. Es la primera punta del
    // circuito —comprado, enviado, devuelto— y sin ella no hay saldo.
    const totalBoughtItems = filteredPurchases.reduce(
      (s, c) => s + (c.items || []).reduce((n, it) => n + (Number(it.quantity) || 0), 0), 0)
    const totalBoughtAmount = filteredPurchases.reduce((s, c) => s + (Number(c.total) || 0), 0)

    return { totalExitItems, totalReturnItems, totalGood, totalDamaged, totalLost, pendingInField,
             totalBoughtItems, totalBoughtAmount }
  }, [filteredExits, filteredReturns, filteredPurchases])

  // ===== DATOS POR PROYECTO =====
  const projectStats = useMemo(() => {
    const stats = {}

    projects.forEach(p => {
      stats[p.id] = {
        project: p,
        exits: 0,
        exitItems: 0,
        returns: 0,
        returnItems: 0,
        goodItems: 0,
        damagedItems: 0,
        lostItems: 0,
        pendingInField: 0,
        purchases: 0,
        boughtItems: 0,
        boughtAmount: 0,
        productDetails: {},
      }
    })

    // Lo COMPRADO para cada obra. Va primero porque es el punto de partida:
    // todo lo demas —enviar, devolver— pasa despues.
    filteredPurchases.forEach(compra => {
      if (!stats[compra.projectId]) return
      const s2 = stats[compra.projectId]
      s2.purchases++
      s2.boughtAmount += Number(compra.total) || 0
      compra.items?.forEach(item => {
        const cantidad = Number(item.quantity) || 0
        s2.boughtItems += cantidad
        const key = item.productId || item.productName
        if (!s2.productDetails[key]) {
          s2.productDetails[key] = {
            name: item.productName, code: item.productCode,
            bought: 0, sent: 0, returnedGood: 0, returnedDamaged: 0, lost: 0,
          }
        }
        s2.productDetails[key].bought += cantidad
      })
    })

    filteredExits.forEach(exit => {
      if (!stats[exit.projectId]) return
      stats[exit.projectId].exits++
      stats[exit.projectId].exitItems += exit.totalItems || 0
      exit.items?.forEach(item => {
        const key = item.productId || item.productName
        if (!stats[exit.projectId].productDetails[key]) {
          stats[exit.projectId].productDetails[key] = {
            name: item.productName, code: item.productCode,
            bought: 0, sent: 0, returnedGood: 0, returnedDamaged: 0, lost: 0,
          }
        }
        stats[exit.projectId].productDetails[key].sent += item.quantity
      })
    })

    filteredReturns.forEach(ret => {
      if (!stats[ret.projectId]) return
      stats[ret.projectId].returns++
      stats[ret.projectId].returnItems += ret.totalItems || 0
      stats[ret.projectId].goodItems += ret.goodItems || 0
      stats[ret.projectId].damagedItems += ret.damagedItems || 0
      stats[ret.projectId].lostItems += ret.lostItems || 0
      ret.items?.forEach(item => {
        const key = item.productId || item.productName
        if (!stats[ret.projectId].productDetails[key]) {
          stats[ret.projectId].productDetails[key] = {
            name: item.productName, code: item.productCode,
            bought: 0, sent: 0, returnedGood: 0, returnedDamaged: 0, lost: 0,
          }
        }
        if (item.condition === 'good') stats[ret.projectId].productDetails[key].returnedGood += item.quantity
        else if (item.condition === 'damaged') stats[ret.projectId].productDetails[key].returnedDamaged += item.quantity
        else if (item.condition === 'lost') stats[ret.projectId].productDetails[key].lost += item.quantity
      })
    })

    // Calcular pendientes
    Object.values(stats).forEach(s => {
      s.pendingInField = s.exitItems - s.returnItems
      Object.values(s.productDetails).forEach(pd => {
        pd.pending = pd.sent - pd.returnedGood - pd.returnedDamaged - pd.lost
      })
    })

    // Sin enviar: lo que se compro para la obra y todavia esta en el almacen.
    Object.values(stats).forEach(s2 => {
      Object.values(s2.productDetails).forEach(pd => {
        pd.notSent = (pd.bought || 0) - pd.sent
      })
    })

    // Una obra con compras pero sin movimientos todavia tambien cuenta: es
    // justo la que hay que mirar para saber que queda por despachar.
    return Object.values(stats).filter(s => s.exits > 0 || s.returns > 0 || s.purchases > 0)
  }, [projects, filteredExits, filteredReturns, filteredPurchases])

  // ===== HISTORIAL COMBINADO =====
  const timeline = useMemo(() => {
    const all = [
      ...filteredExits.map(e => ({ ...e, _type: 'exit' })),
      ...filteredReturns.map(r => ({ ...r, _type: 'return' })),
      ...filteredPurchases.map(c => ({ ...c, _type: 'purchase' })),
    ]
    all.sort((a, b) => {
      const dA = toDate(a.createdAt)?.getTime() || 0
      const dB = toDate(b.createdAt)?.getTime() || 0
      return dB - dA
    })
    return all
  }, [filteredExits, filteredReturns, filteredPurchases])

  const tabs = [
    { id: 'overview', label: 'Resumen General' },
    { id: 'projects', label: 'Por Proyecto' },
    { id: 'timeline', label: 'Historial' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-7 h-7 text-indigo-600" />
          Reportes Logísticos
        </h1>
        <p className="text-gray-600 mt-1">Historial de movimientos, inventario por obra y resumen de estados</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterProject}
          onChange={e => setFilterProject(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
        >
          <option value="all">Todos los proyectos</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>
          ))}
        </select>
        <input
          type="date"
          value={filterDateFrom}
          onChange={e => setFilterDateFrom(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
          placeholder="Desde"
        />
        <input
          type="date"
          value={filterDateTo}
          onChange={e => setFilterDateTo(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
          placeholder="Hasta"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <>
          {/* Stats principales */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card><CardContent className="p-3 text-center">
              <ArrowUpFromLine className="w-5 h-5 text-indigo-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-indigo-600">{generalStats.totalExitItems}</p>
              <p className="text-xs text-gray-500">Enviados</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <ArrowDownToLine className="w-5 h-5 text-blue-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-blue-600">{generalStats.totalReturnItems}</p>
              <p className="text-xs text-gray-500">Retornados</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <Package className="w-5 h-5 text-amber-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-amber-600">{generalStats.pendingInField}</p>
              <p className="text-xs text-gray-500">En obra</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <CheckCircle className="w-5 h-5 text-green-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-green-600">{generalStats.totalGood}</p>
              <p className="text-xs text-gray-500">Buen estado</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-yellow-600">{generalStats.totalDamaged}</p>
              <p className="text-xs text-gray-500">Dañados</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <XCircle className="w-5 h-5 text-red-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-red-600">{generalStats.totalLost}</p>
              <p className="text-xs text-gray-500">Perdidos</p>
            </CardContent></Card>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <div className="flex gap-1 overflow-x-auto">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ===== TAB: RESUMEN GENERAL ===== */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {projectStats.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-gray-500">
                  No hay movimientos registrados
                </CardContent></Card>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b text-xs text-gray-500">
                        <th className="text-left py-3 px-4">Proyecto</th>
                        <th className="text-center py-3 px-2">Salidas</th>
                        <th className="text-center py-3 px-2">Enviados</th>
                        <th className="text-center py-3 px-2">Retornados</th>
                        <th className="text-center py-3 px-2">En obra</th>
                        <th className="text-center py-3 px-2">Buen est.</th>
                        <th className="text-center py-3 px-2">Dañados</th>
                        <th className="text-center py-3 px-2">Perdidos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectStats.map(ps => (
                        <tr key={ps.project.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div className="font-medium text-gray-900">{ps.project.name}</div>
                            {ps.project.code && <span className="text-xs text-indigo-600 font-mono">{ps.project.code}</span>}
                          </td>
                          <td className="py-3 px-2 text-center">{ps.exits}</td>
                          <td className="py-3 px-2 text-center font-semibold text-indigo-600">{ps.exitItems}</td>
                          <td className="py-3 px-2 text-center font-semibold text-blue-600">{ps.returnItems}</td>
                          <td className="py-3 px-2 text-center font-bold text-amber-600">{ps.pendingInField}</td>
                          <td className="py-3 px-2 text-center text-green-600">{ps.goodItems}</td>
                          <td className="py-3 px-2 text-center text-yellow-600">{ps.damagedItems}</td>
                          <td className="py-3 px-2 text-center text-red-600">{ps.lostItems}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Vista móvil del resumen */}
              <div className="sm:hidden space-y-3">
                {projectStats.map(ps => (
                  <Card key={ps.project.id}>
                    <CardContent className="p-3">
                      <div className="font-semibold text-gray-900 mb-2">{ps.project.name}
                        {ps.project.code && <span className="text-xs text-indigo-600 font-mono ml-2">{ps.project.code}</span>}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div><p className="font-bold text-indigo-600">{ps.exitItems}</p><p className="text-gray-500">Enviados</p></div>
                        <div><p className="font-bold text-blue-600">{ps.returnItems}</p><p className="text-gray-500">Retornados</p></div>
                        <div><p className="font-bold text-amber-600">{ps.pendingInField}</p><p className="text-gray-500">En obra</p></div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs mt-2 pt-2 border-t">
                        <div><p className="font-bold text-green-600">{ps.goodItems}</p><p className="text-gray-500">Ok</p></div>
                        <div><p className="font-bold text-yellow-600">{ps.damagedItems}</p><p className="text-gray-500">Dañados</p></div>
                        <div><p className="font-bold text-red-600">{ps.lostItems}</p><p className="text-gray-500">Perdidos</p></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* ===== TAB: POR PROYECTO ===== */}
          {activeTab === 'projects' && (
            <div className="space-y-3">
              {projectStats.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-gray-500">
                  No hay movimientos registrados
                </CardContent></Card>
              ) : (
                projectStats.map(ps => (
                  <Card key={ps.project.id} className="overflow-hidden">
                    <CardContent className="p-0">
                      <button
                        onClick={() => setExpandedProject(expandedProject === ps.project.id ? null : ps.project.id)}
                        className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <HardHat className="w-4 h-4 text-indigo-600" />
                              <span className="font-semibold text-gray-900">{ps.project.name}</span>
                              {ps.project.code && <span className="text-xs text-indigo-600 font-mono">({ps.project.code})</span>}
                            </div>
                            <div className="flex flex-wrap gap-3 mt-1 text-xs">
                              {ps.boughtItems > 0 && (
                                <span className="text-emerald-700">
                                  {ps.boughtItems} comprados · {formatCurrency(ps.boughtAmount)}
                                </span>
                              )}
                              <span className="text-indigo-600">{ps.exitItems} enviados</span>
                              <span className="text-blue-600">{ps.returnItems} retornados</span>
                              <span className="font-bold text-amber-600">{ps.pendingInField} en obra</span>
                              {ps.damagedItems > 0 && <span className="text-yellow-600">{ps.damagedItems} dañados</span>}
                              {ps.lostItems > 0 && <span className="text-red-600">{ps.lostItems} perdidos</span>}
                            </div>
                          </div>
                          {expandedProject === ps.project.id ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                        </div>
                      </button>

                      {expandedProject === ps.project.id && (
                        <div className="border-t border-gray-100 px-4 pb-4">
                          <h4 className="text-xs font-semibold text-gray-500 uppercase mt-3 mb-2">Detalle por producto</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-gray-500 border-b">
                                  <th className="text-left py-2">Producto</th>
                                  <th className="text-center py-2">Comprados</th>
                                  <th className="text-center py-2">Enviados</th>
                                  <th className="text-center py-2">Ret. OK</th>
                                  <th className="text-center py-2">Dañados</th>
                                  <th className="text-center py-2">Perdidos</th>
                                  <th className="text-center py-2 font-bold">En obra</th>
                                  {/* Lo comprado para la obra que todavia no salio del almacen:
                                      es el "sobrante" que pidio ECOQORIS. */}
                                  <th className="text-center py-2">Sin enviar</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.values(ps.productDetails).map((pd, idx) => (
                                  <tr key={idx} className="border-b border-gray-50">
                                    <td className="py-2">
                                      <span className="font-medium text-gray-900">{pd.name}</span>
                                      {pd.code && <span className="text-xs text-gray-500 font-mono ml-1">{pd.code}</span>}
                                    </td>
                                    <td className="py-2 text-center text-emerald-700">{pd.bought || 0}</td>
                                    <td className="py-2 text-center text-indigo-600">{pd.sent}</td>
                                    <td className="py-2 text-center text-green-600">{pd.returnedGood}</td>
                                    <td className="py-2 text-center text-yellow-600">{pd.returnedDamaged}</td>
                                    <td className="py-2 text-center text-red-600">{pd.lost}</td>
                                    <td className="py-2 text-center font-bold text-amber-600">{pd.pending}</td>
                                    <td className="py-2 text-center text-gray-600">{pd.notSent}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* ===== TAB: HISTORIAL ===== */}
          {activeTab === 'timeline' && (
            <div className="space-y-2">
              {timeline.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-gray-500">
                  No hay movimientos registrados
                </CardContent></Card>
              ) : (
                timeline.map(mov => {
                  const isExit = mov._type === 'exit'
                  const isCompra = mov._type === 'purchase'
                  // Una compra es el PRIMER movimiento de la obra: entra material.
                  // Sus campos son otros (no tiene number ni userName; el "quién" es
                  // el proveedor y las unidades salen de los items).
                  const unidades = isCompra
                    ? (mov.items || []).reduce((n2, it) => n2 + (Number(it.quantity) || 0), 0)
                    : (mov.totalItems || 0)
                  return (
                    <div key={mov.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50">
                      <div className={`p-2 rounded-full flex-shrink-0 ${isCompra ? 'bg-emerald-100' : isExit ? 'bg-indigo-100' : 'bg-blue-100'}`}>
                        {isCompra
                          ? <ShoppingCart className="w-4 h-4 text-emerald-700" />
                          : isExit
                            ? <ArrowUpFromLine className="w-4 h-4 text-indigo-600" />
                            : <ArrowDownToLine className="w-4 h-4 text-blue-600" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {mov.number && <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{mov.number}</span>}
                          {isCompra && mov.invoiceNumber && (
                            <span className="text-xs font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{mov.invoiceNumber}</span>
                          )}
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isCompra ? 'bg-emerald-100 text-emerald-700' : isExit ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`}>
                            {isCompra ? 'Compra' : isExit ? 'Salida' : 'Retorno'}
                          </span>
                          <span className="font-medium text-gray-900 text-sm truncate">{mov.projectName}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
                          <span>{unidades} und · {mov.items?.length || 0} productos</span>
                          {isCompra
                            ? <>
                                <span>{mov.supplier?.businessName || 'Sin proveedor'}</span>
                                <span className="text-emerald-700">{formatCurrency(mov.total || 0)}</span>
                              </>
                            : <>
                                <span>{mov.warehouseName}</span>
                                <span>{mov.userName}</span>
                              </>
                          }
                          {!isExit && !isCompra && mov.damagedItems > 0 && <span className="text-yellow-600">{mov.damagedItems} dañados</span>}
                          {!isExit && !isCompra && mov.lostItems > 0 && <span className="text-red-600">{mov.lostItems} perdidos</span>}
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(mov.createdAt)}</span>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
