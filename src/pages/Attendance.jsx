import { useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { QRCodeSVG } from 'qrcode.react'
import {
  UserCheck, Clock, MapPin, Scan, Loader2, QrCode, RefreshCw,
  CheckCircle2, AlertTriangle, Calendar, Filter, Download, Plus, X,
  ShieldCheck, XCircle,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import Tabs, { TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { getBranches } from '@/services/branchService'
import { getCompanySettings } from '@/services/firestoreService'
import { getManagedUsers } from '@/services/userManagementService'
import {
  buildQrPayload,
  createManualAttendance,
  getAttendanceRecords,
  getLastAttendance,
  markAttendanceFromQR,
  regenerateAttendanceToken,
  setAttendanceApproval,
  setAttendanceEnabled,
  updateBranchGeofence,
} from '@/services/attendanceService'

const formatDateTime = (ts) => {
  if (!ts) return '-'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const statusBadge = (record) => {
  if (record.autoClosed) return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">Auto-cerrado</span>
  switch (record.approvalStatus) {
    case 'approved':
      return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Aprobado</span>
    case 'pending':
      return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Pendiente</span>
    case 'manual':
      return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Manual</span>
    case 'rejected':
      return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Rechazado</span>
    default:
      return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">—</span>
  }
}

export default function Attendance() {
  const { user, isBusinessOwner, isAdmin, getBusinessId } = useAppContext()
  const canManage = !!(isBusinessOwner || isAdmin)
  const toast = useToast()

  const [activeTab, setActiveTab] = useState('mark')
  const [branches, setBranches] = useState([])
  const [subUsers, setSubUsers] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  const [lastMark, setLastMark] = useState(null)

  // Filtros en tab Marcaciones
  const [filterUser, setFilterUser] = useState('')
  const [filterBranch, setFilterBranch] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  // Modal de marcación manual
  const [showManualModal, setShowManualModal] = useState(false)
  const [manualForm, setManualForm] = useState({ userId: '', branchId: '', type: 'in', timestamp: '', notes: '' })

  // Modal de fallback web (pegar contenido del QR)
  const [showPasteModal, setShowPasteModal] = useState(false)
  const [pastedQr, setPastedQr] = useState('')

  const isNative = useMemo(() => Capacitor.isNativePlatform(), [])
  const businessId = getBusinessId?.()
  const scanningRef = useRef(false)

  useEffect(() => {
    loadInitial()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadInitial = async () => {
    if (!businessId) return
    setLoading(true)
    try {
      const [branchesRes, settingsRes, usersRes, lastRes] = await Promise.all([
        getBranches(businessId),
        getCompanySettings(businessId),
        canManage ? getManagedUsers(businessId) : Promise.resolve({ success: true, data: [] }),
        user?.uid ? getLastAttendance(businessId, user.uid) : Promise.resolve({ success: true, data: null }),
      ])
      // Sucursal principal: se representa con id 'main' y se nutre de companySettings.
      // Su configuración de asistencia vive en el documento del negocio (no en branches).
      const mainBranch = settingsRes.success && settingsRes.data ? {
        id: 'main',
        name: settingsRes.data.name || settingsRes.data.businessName || 'Sucursal Principal',
        address: settingsRes.data.address || '',
        attendance: settingsRes.data.attendance || {},
        isMain: true,
      } : null
      const realBranches = branchesRes.success ? (branchesRes.data || []) : []
      setBranches(mainBranch ? [mainBranch, ...realBranches] : realBranches)
      if (usersRes.success) setSubUsers(usersRes.data || [])
      if (lastRes.success) setLastMark(lastRes.data)
      if (canManage) await loadRecords()
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // Recarga branches + principal tras cualquier cambio (toggle, regenerar, geofence)
  const reloadBranches = async () => {
    const [branchesRes, settingsRes] = await Promise.all([
      getBranches(businessId),
      getCompanySettings(businessId),
    ])
    const mainBranch = settingsRes.success && settingsRes.data ? {
      id: 'main',
      name: settingsRes.data.name || settingsRes.data.businessName || 'Sucursal Principal',
      address: settingsRes.data.address || '',
      attendance: settingsRes.data.attendance || {},
      isMain: true,
    } : null
    const realBranches = branchesRes.success ? (branchesRes.data || []) : []
    setBranches(mainBranch ? [mainBranch, ...realBranches] : realBranches)
  }

  const loadRecords = async (filters = {}) => {
    if (!businessId) return
    const res = await getAttendanceRecords(businessId, filters)
    if (res.success) setRecords(res.data || [])
  }

  const applyFilters = async () => {
    await loadRecords({
      userId: filterUser || undefined,
      branchId: filterBranch || undefined,
      fromDate: filterFrom || undefined,
      toDate: filterTo || undefined,
    })
  }

  const clearFilters = async () => {
    setFilterUser(''); setFilterBranch(''); setFilterFrom(''); setFilterTo('')
    await loadRecords()
  }

  const getCurrentPosition = () => new Promise((resolve) => {
    const onPos = (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
    const onErr = () => resolve(null)
    const tryNative = async () => {
      try {
        const { Geolocation } = await import('@capacitor/geolocation')
        const perm = await Geolocation.checkPermissions()
        if (perm.location !== 'granted') {
          const req = await Geolocation.requestPermissions()
          if (req.location !== 'granted') return resolve(null)
        }
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 })
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
      } catch {
        resolve(null)
      }
    }
    if (isNative) return tryNative()
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(onPos, onErr, { enableHighAccuracy: true, timeout: 10000 })
  })

  const scanQrNative = async () => {
    const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')
    try {
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
      if (!available) await BarcodeScanner.installGoogleBarcodeScannerModule()
    } catch { /* no-op */ }
    const { camera } = await BarcodeScanner.checkPermissions()
    if (camera !== 'granted') {
      const { camera: n } = await BarcodeScanner.requestPermissions()
      if (n !== 'granted') throw new Error('Se necesita permiso de cámara')
    }
    const { barcodes } = await BarcodeScanner.scan()
    await BarcodeScanner.stopScan().catch(() => {})
    if (!barcodes || barcodes.length === 0) throw new Error('No se detectó ningún QR')
    return barcodes[0].rawValue
  }

  const handleMark = async () => {
    if (marking || scanningRef.current) return
    if (!businessId || !user?.uid) {
      toast.error('Sesión no válida')
      return
    }
    scanningRef.current = true
    setMarking(true)
    try {
      // Obtener QR: scanner nativo o pegado manualmente
      let qrContent
      if (isNative) {
        try {
          qrContent = await scanQrNative()
        } catch (e) {
          toast.error(e.message || 'Error al escanear')
          return
        }
      } else {
        setShowPasteModal(true)
        return
      }
      await performMark(qrContent)
    } finally {
      scanningRef.current = false
      setMarking(false)
    }
  }

  const performMark = async (qrContent) => {
    const gps = await getCurrentPosition()
    const res = await markAttendanceFromQR(businessId, { scannedToken: qrContent, user, gps })
    if (!res.success) {
      toast.error(res.error || 'No se pudo registrar la marcación')
      return
    }
    const typeLabel = res.type === 'in' ? 'Entrada' : 'Salida'
    if (res.gpsValid === false) {
      toast.warning(`${typeLabel} registrada. Fuera de zona — pendiente de aprobación.`)
    } else {
      toast.success(`${typeLabel} registrada correctamente`)
    }
    const lastRes = await getLastAttendance(businessId, user.uid)
    if (lastRes.success) setLastMark(lastRes.data)
    if (canManage) await loadRecords()
  }

  const handlePastedQrSubmit = async () => {
    if (!pastedQr.trim()) {
      toast.error('Pega el contenido del QR')
      return
    }
    setShowPasteModal(false)
    setMarking(true)
    try {
      await performMark(pastedQr.trim())
      setPastedQr('')
    } finally {
      setMarking(false)
    }
  }

  const handleRegenerateToken = async (branchId) => {
    if (!confirm('¿Regenerar el QR de esta sucursal? Los carteles impresos dejarán de funcionar.')) return
    const res = await regenerateAttendanceToken(businessId, branchId, user?.uid)
    if (res.success) {
      toast.success('QR regenerado')
      await reloadBranches()
    } else {
      toast.error(res.error || 'No se pudo regenerar')
    }
  }

  const handleToggleEnabled = async (branchId, enabled) => {
    const res = await setAttendanceEnabled(businessId, branchId, enabled, user?.uid)
    if (res.success) {
      await reloadBranches()
    } else {
      toast.error(res.error || 'Error')
    }
  }

  const handleSaveGeofence = async (branchId, { lat, lng, radius }) => {
    const res = await updateBranchGeofence(businessId, branchId, { lat, lng, radius })
    if (res.success) {
      toast.success('Geofence actualizado')
      await reloadBranches()
    } else {
      toast.error(res.error || 'Error')
    }
  }

  const handleUseCurrentPosForBranch = async (branchId) => {
    toast.info?.('Obteniendo ubicación actual...')
    const pos = await getCurrentPosition()
    if (!pos) {
      toast.error('No se pudo obtener la ubicación')
      return
    }
    const current = branches.find(b => b.id === branchId)?.attendance || {}
    await handleSaveGeofence(branchId, { lat: pos.lat, lng: pos.lng, radius: current.gpsRadius ?? 100 })
  }

  const handleCreateManual = async () => {
    if (!manualForm.userId || !manualForm.type || !manualForm.timestamp) {
      toast.error('Completá todos los campos')
      return
    }
    const selectedUser = subUsers.find(u => u.uid === manualForm.userId || u.id === manualForm.userId)
    const selectedBranch = branches.find(b => b.id === manualForm.branchId)
    const res = await createManualAttendance(businessId, {
      userId: selectedUser?.uid || selectedUser?.id || manualForm.userId,
      userName: selectedUser?.displayName || selectedUser?.name || '',
      userEmail: selectedUser?.email || '',
      branchId: manualForm.branchId || null,
      branchName: selectedBranch?.name || '',
      type: manualForm.type,
      timestamp: manualForm.timestamp,
      notes: manualForm.notes,
      createdBy: user?.uid,
    })
    if (res.success) {
      toast.success('Marcación manual creada')
      setShowManualModal(false)
      setManualForm({ userId: '', branchId: '', type: 'in', timestamp: '', notes: '' })
      await loadRecords({
        userId: filterUser || undefined,
        branchId: filterBranch || undefined,
        fromDate: filterFrom || undefined,
        toDate: filterTo || undefined,
      })
    } else {
      toast.error(res.error || 'Error')
    }
  }

  const handleApproval = async (recordId, status) => {
    const res = await setAttendanceApproval(businessId, recordId, status, user?.uid)
    if (res.success) {
      toast.success(status === 'approved' ? 'Marcación aprobada' : 'Marcación rechazada')
      await loadRecords({
        userId: filterUser || undefined,
        branchId: filterBranch || undefined,
        fromDate: filterFrom || undefined,
        toDate: filterTo || undefined,
      })
    } else {
      toast.error(res.error || 'Error')
    }
  }

  const exportCsv = () => {
    if (records.length === 0) {
      toast.info?.('No hay registros para exportar')
      return
    }
    const headers = ['Fecha y hora', 'Empleado', 'Email', 'Sucursal', 'Tipo', 'Estado', 'GPS válido', 'Notas']
    const rows = records.map(r => [
      formatDateTime(r.timestamp),
      r.userName || '',
      r.userEmail || '',
      r.branchName || '',
      r.type === 'in' ? 'Entrada' : 'Salida',
      r.autoClosed ? 'Auto-cerrado' : (r.approvalStatus || ''),
      r.gpsValid ? 'Sí' : 'No',
      (r.notes || '').replace(/\n/g, ' '),
    ])
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `asistencia_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  // Sub-usuario en web: no puede marcar (requiere app) ni gestionar. Mostrar mensaje.
  if (!canManage && !isNative) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <UserCheck className="w-7 h-7 text-primary-600" />
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Control de Asistencia</h1>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center max-w-md mx-auto">
          <div className="mx-auto w-14 h-14 bg-yellow-100 rounded-full flex items-center justify-center mb-3">
            <AlertTriangle className="w-7 h-7 text-yellow-600" />
          </div>
          <h2 className="font-bold text-gray-900 text-lg mb-2">Disponible en la app móvil</h2>
          <p className="text-sm text-gray-600">
            Para marcar tu asistencia y ver tu historial, usá la app en tu celular. El escaneo de QR y la validación por ubicación solo funcionan ahí.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <UserCheck className="w-7 h-7 text-primary-600" />
            Control de Asistencia
          </h1>
          <p className="text-sm text-gray-600 mt-1">Registro de entradas y salidas del personal mediante QR por sucursal.</p>
        </div>
      </div>

      <Tabs defaultValue={isNative ? 'mark' : (canManage ? 'records' : 'myhistory')}>
        {({ activeTab: at, setActiveTab: setAt }) => {
          // Sincronizar con estado externo
          if (at !== activeTab) setActiveTab(at)
          return (
            <>
              <TabsList className="bg-gray-100">
                {/* "Marcar" solo tiene sentido en la app nativa (scanner + GPS).
                    En web desktop no se muestra. */}
                {isNative && (
                  <TabsTrigger value="mark" activeTab={at} setActiveTab={setAt}>Marcar</TabsTrigger>
                )}
                {canManage && (
                  <>
                    <TabsTrigger value="records" activeTab={at} setActiveTab={setAt}>Marcaciones</TabsTrigger>
                    <TabsTrigger value="config" activeTab={at} setActiveTab={setAt}>Configuración</TabsTrigger>
                  </>
                )}
                {!canManage && isNative && (
                  <TabsTrigger value="myhistory" activeTab={at} setActiveTab={setAt}>Mi historial</TabsTrigger>
                )}
              </TabsList>

              {/* ========== TAB: MARCAR ========== */}
              <TabsContent value="mark" activeTab={at} className="mt-4">
                <div className="max-w-md mx-auto space-y-4">
                  <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
                    <div className="mx-auto w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mb-3">
                      <Clock className="w-8 h-8 text-primary-600" />
                    </div>
                    {lastMark ? (
                      <div className="text-sm text-gray-600 mb-4">
                        <p className="font-medium text-gray-900">Última marcación</p>
                        <p className="mt-1">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${lastMark.type === 'in' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                            {lastMark.type === 'in' ? 'Entrada' : 'Salida'}
                          </span>
                          <span className="ml-2">{formatDateTime(lastMark.timestamp)}</span>
                        </p>
                        {lastMark.branchName && <p className="text-xs text-gray-500 mt-1">en {lastMark.branchName}</p>}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 mb-4">Todavía no registraste ninguna marcación.</p>
                    )}

                    <Button onClick={handleMark} disabled={marking} className="w-full py-6 text-lg">
                      {marking ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Scan className="w-5 h-5 mr-2" />}
                      {marking ? 'Registrando...' : 'Escanear QR y marcar'}
                    </Button>

                    {!isNative && (
                      <p className="text-xs text-gray-500 mt-3">
                        En navegador web, se abrirá un cuadro para pegar el contenido del QR.
                      </p>
                    )}
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs text-blue-900">
                    <p className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>Se pedirá permiso de ubicación. Si estás fuera de la zona configurada, la marcación quedará pendiente de aprobación.</span>
                    </p>
                  </div>
                </div>
              </TabsContent>

              {/* ========== TAB: MARCACIONES (owner) ========== */}
              {canManage && (
                <TabsContent value="records" activeTab={at} className="mt-4">
                  <div className="space-y-4">
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Filter className="w-4 h-4" /> Filtros</h3>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setShowManualModal(true)}>
                            <Plus className="w-4 h-4 mr-1" /> Manual
                          </Button>
                          <Button size="sm" variant="outline" onClick={exportCsv}>
                            <Download className="w-4 h-4 mr-1" /> CSV
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        <Select label="Empleado" value={filterUser} onChange={e => setFilterUser(e.target.value)}>
                          <option value="">Todos</option>
                          {subUsers.map(u => (
                            <option key={u.uid || u.id} value={u.uid || u.id}>{u.displayName || u.name || u.email}</option>
                          ))}
                        </Select>
                        <Select label="Sucursal" value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
                          <option value="">Todas</option>
                          {branches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </Select>
                        <Input type="date" label="Desde" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
                        <Input type="date" label="Hasta" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" onClick={applyFilters}>Aplicar</Button>
                        <Button size="sm" variant="outline" onClick={clearFilters}>Limpiar</Button>
                      </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      {records.length === 0 ? (
                        <div className="p-8 text-center text-sm text-gray-500">
                          <Calendar className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                          Sin marcaciones para los filtros seleccionados.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Fecha</th>
                                <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Empleado</th>
                                <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Sucursal</th>
                                <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Tipo</th>
                                <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Estado</th>
                                <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs uppercase"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {records.map(r => (
                                <tr key={r.id} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{formatDateTime(r.timestamp)}</td>
                                  <td className="px-3 py-2 text-gray-900">
                                    <div className="font-medium">{r.userName || '—'}</div>
                                    <div className="text-xs text-gray-500">{r.userEmail || ''}</div>
                                  </td>
                                  <td className="px-3 py-2 text-gray-700">{r.branchName || '—'}</td>
                                  <td className="px-3 py-2">
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${r.type === 'in' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                                      {r.type === 'in' ? 'Entrada' : 'Salida'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2">{statusBadge(r)}</td>
                                  <td className="px-3 py-2 text-right">
                                    {r.approvalStatus === 'pending' && (
                                      <div className="flex gap-1 justify-end">
                                        <button onClick={() => handleApproval(r.id, 'approved')} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Aprobar">
                                          <CheckCircle2 className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleApproval(r.id, 'rejected')} className="p-1 text-red-600 hover:bg-red-50 rounded" title="Rechazar">
                                          <XCircle className="w-4 h-4" />
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              )}

              {/* ========== TAB: CONFIGURACIÓN (owner) ========== */}
              {canManage && (
                <TabsContent value="config" activeTab={at} className="mt-4">
                  <div className="space-y-4">
                    {branches.length === 0 && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
                        <AlertTriangle className="w-5 h-5 inline mr-2" />
                        No tenés sucursales creadas. Andá a Configuración → Sucursales para crear al menos una.
                      </div>
                    )}
                    {branches.map(branch => (
                      <BranchAttendanceCard
                        key={branch.id}
                        branch={branch}
                        onToggle={(enabled) => handleToggleEnabled(branch.id, enabled)}
                        onRegenerate={() => handleRegenerateToken(branch.id)}
                        onSaveGeofence={(geo) => handleSaveGeofence(branch.id, geo)}
                        onUseCurrentPos={() => handleUseCurrentPosForBranch(branch.id)}
                      />
                    ))}
                  </div>
                </TabsContent>
              )}

              {/* ========== TAB: MI HISTORIAL (sub-user) ========== */}
              {!canManage && (
                <TabsContent value="myhistory" activeTab={at} className="mt-4">
                  <MyHistory businessId={businessId} userId={user?.uid} />
                </TabsContent>
              )}
            </>
          )
        }}
      </Tabs>

      {/* Modal marcación manual */}
      <Modal isOpen={showManualModal} onClose={() => setShowManualModal(false)} maxWidth="md">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">Marcación manual</h3>
            <button onClick={() => setShowManualModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
          <p className="text-sm text-gray-600 mb-4">Usá esto solo en emergencia: cuando la app falló, el empleado olvidó marcar, etc.</p>
          <div className="space-y-3">
            <Select label="Empleado *" value={manualForm.userId} onChange={e => setManualForm({ ...manualForm, userId: e.target.value })}>
              <option value="">Seleccionar...</option>
              {subUsers.map(u => (
                <option key={u.uid || u.id} value={u.uid || u.id}>{u.displayName || u.name || u.email}</option>
              ))}
            </Select>
            <Select label="Sucursal" value={manualForm.branchId} onChange={e => setManualForm({ ...manualForm, branchId: e.target.value })}>
              <option value="">(Sin sucursal)</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
            <Select label="Tipo *" value={manualForm.type} onChange={e => setManualForm({ ...manualForm, type: e.target.value })}>
              <option value="in">Entrada</option>
              <option value="out">Salida</option>
            </Select>
            <Input type="datetime-local" label="Fecha y hora *" value={manualForm.timestamp} onChange={e => setManualForm({ ...manualForm, timestamp: e.target.value })} />
            <Input label="Motivo / Notas" value={manualForm.notes} onChange={e => setManualForm({ ...manualForm, notes: e.target.value })} placeholder="Ej: La app no abrió, corte de internet..." />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowManualModal(false)}>Cancelar</Button>
            <Button onClick={handleCreateManual}>Guardar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal paste QR (fallback web) */}
      <Modal isOpen={showPasteModal} onClose={() => { setShowPasteModal(false); setMarking(false); setPastedQr('') }} maxWidth="md">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">Contenido del QR</h3>
            <button onClick={() => { setShowPasteModal(false); setMarking(false); setPastedQr('') }} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            En la versión web no hay scanner de cámara. Pegá acá el contenido del QR (podés escanearlo con otro lector o copiar el JSON al configurarlo).
          </p>
          <textarea
            value={pastedQr}
            onChange={e => setPastedQr(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
            placeholder='{"v":1,"bid":"...","t":"..."}'
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => { setShowPasteModal(false); setMarking(false); setPastedQr('') }}>Cancelar</Button>
            <Button onClick={handlePastedQrSubmit}>Marcar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// Tarjeta de configuración por sucursal
function BranchAttendanceCard({ branch, onToggle, onRegenerate, onSaveGeofence, onUseCurrentPos }) {
  const att = branch.attendance || {}
  const enabled = att.enabled !== false && !!att.token
  const [radius, setRadius] = useState(att.gpsRadius ?? '')
  const [lat, setLat] = useState(att.gpsLat ?? '')
  const [lng, setLng] = useState(att.gpsLng ?? '')
  const qrValue = enabled && att.token ? buildQrPayload({ branchId: branch.id, token: att.token }) : ''

  useEffect(() => {
    setRadius(att.gpsRadius ?? '')
    setLat(att.gpsLat ?? '')
    setLng(att.gpsLng ?? '')
  }, [att.gpsRadius, att.gpsLat, att.gpsLng])

  const saveGeo = () => {
    const latN = lat === '' ? null : Number(lat)
    const lngN = lng === '' ? null : Number(lng)
    const radN = radius === '' ? null : Number(radius)
    if ((latN !== null || lngN !== null || radN !== null) && (latN === null || lngN === null || radN === null)) {
      // Permitimos limpiar todo (null), pero no parcial
      return onSaveGeofence({ lat: null, lng: null, radius: null })
    }
    onSaveGeofence({ lat: latN, lng: lngN, radius: radN })
  }

  const clearGeo = () => {
    setLat(''); setLng(''); setRadius('')
    onSaveGeofence({ lat: null, lng: null, radius: null })
  }

  const downloadQrPng = () => {
    if (!qrValue) return
    const svg = document.getElementById(`qr-${branch.id}`)
    if (!svg) return
    const xml = new XMLSerializer().serializeToString(svg)
    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 512
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, 512, 512)
      ctx.drawImage(img, 0, 0, 512, 512)
      canvas.toBlob(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `qr-asistencia-${(branch.name || branch.id).replace(/\s+/g, '-')}.png`
        a.click()
        URL.revokeObjectURL(a.href)
        URL.revokeObjectURL(url)
      })
    }
    img.src = url
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-900 text-lg">{branch.name}</h3>
            {branch.isMain && (
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 font-semibold">Principal</span>
            )}
          </div>
          {branch.address && <p className="text-xs text-gray-500 mt-0.5">{branch.address}</p>}
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => onToggle(e.target.checked)}
            className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
          />
          <span className="text-sm font-medium text-gray-700">Habilitar asistencia</span>
        </label>
      </div>

      {enabled ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* QR */}
          <div>
            <p className="text-xs font-medium text-gray-600 uppercase mb-2 flex items-center gap-1"><QrCode className="w-3.5 h-3.5" /> QR de la sucursal</p>
            <div className="bg-white border-2 border-gray-200 rounded-lg p-4 flex items-center justify-center">
              <QRCodeSVG id={`qr-${branch.id}`} value={qrValue} size={200} level="M" includeMargin />
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={downloadQrPng} className="flex-1">
                <Download className="w-4 h-4 mr-1" /> Descargar PNG
              </Button>
              <Button size="sm" variant="outline" onClick={onRegenerate} className="flex-1">
                <RefreshCw className="w-4 h-4 mr-1" /> Regenerar
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Imprimí este QR y pegalo en un lugar visible. Cualquier regeneración invalida los carteles anteriores.</p>
          </div>

          {/* Geofence */}
          <div>
            <p className="text-xs font-medium text-gray-600 uppercase mb-2 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Zona permitida (GPS)</p>
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" step="0.000001" label="Latitud" value={lat} onChange={e => setLat(e.target.value)} placeholder="-12.046" />
              <Input type="number" step="0.000001" label="Longitud" value={lng} onChange={e => setLng(e.target.value)} placeholder="-77.032" />
              <Input type="number" label="Radio (metros)" value={radius} onChange={e => setRadius(e.target.value)} placeholder="100" />
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              <Button size="sm" onClick={saveGeo}>Guardar zona</Button>
              <Button size="sm" variant="outline" onClick={onUseCurrentPos}>
                <MapPin className="w-4 h-4 mr-1" /> Usar mi ubicación
              </Button>
              {(att.gpsLat != null || att.gpsLng != null || att.gpsRadius != null) && (
                <Button size="sm" variant="outline" onClick={clearGeo}>Quitar zona</Button>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">Sin zona configurada, todas las marcaciones se aprueban automáticamente. Con zona, las que estén fuera quedan pendientes de aprobación.</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500 italic">Habilitá asistencia para generar el QR de esta sucursal.</p>
      )}
    </div>
  )
}

// Historial personal del sub-usuario
function MyHistory({ businessId, userId }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      if (!businessId || !userId) return
      setLoading(true)
      const res = await getAttendanceRecords(businessId, { userId, max: 200 })
      if (res.success) setRecords(res.data || [])
      setLoading(false)
    }
    load()
  }, [businessId, userId])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500">
        <Calendar className="w-10 h-10 mx-auto text-gray-300 mb-2" />
        No tenés marcaciones registradas todavía.
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Fecha</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Sucursal</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Tipo</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {records.map(r => (
            <tr key={r.id} className="hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{formatDateTime(r.timestamp)}</td>
              <td className="px-3 py-2 text-gray-700">{r.branchName || '—'}</td>
              <td className="px-3 py-2">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${r.type === 'in' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                  {r.type === 'in' ? 'Entrada' : 'Salida'}
                </span>
              </td>
              <td className="px-3 py-2">{statusBadge(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
