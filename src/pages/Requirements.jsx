import { useState, useEffect, useMemo } from 'react'
import {
  ClipboardList, Plus, Search, Printer, FileText, ChevronDown, ChevronLeft,
  Trash2, Send, CheckCircle, Copy, Pencil, Loader2, Eye, ShoppingCart,
} from 'lucide-react'
import jsPDF from 'jspdf'
import { useAppContext } from '@/hooks/useAppContext'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import { formatDate, buildSearchHaystack, matchesPrebuilt } from '@/lib/utils'
import { getIngredients } from '@/services/ingredientService'
import { getIngredientCategories } from '@/services/firestoreService'
import { getActiveBranches } from '@/services/branchService'
import { getRequirements, createRequirement, updateRequirement, deleteRequirement } from '@/services/requirementService'
import { useLocationAccess } from '@/utils/locationAccess'

/**
 * REQUERIMIENTOS — pedidos de compra de insumos (cocina → compras).
 *
 * Flujo: el cocinero (usualmente el turno de cierre) marca qué insumos faltan,
 * cuánto comprar y con qué prioridad; el sistema pre-sugiere los que están en
 * o bajo su stock mínimo. Al enviar, el comprador ve la lista al día siguiente,
 * la imprime (ticket 80mm / PDF) o la copia para WhatsApp, y al terminar la
 * marca como Comprada. Estados: Abierto (borrador) → Enviado → Comprado.
 */

const PRIORITIES = { alta: 'Alta', media: 'Media', baja: 'Baja' }
const PRIORITY_ORDER = ['alta', 'media', 'baja']

const DEFAULT_CATEGORIES = [
  { id: 'granos', name: 'Granos y Cereales', order: 0 },
  { id: 'carnes', name: 'Carnes', order: 1 },
  { id: 'vegetales', name: 'Vegetales y Frutas', order: 2 },
  { id: 'lacteos', name: 'Lácteos', order: 3 },
  { id: 'condimentos', name: 'Condimentos y Especias', order: 4 },
  { id: 'bebidas', name: 'Bebidas', order: 5 },
  { id: 'estetica', name: 'Estética y Belleza', order: 6 },
  { id: 'salud', name: 'Salud y Farmacia', order: 7 },
  { id: 'limpieza', name: 'Limpieza', order: 8 },
  { id: 'otros', name: 'Otros', order: 9 },
]

const toDate = (v) => v?.toDate?.() || (v ? new Date(v) : null)

export default function Requirements() {
  const { user, isDemoMode, demoData, getBusinessId, businessMode, isBusinessOwner, isAdmin, allowedWarehouses, filterBranchesByAccess } = useAppContext()
  const appNavigate = useAppNavigate()
  const toast = useToast()
  const canAccessByLocation = useLocationAccess()

  const isRestaurantMode = businessMode === 'restaurant'
  const itemLabel = isRestaurantMode ? 'ingredientes' : 'insumos'

  // ===== Estado general =====
  const [isLoading, setIsLoading] = useState(true)
  const [requirements, setRequirements] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [branches, setBranches] = useState([])

  // ===== Vista: 'list' | 'editor' =====
  const [view, setView] = useState('list')
  const [editingId, setEditingId] = useState(null) // null = nuevo

  // ===== Estado del editor =====
  // selection: { [ingredientId]: { qty: string, priority } } — presencia = incluido
  const [selection, setSelection] = useState({})
  const [freeItems, setFreeItems] = useState([]) // [{ id, name, qty, unit, priority }]
  const [freeForm, setFreeForm] = useState({ name: '', qty: '', unit: 'unidades' })
  const [editorNotes, setEditorNotes] = useState('')
  const [editorBranchId, setEditorBranchId] = useState('')
  const [editorSearch, setEditorSearch] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // ===== Detalle =====
  const [viewingReq, setViewingReq] = useState(null)
  const [printMenuOpen, setPrintMenuOpen] = useState(false)
  const [deletingReq, setDeletingReq] = useState(null)

  // ===== Carga =====
  useEffect(() => {
    const load = async () => {
      if (!user?.uid && !isDemoMode) return
      setIsLoading(true)
      try {
        if (isDemoMode) {
          setIngredients(demoData?.ingredients || [])
          setCategories(DEFAULT_CATEGORIES)
          setRequirements([]) // demo: solo en memoria
          setBranches([])
          return
        }
        const businessId = getBusinessId()
        if (!businessId) return
        const [reqsRes, ingsRes, catsRes, branchesRes] = await Promise.all([
          getRequirements(businessId),
          getIngredients(businessId),
          getIngredientCategories(businessId),
          getActiveBranches(businessId),
        ])
        if (reqsRes.success) setRequirements(reqsRes.data || [])
        if (ingsRes.success) setIngredients(ingsRes.data || [])
        if (catsRes.success && catsRes.data?.length > 0) setCategories(catsRes.data)
        if (branchesRes.success) {
          const list = filterBranchesByAccess ? filterBranchesByAccess(branchesRes.data || []) : (branchesRes.data || [])
          setBranches(list)
        }
      } catch (e) {
        console.error('Error cargando requerimientos:', e)
      } finally {
        setIsLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isDemoMode])

  // ===== Stock visible para el usuario (respeta almacenes permitidos) =====
  const allowedWarehouseIdSet = useMemo(() => {
    if (!allowedWarehouses || allowedWarehouses.length === 0) return null
    return new Set(allowedWarehouses)
  }, [allowedWarehouses])

  const getVisibleStock = (ingredient) => {
    if (!allowedWarehouseIdSet) return ingredient.currentStock || 0
    const ws = ingredient.warehouseStocks || []
    if (ws.length === 0) return 0
    return ws.filter(w => allowedWarehouseIdSet.has(w.warehouseId)).reduce((s, w) => s + (w.stock || 0), 0)
  }

  const getCategoryLabel = (categoryId) => {
    if (!categoryId) return 'Otros'
    const byId = categories.find(c => c.id === categoryId)
    if (byId) return byId.name
    const byName = categories.find(c => c.name.toLowerCase() === String(categoryId).toLowerCase())
    if (byName) return byName.name
    return categoryId
  }

  // ===== Requerimientos visibles (permisos de sucursal) =====
  const visibleRequirements = useMemo(
    () => requirements.filter(r => canAccessByLocation(r)),
    [requirements, canAccessByLocation]
  )

  // ===== Editor: abrir nuevo / editar =====
  const openNewEditor = () => {
    // Pre-sugerir insumos en o bajo su stock mínimo (la data ya existe: minimumStock)
    const suggested = {}
    for (const ing of ingredients) {
      if (ing.trackStock === false) continue
      const stock = getVisibleStock(ing)
      const min = ing.minimumStock || 0
      if (min <= 0 && stock > 0) continue
      if (stock <= min) {
        const qty = Math.max(min - stock, 0)
        suggested[ing.id] = {
          qty: qty > 0 ? String(Math.round(qty * 100) / 100) : '1',
          priority: stock <= 0 ? 'alta' : 'media',
        }
      }
    }
    setSelection(suggested)
    setFreeItems([])
    setFreeForm({ name: '', qty: '', unit: 'unidades' })
    setEditorNotes('')
    setEditorBranchId(branches.length === 1 ? branches[0].id : '')
    setEditorSearch('')
    setEditingId(null)
    setView('editor')
    if (Object.keys(suggested).length > 0) {
      toast.info(`${Object.keys(suggested).length} ${itemLabel} con stock bajo ya vienen sugeridos`, 4000)
    }
  }

  const openEditEditor = (req) => {
    const sel = {}
    const free = []
    for (const item of req.items || []) {
      if (item.ingredientId) {
        sel[item.ingredientId] = { qty: String(item.qty ?? ''), priority: item.priority || 'media' }
      } else {
        free.push({ id: `free-${free.length}-${item.name}`, name: item.name, qty: String(item.qty ?? ''), unit: item.unit || 'unidades', priority: item.priority || 'media' })
      }
    }
    setSelection(sel)
    setFreeItems(free)
    setFreeForm({ name: '', qty: '', unit: 'unidades' })
    setEditorNotes(req.notes || '')
    setEditorBranchId(req.branchId || '')
    setEditorSearch('')
    setEditingId(req.id)
    setView('editor')
  }

  const toggleIngredient = (ing) => {
    setSelection(prev => {
      const next = { ...prev }
      if (next[ing.id]) {
        delete next[ing.id]
      } else {
        const stock = getVisibleStock(ing)
        const min = ing.minimumStock || 0
        const qty = Math.max(min - stock, 0)
        next[ing.id] = { qty: qty > 0 ? String(Math.round(qty * 100) / 100) : '', priority: stock <= 0 ? 'alta' : 'media' }
      }
      return next
    })
  }

  const setItemField = (ingredientId, field, value) => {
    setSelection(prev => ({ ...prev, [ingredientId]: { ...prev[ingredientId], [field]: value } }))
  }

  const addFreeItem = () => {
    const name = freeForm.name.trim()
    if (!name) return
    setFreeItems(prev => [...prev, {
      id: `free-${Date.now()}`,
      name,
      qty: freeForm.qty || '1',
      unit: freeForm.unit || 'unidades',
      priority: 'media',
    }])
    setFreeForm({ name: '', qty: '', unit: 'unidades' })
  }

  // ===== Construir items del documento =====
  const buildItems = () => {
    const items = []
    for (const ing of ingredients) {
      const sel = selection[ing.id]
      if (!sel) continue
      const qty = parseFloat(sel.qty)
      if (!Number.isFinite(qty) || qty <= 0) continue
      items.push({
        ingredientId: ing.id,
        name: ing.name,
        unit: ing.purchaseUnit || 'unidades',
        qty: Math.round(qty * 100) / 100,
        priority: sel.priority || 'media',
        category: ing.category || null,
        stockAtRequest: Math.round(getVisibleStock(ing) * 100) / 100,
      })
    }
    for (const f of freeItems) {
      const qty = parseFloat(f.qty)
      if (!f.name.trim() || !Number.isFinite(qty) || qty <= 0) continue
      items.push({
        ingredientId: null,
        name: f.name.trim(),
        unit: f.unit || 'unidades',
        qty: Math.round(qty * 100) / 100,
        priority: f.priority || 'media',
        category: null,
        stockAtRequest: null,
      })
    }
    return items
  }

  const editorCounts = useMemo(() => {
    const counts = { alta: 0, media: 0, baja: 0, total: 0 }
    for (const [, sel] of Object.entries(selection)) {
      const qty = parseFloat(sel.qty)
      if (!Number.isFinite(qty) || qty <= 0) continue
      counts[sel.priority || 'media']++
      counts.total++
    }
    for (const f of freeItems) {
      const qty = parseFloat(f.qty)
      if (!Number.isFinite(qty) || qty <= 0) continue
      counts[f.priority || 'media']++
      counts.total++
    }
    return counts
  }, [selection, freeItems])

  // ===== Guardar / enviar =====
  const saveRequirement = async (status) => {
    const items = buildItems()
    if (items.length === 0) {
      toast.error(`Marca al menos un ${isRestaurantMode ? 'ingrediente' : 'insumo'} con cantidad`)
      return
    }
    const branch = branches.find(b => b.id === editorBranchId)
    const payload = {
      status,
      branchId: editorBranchId || null,
      branchName: branch?.name || null,
      notes: editorNotes.trim(),
      items,
      createdBy: user?.uid || 'demo',
      createdByName: user?.displayName || user?.email || 'Usuario',
      ...(status === 'sent' && { sentAt: new Date() }),
    }
    if (isDemoMode) {
      const fake = { id: `demo-${Date.now()}`, ...payload, createdAt: new Date() }
      setRequirements(prev => editingId ? prev.map(r => r.id === editingId ? { ...fake, id: editingId } : r) : [fake, ...prev])
      toast.success(status === 'sent' ? 'Requerimiento enviado (demo)' : 'Borrador guardado (demo)')
      setView('list')
      return
    }
    setIsSaving(true)
    try {
      const businessId = getBusinessId()
      let result
      if (editingId) {
        result = await updateRequirement(businessId, editingId, payload)
      } else {
        result = await createRequirement(businessId, payload)
      }
      if (!result.success) throw new Error(result.error)
      toast.success(status === 'sent' ? 'Requerimiento enviado' : 'Borrador guardado')
      const fresh = await getRequirements(businessId)
      if (fresh.success) setRequirements(fresh.data || [])
      setView('list')
    } catch (e) {
      console.error('Error guardando requerimiento:', e)
      toast.error('No se pudo guardar el requerimiento')
    } finally {
      setIsSaving(false)
    }
  }

  const changeStatus = async (req, status) => {
    const updates = {
      status,
      ...(status === 'sent' && { sentAt: new Date() }),
      ...(status === 'purchased' && { purchasedAt: new Date(), purchasedBy: user?.uid || null, purchasedByName: user?.displayName || user?.email || null }),
    }
    if (isDemoMode) {
      setRequirements(prev => prev.map(r => r.id === req.id ? { ...r, ...updates } : r))
      setViewingReq(v => v && v.id === req.id ? { ...v, ...updates } : v)
      toast.success(status === 'purchased' ? 'Marcado como comprado (demo)' : 'Requerimiento enviado (demo)')
      return
    }
    const result = await updateRequirement(getBusinessId(), req.id, updates)
    if (result.success) {
      setRequirements(prev => prev.map(r => r.id === req.id ? { ...r, ...updates } : r))
      setViewingReq(v => v && v.id === req.id ? { ...v, ...updates } : v)
      toast.success(status === 'purchased' ? 'Requerimiento marcado como comprado' : 'Requerimiento enviado')
    } else {
      toast.error('No se pudo actualizar el requerimiento')
    }
  }

  const handleDelete = async () => {
    if (!deletingReq) return
    if (isDemoMode) {
      setRequirements(prev => prev.filter(r => r.id !== deletingReq.id))
      setDeletingReq(null)
      toast.success('Requerimiento eliminado (demo)')
      return
    }
    const result = await deleteRequirement(getBusinessId(), deletingReq.id)
    if (result.success) {
      setRequirements(prev => prev.filter(r => r.id !== deletingReq.id))
      toast.success('Requerimiento eliminado')
    } else {
      toast.error('No se pudo eliminar')
    }
    setDeletingReq(null)
  }

  // ===== Impresión / exportación =====
  const groupByPriority = (items) => {
    const groups = { alta: [], media: [], baja: [] }
    for (const it of items || []) groups[it.priority || 'media'].push(it)
    return groups
  }

  const reqHeaderLines = (req) => {
    const lines = []
    const d = toDate(req.createdAt)
    lines.push(`Fecha: ${d ? formatDate(d) : formatDate(new Date())}`)
    if (req.branchName) lines.push(`Sucursal: ${req.branchName}`)
    lines.push(`Pedido por: ${req.createdByName || '—'}`)
    return lines
  }

  const openPdf = (doc) => {
    try {
      doc.autoPrint()
      const win = window.open(doc.output('bloburl'), '_blank')
      if (!win) toast.error('Permite ventanas emergentes para imprimir')
    } catch (e) {
      console.error('Error generando PDF del requerimiento:', e)
      toast.error('No se pudo generar el documento')
    }
  }

  const printTicket = (req) => {
    const W = 80, MX = 4
    const groups = groupByPriority(req.items)
    let height = 34
    for (const p of PRIORITY_ORDER) {
      if (groups[p].length === 0) continue
      height += 7 + groups[p].length * 4.5
    }
    if (req.notes) height += 14
    const doc = new jsPDF({ unit: 'mm', format: [W, Math.max(height, 60)] })
    let y = 8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('REQUERIMIENTO DE COMPRA', W / 2, y, { align: 'center' })
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    for (const line of reqHeaderLines(req)) { doc.text(line, W / 2, y, { align: 'center' }); y += 3.8 }
    y += 1
    doc.setLineDashPattern([1, 1], 0)
    doc.line(MX, y, W - MX, y)
    doc.setLineDashPattern([], 0)
    y += 5
    for (const p of PRIORITY_ORDER) {
      if (groups[p].length === 0) continue
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text(`${PRIORITIES[p].toUpperCase()} (${groups[p].length})`, MX, y)
      y += 4.5
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      for (const it of groups[p]) {
        doc.text(it.name.slice(0, 30), MX + 1, y)
        doc.setFont('helvetica', 'bold')
        doc.text(`${it.qty} ${it.unit}`, W - MX, y, { align: 'right' })
        doc.setFont('helvetica', 'normal')
        y += 4.5
      }
      y += 2.5
    }
    if (req.notes) {
      doc.setLineDashPattern([1, 1], 0)
      doc.line(MX, y, W - MX, y)
      doc.setLineDashPattern([], 0)
      y += 4
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.text('NOTAS:', MX, y)
      y += 3.5
      doc.setFont('helvetica', 'normal')
      const noteLines = doc.splitTextToSize(req.notes, W - 2 * MX)
      doc.text(noteLines.slice(0, 4), MX, y)
    }
    openPdf(doc)
  }

  const printPdf = (req) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const W = 210, MX = 14
    let y = 16
    const ensureSpace = (needed) => { if (y + needed > 283) { doc.addPage(); y = 16 } }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('REQUERIMIENTO DE COMPRA', W / 2, y, { align: 'center' })
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(reqHeaderLines(req).join('  ·  '), W / 2, y, { align: 'center' })
    y += 7
    doc.line(MX, y, W - MX, y)
    y += 6
    const groups = groupByPriority(req.items)
    for (const p of PRIORITY_ORDER) {
      if (groups[p].length === 0) continue
      ensureSpace(12)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text(`Prioridad ${PRIORITIES[p]} (${groups[p].length})`, MX, y)
      y += 5.5
      doc.setFontSize(9)
      for (const it of groups[p]) {
        ensureSpace(6)
        doc.setFont('helvetica', 'normal')
        const stockTxt = it.stockAtRequest != null ? `  ·  stock: ${it.stockAtRequest}` : ''
        doc.text(`• ${it.name}${stockTxt}`, MX + 3, y)
        doc.setFont('helvetica', 'bold')
        doc.text(`${it.qty} ${it.unit}`, W - MX, y, { align: 'right' })
        y += 5
      }
      y += 3
    }
    if (req.notes) {
      ensureSpace(16)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text('Notas:', MX, y)
      y += 5
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(doc.splitTextToSize(req.notes, W - 2 * MX), MX, y)
    }
    openPdf(doc)
  }

  const copyText = (req) => {
    const groups = groupByPriority(req.items)
    let txt = `REQUERIMIENTO DE COMPRA\n${reqHeaderLines(req).join('\n')}\n`
    for (const p of PRIORITY_ORDER) {
      if (groups[p].length === 0) continue
      txt += `\n[${PRIORITIES[p].toUpperCase()}]\n`
      for (const it of groups[p]) txt += `- ${it.name}: ${it.qty} ${it.unit}\n`
    }
    if (req.notes) txt += `\nNotas: ${req.notes}\n`
    navigator.clipboard?.writeText(txt)
      .then(() => toast.success('Lista copiada — pégala en WhatsApp'))
      .catch(() => toast.error('No se pudo copiar'))
  }

  // ===== Helpers de UI =====
  const statusBadge = (status) => {
    if (status === 'purchased') return <Badge variant="success">Comprado</Badge>
    if (status === 'sent') return <Badge className="bg-primary-100 text-primary-800">Enviado</Badge>
    return <Badge variant="warning">Abierto</Badge>
  }

  const priorityDot = (p) => (
    <span className={`inline-block w-2 h-2 rounded-full ${p === 'alta' ? 'bg-red-500' : p === 'media' ? 'bg-amber-500' : 'bg-green-500'}`} />
  )

  // ===== Editor: ingredientes agrupados por categoría =====
  const searchIndex = useMemo(() => {
    const map = new Map()
    for (const ing of ingredients) map.set(ing.id, buildSearchHaystack(ing.name))
    return map
  }, [ingredients])

  const editorGroups = useMemo(() => {
    const filtered = ingredients.filter(ing => matchesPrebuilt(editorSearch, searchIndex.get(ing.id) || ''))
    const byCat = new Map()
    for (const ing of filtered) {
      const key = ing.category || 'otros'
      if (!byCat.has(key)) byCat.set(key, [])
      byCat.get(key).push(ing)
    }
    // Ordenar categorías según el orden configurado; las no listadas al final
    const orderOf = (catId) => {
      const idx = categories.findIndex(c => c.id === catId)
      return idx === -1 ? 999 : idx
    }
    return [...byCat.entries()]
      .sort((a, b) => orderOf(a[0]) - orderOf(b[0]))
      .map(([catId, list]) => ({ catId, label: getCategoryLabel(catId), items: list.sort((a, b) => a.name.localeCompare(b.name)) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredients, editorSearch, searchIndex, categories])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando requerimientos...</p>
        </div>
      </div>
    )
  }

  // =========================================================================
  // VISTA EDITOR
  // =========================================================================
  if (view === 'editor') {
    return (
      <div className="space-y-4 animate-fade-in pb-24">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setView('list')}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            Volver
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              {editingId ? 'Editar requerimiento' : 'Nuevo requerimiento'}
            </h1>
            <p className="text-sm text-gray-600">Marca lo que falta comprar; lo que está en stock mínimo ya viene sugerido.</p>
          </div>
        </div>

        {/* Meta: sucursal + notas */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {branches.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Sucursal / cocina</label>
                  <select
                    value={editorBranchId}
                    onChange={(e) => setEditorBranchId(e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value="">Sucursal Principal</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              <div className={branches.length > 1 ? '' : 'sm:col-span-2'}>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notas para el comprador</label>
                <input
                  type="text"
                  value={editorNotes}
                  onChange={(e) => setEditorNotes(e.target.value)}
                  placeholder="Ej: el limón que sea verde, comprar temprano..."
                  className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder={`Buscar ${itemLabel}...`}
                value={editorSearch}
                onChange={(e) => setEditorSearch(e.target.value)}
                className="w-full h-10 pl-9 pr-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* Lista de insumos por categoría */}
        <Card>
          <CardContent className="p-0">
            {editorGroups.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <ClipboardList className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No hay {itemLabel} registrados{editorSearch ? ' que coincidan con la búsqueda' : ''}.</p>
              </div>
            ) : editorGroups.map(group => (
              <div key={group.catId}>
                <div className="px-4 py-2 bg-gray-50 border-y border-gray-100 first:border-t-0">
                  <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{group.label}</span>
                  <span className="text-xs text-gray-400 ml-2">{group.items.length}</span>
                </div>
                {group.items.map(ing => {
                  const sel = selection[ing.id]
                  const stock = getVisibleStock(ing)
                  const min = ing.minimumStock || 0
                  const low = ing.trackStock !== false && stock <= min
                  return (
                    <div key={ing.id} className={`flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-b-0 ${sel ? 'bg-primary-50/40' : ''}`}>
                      <button
                        onClick={() => toggleIngredient(ing)}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${sel ? 'bg-primary-600 border-primary-600' : 'border-gray-300 bg-white hover:border-primary-400'}`}
                        aria-label={sel ? 'Quitar' : 'Agregar'}
                      >
                        {sel && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                      </button>
                      <div className="flex-1 min-w-[140px]">
                        <p className="text-sm font-medium text-gray-900">{ing.name}</p>
                        <p className="text-xs text-gray-500">
                          Stock: <span className={low ? 'text-red-600 font-semibold' : ''}>{Math.round(stock * 100) / 100} {ing.purchaseUnit || ''}</span>
                          {min > 0 && <span className="text-gray-400"> · mín. {min}</span>}
                          {low && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100 font-semibold">BAJO</span>}
                        </p>
                      </div>
                      {sel && (
                        <>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={sel.qty}
                              onChange={(e) => setItemField(ing.id, 'qty', e.target.value)}
                              placeholder="Cant."
                              className="w-20 h-9 px-2 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                            <span className="text-xs text-gray-500 w-14 truncate">{ing.purchaseUnit || 'unid.'}</span>
                          </div>
                          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                            {PRIORITY_ORDER.map(p => (
                              <button
                                key={p}
                                onClick={() => setItemField(ing.id, 'priority', p)}
                                title={PRIORITIES[p]}
                                className={`w-9 h-9 text-xs font-bold transition-colors ${sel.priority === p
                                  ? (p === 'alta' ? 'bg-red-500 text-white' : p === 'media' ? 'bg-amber-500 text-white' : 'bg-green-600 text-white')
                                  : 'bg-white text-gray-400 hover:bg-gray-50'}`}
                              >
                                {PRIORITIES[p][0]}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Ítems libres (cosas que no son insumos registrados) */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium text-gray-900">Otros (no registrados como {itemLabel})</p>
            {freeItems.length > 0 && (
              <div className="space-y-1.5">
                {freeItems.map(f => (
                  <div key={f.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 text-gray-800">{f.name}</span>
                    <span className="text-gray-500 text-xs">{f.qty} {f.unit}</span>
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                      {PRIORITY_ORDER.map(p => (
                        <button
                          key={p}
                          onClick={() => setFreeItems(prev => prev.map(x => x.id === f.id ? { ...x, priority: p } : x))}
                          className={`w-7 h-7 text-[10px] font-bold ${f.priority === p
                            ? (p === 'alta' ? 'bg-red-500 text-white' : p === 'media' ? 'bg-amber-500 text-white' : 'bg-green-600 text-white')
                            : 'bg-white text-gray-400'}`}
                        >
                          {PRIORITIES[p][0]}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setFreeItems(prev => prev.filter(x => x.id !== f.id))} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={freeForm.name}
                onChange={(e) => setFreeForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') addFreeItem() }}
                placeholder="Ej: gas, bolsas, servilletas..."
                className="flex-1 min-w-[160px] h-10 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <input
                type="number"
                min="0"
                step="any"
                value={freeForm.qty}
                onChange={(e) => setFreeForm(f => ({ ...f, qty: e.target.value }))}
                placeholder="Cant."
                className="w-20 h-10 px-2 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <input
                type="text"
                value={freeForm.unit}
                onChange={(e) => setFreeForm(f => ({ ...f, unit: e.target.value }))}
                placeholder="Unidad"
                className="w-24 h-10 px-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <Button variant="outline" onClick={addFreeItem} disabled={!freeForm.name.trim()}>
                <Plus className="w-4 h-4 mr-1" />
                Agregar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Barra fija inferior: resumen + acciones */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-gray-200 px-4 py-3 z-20">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-semibold text-gray-900">{editorCounts.total} ítem{editorCounts.total === 1 ? '' : 's'}</span>
              <span className="flex items-center gap-1 text-red-600">{priorityDot('alta')} {editorCounts.alta}</span>
              <span className="flex items-center gap-1 text-amber-600">{priorityDot('media')} {editorCounts.media}</span>
              <span className="flex items-center gap-1 text-green-600">{priorityDot('baja')} {editorCounts.baja}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => saveRequirement('open')} disabled={isSaving || editorCounts.total === 0}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Guardar borrador
              </Button>
              <Button onClick={() => saveRequirement('sent')} disabled={isSaving || editorCounts.total === 0}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Enviar requerimiento
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // =========================================================================
  // VISTA LISTA
  // =========================================================================
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Requerimientos</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Lo que la cocina pide comprar. Crea el pedido al cierre y el comprador lo ve al día siguiente.
          </p>
        </div>
        <Button onClick={openNewEditor} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          Nuevo requerimiento
        </Button>
      </div>

      {/* Lista */}
      {visibleRequirements.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Aún no hay requerimientos</h3>
            <p className="text-sm text-gray-600 max-w-md mx-auto mb-4">
              Crea el primero: los {itemLabel} con stock en o bajo el mínimo ya vienen sugeridos para que solo confirmes cantidades.
            </p>
            <Button onClick={openNewEditor}>
              <Plus className="w-4 h-4 mr-2" />
              Crear requerimiento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleRequirements.map(req => {
            const d = toDate(req.createdAt)
            const counts = { alta: 0, media: 0, baja: 0 }
            for (const it of req.items || []) counts[it.priority || 'media']++
            return (
              <Card key={req.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{d ? formatDate(d) : '—'}</span>
                        {statusBadge(req.status)}
                        {req.branchName && <span className="text-xs text-gray-500">· {req.branchName}</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {(req.items || []).length} ítem{(req.items || []).length === 1 ? '' : 's'} · Pedido por {req.createdByName || '—'}
                        {req.status === 'purchased' && req.purchasedByName && ` · Comprado por ${req.purchasedByName}`}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs">
                        {counts.alta > 0 && <span className="flex items-center gap-1 text-red-600 font-medium">{priorityDot('alta')} {counts.alta} alta</span>}
                        {counts.media > 0 && <span className="flex items-center gap-1 text-amber-600 font-medium">{priorityDot('media')} {counts.media} media</span>}
                        {counts.baja > 0 && <span className="flex items-center gap-1 text-green-600 font-medium">{priorityDot('baja')} {counts.baja} baja</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => setViewingReq(req)}>
                        <Eye className="w-4 h-4 mr-1.5" />
                        Ver
                      </Button>
                      {req.status === 'open' && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => openEditEditor(req)}>
                            <Pencil className="w-4 h-4 mr-1.5" />
                            Editar
                          </Button>
                          <Button size="sm" onClick={() => changeStatus(req, 'sent')}>
                            <Send className="w-4 h-4 mr-1.5" />
                            Enviar
                          </Button>
                        </>
                      )}
                      {req.status === 'sent' && (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => changeStatus(req, 'purchased')}>
                          <CheckCircle className="w-4 h-4 mr-1.5" />
                          Marcar comprado
                        </Button>
                      )}
                      {(isBusinessOwner || isAdmin || req.status === 'open') && (
                        <button onClick={() => setDeletingReq(req)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Eliminar">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal detalle */}
      <Modal
        isOpen={!!viewingReq}
        onClose={() => { setViewingReq(null); setPrintMenuOpen(false) }}
        title="Detalle del requerimiento"
        size="2xl"
      >
        {viewingReq && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{toDate(viewingReq.createdAt) ? formatDate(toDate(viewingReq.createdAt)) : '—'}</span>
              {statusBadge(viewingReq.status)}
              {viewingReq.branchName && <span>· {viewingReq.branchName}</span>}
              <span>· Pedido por {viewingReq.createdByName || '—'}</span>
            </div>

            {PRIORITY_ORDER.map(p => {
              const items = (viewingReq.items || []).filter(it => (it.priority || 'media') === p)
              if (items.length === 0) return null
              return (
                <div key={p}>
                  <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wide pb-1.5 border-b-2 mb-1.5 ${p === 'alta' ? 'text-red-600 border-red-200' : p === 'media' ? 'text-amber-600 border-amber-200' : 'text-green-700 border-green-200'}`}>
                    {priorityDot(p)} {PRIORITIES[p]} · {items.length}
                  </div>
                  {items.map((it, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1.5 border-b border-dashed border-gray-100 last:border-b-0 text-sm">
                      <span className="text-gray-800">
                        {it.name}
                        {it.stockAtRequest != null && <span className="text-xs text-gray-400 ml-2">stock: {it.stockAtRequest}</span>}
                      </span>
                      <span className="font-bold text-gray-900 whitespace-nowrap">{it.qty} {it.unit}</span>
                    </div>
                  ))}
                </div>
              )
            })}

            {viewingReq.notes && (
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-sm text-amber-900">
                <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600 block mb-0.5">Notas</span>
                {viewingReq.notes}
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => copyText(viewingReq)}>
                <Copy className="w-4 h-4 mr-2" />
                Copiar
              </Button>
              <div className="relative">
                <Button variant="outline" onClick={() => setPrintMenuOpen(o => !o)} className="w-full sm:w-auto">
                  <Printer className="w-4 h-4 mr-2" />
                  Imprimir
                  <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${printMenuOpen ? 'rotate-180' : ''}`} />
                </Button>
                {printMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setPrintMenuOpen(false)} />
                    <div className="absolute right-0 bottom-full mb-2 z-20 w-56 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden py-1">
                      <button
                        onClick={() => { setPrintMenuOpen(false); printTicket(viewingReq) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left text-sm text-gray-900"
                      >
                        <Printer className="w-4 h-4 text-primary-600" />
                        Ticket 80mm
                      </button>
                      <button
                        onClick={() => { setPrintMenuOpen(false); printPdf(viewingReq) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left text-sm text-gray-900"
                      >
                        <FileText className="w-4 h-4 text-primary-600" />
                        PDF A4
                      </button>
                    </div>
                  </>
                )}
              </div>
              {viewingReq.status === 'sent' && (
                <>
                  <Button variant="outline" onClick={() => appNavigate('ingredientes/compra')}>
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Registrar compra
                  </Button>
                  <Button className="bg-green-600 hover:bg-green-700" onClick={() => changeStatus(viewingReq, 'purchased')}>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Marcar comprado
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal confirmar eliminación */}
      <Modal isOpen={!!deletingReq} onClose={() => setDeletingReq(null)} title="Eliminar requerimiento" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            ¿Eliminar el requerimiento del {deletingReq && toDate(deletingReq.createdAt) ? formatDate(toDate(deletingReq.createdAt)) : '—'}? Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeletingReq(null)}>Cancelar</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
