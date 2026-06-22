import { useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { QRCodeSVG } from 'qrcode.react'
import {
  UserCheck, Clock, MapPin, Scan, Loader2, QrCode, RefreshCw,
  CheckCircle2, AlertTriangle, Calendar, Filter, Download, Plus, X,
  ShieldCheck, XCircle, Briefcase, Phone, Mail, MapPinned, CreditCard, Search,
  Store,
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
  updateBranchGracePeriod,
} from '@/services/attendanceService'
import {
  getEmployees,
  getHrStatusInfo,
  getEmploymentTypeLabel,
  HR_STATUSES,
} from '@/services/personnelService'
import SchedulePlanner, { ALL_BRANCHES } from '@/components/personnel/SchedulePlanner'
import VacationManager from '@/components/personnel/VacationManager'

const formatDateTime = (ts) => {
  if (!ts) return '-'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Helpers para vista del sub-usuario (jornadas)
const tsToDate = (ts) => {
  if (!ts) return null
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return Number.isNaN(d.getTime()) ? null : d
}

const dayKey = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Agrupa registros por día y devuelve un objeto { 'YYYY-MM-DD': { date, marks: [{...r, _ts}] } }
const groupRecordsByDay = (records) => {
  const groups = {}
  records.forEach((r) => {
    const ts = tsToDate(r.timestamp)
    if (!ts) return
    const key = dayKey(ts)
    if (!groups[key]) groups[key] = { date: ts, marks: [] }
    groups[key].marks.push({ ...r, _ts: ts })
  })
  Object.values(groups).forEach((g) => g.marks.sort((a, b) => a._ts - b._ts))
  return groups
}

// Resumen por día: primera entrada, última salida, total trabajado
const summaryForDay = (group) => {
  if (!group) return { inMark: null, outMark: null, totalMs: null, marks: [] }
  const marks = group.marks
  const inMark = marks.find((m) => m.type === 'in') || null
  const outMark = [...marks].reverse().find((m) => m.type === 'out') || null
  let totalMs = null
  if (inMark && outMark && outMark._ts > inMark._ts) {
    totalMs = outMark._ts - inMark._ts
  }
  return { inMark, outMark, totalMs, marks }
}

const formatTime = (date) => date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })

const formatDuration = (ms) => {
  if (ms == null || ms < 0) return '—'
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const formatDayLabel = (date) => {
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (dayKey(date) === dayKey(today)) return 'Hoy'
  if (dayKey(date) === dayKey(yesterday)) return 'Ayer'
  return date.toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'short' })
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
  const { user, isBusinessOwner, isAdmin, getBusinessId, filterBranchesByAccess, hasMainBranchAccess, isDemoMode, demoData, businessSettings, hasPageAccess } = useAppContext()
  const canManage = !!(isBusinessOwner || isAdmin)
  // Sub-usuario con permiso "Horarios": puede usar SOLO el planificador de
  // horarios (no el resto de la gestión de personal). Requiere también el
  // permiso "Marcar Asistencia" para tener acceso a la página /asistencia.
  const canManageSchedules = canManage || (typeof hasPageAccess === 'function' && hasPageAccess('schedules'))
  const toast = useToast()

  // Tab inicial: en app nativa siempre "mark", en web depende del rol.
  // Se inicializa una sola vez (no se recalcula en cada render).
  const [activeTab, setActiveTab] = useState(() => {
    const native = Capacitor.isNativePlatform()
    if (native) return 'mark'
    if (isBusinessOwner || isAdmin) return 'records'
    return 'myhistory'
  })
  const [branches, setBranches] = useState([])
  const [subUsers, setSubUsers] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  const [lastMark, setLastMark] = useState(null)
  // Marcaciones del usuario actual de los últimos 7 días (para vista de jornada)
  const [myWeekRecords, setMyWeekRecords] = useState([])

  // Filtros en tab Marcaciones.
  // Rango por defecto: lunes a domingo de la semana en curso, para que al
  // entrar el cliente vea de inmediato la actividad reciente sin tener que
  // elegir fechas. "Limpiar" deja ambos vacíos (= sin filtro de fecha).
  const getCurrentWeekRange = () => {
    const today = new Date()
    const dow = today.getDay() // 0=dom, 1=lun, ..., 6=sab
    const monday = new Date(today)
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const toYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { from: toYmd(monday), to: toYmd(sunday) }
  }
  const [filterUser, setFilterUser] = useState('')
  const [filterBranch, setFilterBranch] = useState('')
  const [filterFrom, setFilterFrom] = useState(() => getCurrentWeekRange().from)
  const [filterTo, setFilterTo] = useState(() => getCurrentWeekRange().to)

  // Modal de marcación manual
  const [showManualModal, setShowManualModal] = useState(false)
  const [manualForm, setManualForm] = useState({ userId: '', branchId: '', type: 'in', timestamp: '', notes: '' })

  // Modal de fallback web (pegar contenido del QR)
  const [showPasteModal, setShowPasteModal] = useState(false)
  const [pastedQr, setPastedQr] = useState('')

  // Tab "Personal" (Capa 1 del módulo Personal)
  const [employees, setEmployees] = useState([])
  const [employeesLoaded, setEmployeesLoaded] = useState(false)
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [employeeFilterDept, setEmployeeFilterDept] = useState('')
  const [employeeFilterStatus, setEmployeeFilterStatus] = useState('')

  const isNative = useMemo(() => Capacitor.isNativePlatform(), [])
  const businessId = getBusinessId?.()
  const scanningRef = useRef(false)

  // ----- Selector de sucursal para el tab Horarios (header de la página) -----
  // Sucursal seleccionada con persistencia en localStorage por business.
  const [selectedScheduleBranch, setSelectedScheduleBranch] = useState(() => {
    try { return localStorage.getItem(`attendance.scheduleBranch.${businessId || ''}`) || 'main' } catch { return 'main' }
  })
  useEffect(() => {
    try { localStorage.setItem(`attendance.scheduleBranch.${businessId || ''}`, selectedScheduleBranch) } catch {}
  }, [businessId, selectedScheduleBranch])
  // Sucursales accesibles para el usuario (filtradas por permisos).
  // IMPORTANTE: estos hooks tienen que estar ANTES de cualquier return temprano del
  // componente, o React detecta "Rendered more hooks than during the previous render".
  const accessibleScheduleBranches = useMemo(() => {
    const filtered = filterBranchesByAccess ? filterBranchesByAccess(branches) : branches
    return filtered.filter(b => b.isMain ? hasMainBranchAccess : true)
  }, [branches, filterBranchesByAccess, hasMainBranchAccess])
  // Si la sucursal guardada deja de ser accesible, caemos a la primera disponible.
  useEffect(() => {
    if (accessibleScheduleBranches.length === 0) return
    if (selectedScheduleBranch !== ALL_BRANCHES && !accessibleScheduleBranches.some(b => b.id === selectedScheduleBranch)) {
      setSelectedScheduleBranch(accessibleScheduleBranches[0].id)
    }
  }, [accessibleScheduleBranches, selectedScheduleBranch])

  useEffect(() => {
    loadInitial()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cargar empleados cuando se entra a "Personal", "Horarios" o "Vacaciones"
  useEffect(() => {
    const needsEmployees = ['personnel', 'schedules', 'vacations'].includes(activeTab)
    if (needsEmployees && !employeesLoaded && canManageSchedules) {
      loadEmployees()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, employeesLoaded, canManageSchedules])

  // Sub-usuario con permiso de Horarios (no gestor): abrir directo el
  // planificador en vez de "Mi historial". Se ejecuta una sola vez al
  // resolverse el permiso (no pelea con clics posteriores del usuario).
  useEffect(() => {
    if (!canManage && canManageSchedules) {
      setActiveTab(prev => (prev === 'myhistory' ? 'schedules' : prev))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, canManageSchedules])

  const loadInitial = async () => {
    if (isDemoMode) {
      const mainBranch = { id: 'main', name: demoData?.business?.businessName || 'Sucursal Principal', address: demoData?.business?.address || '', attendance: {}, isMain: true }
      setBranches([mainBranch])
      setSubUsers(demoData?.employees || [])
      setEmployees(demoData?.employees || [])
      setEmployeesLoaded(true)
      setMyWeekRecords(demoData?.attendanceRecords || [])
      setRecords(demoData?.attendanceRecords || [])
      setLastMark(demoData?.attendanceRecords?.[0] || null)
      setLoading(false)
      return
    }
    if (!businessId) return
    setLoading(true)
    try {
      // Para sub-usuarios cargamos las marcaciones de los últimos 7 días para
      // armar la vista de jornadas. Para owner/admin con acceso completo usamos
      // la última marcación nada más (ellos tienen la tab "Marcaciones" con todo).
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const [branchesRes, settingsRes, usersRes, lastRes, weekRes] = await Promise.all([
        getBranches(businessId),
        getCompanySettings(businessId),
        canManageSchedules ? getManagedUsers(businessId) : Promise.resolve({ success: true, data: [] }),
        user?.uid ? getLastAttendance(businessId, user.uid) : Promise.resolve({ success: true, data: null }),
        user?.uid
          ? getAttendanceRecords(businessId, { userId: user.uid, fromDate: sevenDaysAgo.toISOString(), max: 200 })
          : Promise.resolve({ success: true, data: [] }),
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
      if (weekRes.success) setMyWeekRecords(weekRes.data || [])
      // Carga inicial filtrada por la semana en curso (estado inicial de los
      // filtros). Si el usuario quiere ver todo, presiona "Limpiar".
      if (canManage) await loadRecords({ fromDate: filterFrom || undefined, toDate: filterTo || undefined })
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // Carga la lista de empleados (sub-usuarios con datos de personal).
  // Se hace lazy: solo cuando el owner abre la tab "Personal".
  const loadEmployees = async () => {
    if (isDemoMode) return
    if (!businessId) return
    try {
      const res = await getEmployees(businessId)
      if (res.success) {
        setEmployees(res.data)
        setEmployeesLoaded(true)
      }
    } catch (e) {
      console.error('Error cargando empleados:', e)
    }
  }

  // Recarga branches + principal tras cualquier cambio (toggle, regenerar, geofence)
  const reloadBranches = async () => {
    if (isDemoMode) return
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
    if (isDemoMode) return
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

        // 1. Verificar/pedir permiso
        let permGranted = false
        try {
          const perm = await Geolocation.checkPermissions()
          if (perm.location === 'granted') {
            permGranted = true
          } else {
            const req = await Geolocation.requestPermissions()
            permGranted = req.location === 'granted'
            // Bug @capacitor/geolocation v8: llamar getCurrentPosition() inmediatamente después
            // de requestPermissions() puede crashear en algunos Android porque la Activity
            // todavía se está re-inicializando tras el diálogo del sistema. Esperamos 500ms.
            if (permGranted) await new Promise((r) => setTimeout(r, 500))
          }
        } catch (permErr) {
          console.warn('Error verificando permiso de ubicación:', permErr)
        }

        if (!permGranted) return resolve(null)

        // 2. Obtener posición. enableHighAccuracy: false es más rápido y menos
        //    propenso a crashear cuando no hay fix GPS reciente. Para asistencia
        //    no necesitamos precisión sub-métrica.
        try {
          const pos = await Geolocation.getCurrentPosition({
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 60000, // Acepta una posición reciente cacheada (1 min)
          })
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          })
        } catch (gpsErr) {
          console.warn('Error obteniendo posición GPS:', gpsErr)
          resolve(null)
        }
      } catch (importErr) {
        console.warn('Error cargando plugin Geolocation:', importErr)
        resolve(null)
      }
    }
    if (isNative) return tryNative()
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(onPos, onErr, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 })
  })

  // Espera a que el módulo Google Barcode Scanner esté instalado.
  // installGoogleBarcodeScannerModule() solo dispara el download — si llamamos
  // scan() antes de que termine, la app CRASHEA. Hay que escuchar el evento de
  // progreso y esperar a state COMPLETED.
  const ensureBarcodeModule = async (BarcodeScanner) => {
    try {
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
      if (available) return true
    } catch { /* fallthrough */ }

    toast.info('Instalando módulo de escaneo (puede tardar unos segundos)…', 5000)

    return await new Promise((resolve) => {
      let listenerHandle = null
      let settled = false
      const settle = (ok) => {
        if (settled) return
        settled = true
        try { listenerHandle?.remove?.() } catch { /* no-op */ }
        resolve(ok)
      }

      // Timeout de seguridad: 60s para conexiones lentas
      const timeoutId = setTimeout(() => {
        toast.error('La instalación del módulo demoró demasiado. Intenta de nuevo con buena señal.', 5000)
        settle(false)
      }, 60000)

      try {
        // Listener de progreso. Cuando state === 4 (COMPLETED) seguimos.
        BarcodeScanner.addListener('googleBarcodeScannerModuleInstallProgress', (info) => {
          // info.state: 1=PENDING, 2=DOWNLOADING, 3=CANCELED, 4=COMPLETED, 5=FAILED, 6=INSTALLING, 7=DOWNLOAD_PAUSED
          if (info.state === 4) {
            clearTimeout(timeoutId)
            toast.success('Módulo instalado, escaneando…')
            settle(true)
          } else if (info.state === 3 || info.state === 5) {
            clearTimeout(timeoutId)
            toast.error('La instalación del módulo de escaneo falló. Verifica tu conexión.', 5000)
            settle(false)
          }
        }).then((h) => { listenerHandle = h })

        // Disparar el download (no bloquea)
        BarcodeScanner.installGoogleBarcodeScannerModule().catch(() => {
          clearTimeout(timeoutId)
          toast.error('No se pudo iniciar la instalación del módulo de escaneo.', 5000)
          settle(false)
        })
      } catch (err) {
        clearTimeout(timeoutId)
        console.error('Error al instalar módulo Barcode Scanner:', err)
        settle(false)
      }
    })
  }

  const scanQrNative = async () => {
    const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')

    // 1. Permiso de cámara primero (necesario incluso para preparar la cámara)
    const { camera } = await BarcodeScanner.checkPermissions()
    if (camera !== 'granted') {
      const { camera: n } = await BarcodeScanner.requestPermissions()
      if (n !== 'granted') throw new Error('Se necesita permiso de cámara')
    }

    // 2. Asegurar que el módulo Google Barcode Scanner esté listo (evita crash).
    //    Solo aplica en Android: en iOS el módulo viene bundled con el plugin
    //    vía CocoaPods, no se instala en runtime — llamar a las APIs de
    //    install/available en iOS rechaza con "Not implemented" y muestra
    //    toasts de error falsos al usuario.
    if (Capacitor.getPlatform() === 'android') {
      const moduleReady = await ensureBarcodeModule(BarcodeScanner)
      if (!moduleReady) {
        throw new Error('El módulo de escaneo no está disponible. Reintenta en unos segundos.')
      }
    }

    // 3. Escanear con manejo de errores
    let scanResult
    try {
      scanResult = await BarcodeScanner.scan()
    } catch (err) {
      console.error('Error en BarcodeScanner.scan():', err)
      throw new Error(err?.message || 'No se pudo abrir la cámara para escanear')
    } finally {
      await BarcodeScanner.stopScan().catch(() => {})
    }

    const { barcodes } = scanResult || {}
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
    // Refrescar la semana del usuario para que la card "Hoy" se actualice al instante
    try {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const weekRes = await getAttendanceRecords(businessId, { userId: user.uid, fromDate: sevenDaysAgo.toISOString(), max: 200 })
      if (weekRes.success) setMyWeekRecords(weekRes.data || [])
    } catch { /* no-op */ }
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

  const handleSaveGracePeriod = async (branchId, minutes) => {
    const res = await updateBranchGracePeriod(businessId, branchId, minutes)
    if (res.success) {
      toast.success('Tolerancia de tardanza actualizada')
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
  // Excepción: si tiene el permiso de Horarios, sí puede usar el planificador en web.
  if (!canManage && !canManageSchedules && !isNative) {
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
        {/* Selector de sucursal — solo en tab Horarios y solo si hay 2+ sucursales accesibles.
            Sigue el mismo patrón visual que el del Dashboard. */}
        {activeTab === 'schedules' && accessibleScheduleBranches.length > 1 && (
          <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
            <Store className="w-4 h-4 text-gray-500" />
            <select
              value={selectedScheduleBranch}
              onChange={(e) => setSelectedScheduleBranch(e.target.value)}
              className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer"
            >
              {/* Vista consolidada: todos los turnos de cada empleado, de todas las sedes. */}
              <option value={ALL_BRANCHES}>Todas las sucursales</option>
              {accessibleScheduleBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.isMain ? (businessSettings?.mainBranchName || 'Sucursal Principal') : b.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <Tabs defaultValue={activeTab}>
        {(() => {
          const at = activeTab
          const setAt = setActiveTab
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
                    <TabsTrigger value="personnel" activeTab={at} setActiveTab={setAt}>Personal</TabsTrigger>
                    <TabsTrigger value="schedules" activeTab={at} setActiveTab={setAt}>Horarios</TabsTrigger>
                    <TabsTrigger value="vacations" activeTab={at} setActiveTab={setAt}>Vacaciones</TabsTrigger>
                    <TabsTrigger value="config" activeTab={at} setActiveTab={setAt}>Configuración</TabsTrigger>
                  </>
                )}
                {!canManage && canManageSchedules && (
                  <TabsTrigger value="schedules" activeTab={at} setActiveTab={setAt}>Horarios</TabsTrigger>
                )}
                {!canManage && (
                  <TabsTrigger value="myhistory" activeTab={at} setActiveTab={setAt}>Mi historial</TabsTrigger>
                )}
              </TabsList>

              {/* ========== TAB: MARCAR ========== */}
              <TabsContent value="mark" activeTab={at} className="mt-4">
                {canManage ? (
                  // Vista simple para owner/admin (ellos tienen su tabla en "Marcaciones")
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
                ) : (
                  // Vista de jornada para sub-usuarios
                  <SubUserAttendanceView
                    weekRecords={myWeekRecords}
                    onMark={handleMark}
                    marking={marking}
                    isNative={isNative}
                  />
                )}
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
                        <>
                          {/* Tabla en sm+, cards apiladas en móvil */}
                          <div className="hidden sm:block overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Fecha</th>
                                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Empleado</th>
                                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Sucursal</th>
                                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Tipo</th>
                                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Turno</th>
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
                                    <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                                      {r.scheduledStart
                                        ? <span>{r.scheduledStart}{r.scheduledEnd ? `–${r.scheduledEnd}` : ''}</span>
                                        : <span className="text-gray-300">—</span>}
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex flex-col gap-1 items-start">
                                        {statusBadge(r)}
                                        {r.justified && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium uppercase">
                                            Justificada
                                          </span>
                                        )}
                                        {r.isLate && !r.justified && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium uppercase">
                                            Tardanza · {r.lateMinutes}m
                                          </span>
                                        )}
                                      </div>
                                    </td>
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

                          {/* Vista de cards en móvil */}
                          <div className="sm:hidden divide-y divide-gray-100">
                            {records.map(r => (
                              <div key={r.id} className="p-3 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="font-medium text-gray-900 truncate">{r.userName || '—'}</div>
                                    <div className="text-xs text-gray-500 truncate">{r.userEmail || ''}</div>
                                  </div>
                                  <span className={`flex-shrink-0 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${r.type === 'in' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                                    {r.type === 'in' ? 'Entrada' : 'Salida'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-gray-600">
                                  <span>{formatDateTime(r.timestamp)}</span>
                                  {r.scheduledStart && (
                                    <span className="text-gray-500">
                                      Turno: {r.scheduledStart}{r.scheduledEnd ? `–${r.scheduledEnd}` : ''}
                                    </span>
                                  )}
                                </div>
                                {r.branchName && <div className="text-xs text-gray-600">{r.branchName}</div>}
                                <div className="flex flex-wrap gap-1">
                                  {statusBadge(r)}
                                  {r.justified && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium uppercase">
                                      Justificada
                                    </span>
                                  )}
                                  {r.isLate && !r.justified && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium uppercase">
                                      Tardanza · {r.lateMinutes}m
                                    </span>
                                  )}
                                </div>
                                {r.approvalStatus === 'pending' && (
                                  <div className="flex gap-2 pt-1">
                                    <button onClick={() => handleApproval(r.id, 'approved')} className="flex-1 px-3 py-1.5 text-xs text-green-700 bg-green-50 hover:bg-green-100 rounded flex items-center justify-center gap-1">
                                      <CheckCircle2 className="w-4 h-4" />
                                      Aprobar
                                    </button>
                                    <button onClick={() => handleApproval(r.id, 'rejected')} className="flex-1 px-3 py-1.5 text-xs text-red-700 bg-red-50 hover:bg-red-100 rounded flex items-center justify-center gap-1">
                                      <XCircle className="w-4 h-4" />
                                      Rechazar
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </TabsContent>
              )}

              {/* ========== TAB: PERSONAL (owner) — Capa 1 del módulo Personal ========== */}
              {canManage && (
                <TabsContent value="personnel" activeTab={at} className="mt-4">
                  {(() => {
                    // Filtros en cliente
                    const term = (employeeSearch || '').toLowerCase()
                    const filtered = employees.filter((e) => {
                      if (employeeFilterDept && e.department !== employeeFilterDept) return false
                      if (employeeFilterStatus && e.hrStatus !== employeeFilterStatus) return false
                      if (term) {
                        const hay = [e.displayName, e.email, e.jobTitle, e.department].join(' ').toLowerCase()
                        if (!hay.includes(term)) return false
                      }
                      return true
                    })
                    const departments = Array.from(new Set(employees.map((e) => e.department).filter(Boolean))).sort()

                    return (
                      <div className="space-y-4">
                        {/* Header */}
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                              <Briefcase className="w-5 h-5 text-primary-600" />
                              Directorio de personal
                              <span className="text-sm font-normal text-gray-500">({filtered.length})</span>
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Empleados con su cargo, área y datos de RR.HH. Editá desde "Gestión de Usuarios".
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                              <input
                                type="text"
                                value={employeeSearch}
                                onChange={(e) => setEmployeeSearch(e.target.value)}
                                placeholder="Buscar por nombre, cargo..."
                                className="pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 w-full sm:w-56"
                              />
                            </div>
                            <select
                              value={employeeFilterDept}
                              onChange={(e) => setEmployeeFilterDept(e.target.value)}
                              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                            >
                              <option value="">Todas las áreas</option>
                              {departments.map((d) => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                            <select
                              value={employeeFilterStatus}
                              onChange={(e) => setEmployeeFilterStatus(e.target.value)}
                              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                            >
                              <option value="">Todos los estados</option>
                              {HR_STATUSES.map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Empty state */}
                        {!employeesLoaded && (
                          <div className="flex items-center justify-center py-16 text-gray-500">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" />
                            Cargando empleados...
                          </div>
                        )}
                        {employeesLoaded && employees.length === 0 && (
                          <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
                            <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <h4 className="text-base font-medium text-gray-900 mb-1">
                              Aún no hay empleados registrados
                            </h4>
                            <p className="text-sm text-gray-500 mb-4">
                              Los empleados se agregan desde "Gestión de Usuarios" creando un sub-usuario con sus datos.
                            </p>
                          </div>
                        )}
                        {employeesLoaded && employees.length > 0 && filtered.length === 0 && (
                          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
                            No hay empleados que coincidan con los filtros aplicados.
                          </div>
                        )}

                        {/* Cards grid */}
                        {filtered.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filtered.map((emp) => {
                              const status = getHrStatusInfo(emp.hrStatus)
                              const initials = (emp.displayName || emp.email || '?')
                                .split(/\s+/)
                                .map((p) => p[0])
                                .filter(Boolean)
                                .slice(0, 2)
                                .join('')
                                .toUpperCase()
                              const statusBg = {
                                green: 'bg-green-100 text-green-700',
                                amber: 'bg-amber-100 text-amber-700',
                                blue: 'bg-blue-100 text-blue-700',
                                gray: 'bg-gray-100 text-gray-600',
                              }[status.color] || 'bg-gray-100 text-gray-600'

                              return (
                                <div
                                  key={emp.id}
                                  className={`bg-white border rounded-xl p-5 hover:shadow-md transition-shadow ${
                                    emp.isActive === false ? 'border-gray-200 opacity-70' : 'border-gray-200'
                                  }`}
                                >
                                  {/* Avatar + nombre + cargo */}
                                  <div className="flex items-start gap-3 mb-4">
                                    <div className="w-12 h-12 rounded-full bg-primary-100 text-primary-700 font-bold flex items-center justify-center flex-shrink-0">
                                      {emp.photoUrl ? (
                                        <img src={emp.photoUrl} alt={emp.displayName} className="w-full h-full rounded-full object-cover" />
                                      ) : (
                                        initials || '?'
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-semibold text-gray-900 truncate">{emp.displayName || 'Sin nombre'}</p>
                                        {emp.excludeFromSchedule && (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold uppercase">
                                            Refuerzo
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-primary-600 uppercase tracking-wide font-medium truncate">
                                        {emp.jobTitle || 'Sin cargo'}
                                      </p>
                                      {emp.employmentType && (
                                        <p className="text-[11px] text-gray-500 mt-0.5">
                                          {getEmploymentTypeLabel(emp.employmentType)}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Contacto */}
                                  <div className="space-y-1.5 text-sm text-gray-700">
                                    {emp.email && (
                                      <div className="flex items-center gap-2 truncate">
                                        <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                        <span className="truncate text-xs">{emp.email}</span>
                                      </div>
                                    )}
                                    {emp.phone && (
                                      <div className="flex items-center gap-2">
                                        <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                        <span className="text-xs">{emp.phone}</span>
                                      </div>
                                    )}
                                    {emp.department && (
                                      <div className="flex items-center gap-2 truncate">
                                        <MapPinned className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                        <span className="truncate text-xs">{emp.department}</span>
                                      </div>
                                    )}
                                    {emp.documentId && (
                                      <div className="flex items-center gap-2">
                                        <CreditCard className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                        <span className="text-xs">{emp.documentId}</span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Footer: estado + horas/vacaciones */}
                                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                                    <span className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full ${statusBg}`}>
                                      {status.label}
                                    </span>
                                    <div className="flex items-center gap-3 text-[11px] text-gray-500">
                                      {emp.weeklyHours != null && (
                                        <span title="Horas semanales">{emp.weeklyHours}h/sem</span>
                                      )}
                                      {emp.vacationDaysPerYear != null && (
                                        <span title="Vacaciones por año">{emp.vacationDaysPerYear}d/año</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </TabsContent>
              )}

              {/* ========== TAB: HORARIOS — Capa 2 del módulo Personal ==========
                  Visible para owner/admin y para sub-usuarios con permiso 'schedules'. */}
              {canManageSchedules && (
                <TabsContent value="schedules" activeTab={at} className="mt-4">
                  <SchedulePlanner
                    businessId={businessId}
                    employees={employees.filter(e => !e.excludeFromSchedule)}
                    currentUserUid={user?.uid}
                    businessInfo={{ businessName: branches?.[0]?.name || '' }}
                    selectedBranchId={selectedScheduleBranch}
                    selectedBranchName={
                      selectedScheduleBranch === ALL_BRANCHES
                        ? 'Todas las sucursales'
                        : (accessibleScheduleBranches.find(b => b.id === selectedScheduleBranch)?.name || '')
                    }
                    branches={accessibleScheduleBranches}
                  />
                </TabsContent>
              )}

              {/* ========== TAB: VACACIONES (owner) — Capa 3 del módulo Personal ========== */}
              {canManage && (
                <TabsContent value="vacations" activeTab={at} className="mt-4">
                  <VacationManager
                    businessId={businessId}
                    employees={employees}
                    currentUser={user}
                  />
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
                        onSaveGracePeriod={(minutes) => handleSaveGracePeriod(branch.id, minutes)}
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
        })()}
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
function BranchAttendanceCard({ branch, onToggle, onRegenerate, onSaveGeofence, onUseCurrentPos, onSaveGracePeriod }) {
  const toast = useToast()
  const att = branch.attendance || {}
  const enabled = att.enabled !== false && !!att.token
  const [radius, setRadius] = useState(att.gpsRadius ?? '')
  const [lat, setLat] = useState(att.gpsLat ?? '')
  const [lng, setLng] = useState(att.gpsLng ?? '')
  const [gracePeriod, setGracePeriod] = useState(att.gracePeriodMinutes ?? '')
  const qrValue = enabled && att.token ? buildQrPayload({ branchId: branch.id, token: att.token }) : ''

  useEffect(() => {
    setRadius(att.gpsRadius ?? '')
    setLat(att.gpsLat ?? '')
    setLng(att.gpsLng ?? '')
    setGracePeriod(att.gracePeriodMinutes ?? '')
  }, [att.gpsRadius, att.gpsLat, att.gpsLng, att.gracePeriodMinutes])

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
    const fileName = `qr-asistencia-${(branch.name || branch.id).replace(/\s+/g, '-')}.png`
    const xml = new XMLSerializer().serializeToString(svg)
    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()
    img.onload = async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 512
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, 512, 512)
      ctx.drawImage(img, 0, 0, 512, 512)
      const isNative = Capacitor.isNativePlatform()
      if (isNative) {
        // En la app: `<a download>` no funciona en el WebView de iOS/Android.
        // Guardamos en Documents y abrimos el sheet de compartir/guardar.
        try {
          const dataUrl = canvas.toDataURL('image/png')
          const base64 = dataUrl.split(',')[1]
          const qrDir = 'QR'
          try {
            await Filesystem.mkdir({ path: qrDir, directory: Directory.Documents, recursive: true })
          } catch (_) { /* dir ya existe */ }
          const result = await Filesystem.writeFile({
            path: `${qrDir}/${fileName}`,
            data: base64,
            directory: Directory.Documents,
            recursive: true,
          })
          try {
            await Share.share({
              title: fileName,
              text: `QR de asistencia · ${branch.name || ''}`.trim(),
              url: result.uri,
              dialogTitle: 'Guardar o compartir QR',
            })
          } catch (_) { /* compartir cancelado por el usuario */ }
        } catch (e) {
          console.error('Error guardando QR en móvil:', e)
          toast.error('No se pudo guardar el QR')
        } finally {
          URL.revokeObjectURL(url)
        }
      } else {
        // Web: descarga directa con <a download>.
        canvas.toBlob(blob => {
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = fileName
          a.click()
          URL.revokeObjectURL(a.href)
          URL.revokeObjectURL(url)
        })
      }
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

          {/* Tolerancia de tardanza (F6) */}
          <div>
            <p className="text-xs font-medium text-gray-600 uppercase mb-2 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Tolerancia de tardanza
            </p>
            <div className="flex items-end gap-2">
              <div className="flex-1 max-w-[180px]">
                <Input
                  type="number"
                  min="0"
                  max="120"
                  label="Minutos"
                  value={gracePeriod}
                  onChange={(e) => setGracePeriod(e.target.value)}
                  placeholder="15"
                />
              </div>
              <Button
                size="sm"
                onClick={() => onSaveGracePeriod(gracePeriod === '' ? null : Number(gracePeriod))}
              >
                Guardar
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Marcaciones de entrada con un retraso mayor a este valor se etiquetan como "Tardanza".
              Si el día está cubierto por una vacación o permiso aprobado, se etiqueta como "Justificada".
              Default: 15 minutos.
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500 italic">Habilitá asistencia para generar el QR de esta sucursal.</p>
      )}
    </div>
  )
}

// Historial personal del sub-usuario
/**
 * Vista de jornada para sub-usuarios:
 *  - Card "Hoy" con entrada/salida/total y botón contextual
 *  - Mini historial de últimos 6 días con resumen por jornada
 */
function SubUserAttendanceView({ weekRecords, onMark, marking, isNative }) {
  const grouped = useMemo(() => groupRecordsByDay(weekRecords || []), [weekRecords])

  const today = new Date()
  const todayKey = dayKey(today)
  const todayGroup = grouped[todayKey]
  const todaySummary = summaryForDay(todayGroup)

  // Estado: 'idle' (no fichó), 'in' (entró pero no salió), 'done' (jornada completa)
  let state = 'idle'
  if (todaySummary.inMark && todaySummary.outMark) state = 'done'
  else if (todaySummary.inMark) state = 'in'

  const buttonLabel = marking
    ? 'Registrando…'
    : state === 'idle'
      ? 'Marcar entrada'
      : state === 'in'
        ? 'Marcar salida'
        : '✓ Jornada completa'

  // Días anteriores ordenados: descendente, excluyendo hoy
  const previousDays = Object.entries(grouped)
    .filter(([k]) => k !== todayKey)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 6)

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* ===== CARD HOY ===== */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-primary-600 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            <div>
              <p className="text-xs opacity-80">Hoy</p>
              <p className="font-semibold text-sm">
                {today.toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long' })}
              </p>
            </div>
          </div>
          {state === 'done' && (
            <CheckCircle2 className="w-6 h-6 text-green-300" />
          )}
        </div>

        <div className="p-5 space-y-3">
          {state === 'idle' ? (
            <p className="text-center text-sm text-gray-500 py-2">
              Aún no fichaste hoy. Pulsa el botón para escanear el QR.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold">IN</div>
                  <div>
                    <p className="text-xs text-green-700 font-medium">Entrada</p>
                    <p className="text-base font-semibold text-green-900">
                      {todaySummary.inMark ? formatTime(todaySummary.inMark._ts) : '—'}
                    </p>
                  </div>
                </div>
                {todaySummary.inMark?.gpsValid === false && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Pendiente</span>
                )}
              </div>

              <div className={`flex items-center justify-between p-3 rounded-lg border ${
                todaySummary.outMark ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200 border-dashed'
              }`}>
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    todaySummary.outMark ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
                  }`}>OUT</div>
                  <div>
                    <p className={`text-xs font-medium ${todaySummary.outMark ? 'text-blue-700' : 'text-gray-500'}`}>Salida</p>
                    <p className={`text-base font-semibold ${todaySummary.outMark ? 'text-blue-900' : 'text-gray-400 italic'}`}>
                      {todaySummary.outMark ? formatTime(todaySummary.outMark._ts) : 'Pendiente'}
                    </p>
                  </div>
                </div>
                {todaySummary.outMark?.gpsValid === false && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Pendiente</span>
                )}
              </div>

              {todaySummary.totalMs != null && (
                <div className="text-center pt-1">
                  <p className="text-xs text-gray-500">Total trabajado</p>
                  <p className="text-2xl font-bold text-gray-900">{formatDuration(todaySummary.totalMs)}</p>
                </div>
              )}
            </div>
          )}

          <Button
            onClick={onMark}
            disabled={marking || state === 'done'}
            className={`w-full py-5 text-base ${
              state === 'done' ? 'bg-gray-300 text-gray-500 hover:bg-gray-300' : ''
            }`}
          >
            {marking ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : (state !== 'done' && <Scan className="w-5 h-5 mr-2" />)}
            {buttonLabel}
          </Button>

          {!isNative && state !== 'done' && (
            <p className="text-xs text-gray-500 text-center">
              En navegador web, se abrirá un cuadro para pegar el contenido del QR.
            </p>
          )}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
        <p className="flex items-start gap-2">
          <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Se pedirá permiso de ubicación. Si estás fuera de la zona configurada, la marcación quedará pendiente de aprobación.</span>
        </p>
      </div>

      {/* ===== DÍAS ANTERIORES ===== */}
      {previousDays.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <p className="text-sm font-semibold text-gray-700">Días anteriores</p>
          </div>
          <div className="divide-y divide-gray-100">
            {previousDays.map(([key, group]) => {
              const s = summaryForDay(group)
              return (
                <div key={key} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 capitalize truncate">{formatDayLabel(group.date)}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        {s.inMark ? formatTime(s.inMark._ts) : '—'}
                      </span>
                      <span className="text-gray-300">→</span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                        {s.outMark ? formatTime(s.outMark._ts) : '—'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold text-gray-900">{formatDuration(s.totalMs)}</p>
                    {!s.outMark && s.inMark && (
                      <span className="text-[10px] text-yellow-600">sin salida</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

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
      {/* Tabla en sm+, cards apiladas en móvil */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Fecha</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Sucursal</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Tipo</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs uppercase">Turno</th>
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
                <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                  {r.scheduledStart
                    ? <span>{r.scheduledStart}{r.scheduledEnd ? `–${r.scheduledEnd}` : ''}</span>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1 items-start">
                    {statusBadge(r)}
                    {r.justified && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium uppercase">
                        Justificada
                      </span>
                    )}
                    {r.isLate && !r.justified && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium uppercase">
                        Tardanza · {r.lateMinutes}m
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Vista de cards en móvil */}
      <div className="sm:hidden divide-y divide-gray-100">
        {records.map(r => (
          <div key={r.id} className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900">{formatDateTime(r.timestamp)}</div>
                {r.branchName && (
                  <div className="text-xs text-gray-500 truncate mt-0.5">{r.branchName}</div>
                )}
              </div>
              <span className={`flex-shrink-0 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${r.type === 'in' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                {r.type === 'in' ? 'Entrada' : 'Salida'}
              </span>
            </div>
            {r.scheduledStart && (
              <div className="text-xs text-gray-500">
                Turno: {r.scheduledStart}{r.scheduledEnd ? `–${r.scheduledEnd}` : ''}
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {statusBadge(r)}
              {r.justified && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium uppercase">
                  Justificada
                </span>
              )}
              {r.isLate && !r.justified && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium uppercase">
                  Tardanza · {r.lateMinutes}m
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
