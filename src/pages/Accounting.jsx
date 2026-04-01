import { useState, useEffect } from 'react'
import { FileText, Download, CheckCircle, XCircle, Clock, AlertTriangle, Search, Filter, Code, Loader2, Calendar, Archive, FileSpreadsheet, FileCode, FileCheck } from 'lucide-react'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { prepareInvoiceXML } from '@/services/sunatService'
import { getCompanySettings } from '@/services/firestoreService'

// Nombres de meses en español
const MONTHS = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
]

export default function Accounting() {
  const { user, getBusinessId, isDemoMode } = useAppContext()
  const toast = useToast()

  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all') // all, factura, boleta
  const [filterSunat, setFilterSunat] = useState('all') // all, accepted, pending, rejected
  const [filterCdr, setFilterCdr] = useState('all') // all, with, without
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Selector de mes rápido
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  const [selectedMonth, setSelectedMonth] = useState('')
  const [selectedYear, setSelectedYear] = useState(currentYear)

  // Estados para descargas masivas
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState('')

  useEffect(() => {
    loadInvoices()
  }, [user])

  const loadInvoices = async () => {
    if (!user?.uid || isDemoMode) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const businessId = getBusinessId()
      const ref = collection(db, 'businesses', businessId, 'invoices')
      const snapshot = await getDocs(ref)
      const data = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(inv => inv.documentType === 'factura' || inv.documentType === 'boleta')
        .sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(0)
          const dateB = b.createdAt?.toDate?.() || new Date(0)
          return dateB - dateA
        })
      setInvoices(data)
    } catch (error) {
      console.error('Error cargando comprobantes:', error)
      toast.error('Error al cargar comprobantes')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return '-'
    const d = timestamp.toDate ? timestamp.toDate() : timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp)
    if (isNaN(d.getTime())) return '-'
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const hasCdr = (inv) => {
    return !!(inv.cdrStorageUrl || inv.cdrUrl || inv.sunatResponse?.cdrStorageUrl || inv.sunatResponse?.cdrUrl || inv.cdrData || inv.sunatResponse?.cdrData)
  }

  const hasXml = (inv) => {
    return !!(inv.xmlStorageUrl || inv.xmlUrl || inv.sunatResponse?.xmlStorageUrl || inv.sunatResponse?.xmlUrl)
  }

  const getSunatStatus = (inv) => {
    const status = inv.sunatStatus || 'pending'
    if (status === 'accepted' || status === 'SIGNED' || status === 'signed') return 'accepted'
    if (status === 'rejected') return 'rejected'
    if (status === 'voided') return 'voided'
    return 'pending'
  }

  // Helper para forzar descarga de archivos en lugar de abrirlos en el navegador
  const forceDownload = async (url, filename) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch (error) {
      console.error('Error al descargar archivo:', error)
      window.open(url, '_blank')
    }
  }

  const downloadCdr = async (inv) => {
    const url = inv.cdrStorageUrl || inv.cdrUrl || inv.sunatResponse?.cdrStorageUrl || inv.sunatResponse?.cdrUrl
    if (url) {
      const cdrFilename = `CDR-${(inv.number || 'doc').replace(/\//g, '-')}.xml`
      await forceDownload(url, cdrFilename)
    } else if (inv.cdrData || inv.sunatResponse?.cdrData) {
      const data = inv.cdrData || inv.sunatResponse.cdrData
      const blob = new Blob([data], { type: 'application/xml' })
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `CDR-${inv.number || 'doc'}.xml`
      a.click()
      URL.revokeObjectURL(blobUrl)
    }
  }

  const [generatingXml, setGeneratingXml] = useState(null)

  const downloadXml = async (inv) => {
    // 1. Intentar URL guardada (XML firmado real)
    const url = inv.xmlStorageUrl || inv.xmlUrl || inv.sunatResponse?.xmlStorageUrl || inv.sunatResponse?.xmlUrl
    if (url) {
      const xmlFilename = `${(inv.number || 'doc').replace(/\//g, '-')}_XML.xml`
      await forceDownload(url, xmlFilename)
      return
    }

    // 2. Generar XML desde los datos del comprobante
    setGeneratingXml(inv.id)
    try {
      const businessId = getBusinessId()
      const settingsResult = await getCompanySettings(businessId)
      if (!settingsResult.success) {
        toast.error('Error al cargar datos de la empresa')
        return
      }

      const result = await prepareInvoiceXML(inv, settingsResult.data)
      if (!result.success) {
        toast.error('Error al generar XML: ' + result.error)
        return
      }

      // Descargar el XML generado
      const blob = new Blob([result.xml], { type: 'application/xml' })
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = result.fileName || `${inv.number || 'doc'}.xml`
      a.click()
      URL.revokeObjectURL(blobUrl)
      toast.success('XML descargado')
    } catch (error) {
      console.error('Error generando XML:', error)
      toast.error('Error al generar el XML')
    } finally {
      setGeneratingXml(null)
    }
  }

  // Manejar selección de mes
  const handleMonthSelect = (month) => {
    setSelectedMonth(month)
    if (month) {
      const year = selectedYear
      const firstDay = new Date(year, month - 1, 1)
      const lastDay = new Date(year, month, 0)
      setDateFrom(format(firstDay, 'yyyy-MM-dd'))
      setDateTo(format(lastDay, 'yyyy-MM-dd'))
    } else {
      setDateFrom('')
      setDateTo('')
    }
  }

  const handleYearChange = (year) => {
    setSelectedYear(year)
    if (selectedMonth) {
      const firstDay = new Date(year, selectedMonth - 1, 1)
      const lastDay = new Date(year, selectedMonth, 0)
      setDateFrom(format(firstDay, 'yyyy-MM-dd'))
      setDateTo(format(lastDay, 'yyyy-MM-dd'))
    }
  }

  // Descargar todos los XMLs como ZIP
  const handleDownloadAllXml = async () => {
    const invoicesWithXml = filtered.filter(inv => hasXml(inv))
    if (invoicesWithXml.length === 0) {
      toast.error('No hay XMLs para descargar')
      return
    }

    setDownloadingAll(true)
    setDownloadProgress('Preparando XMLs...')

    try {
      const zip = new JSZip()
      let downloaded = 0

      for (const inv of invoicesWithXml) {
        const url = inv.xmlStorageUrl || inv.xmlUrl || inv.sunatResponse?.xmlStorageUrl || inv.sunatResponse?.xmlUrl
        if (url) {
          try {
            const response = await fetch(url)
            const blob = await response.blob()
            zip.file(`${inv.number || inv.id}.xml`, blob)
            downloaded++
            setDownloadProgress(`Descargando XMLs: ${downloaded}/${invoicesWithXml.length}`)
          } catch (e) {
            console.warn(`Error descargando XML de ${inv.number}:`, e)
          }
        }
      }

      const content = await zip.generateAsync({ type: 'blob' })
      const monthLabel = selectedMonth ? MONTHS.find(m => m.value === parseInt(selectedMonth))?.label : 'Todos'
      const filename = `XMLs_${monthLabel}_${selectedYear}.zip`

      const a = document.createElement('a')
      a.href = URL.createObjectURL(content)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)

      toast.success(`${downloaded} XMLs descargados`)
    } catch (error) {
      console.error('Error descargando XMLs:', error)
      toast.error('Error al descargar XMLs')
    } finally {
      setDownloadingAll(false)
      setDownloadProgress('')
    }
  }

  // Descargar todos los CDRs como ZIP
  const handleDownloadAllCdr = async () => {
    const invoicesWithCdr = filtered.filter(inv => hasCdr(inv))
    if (invoicesWithCdr.length === 0) {
      toast.error('No hay CDRs para descargar')
      return
    }

    setDownloadingAll(true)
    setDownloadProgress('Preparando CDRs...')

    try {
      const zip = new JSZip()
      let downloaded = 0

      for (const inv of invoicesWithCdr) {
        const url = inv.cdrStorageUrl || inv.cdrUrl || inv.sunatResponse?.cdrStorageUrl || inv.sunatResponse?.cdrUrl
        if (url) {
          try {
            const response = await fetch(url)
            const blob = await response.blob()
            zip.file(`CDR-${inv.number || inv.id}.xml`, blob)
            downloaded++
            setDownloadProgress(`Descargando CDRs: ${downloaded}/${invoicesWithCdr.length}`)
          } catch (e) {
            console.warn(`Error descargando CDR de ${inv.number}:`, e)
          }
        } else if (inv.cdrData || inv.sunatResponse?.cdrData) {
          const data = inv.cdrData || inv.sunatResponse.cdrData
          zip.file(`CDR-${inv.number || inv.id}.xml`, data)
          downloaded++
          setDownloadProgress(`Descargando CDRs: ${downloaded}/${invoicesWithCdr.length}`)
        }
      }

      const content = await zip.generateAsync({ type: 'blob' })
      const monthLabel = selectedMonth ? MONTHS.find(m => m.value === parseInt(selectedMonth))?.label : 'Todos'
      const filename = `CDRs_${monthLabel}_${selectedYear}.zip`

      const a = document.createElement('a')
      a.href = URL.createObjectURL(content)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)

      toast.success(`${downloaded} CDRs descargados`)
    } catch (error) {
      console.error('Error descargando CDRs:', error)
      toast.error('Error al descargar CDRs')
    } finally {
      setDownloadingAll(false)
      setDownloadProgress('')
    }
  }

  // Descargar todo (XML + CDR + Excel) como ZIP
  const handleDownloadAllZip = async () => {
    if (filtered.length === 0) {
      toast.error('No hay comprobantes para descargar')
      return
    }

    setDownloadingAll(true)
    setDownloadProgress('Preparando descarga completa...')

    try {
      const zip = new JSZip()
      const xmlFolder = zip.folder('XMLs')
      const cdrFolder = zip.folder('CDRs')
      let xmlCount = 0
      let cdrCount = 0

      // Descargar XMLs
      const invoicesWithXml = filtered.filter(inv => hasXml(inv))
      for (const inv of invoicesWithXml) {
        const url = inv.xmlStorageUrl || inv.xmlUrl || inv.sunatResponse?.xmlStorageUrl || inv.sunatResponse?.xmlUrl
        if (url) {
          try {
            setDownloadProgress(`Descargando XML: ${inv.number}`)
            const response = await fetch(url)
            const blob = await response.blob()
            xmlFolder.file(`${inv.number || inv.id}.xml`, blob)
            xmlCount++
          } catch (e) {
            console.warn(`Error descargando XML de ${inv.number}:`, e)
          }
        }
      }

      // Descargar CDRs
      const invoicesWithCdr = filtered.filter(inv => hasCdr(inv))
      for (const inv of invoicesWithCdr) {
        const url = inv.cdrStorageUrl || inv.cdrUrl || inv.sunatResponse?.cdrStorageUrl || inv.sunatResponse?.cdrUrl
        if (url) {
          try {
            setDownloadProgress(`Descargando CDR: ${inv.number}`)
            const response = await fetch(url)
            const blob = await response.blob()
            cdrFolder.file(`CDR-${inv.number || inv.id}.xml`, blob)
            cdrCount++
          } catch (e) {
            console.warn(`Error descargando CDR de ${inv.number}:`, e)
          }
        } else if (inv.cdrData || inv.sunatResponse?.cdrData) {
          const data = inv.cdrData || inv.sunatResponse.cdrData
          cdrFolder.file(`CDR-${inv.number || inv.id}.xml`, data)
          cdrCount++
        }
      }

      // Agregar Excel
      setDownloadProgress('Generando Excel...')
      const rows = [
        ['REPORTE CONTABLE'],
        ['Fecha:', format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })],
        ['Total:', filtered.length],
        [''],
        ['Número', 'Tipo', 'Cliente', 'RUC/DNI', 'Fecha Emisión', 'Total', 'Estado SUNAT', 'Tiene XML', 'Tiene CDR', 'Hash SUNAT']
      ]
      filtered.forEach(inv => {
        rows.push([
          inv.number || '-',
          inv.documentType === 'factura' ? 'Factura' : 'Boleta',
          inv.customer?.businessName || inv.customer?.name || '-',
          inv.customer?.documentNumber || '-',
          formatDate(inv.createdAt),
          inv.total || 0,
          getSunatStatus(inv) === 'accepted' ? 'Aceptado' : getSunatStatus(inv) === 'rejected' ? 'Rechazado' : getSunatStatus(inv) === 'voided' ? 'Anulado' : 'Pendiente',
          hasXml(inv) ? 'Sí' : 'No',
          hasCdr(inv) ? 'Sí' : 'No',
          inv.sunatResponse?.hash || inv.sunatHash || '-'
        ])
      })
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [{ width: 20 }, { width: 10 }, { width: 35 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 10 }, { width: 10 }, { width: 40 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Contabilidad')
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      zip.file('Reporte_Contable.xlsx', excelBuffer)

      setDownloadProgress('Comprimiendo archivos...')
      const content = await zip.generateAsync({ type: 'blob' })
      const monthLabel = selectedMonth ? MONTHS.find(m => m.value === parseInt(selectedMonth))?.label : 'Todos'
      const filename = `Contabilidad_${monthLabel}_${selectedYear}.zip`

      const a = document.createElement('a')
      a.href = URL.createObjectURL(content)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)

      toast.success(`Descarga completa: ${xmlCount} XMLs, ${cdrCount} CDRs, 1 Excel`)
    } catch (error) {
      console.error('Error en descarga completa:', error)
      toast.error('Error al generar el ZIP')
    } finally {
      setDownloadingAll(false)
      setDownloadProgress('')
    }
  }

  // Filtrado
  const filtered = invoices.filter(inv => {
    if (filterType !== 'all' && inv.documentType !== filterType) return false
    const status = getSunatStatus(inv)
    if (filterSunat !== 'all' && status !== filterSunat) return false
    if (filterCdr === 'with' && !hasCdr(inv)) return false
    if (filterCdr === 'without' && hasCdr(inv)) return false

    if (dateFrom || dateTo) {
      const invDate = inv.createdAt?.toDate?.() || (inv.createdAt?.seconds ? new Date(inv.createdAt.seconds * 1000) : null)
      if (invDate) {
        if (dateFrom && invDate < new Date(dateFrom + 'T00:00:00')) return false
        if (dateTo && invDate > new Date(dateTo + 'T23:59:59')) return false
      }
    }

    if (searchTerm) {
      const s = searchTerm.toLowerCase()
      const matchNumber = inv.number?.toLowerCase().includes(s)
      const matchClient = (inv.customer?.name || inv.customer?.businessName || '').toLowerCase().includes(s)
      const matchDoc = (inv.customer?.documentNumber || '').includes(s)
      if (!matchNumber && !matchClient && !matchDoc) return false
    }

    return true
  })

  // Stats
  const stats = {
    total: filtered.length,
    facturas: filtered.filter(i => i.documentType === 'factura').length,
    boletas: filtered.filter(i => i.documentType === 'boleta').length,
    accepted: filtered.filter(i => getSunatStatus(i) === 'accepted').length,
    pending: filtered.filter(i => getSunatStatus(i) === 'pending').length,
    rejected: filtered.filter(i => getSunatStatus(i) === 'rejected').length,
    withCdr: filtered.filter(i => hasCdr(i)).length,
    withoutCdr: filtered.filter(i => !hasCdr(i)).length,
  }

  // Export Excel
  const handleExportExcel = () => {
    if (filtered.length === 0) {
      toast.error('No hay datos para exportar')
      return
    }
    const rows = [
      ['REPORTE CONTABLE'],
      ['Fecha:', format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })],
      ['Total:', filtered.length],
      [''],
      ['Número', 'Tipo', 'Cliente', 'RUC/DNI', 'Fecha Emisión', 'Total', 'Estado SUNAT', 'Tiene XML', 'Tiene CDR', 'Hash SUNAT']
    ]
    filtered.forEach(inv => {
      rows.push([
        inv.number || '-',
        inv.documentType === 'factura' ? 'Factura' : 'Boleta',
        inv.customer?.businessName || inv.customer?.name || '-',
        inv.customer?.documentNumber || '-',
        formatDate(inv.createdAt),
        inv.total || 0,
        getSunatStatus(inv) === 'accepted' ? 'Aceptado' : getSunatStatus(inv) === 'rejected' ? 'Rechazado' : getSunatStatus(inv) === 'voided' ? 'Anulado' : 'Pendiente',
        hasXml(inv) ? 'Sí' : 'No',
        hasCdr(inv) ? 'Sí' : 'No',
        inv.sunatResponse?.hash || inv.sunatHash || '-'
      ])
    })
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ width: 20 }, { width: 10 }, { width: 35 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 10 }, { width: 10 }, { width: 40 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Contabilidad')
    XLSX.writeFile(wb, `Contabilidad_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
    toast.success('Excel exportado')
  }

  const StatusBadge = ({ inv }) => {
    const status = getSunatStatus(inv)
    if (status === 'accepted') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"><CheckCircle className="w-3 h-3" /> Aceptado</span>
    if (status === 'rejected') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"><XCircle className="w-3 h-3" /> Rechazado</span>
    if (status === 'voided') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700"><XCircle className="w-3 h-3" /> Anulado</span>
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700"><Clock className="w-3 h-3" /> Pendiente</span>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-7 h-7 text-primary-600" />
            Contabilidad
          </h1>
          <p className="text-gray-600 mt-1">Control de comprobantes electrónicos enviados a SUNAT</p>
        </div>
      </div>

      {/* Selector de Mes y Descargas Rápidas */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            {/* Selector de Mes */}
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Período:</span>
              <select
                value={selectedYear}
                onChange={e => handleYearChange(parseInt(e.target.value))}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select
                value={selectedMonth}
                onChange={e => handleMonthSelect(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Todos los meses</option>
                {MONTHS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* Botones de descarga rápida */}
            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
              <span className="text-sm text-gray-500 hidden sm:inline">Descargar:</span>
              <Button
                onClick={handleExportExcel}
                variant="outline"
                size="sm"
                disabled={downloadingAll || filtered.length === 0}
              >
                <FileSpreadsheet className="w-4 h-4 mr-1" />
                Excel
              </Button>
              <Button
                onClick={handleDownloadAllXml}
                variant="outline"
                size="sm"
                disabled={downloadingAll || filtered.filter(i => hasXml(i)).length === 0}
              >
                <FileCode className="w-4 h-4 mr-1" />
                XMLs ({filtered.filter(i => hasXml(i)).length})
              </Button>
              <Button
                onClick={handleDownloadAllCdr}
                variant="outline"
                size="sm"
                disabled={downloadingAll || filtered.filter(i => hasCdr(i)).length === 0}
              >
                <FileCheck className="w-4 h-4 mr-1" />
                CDRs ({filtered.filter(i => hasCdr(i)).length})
              </Button>
              <Button
                onClick={handleDownloadAllZip}
                variant="primary"
                size="sm"
                disabled={downloadingAll || filtered.length === 0}
              >
                {downloadingAll ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    {downloadProgress || 'Procesando...'}
                  </>
                ) : (
                  <>
                    <Archive className="w-4 h-4 mr-1" />
                    Descargar Todo (ZIP)
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Mostrar período seleccionado */}
          {selectedMonth && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-sm text-gray-600">
                Mostrando comprobantes de <span className="font-semibold text-primary-600">{MONTHS.find(m => m.value === parseInt(selectedMonth))?.label} {selectedYear}</span>
                {' '}&bull; {filtered.length} comprobante(s)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card><CardContent className="p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500">Total</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xl font-bold text-blue-600">{stats.facturas}</p>
          <p className="text-xs text-gray-500">Facturas</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xl font-bold text-purple-600">{stats.boletas}</p>
          <p className="text-xs text-gray-500">Boletas</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xl font-bold text-green-600">{stats.accepted}</p>
          <p className="text-xs text-gray-500">Aceptados</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xl font-bold text-yellow-600">{stats.pending}</p>
          <p className="text-xs text-gray-500">Pendientes</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xl font-bold text-red-600">{stats.rejected}</p>
          <p className="text-xs text-gray-500">Rechazados</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xl font-bold text-green-600">{stats.withCdr}</p>
          <p className="text-xs text-gray-500">Con CDR</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xl font-bold text-red-600">{stats.withoutCdr}</p>
          <p className="text-xs text-gray-500">Sin CDR</p>
        </CardContent></Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por número, cliente o RUC..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
              <option value="all">Todos</option>
              <option value="factura">Facturas</option>
              <option value="boleta">Boletas</option>
            </select>
            <select value={filterSunat} onChange={e => setFilterSunat(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
              <option value="all">Estado SUNAT</option>
              <option value="accepted">Aceptados</option>
              <option value="pending">Pendientes</option>
              <option value="rejected">Rechazados</option>
            </select>
            <select value={filterCdr} onChange={e => setFilterCdr(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
              <option value="all">CDR</option>
              <option value="with">Con CDR</option>
              <option value="without">Sin CDR</option>
            </select>
            {/* Fechas personalizadas (ocultas si hay mes seleccionado) */}
            {!selectedMonth && (
              <>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); setSelectedMonth('') }}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  title="Fecha desde"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => { setDateTo(e.target.value); setSelectedMonth('') }}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  title="Fecha hasta"
                />
              </>
            )}
            {/* Botón para limpiar filtros de fecha */}
            {(dateFrom || dateTo || selectedMonth) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); setSelectedMonth('') }}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Limpiar fechas
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          {/* Vista móvil: tarjetas */}
          <div className="sm:hidden space-y-3 p-3">
            {filtered.length === 0 ? (
              <p className="text-center py-12 text-gray-500">No se encontraron comprobantes</p>
            ) : (
              filtered.map(inv => (
                <div key={inv.id} className="border border-gray-200 rounded-lg p-3 bg-white">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="font-medium text-primary-600 text-sm">{inv.number || '-'}</span>
                      <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${inv.documentType === 'factura' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                        {inv.documentType === 'factura' ? 'Factura' : 'Boleta'}
                      </span>
                    </div>
                    <span className="font-semibold text-sm">S/ {(inv.total || 0).toFixed(2)}</span>
                  </div>
                  <p className="text-sm text-gray-700 truncate">{inv.customer?.businessName || inv.customer?.name || '-'}</p>
                  <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                    <span>{inv.customer?.documentNumber || '-'}</span>
                    <span>{formatDate(inv.createdAt)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-gray-500">SUNAT:</span>
                        <StatusBadge inv={inv} />
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-gray-500">XML:</span>
                        {hasXml(inv) ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <span className="text-gray-400">—</span>}
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-gray-500">CDR:</span>
                        {hasCdr(inv) ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => downloadXml(inv)}
                        title={hasXml(inv) ? 'Descargar XML firmado' : 'Generar y descargar XML'}
                        disabled={generatingXml === inv.id}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
                      >
                        {generatingXml === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Code className="w-4 h-4" />}
                      </button>
                      {hasCdr(inv) && (
                        <button onClick={() => downloadCdr(inv)} title="Descargar CDR"
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded">
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Vista desktop: tabla */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Número</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Tipo</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Cliente</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">RUC/DNI</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Fecha</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-600">Total</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">SUNAT</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">XML</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">CDR</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-12 text-gray-500">No se encontraron comprobantes</td></tr>
                ) : (
                  filtered.map(inv => (
                    <tr key={inv.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium text-primary-600">{inv.number || '-'}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${inv.documentType === 'factura' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {inv.documentType === 'factura' ? 'Factura' : 'Boleta'}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-[200px] truncate">{inv.customer?.businessName || inv.customer?.name || '-'}</td>
                      <td className="py-3 px-4">{inv.customer?.documentNumber || '-'}</td>
                      <td className="py-3 px-4">{formatDate(inv.createdAt)}</td>
                      <td className="py-3 px-4 text-right font-medium">S/ {(inv.total || 0).toFixed(2)}</td>
                      <td className="py-3 px-4 text-center"><StatusBadge inv={inv} /></td>
                      <td className="py-3 px-4 text-center">
                        {hasXml(inv) ? (
                          <CheckCircle className="w-4 h-4 text-green-500 mx-auto" title="XML firmado disponible" />
                        ) : (
                          <span className="text-xs text-gray-400" title="XML se generará al descargar">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {hasCdr(inv) ? (
                          <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 mx-auto" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => downloadXml(inv)}
                            title={hasXml(inv) ? 'Descargar XML firmado' : 'Generar y descargar XML'}
                            disabled={generatingXml === inv.id}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
                          >
                            {generatingXml === inv.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Code className="w-4 h-4" />
                            )}
                          </button>
                          {hasCdr(inv) && (
                            <button onClick={() => downloadCdr(inv)} title="Descargar CDR"
                              className="p-1 text-green-600 hover:bg-green-50 rounded">
                              <Download className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
