import { useState, useEffect } from 'react'
import { Store, Upload, X, Image as ImageIcon, Loader2, Edit } from 'lucide-react'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { getActiveBranches, updateBranch } from '@/services/branchService'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'

/**
 * Sección "Mis sucursales" (Configuración › Mi Empresa).
 *
 * Cuando el negocio tiene sucursales, el dueño puede personalizar por cada una su
 * logo, nombre comercial, dirección y teléfono (independientes del negocio). Esos
 * datos se usan en comprobantes/tickets/cotizaciones/guías/catálogo emitidos desde
 * esa sucursal. La Sucursal Principal se edita arriba en "Información de la Empresa".
 *
 * Crear/eliminar sucursales sigue siendo del panel admin (va ligado a series y plan).
 */
export default function BranchInfoSettings({ businessId, mainBranchName = 'Sucursal Principal' }) {
  const { toast } = useToast()
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)

  const [editing, setEditing] = useState(null) // branch en edición (o null)
  const [form, setForm] = useState({ tradeName: '', address: '', phone: '' })
  const [logoUrl, setLogoUrl] = useState('')      // preview/URL actual
  const [logoFile, setLogoFile] = useState(null)  // archivo nuevo pendiente de subir
  const [saving, setSaving] = useState(false)

  const loadBranches = async () => {
    if (!businessId) return
    setLoading(true)
    try {
      const res = await getActiveBranches(businessId)
      setBranches(res.success ? (res.data || []) : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBranches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId])

  const openEdit = (branch) => {
    setEditing(branch)
    setForm({
      tradeName: branch.tradeName || '',
      address: branch.address || '',
      phone: branch.phone || '',
    })
    setLogoUrl(branch.logoUrl || '')
    setLogoFile(null)
  }

  const closeEdit = () => {
    setEditing(null)
    setLogoFile(null)
  }

  const handleLogoSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast.error('El archivo debe ser una imagen (JPG, PNG o WEBP)')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('La imagen no debe superar los 2MB')
      return
    }
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setLogoUrl(ev.target.result)
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    try {
      let uploadedLogoUrl = editing.logoUrl || ''
      // Subir logo nuevo si se eligió uno (mismo patrón que el logo del negocio).
      if (logoFile) {
        try {
          const logoRef = ref(storage, `businesses/${businessId}/branches/${editing.id}/logo`)
          await uploadBytes(logoRef, logoFile)
          uploadedLogoUrl = await getDownloadURL(logoRef)
        } catch (err) {
          console.error('Error al subir logo de sucursal:', err)
          toast.error('No se pudo subir el logo. Se guardará el resto.')
        }
      } else if (logoUrl === '') {
        // El usuario quitó el logo
        uploadedLogoUrl = ''
      }

      const res = await updateBranch(businessId, editing.id, {
        tradeName: form.tradeName.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        logoUrl: uploadedLogoUrl || '',
      })

      if (res.success) {
        toast.success('Sucursal actualizada')
        closeEdit()
        await loadBranches()
      } else {
        toast.error(res.error || 'No se pudo actualizar la sucursal')
      }
    } finally {
      setSaving(false)
    }
  }

  // Sin sucursales → no mostrar la sección (la Principal se edita en "Mi Empresa").
  if (!loading && branches.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center space-x-2">
          <Store className="w-5 h-5 text-primary-600" />
          <CardTitle>Mis sucursales</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600 mb-4">
          Personaliza el <strong>logo</strong>, <strong>nombre comercial</strong>, <strong>dirección</strong> y{' '}
          <strong>teléfono</strong> de cada sucursal. Estos datos aparecen en los comprobantes, tickets y catálogo
          emitidos desde esa sucursal. La <strong>{mainBranchName}</strong> usa los datos de arriba (Información de la Empresa).
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 py-6 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> Cargando sucursales…
          </div>
        ) : (
          <div className="space-y-2">
            {branches.map((b) => (
              <div key={b.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                {b.logoUrl ? (
                  <img src={b.logoUrl} alt={b.name} className="w-12 h-12 object-contain rounded-lg border border-gray-100 bg-white p-1 flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Store className="w-5 h-5 text-gray-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{b.name}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {b.tradeName ? <span className="text-gray-700">{b.tradeName}</span> : <span className="italic">Sin nombre comercial propio</span>}
                    {b.address ? ` · ${b.address}` : ''}
                    {b.phone ? ` · ${b.phone}` : ''}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => openEdit(b)} className="flex-shrink-0">
                  <Edit className="w-4 h-4 mr-1.5" /> Editar
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Modal de edición */}
      <Modal isOpen={!!editing} onClose={closeEdit} title={`Editar ${editing?.name || 'sucursal'}`} size="lg">
        <div className="space-y-5">
          {/* Logo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Logo de la sucursal</label>
            <div className="flex items-start gap-4">
              {logoUrl ? (
                <div className="relative group">
                  <img src={logoUrl} alt="Logo" className="w-28 h-28 object-contain border-2 border-gray-200 rounded-lg p-2 bg-white" />
                  <button
                    type="button"
                    onClick={() => { setLogoUrl(''); setLogoFile(null) }}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Quitar logo"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="w-28 h-28 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                  <ImageIcon className="w-10 h-10 text-gray-400" />
                </div>
              )}
              <div className="flex-1">
                <label className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <Upload className="w-4 h-4 mr-2 text-gray-600" />
                  <span className="text-sm text-gray-700">{logoUrl ? 'Cambiar logo' : 'Subir logo'}</span>
                  <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleLogoSelect} className="hidden" />
                </label>
                <p className="text-xs text-gray-500 mt-2">JPG, PNG o WEBP · máx 2MB. Si lo dejas vacío, usa el logo del negocio.</p>
              </div>
            </div>
          </div>

          {/* Nombre comercial */}
          <Input
            label="Nombre comercial"
            placeholder="Ej: Mi Tienda - Surquillo (si lo dejas vacío usa el del negocio)"
            value={form.tradeName}
            onChange={(e) => setForm(f => ({ ...f, tradeName: e.target.value }))}
          />

          {/* Dirección */}
          <Input
            label="Dirección"
            placeholder="Dirección de esta sucursal"
            value={form.address}
            onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
          />

          {/* Teléfono */}
          <Input
            label="Teléfono"
            placeholder="Teléfono de esta sucursal"
            value={form.phone}
            onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={closeEdit} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando…</> : 'Guardar'}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
