import { useState, useEffect, useMemo } from 'react'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { useAppContext } from '@/hooks/useAppContext'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import {
  DollarSign,
  TrendingUp,
  Home,
  Key,
  Building2,
  Loader2,
  Download,
  Users,
  UserCheck,
  Handshake,
  Calendar,
  BarChart3,
  PieChart,
} from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Select from '@/components/ui/Select'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { formatCurrency } from '@/lib/utils'
import * as XLSX from 'xlsx'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts'

const COLORS = ['#06b6d4', '#f97316', '#10b981', '#8b5cf6', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6']

export default function RealEstateReports() {
  const { getBusinessId } = useAppContext()
  const { isBusinessOwner } = useAuth()
  const toast = useToast()

  const [operations, setOperations] = useState([])
  const [agents, setAgents] = useState([])
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('month')
  const [selectedReport, setSelectedReport] = useState('overview')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const businessId = getBusinessId()

      const [operationsSnap, agentsSnap, propertiesSnap] = await Promise.all([
        getDocs(query(collection(db, `businesses/${businessId}/operations`), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, `businesses/${businessId}/agents`)),
        getDocs(collection(db, `businesses/${businessId}/properties`)),
      ])

      const operationsData = operationsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date(),
      }))

      const agentsData = agentsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      const propertiesData = propertiesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      setOperations(operationsData)
      setAgents(agentsData)
      setProperties(propertiesData)
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  // Filtrar operaciones por rango de fecha
  const filteredOperations = useMemo(() => {
    const now = new Date()
    const filterDate = new Date()

    switch (dateRange) {
      case 'day':
        filterDate.setDate(now.getDate() - 1)
        break
      case 'week':
        filterDate.setDate(now.getDate() - 7)
        break
      case 'month':
        filterDate.setMonth(now.getMonth() - 1)
        break
      case 'quarter':
        filterDate.setMonth(now.getMonth() - 3)
        break
      case 'year':
        filterDate.setFullYear(now.getFullYear() - 1)
        break
      case 'all':
        return operations
      default:
        return operations
    }

    return operations.filter(op => op.createdAt >= filterDate)
  }, [operations, dateRange])

  // Solo operaciones cerradas para comisiones
  const closedOperations = useMemo(() => {
    return filteredOperations.filter(op => op.status === 'cerrada')
  }, [filteredOperations])

  // Estadisticas generales
  const stats = useMemo(() => {
    const ventas = closedOperations.filter(op => op.type === 'venta')
    const alquileres = closedOperations.filter(op => op.type === 'alquiler')

    const totalComisionesInmobiliaria = closedOperations.reduce((sum, op) => sum + (op.commissionAmount || 0), 0)
    const totalComisionesAgentes = closedOperations.reduce((sum, op) => sum + (op.agentCommission || 0), 0)
    const totalVentas = ventas.reduce((sum, op) => sum + (op.agreedPrice || 0), 0)
    const totalAlquileres = alquileres.reduce((sum, op) => sum + (op.agreedPrice || 0), 0)

    return {
      totalOperaciones: closedOperations.length,
      operacionesEnProceso: filteredOperations.filter(op => op.status === 'en_proceso').length,
      cantidadVentas: ventas.length,
      cantidadAlquileres: alquileres.length,
      totalComisionesInmobiliaria,
      totalComisionesAgentes,
      gananciaNetaInmobiliaria: totalComisionesInmobiliaria - totalComisionesAgentes,
      totalVentas,
      totalAlquileres,
      volumenTotal: totalVentas + totalAlquileres,
      ticketPromedioVenta: ventas.length > 0 ? totalVentas / ventas.length : 0,
      ticketPromedioAlquiler: alquileres.length > 0 ? totalAlquileres / alquileres.length : 0,
    }
  }, [closedOperations, filteredOperations])

  // Estadisticas por agente
  const agentStats = useMemo(() => {
    const agentMap = {}

    // Inicializar todos los agentes
    agents.forEach(agent => {
      agentMap[agent.id] = {
        id: agent.id,
        name: agent.name,
        commissionPercent: agent.commissionPercent,
        isActive: agent.isActive,
        operacionesCerradas: 0,
        operacionesEnProceso: 0,
        totalVentas: 0,
        totalAlquileres: 0,
        comisionesGanadas: 0,
        volumenOperado: 0,
      }
    })

    // Agregar "Sin agente" para operaciones sin agente asignado
    agentMap['sin_agente'] = {
      id: 'sin_agente',
      name: 'Sin agente asignado',
      commissionPercent: 0,
      isActive: true,
      operacionesCerradas: 0,
      operacionesEnProceso: 0,
      totalVentas: 0,
      totalAlquileres: 0,
      comisionesGanadas: 0,
      volumenOperado: 0,
    }

    filteredOperations.forEach(op => {
      const agentId = op.agentId || 'sin_agente'
      if (!agentMap[agentId]) {
        agentMap[agentId] = {
          id: agentId,
          name: op.agentName || 'Agente desconocido',
          operacionesCerradas: 0,
          operacionesEnProceso: 0,
          totalVentas: 0,
          totalAlquileres: 0,
          comisionesGanadas: 0,
          volumenOperado: 0,
        }
      }

      if (op.status === 'cerrada') {
        agentMap[agentId].operacionesCerradas += 1
        agentMap[agentId].comisionesGanadas += op.agentCommission || 0
        agentMap[agentId].volumenOperado += op.agreedPrice || 0

        if (op.type === 'venta') {
          agentMap[agentId].totalVentas += 1
        } else {
          agentMap[agentId].totalAlquileres += 1
        }
      } else if (op.status === 'en_proceso') {
        agentMap[agentId].operacionesEnProceso += 1
      }
    })

    return Object.values(agentMap)
      .filter(a => a.operacionesCerradas > 0 || a.operacionesEnProceso > 0)
      .sort((a, b) => b.comisionesGanadas - a.comisionesGanadas)
  }, [filteredOperations, agents])

  // Datos por periodo para grafico
  const commissionsByPeriod = useMemo(() => {
    const now = new Date()
    const periodsData = {}
    let groupBy = 'month'

    if (dateRange === 'day' || dateRange === 'week') {
      groupBy = 'day'
      const days = dateRange === 'day' ? 1 : 7
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        periodsData[key] = {
          period: date.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }),
          comisionInmobiliaria: 0,
          comisionAgentes: 0,
          gananciaNet: 0,
          operaciones: 0,
        }
      }
    } else if (dateRange === 'month') {
      groupBy = 'day'
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        periodsData[key] = {
          period: date.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }),
          comisionInmobiliaria: 0,
          comisionAgentes: 0,
          gananciaNet: 0,
          operaciones: 0,
        }
      }
    } else if (dateRange === 'quarter') {
      groupBy = 'month'
      for (let i = 2; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        periodsData[key] = {
          period: date.toLocaleDateString('es-PE', { month: 'short', year: 'numeric' }),
          comisionInmobiliaria: 0,
          comisionAgentes: 0,
          gananciaNet: 0,
          operaciones: 0,
        }
      }
    } else {
      groupBy = 'month'
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        periodsData[key] = {
          period: date.toLocaleDateString('es-PE', { month: 'short', year: 'numeric' }),
          comisionInmobiliaria: 0,
          comisionAgentes: 0,
          gananciaNet: 0,
          operaciones: 0,
        }
      }
    }

    closedOperations.forEach(op => {
      let key
      if (groupBy === 'day') {
        key = `${op.createdAt.getFullYear()}-${String(op.createdAt.getMonth() + 1).padStart(2, '0')}-${String(op.createdAt.getDate()).padStart(2, '0')}`
      } else {
        key = `${op.createdAt.getFullYear()}-${String(op.createdAt.getMonth() + 1).padStart(2, '0')}`
      }

      if (periodsData[key]) {
        periodsData[key].comisionInmobiliaria += op.commissionAmount || 0
        periodsData[key].comisionAgentes += op.agentCommission || 0
        periodsData[key].gananciaNet += (op.commissionAmount || 0) - (op.agentCommission || 0)
        periodsData[key].operaciones += 1
      }
    })

    return Object.entries(periodsData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value)
  }, [closedOperations, dateRange])

  // Datos para grafico de tipo de operacion
  const operationTypeData = useMemo(() => {
    return [
      { name: 'Ventas', value: stats.cantidadVentas, color: COLORS[0] },
      { name: 'Alquileres', value: stats.cantidadAlquileres, color: COLORS[1] },
    ].filter(item => item.value > 0)
  }, [stats])

  // Datos para grafico de comisiones
  const commissionDistributionData = useMemo(() => {
    return [
      { name: 'Ganancia Inmobiliaria', value: stats.gananciaNetaInmobiliaria, color: COLORS[2] },
      { name: 'Comisiones Agentes', value: stats.totalComisionesAgentes, color: COLORS[3] },
    ].filter(item => item.value > 0)
  }, [stats])

  function formatPrice(price) {
    if (!price) return 'S/ 0'
    return `S/ ${price.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`
  }

  function formatDate(date) {
    if (!date) return '-'
    return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function exportToExcel() {
    // Hoja 1: Resumen General
    const resumenData = [
      { 'Concepto': 'Total Operaciones Cerradas', 'Valor': stats.totalOperaciones },
      { 'Concepto': 'Operaciones en Proceso', 'Valor': stats.operacionesEnProceso },
      { 'Concepto': 'Ventas Realizadas', 'Valor': stats.cantidadVentas },
      { 'Concepto': 'Alquileres Realizados', 'Valor': stats.cantidadAlquileres },
      { 'Concepto': 'Volumen Total Operado', 'Valor': stats.volumenTotal },
      { 'Concepto': 'Comisiones Totales Inmobiliaria', 'Valor': stats.totalComisionesInmobiliaria },
      { 'Concepto': 'Comisiones Pagadas a Agentes', 'Valor': stats.totalComisionesAgentes },
      { 'Concepto': 'Ganancia Neta Inmobiliaria', 'Valor': stats.gananciaNetaInmobiliaria },
    ]

    // Hoja 2: Por Agente
    const agentesData = agentStats.map(agent => ({
      'Agente': agent.name,
      'Operaciones Cerradas': agent.operacionesCerradas,
      'En Proceso': agent.operacionesEnProceso,
      'Ventas': agent.totalVentas,
      'Alquileres': agent.totalAlquileres,
      'Volumen Operado': agent.volumenOperado,
      'Comisiones Ganadas': agent.comisionesGanadas,
    }))

    // Hoja 3: Detalle de Operaciones
    const operacionesData = closedOperations.map(op => ({
      'Fecha': formatDate(op.createdAt),
      'Propiedad': op.propertyTitle,
      'Tipo': op.type === 'venta' ? 'Venta' : 'Alquiler',
      'Cliente': op.customerName || '-',
      'Agente': op.agentName || 'Sin asignar',
      'Precio Acordado': op.agreedPrice || 0,
      'Comision Inmobiliaria %': op.commissionPercent || 0,
      'Comision Inmobiliaria S/': op.commissionAmount || 0,
      'Comision Agente %': op.agentCommissionPercent || 0,
      'Comision Agente S/': op.agentCommission || 0,
      'Estado': op.status,
    }))

    const wb = XLSX.utils.book_new()
    const ws1 = XLSX.utils.json_to_sheet(resumenData)
    const ws2 = XLSX.utils.json_to_sheet(agentesData)
    const ws3 = XLSX.utils.json_to_sheet(operacionesData)

    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen')
    XLSX.utils.book_append_sheet(wb, ws2, 'Por Agente')
    XLSX.utils.book_append_sheet(wb, ws3, 'Operaciones')

    const dateRangeText = {
      day: 'hoy',
      week: 'semana',
      month: 'mes',
      quarter: 'trimestre',
      year: 'año',
      all: 'todo'
    }[dateRange] || 'periodo'

    XLSX.writeFile(wb, `reporte_inmobiliaria_${dateRangeText}_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {formatPrice(entry.value)}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando reportes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Reportes Inmobiliaria</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Comisiones y rendimiento de tu agencia
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            className="w-full sm:w-48"
          >
            <option value="day">Hoy</option>
            <option value="week">Ultima semana</option>
            <option value="month">Ultimo mes</option>
            <option value="quarter">Ultimo trimestre</option>
            <option value="year">Ultimo ano</option>
            <option value="all">Todo el periodo</option>
          </Select>
          <button
            onClick={exportToExcel}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Exportar Excel
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedReport('overview')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            selectedReport === 'overview'
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <BarChart3 className="w-4 h-4 inline-block mr-2" />
          Resumen General
        </button>
        <button
          onClick={() => setSelectedReport('agents')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            selectedReport === 'agents'
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <UserCheck className="w-4 h-4 inline-block mr-2" />
          Por Agente
        </button>
        <button
          onClick={() => setSelectedReport('operations')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            selectedReport === 'operations'
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Handshake className="w-4 h-4 inline-block mr-2" />
          Operaciones
        </button>
      </div>

      {/* Resumen General */}
      {selectedReport === 'overview' && (
        <>
          {/* KPIs principales */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Comisiones Totales</p>
                    <p className="text-2xl font-bold text-cyan-600 mt-2">
                      {formatPrice(stats.totalComisionesInmobiliaria)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {stats.totalOperaciones} operaciones
                    </p>
                  </div>
                  <div className="p-3 bg-cyan-100 rounded-lg">
                    <DollarSign className="w-6 h-6 text-cyan-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Pagado a Agentes</p>
                    <p className="text-2xl font-bold text-orange-600 mt-2">
                      {formatPrice(stats.totalComisionesAgentes)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {agentStats.filter(a => a.comisionesGanadas > 0).length} agentes
                    </p>
                  </div>
                  <div className="p-3 bg-orange-100 rounded-lg">
                    <UserCheck className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Ganancia Neta</p>
                    <p className="text-2xl font-bold text-green-600 mt-2">
                      {formatPrice(stats.gananciaNetaInmobiliaria)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Inmobiliaria
                    </p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-lg">
                    <TrendingUp className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Volumen Operado</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">
                      {formatPrice(stats.volumenTotal)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {stats.cantidadVentas} ventas, {stats.cantidadAlquileres} alquileres
                    </p>
                  </div>
                  <div className="p-3 bg-gray-100 rounded-lg">
                    <Building2 className="w-6 h-6 text-gray-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Graficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tendencia de comisiones */}
            <Card>
              <CardHeader>
                <CardTitle>Tendencia de Comisiones</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={commissionsByPeriod}>
                    <defs>
                      <linearGradient id="colorComisionInm" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorGanancia" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS[2]} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={COLORS[2]} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="comisionInmobiliaria"
                      stroke={COLORS[0]}
                      fillOpacity={1}
                      fill="url(#colorComisionInm)"
                      name="Comision Total"
                    />
                    <Area
                      type="monotone"
                      dataKey="gananciaNet"
                      stroke={COLORS[2]}
                      fillOpacity={1}
                      fill="url(#colorGanancia)"
                      name="Ganancia Neta"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Distribucion de comisiones */}
            <Card>
              <CardHeader>
                <CardTitle>Distribucion de Comisiones</CardTitle>
              </CardHeader>
              <CardContent>
                {commissionDistributionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RePieChart>
                      <Pie
                        data={commissionDistributionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                        {commissionDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatPrice(value)} />
                    </RePieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-gray-500">
                    No hay datos disponibles
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tipo de operaciones */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Tipos de Operacion</CardTitle>
              </CardHeader>
              <CardContent>
                {operationTypeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <RePieChart>
                      <Pie
                        data={operationTypeData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {operationTypeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RePieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[250px] text-gray-500">
                    No hay operaciones cerradas
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top 5 Agentes por Comisiones</CardTitle>
              </CardHeader>
              <CardContent>
                {agentStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={agentStats.slice(0, 5)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="comisionesGanadas" fill={COLORS[0]} name="Comisiones" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[250px] text-gray-500">
                    No hay datos de agentes
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Por Agente */}
      {selectedReport === 'agents' && (
        <>
          {/* Cards resumen por agente */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Agentes</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">{agents.length}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {agents.filter(a => a.isActive).length} activos
                    </p>
                  </div>
                  <Users className="w-8 h-8 text-cyan-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Top Agente</p>
                    <p className="text-lg font-bold text-gray-900 mt-2">
                      {agentStats.length > 0 && agentStats[0].id !== 'sin_agente'
                        ? agentStats[0].name
                        : 'N/A'}
                    </p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-green-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Mejor Comision</p>
                    <p className="text-2xl font-bold text-green-600 mt-2">
                      {formatPrice(agentStats.length > 0 ? agentStats[0].comisionesGanadas : 0)}
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Promedio por Agente</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">
                      {formatPrice(
                        agentStats.filter(a => a.id !== 'sin_agente').length > 0
                          ? stats.totalComisionesAgentes / agentStats.filter(a => a.id !== 'sin_agente').length
                          : 0
                      )}
                    </p>
                  </div>
                  <BarChart3 className="w-8 h-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Grafico de comisiones por agente */}
          <Card>
            <CardHeader>
              <CardTitle>Comisiones por Agente</CardTitle>
            </CardHeader>
            <CardContent>
              {agentStats.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={agentStats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={100} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="comisionesGanadas" fill={COLORS[0]} name="Comisiones Ganadas" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="volumenOperado" fill={COLORS[1]} name="Volumen Operado" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[400px] text-gray-500">
                  No hay datos de agentes
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tabla detallada por agente */}
          <Card>
            <CardHeader>
              <CardTitle>Detalle por Agente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pos.</TableHead>
                      <TableHead>Agente</TableHead>
                      <TableHead className="text-right">Op. Cerradas</TableHead>
                      <TableHead className="text-right">En Proceso</TableHead>
                      <TableHead className="text-right">Ventas</TableHead>
                      <TableHead className="text-right">Alquileres</TableHead>
                      <TableHead className="text-right">Volumen</TableHead>
                      <TableHead className="text-right">Comisiones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentStats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                          No hay datos de agentes
                        </TableCell>
                      </TableRow>
                    ) : (
                      agentStats.map((agent, index) => (
                        <TableRow key={agent.id}>
                          <TableCell>
                            <div
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                                index === 0
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : index === 1
                                  ? 'bg-gray-200 text-gray-700'
                                  : index === 2
                                  ? 'bg-orange-100 text-orange-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {index + 1}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {agent.id !== 'sin_agente' && (
                                <UserCheck className="w-4 h-4 text-cyan-600" />
                              )}
                              <span className="font-medium">{agent.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="success">{agent.operacionesCerradas}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="warning">{agent.operacionesEnProceso}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{agent.totalVentas}</TableCell>
                          <TableCell className="text-right">{agent.totalAlquileres}</TableCell>
                          <TableCell className="text-right">{formatPrice(agent.volumenOperado)}</TableCell>
                          <TableCell className="text-right font-bold text-green-600">
                            {formatPrice(agent.comisionesGanadas)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Operaciones */}
      {selectedReport === 'operations' && (
        <>
          {/* KPIs de operaciones */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Cerradas</p>
                    <p className="text-2xl font-bold text-green-600 mt-2">{stats.totalOperaciones}</p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-lg">
                    <Handshake className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">En Proceso</p>
                    <p className="text-2xl font-bold text-yellow-600 mt-2">{stats.operacionesEnProceso}</p>
                  </div>
                  <div className="p-3 bg-yellow-100 rounded-lg">
                    <Calendar className="w-6 h-6 text-yellow-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Ticket Promedio Venta</p>
                    <p className="text-2xl font-bold text-cyan-600 mt-2">
                      {formatPrice(stats.ticketPromedioVenta)}
                    </p>
                  </div>
                  <div className="p-3 bg-cyan-100 rounded-lg">
                    <Key className="w-6 h-6 text-cyan-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Ticket Promedio Alquiler</p>
                    <p className="text-2xl font-bold text-orange-600 mt-2">
                      {formatPrice(stats.ticketPromedioAlquiler)}
                    </p>
                  </div>
                  <div className="p-3 bg-orange-100 rounded-lg">
                    <Building2 className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabla de operaciones */}
          <Card>
            <CardHeader>
              <CardTitle>Operaciones Cerradas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Propiedad</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Agente</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead className="text-right">Com. Inmob.</TableHead>
                      <TableHead className="text-right">Com. Agente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {closedOperations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                          No hay operaciones cerradas en este periodo
                        </TableCell>
                      </TableRow>
                    ) : (
                      closedOperations.slice(0, 20).map(op => (
                        <TableRow key={op.id}>
                          <TableCell className="text-sm">{formatDate(op.createdAt)}</TableCell>
                          <TableCell className="font-medium">{op.propertyTitle}</TableCell>
                          <TableCell>
                            <Badge variant={op.type === 'venta' ? 'primary' : 'warning'}>
                              {op.type === 'venta' ? 'Venta' : 'Alquiler'}
                            </Badge>
                          </TableCell>
                          <TableCell>{op.customerName || '-'}</TableCell>
                          <TableCell>
                            {op.agentName ? (
                              <span className="inline-flex items-center gap-1 text-sm text-cyan-700">
                                <UserCheck className="w-3 h-3" />
                                {op.agentName}
                              </span>
                            ) : (
                              <span className="text-gray-400">Sin asignar</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatPrice(op.agreedPrice)}
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            {formatPrice(op.commissionAmount)}
                            <span className="text-xs text-gray-500 ml-1">({op.commissionPercent}%)</span>
                          </TableCell>
                          <TableCell className="text-right text-orange-600">
                            {formatPrice(op.agentCommission || 0)}
                            {op.agentCommissionPercent && (
                              <span className="text-xs text-gray-500 ml-1">({op.agentCommissionPercent}%)</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {closedOperations.length > 20 && (
                <p className="text-center text-sm text-gray-500 mt-4">
                  Mostrando 20 de {closedOperations.length} operaciones. Exporta a Excel para ver todas.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
