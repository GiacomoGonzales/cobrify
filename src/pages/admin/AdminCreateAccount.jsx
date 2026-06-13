import React, { useState } from 'react'
import { UserPlus, Loader2, CheckCircle, Eye, EyeOff, Search, ImagePlus, X } from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import { registerBusinessAsAdmin } from '@/services/authService'
import { consultarRUC } from '@/services/documentLookupService'
import { uploadImage } from '@/services/imageUploadService'
import { DEPARTAMENTOS, PROVINCIAS, DISTRITOS } from '@/data/peruUbigeos'
import SidebarModulesPicker from '@/components/SidebarModulesPicker'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  ruc: '',
  businessName: '',
  tradeName: '',
  phone: '',
  address: '',
}

export default function AdminCreateAccount() {
  const toast = useToast()
  const [form, setForm] = useState(EMPTY_FORM)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [lookingUpRuc, setLookingUpRuc] = useState(false)
  const [noRuc, setNoRuc] = useState(false)
  const [lastCreated, setLastCreated] = useState(null)

  // Ubicación (ubigeo) — selectores encadenados, default Lima/Lima
  const [departmentCode, setDepartmentCode] = useState('15')
  const [provinceCode, setProvinceCode] = useState('01')
  const [districtCode, setDistrictCode] = useState('')

  // Logo de la empresa (se sube tras crear la cuenta y se guarda en logoUrl)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState('')

  // Preferencias de arranque
  const [businessMode, setBusinessMode] = useState('retail')
  const [enableProductLocation, setEnableProductLocation] = useState(false)
  const [enableManualStockEdit, setEnableManualStockEdit] = useState(false)
  const [batchControl, setBatchControl] = useState(false)
  const [defaultTaxAffectation, setDefaultTaxAffectation] = useState('10')
  const [hiddenMenuItems, setHiddenMenuItems] = useState([])

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast.error('El logo debe ser una imagen (JPG, PNG o WEBP)')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('El logo no debe superar los 2MB')
      return
    }
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setLogoPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  const clearLogo = () => {
    setLogoFile(null)
    setLogoPreview('')
  }

  const setField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const getProvincias = (deptCode) => PROVINCIAS[deptCode] || []
  const getDistritos = (deptCode, provCode) => DISTRITOS[`${deptCode}${provCode}`] || []
  const getUbigeo = () => (departmentCode && provinceCode && districtCode) ? `${departmentCode}${provinceCode}${districtCode}` : ''
  const getLocationNames = () => ({
    department: DEPARTAMENTOS.find(d => d.code === departmentCode)?.name || '',
    province: getProvincias(departmentCode).find(p => p.code === provinceCode)?.name || '',
    district: getDistritos(departmentCode, provinceCode).find(d => d.code === districtCode)?.name || '',
  })

  // Buscar códigos de ubigeo por nombre (para autocompletar desde el RUC)
  const matchByName = (list, name) => {
    if (!name) return ''
    const n = name.toUpperCase().trim()
    const found = (list || []).find(x =>
      x.name.toUpperCase() === n || x.name.toUpperCase().includes(n) || n.includes(x.name.toUpperCase())
    )
    return found?.code || ''
  }

  // Buscar datos del RUC en SUNAT y rellenar el formulario automáticamente
  const handleLookupRuc = async () => {
    const ruc = form.ruc.trim()
    if (!/^\d{11}$/.test(ruc)) {
      toast.error('Ingresa un RUC válido de 11 dígitos')
      return
    }
    setLookingUpRuc(true)
    try {
      const result = await consultarRUC(ruc)
      if (result.success) {
        setForm((prev) => ({
          ...prev,
          businessName: result.data.razonSocial || prev.businessName,
          tradeName: result.data.nombreComercial || prev.tradeName,
          address: result.data.direccion || prev.address,
        }))
        // Convertir nombres de ubicación a códigos de ubigeo encadenados
        const deptCode = matchByName(DEPARTAMENTOS, result.data.departamento)
        if (deptCode) {
          setDepartmentCode(deptCode)
          const provCode = matchByName(PROVINCIAS[deptCode], result.data.provincia)
          if (provCode) {
            setProvinceCode(provCode)
            const distCode = matchByName(DISTRITOS[`${deptCode}${provCode}`], result.data.distrito)
            if (distCode) setDistrictCode(distCode)
          }
        }
        toast.success('Datos del RUC cargados')
      } else {
        toast.error(result.error || 'No se encontraron datos para este RUC')
      }
    } catch (err) {
      console.error('Error al buscar RUC:', err)
      toast.error('Error al consultar el RUC. Intenta nuevamente.')
    } finally {
      setLookingUpRuc(false)
    }
  }

  const validate = () => {
    if (!form.name.trim()) return 'Ingresa el nombre del responsable.'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return 'Ingresa un correo válido.'
    if (form.password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.'
    if (!noRuc && !/^\d{11}$/.test(form.ruc.trim())) return 'El RUC debe tener 11 dígitos (o marca "Crear sin RUC").'
    if (!form.businessName.trim()) return noRuc ? 'Ingresa el nombre del negocio.' : 'Ingresa la razón social.'
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const error = validate()
    if (error) {
      toast.error(error)
      return
    }

    setSubmitting(true)
    try {
      const loc = getLocationNames()
      const result = await registerBusinessAsAdmin(
        form.email.trim(),
        form.password,
        form.name.trim(),
        {
          ruc: noRuc ? '' : form.ruc.trim(),
          businessName: form.businessName.trim(),
          tradeName: form.tradeName.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          department: loc.department,
          province: loc.province,
          district: loc.district,
          ubigeo: getUbigeo(),
          // Preferencias de arranque
          businessMode,
          enableProductLocation,
          enableManualStockEdit,
          defaultTaxAffectation,
          posCustomFields: { showBatchExpiryInPurchase: batchControl },
          hiddenMenuItems,
        }
      )

      if (result.success) {
        // Subir el logo (si se cargó) y guardarlo en el negocio recién creado.
        if (logoFile && result.userId) {
          try {
            const url = await uploadImage(logoFile, { folder: 'cobrify/branding', businessId: result.userId })
            if (url) await updateDoc(doc(db, 'businesses', result.userId), { logoUrl: url })
          } catch (logoErr) {
            console.error('Error al subir el logo:', logoErr)
            toast.error('La cuenta se creó, pero el logo no se pudo subir. Puedes agregarlo luego.')
          }
        }
        toast.success('Cuenta creada correctamente')
        setLastCreated({ email: form.email.trim(), businessName: form.businessName.trim() })
        setForm(EMPTY_FORM)
        setDepartmentCode('15')
        setProvinceCode('01')
        setDistrictCode('')
        clearLogo()
        setBusinessMode('retail')
        setEnableProductLocation(false)
        setEnableManualStockEdit(false)
        setBatchControl(false)
        setDefaultTaxAffectation('10')
        setHiddenMenuItems([])
      } else {
        toast.error(result.error || 'No se pudo crear la cuenta')
      }
    } catch (err) {
      console.error('Error al crear cuenta:', err)
      toast.error('Ocurrió un error al crear la cuenta')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Crear Nueva Cuenta</h2>
        <p className="text-sm text-gray-500">Registra un nuevo negocio sin salir de tu sesión de administrador.</p>
      </div>

      {lastCreated && (
        <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-green-800">
            <p className="font-medium">Última cuenta creada</p>
            <p className="text-green-700">{lastCreated.businessName} · {lastCreated.email}</p>
            <p className="text-xs text-green-600 mt-1">Nace en plan de prueba. Asigna su plan o pago desde la sección Usuarios.</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Columna izquierda: acceso + negocio */}
          <div className="space-y-6">
        {/* Datos de acceso */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-1">Datos de acceso</h3>
          <p className="text-sm text-gray-500 mb-4">Con estos datos el cliente iniciará sesión.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Nombre del responsable *</label>
              <input type="text" value={form.name} onChange={setField('name')} className={inputClass} placeholder="Ej: Juan Pérez" autoComplete="off" />
            </div>
            <div>
              <label className={labelClass}>Correo electrónico *</label>
              <input type="email" value={form.email} onChange={setField('email')} className={inputClass} placeholder="correo@empresa.com" autoComplete="off" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Contraseña *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={setField('password')}
                  className={`${inputClass} pr-10`}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Datos del negocio */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-1">Datos del negocio</h3>
          <p className="text-sm text-gray-500 mb-4">Información fiscal y de contacto de la empresa.</p>

          {/* Crear sin RUC (para negocios que solo emiten notas de venta) */}
          <label className="flex items-center gap-2 mb-4 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={noRuc}
              onChange={(e) => setNoRuc(e.target.checked)}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">Crear sin RUC <span className="text-gray-400">(solo notas de venta)</span></span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!noRuc && (
              <div>
                <label className={labelClass}>RUC *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={11}
                    value={form.ruc}
                    onChange={setField('ruc')}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleLookupRuc() } }}
                    className={`${inputClass} flex-1`}
                    placeholder="20123456789"
                  />
                  <button
                    type="button"
                    onClick={handleLookupRuc}
                    disabled={lookingUpRuc}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors flex-shrink-0"
                    title="Buscar datos del RUC en SUNAT"
                  >
                    {lookingUpRuc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    <span className="hidden sm:inline">Buscar</span>
                  </button>
                </div>
              </div>
            )}
            <div>
              <label className={labelClass}>{noRuc ? 'Nombre del negocio *' : 'Razón social *'}</label>
              <input type="text" value={form.businessName} onChange={setField('businessName')} className={inputClass} placeholder={noRuc ? 'Mi Negocio' : 'EMPRESA SAC'} />
            </div>
            <div>
              <label className={labelClass}>Nombre comercial</label>
              <input type="text" value={form.tradeName} onChange={setField('tradeName')} className={inputClass} placeholder="Opcional" />
            </div>
            <div>
              <label className={labelClass}>Teléfono</label>
              <input type="tel" value={form.phone} onChange={setField('phone')} className={inputClass} placeholder="Opcional" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Dirección</label>
              <input type="text" value={form.address} onChange={setField('address')} className={inputClass} placeholder="Av. Principal 123" />
            </div>
            <div>
              <label className={labelClass}>Departamento</label>
              <select
                value={departmentCode}
                onChange={(e) => { setDepartmentCode(e.target.value); setProvinceCode(''); setDistrictCode('') }}
                className={`${inputClass} bg-white`}
              >
                <option value="">Selecciona...</option>
                {DEPARTAMENTOS.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Provincia</label>
              <select
                value={provinceCode}
                onChange={(e) => { setProvinceCode(e.target.value); setDistrictCode('') }}
                disabled={!departmentCode}
                className={`${inputClass} bg-white disabled:bg-gray-100`}
              >
                <option value="">Selecciona...</option>
                {getProvincias(departmentCode).map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Distrito</label>
              <select
                value={districtCode}
                onChange={(e) => setDistrictCode(e.target.value)}
                disabled={!provinceCode}
                className={`${inputClass} bg-white disabled:bg-gray-100`}
              >
                <option value="">Selecciona...</option>
                {getDistritos(departmentCode, provinceCode).map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
              </select>
            </div>
            {getUbigeo() && (
              <div className="sm:col-span-2 flex items-center gap-2 text-sm text-gray-600">
                <span>Ubigeo:</span>
                <span className="font-mono font-semibold text-gray-900">{getUbigeo()}</span>
              </div>
            )}
          </div>
        </div>
          </div>{/* fin columna izquierda */}

          {/* Columna derecha: configuración del negocio */}
          <div className="space-y-6">
            {/* Logo de la empresa */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h3 className="text-base font-semibold text-gray-900 mb-1">Logo de la empresa</h3>
              <p className="text-sm text-gray-500 mb-4">Aparecerá en sus comprobantes, tickets y catálogo. (Opcional)</p>
              {logoPreview ? (
                <div className="flex items-center gap-4">
                  <img src={logoPreview} alt="Logo" className="w-20 h-20 object-contain rounded-lg border border-gray-200 bg-gray-50" />
                  <div className="flex flex-col gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer w-fit">
                      <ImagePlus className="w-4 h-4" />
                      Cambiar logo
                      <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={handleLogoChange} className="hidden" />
                    </label>
                    <button type="button" onClick={clearLogo} className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 w-fit">
                      <X className="w-4 h-4" /> Quitar
                    </button>
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-400 hover:bg-gray-50 transition-colors cursor-pointer text-center">
                  <ImagePlus className="w-7 h-7 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">Subir logo</span>
                  <span className="text-xs text-gray-400">JPG, PNG o WEBP · máx 2MB</span>
                  <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={handleLogoChange} className="hidden" />
                </label>
              )}
            </div>

            {/* Tipo de negocio */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h3 className="text-base font-semibold text-gray-900 mb-1">Tipo de negocio</h3>
              <p className="text-sm text-gray-500 mb-4">Define los módulos y el flujo del negocio.</p>
              <select value={businessMode} onChange={(e) => setBusinessMode(e.target.value)} className={`${inputClass} bg-white`}>
                <option value="retail">Retail (Tienda/Comercio)</option>
                <option value="restaurant">Restaurante</option>
                <option value="pharmacy">Farmacia</option>
                <option value="veterinary">Veterinaria</option>
                <option value="hotel">Hotelería</option>
                <option value="transport">Transporte</option>
                <option value="logistics">Logística</option>
              </select>
            </div>

            {/* Catálogo y productos */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Catálogo y productos</h3>
                <p className="text-sm text-gray-500">Cómo se gestiona el catálogo y el stock.</p>
              </div>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={enableProductLocation} onChange={(e) => setEnableProductLocation(e.target.checked)} className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500" />
                <span className="text-sm text-gray-700"><span className="font-medium block">Habilitar ubicación de productos</span><span className="text-xs text-gray-500">Asignar ubicación física a cada producto (ej. P1-3A-4R).</span></span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={enableManualStockEdit} onChange={(e) => setEnableManualStockEdit(e.target.checked)} className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500" />
                <span className="text-sm text-gray-700"><span className="font-medium block">Permitir editar stock manualmente desde productos</span><span className="text-xs text-gray-500">Ajustar stock al editar un producto (queda como movimiento auditable).</span></span>
              </label>
              {businessMode !== 'pharmacy' && (
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={batchControl} onChange={(e) => setBatchControl(e.target.checked)} className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500" />
                  <span className="text-sm text-gray-700"><span className="font-medium block">Control de Lotes y Vencimientos</span><span className="text-xs text-gray-500">Lotes, fechas de vencimiento y alertas en ventas, compras e inventario.</span></span>
                </label>
              )}
              <div>
                <label className={labelClass}>Afectación IGV por defecto</label>
                <select value={defaultTaxAffectation} onChange={(e) => setDefaultTaxAffectation(e.target.value)} className={`${inputClass} bg-white`}>
                  <option value="10">Gravado (IGV)</option>
                  <option value="20">Exonerado</option>
                  <option value="30">Inafecto</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Afectación con la que nacen los productos nuevos. Se puede cambiar por producto.</p>
              </div>
            </div>

            {/* Personalizar menú lateral */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h3 className="text-base font-semibold text-gray-900 mb-1">Personalizar menú lateral</h3>
              <p className="text-sm text-gray-500 mb-4">Elige qué módulos mostrar. Desmarca los que no use para simplificar su navegación.</p>
              <SidebarModulesPicker businessMode={businessMode} hiddenMenuItems={hiddenMenuItems} onChange={setHiddenMenuItems} />
            </div>
          </div>{/* fin columna derecha */}
        </div>{/* fin grid 2 columnas */}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {submitting ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </div>
      </form>
    </div>
  )
}
