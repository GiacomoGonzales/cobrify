import { useState, useEffect } from 'react'
import {
  Zap, Building, Package, ShoppingBag, Truck, Users, FileText, Wrench,
  Megaphone, CreditCard, MoreHorizontal, Plus, Trash2, Edit2, Check, X,
  Save, Loader2, AlertTriangle
} from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import { useAppContext } from '@/hooks/useAppContext'
import {
  getExpenseCategories,
  saveExpenseCategories,
  DEFAULT_EXPENSE_CATEGORIES
} from '@/services/expenseService'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

/**
 * Iconos seleccionables al crear/editar una categoría. Cada uno mapea a un
 * componente lucide-react. Si el negocio elige un icono no listado, igual
 * funciona porque se guarda solo el nombre.
 */
const SELECTABLE_ICONS = [
  { name: 'Zap', label: 'Servicios', Component: Zap },
  { name: 'Building', label: 'Edificio', Component: Building },
  { name: 'Package', label: 'Paquete', Component: Package },
  { name: 'ShoppingBag', label: 'Ventas', Component: ShoppingBag },
  { name: 'Truck', label: 'Transporte', Component: Truck },
  { name: 'Users', label: 'Personal', Component: Users },
  { name: 'FileText', label: 'Impuestos', Component: FileText },
  { name: 'Wrench', label: 'Mantenimiento', Component: Wrench },
  { name: 'Megaphone', label: 'Marketing', Component: Megaphone },
  { name: 'CreditCard', label: 'Bancarios', Component: CreditCard },
  { name: 'MoreHorizontal', label: 'Otros', Component: MoreHorizontal },
]

const PALETTE_COLORS = [
  '#F59E0B', '#EF4444', '#F97316', '#EC4899', '#8B5CF6',
  '#6366F1', '#0EA5E9', '#06B6D4', '#14B8A6', '#10B981',
  '#84CC16', '#64748B'
]

function getIconComponent(name) {
  const found = SELECTABLE_ICONS.find(i => i.name === name)
  return found?.Component || MoreHorizontal
}

function newCategoryId() {
  // Simple slug + sufijo aleatorio para evitar colisiones
  return `cat_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export default function ExpenseCategoriesManager() {
  const { user, getBusinessId } = useAppContext()
  const toast = useToast()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', description: '', icon: 'MoreHorizontal', color: '#64748B' })
  const [showAdd, setShowAdd] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', description: '', icon: 'MoreHorizontal', color: '#64748B' })
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    if (user?.uid) load()
  }, [user?.uid])

  async function load() {
    setLoading(true)
    try {
      const result = await getExpenseCategories(getBusinessId())
      if (result.success && Array.isArray(result.data)) {
        setCategories(result.data)
      }
    } catch (err) {
      toast.error('Error al cargar categorías')
    } finally {
      setLoading(false)
    }
  }

  async function persist(updated) {
    setSaving(true)
    try {
      const res = await saveExpenseCategories(getBusinessId(), updated)
      if (res.success) {
        setCategories(updated)
        toast.success('Categorías guardadas')
      } else {
        toast.error('No se pudieron guardar: ' + (res.error || ''))
      }
    } catch (err) {
      toast.error('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAdd() {
    const name = newForm.name.trim()
    if (!name) {
      toast.warning('Ingresa un nombre')
      return
    }
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      toast.warning('Ya existe una categoría con ese nombre')
      return
    }
    const newCat = {
      id: newCategoryId(),
      name,
      description: newForm.description.trim(),
      icon: newForm.icon,
      color: newForm.color,
    }
    await persist([...categories, newCat])
    setNewForm({ name: '', description: '', icon: 'MoreHorizontal', color: '#64748B' })
    setShowAdd(false)
  }

  function startEdit(cat) {
    setEditingId(cat.id)
    setEditForm({
      name: cat.name,
      description: cat.description || '',
      icon: cat.icon || 'MoreHorizontal',
      color: cat.color || '#64748B',
    })
  }

  async function handleSaveEdit(id) {
    const name = editForm.name.trim()
    if (!name) {
      toast.warning('El nombre no puede estar vacío')
      return
    }
    const updated = categories.map(c =>
      c.id === id ? { ...c, name, description: editForm.description.trim(), icon: editForm.icon, color: editForm.color } : c
    )
    await persist(updated)
    setEditingId(null)
  }

  async function handleArchive(id) {
    const updated = categories.map(c =>
      c.id === id ? { ...c, archived: !c.archived } : c
    )
    await persist(updated)
  }

  async function handleDelete(id) {
    const cat = categories.find(c => c.id === id)
    if (!cat) return
    const ok = window.confirm(
      `¿Eliminar "${cat.name}"?\n\n` +
      `Si tienes gastos con esta categoría, no se borrarán pero quedarán huérfanos. ` +
      `Considera archivar en lugar de eliminar para conservar el historial.`
    )
    if (!ok) return
    await persist(categories.filter(c => c.id !== id))
  }

  async function handleResetDefaults() {
    if (!window.confirm('Esto reemplazará todas tus categorías con las predeterminadas de Cobrify. ¿Continuar?')) return
    await persist(DEFAULT_EXPENSE_CATEGORIES.map(c => ({ ...c })))
  }

  const visible = showArchived ? categories : categories.filter(c => !c.archived)
  const archivedCount = categories.filter(c => c.archived).length

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        Cargando categorías...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header con acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Categorías de Gastos</h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Personaliza las categorías que aparecerán al registrar un gasto. Las archivadas conservan el historial.
          </p>
        </div>
        <div className="flex gap-2">
          {archivedCount > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowArchived(s => !s)}
            >
              {showArchived ? 'Ocultar archivadas' : `Ver archivadas (${archivedCount})`}
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setShowAdd(true)}
            disabled={saving}
          >
            <Plus className="w-4 h-4 mr-1" /> Nueva categoría
          </Button>
        </div>
      </div>

      {/* Form de nueva categoría */}
      {showAdd && (
        <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="Nombre"
              required
              placeholder="Ej. Alquiler de almacén"
              value={newForm.name}
              onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
            />
            <Input
              label="Descripción (opcional)"
              placeholder="Ayuda visual al elegir esta categoría"
              value={newForm.description}
              onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
            />
          </div>
          <IconColorPicker
            icon={newForm.icon}
            color={newForm.color}
            onIconChange={(v) => setNewForm({ ...newForm, icon: v })}
            onColorChange={(v) => setNewForm({ ...newForm, color: v })}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAdd(false)} disabled={saving}>
              <X className="w-3.5 h-3.5 mr-1" /> Cancelar
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={handleAdd} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
              Guardar
            </Button>
          </div>
        </div>
      )}

      {/* Lista de categorías */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {visible.map(cat => {
          const Icon = getIconComponent(cat.icon)
          const isEditing = editingId === cat.id
          if (isEditing) {
            return (
              <div key={cat.id} className="border border-primary-300 bg-primary-50/30 rounded-lg p-3 space-y-3 md:col-span-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    label="Nombre"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                  <Input
                    label="Descripción"
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  />
                </div>
                <IconColorPicker
                  icon={editForm.icon}
                  color={editForm.color}
                  onIconChange={(v) => setEditForm({ ...editForm, icon: v })}
                  onColorChange={(v) => setEditForm({ ...editForm, color: v })}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(null)} disabled={saving}>
                    <X className="w-3.5 h-3.5 mr-1" /> Cancelar
                  </Button>
                  <Button type="button" variant="primary" size="sm" onClick={() => handleSaveEdit(cat.id)} disabled={saving}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                    Guardar cambios
                  </Button>
                </div>
              </div>
            )
          }
          return (
            <div
              key={cat.id}
              className={`flex items-center gap-3 p-3 border rounded-lg ${
                cat.archived ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${cat.color || '#64748B'}1A`, color: cat.color || '#64748B' }}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {cat.name}
                  {cat.archived && <span className="ml-2 text-[10px] uppercase tracking-wider text-gray-500">archivada</span>}
                </p>
                {cat.description && <p className="text-xs text-gray-500 truncate">{cat.description}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(cat)}
                  className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded"
                  title="Editar"
                  disabled={saving}
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleArchive(cat.id)}
                  className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded"
                  title={cat.archived ? 'Reactivar' : 'Archivar (oculta sin borrar historial)'}
                  disabled={saving}
                >
                  <AlertTriangle className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(cat.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                  title="Eliminar definitivamente"
                  disabled={saving}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {visible.length === 0 && (
        <p className="text-center text-sm text-gray-500 py-4">No hay categorías {showArchived ? '' : 'activas'}.</p>
      )}

      {/* Reset a defaults */}
      <div className="pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={handleResetDefaults}
          className="text-xs text-gray-500 hover:text-gray-700 underline"
          disabled={saving}
        >
          Restaurar categorías predeterminadas
        </button>
      </div>
    </div>
  )
}

function IconColorPicker({ icon, color, onIconChange, onColorChange }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Icono</label>
        <div className="flex flex-wrap gap-1.5">
          {SELECTABLE_ICONS.map(({ name, Component }) => (
            <button
              key={name}
              type="button"
              onClick={() => onIconChange(name)}
              className={`w-8 h-8 rounded-md flex items-center justify-center border transition-colors ${
                icon === name
                  ? 'bg-primary-50 border-primary-500 text-primary-600'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
              title={name}
            >
              <Component className="w-4 h-4" />
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
        <div className="flex flex-wrap gap-1.5">
          {PALETTE_COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => onColorChange(c)}
              className={`w-7 h-7 rounded-full border-2 transition-transform ${
                color === c ? 'border-gray-900 scale-110' : 'border-white hover:border-gray-300'
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
