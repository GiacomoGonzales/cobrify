/**
 * CONFIGURACIÓN › MI EMPRESA.
 *
 * Los datos que identifican al negocio ante SUNAT y ante sus clientes: RUC,
 * razón social, domicilio fiscal con su ubigeo, contacto, logo y las cuentas
 * (bancarias y Yape/Plin) que salen en los comprobantes.
 *
 * La lógica es la misma que tenía el bloque `informacion` del Settings.jsx
 * monolítico (lupa del RUC, ubigeo desde la consulta, subida del logo y de
 * los QR a Storage). Lo que cambió: guarda SOLO sus campos con `useGuardado`,
 * se inicializa desde `businessSettings` en vez de leer Firestore por su
 * cuenta, y viste el kit común.
 *
 * Lo que ya NO vive aquí: el nombre de la cabecera (pestaña Cuenta), el tamaño
 * del logo en el ticket y el eslogan (pestaña Impresión). La subida del logo
 * sí se queda.
 */
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Search, Edit, Check, Trash2 } from 'lucide-react'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { useGuardado } from '@/components/settings/useGuardado'
import { Seccion, Campo, Fila, BarraGuardar, Separador } from '@/components/settings/kit'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import BranchInfoSettings from '@/components/settings/BranchInfoSettings'
import { companySettingsSchema } from '@/utils/schemas'
import { consultarRUC, consultarEstablecimientos } from '@/services/documentLookupService'
import { codigosDeUbigeo, ubigeoDeCodigos } from '@/utils/ubigeoDesdeConsulta'
import { DEPARTAMENTOS, PROVINCIAS, DISTRITOS } from '@/data/peruUbigeos'
import { invalidateLogoCache } from '@/utils/pdfGenerator'

// Lo que ve el demo en el formulario. No se guarda: `guardar` lo bloquea y
// `onSubmit` corta antes para no subir nada a Storage.
const DATOS_DEMO = {
  ruc: '20123456789',
  businessName: 'EMPRESA DEMO SAC',
  tradeName: 'Demo Store',
  phone: '01-2345678',
  email: 'demo@empresa.com',
  website: 'www.empresademo.com',
  socialMedia: '@empresademo',
  address: 'Av. Demo 123',
  urbanization: '',
  district: 'Miraflores',
  province: 'Lima',
  department: 'Lima',
  ubigeo: '150101',
}

// El mismo texto que usa `useGuardado`, para que el demo lea lo mismo venga
// de donde venga el corte.
const MENSAJE_DEMO = 'No se pueden guardar cambios en modo demo. Crea una cuenta para configurar tu empresa.'

const BANCOS = ['BCP', 'BBVA', 'Interbank', 'Scotiabank', 'BanBif', 'Pichincha', 'Banco de la Nación', 'Otro']
const TIPOS_CUENTA = [
  { value: 'corriente', label: 'Corriente' },
  { value: 'ahorros', label: 'Ahorros' },
  { value: 'detracciones', label: 'Detracciones' },
]
const MONEDAS = [
  { value: 'PEN', label: 'Soles' },
  { value: 'USD', label: 'Dólares' },
]
const BILLETERAS = ['Yape', 'Plin']

// Las mismas reglas de siempre para el logo y los QR: solo imágenes, hasta 2 MB.
const TIPOS_IMAGEN = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const IMAGEN_MAX_BYTES = 2 * 1024 * 1024
const ACCEPT_IMAGEN = 'image/jpeg,image/jpg,image/png,image/webp'

const CUENTA_VACIA = { bank: '', accountType: 'corriente', currency: 'PEN', accountNumber: '', cci: '' }
const BILLETERA_VACIA = { provider: '', holderName: '', phoneNumber: '' }

// Controles dentro de las tablas: más chicos que el Input normal.
const CELDA = 'px-2 py-1 text-xs'

// Sin tipo guardado se muestra "Corriente", como siempre.
const etiquetaTipoCuenta = (valor) => TIPOS_CUENTA.find(t => t.value === valor)?.label || 'Corriente'
const etiquetaMoneda = (valor) => (valor === 'PEN' ? 'Soles' : 'Dólares')

/** El asterisco de campo obligatorio. Gris, como todo lo que no es acción. */
const Obligatorio = () => <span className="text-gray-400 ml-1" aria-hidden="true">*</span>

export default function MiEmpresa() {
  const { user, getBusinessId, isDemoMode, businessSettings, isBusinessOwner, isAdmin } = useAppContext()
  const toast = useToast()
  const { guardar, guardando } = useGuardado()

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm({
    resolver: zodResolver(companySettingsSchema),
  })

  // Selector de ubicación: los tres códigos de 2 dígitos que forman el ubigeo
  const [locationDeptCode, setLocationDeptCode] = useState('')
  const [locationProvCode, setLocationProvCode] = useState('')
  const [locationDistCode, setLocationDistCode] = useState('')

  // Logo: la URL guardada (o el preview en data URL) y el archivo pendiente de subir
  const [logoUrl, setLogoUrl] = useState('')
  const [logoFile, setLogoFile] = useState(null)
  // Mientras suben el logo y los QR a Storage (va antes del guardado)
  const [subiendoArchivos, setSubiendoArchivos] = useState(false)

  // Lupa del RUC
  const [isLookingUpRuc, setIsLookingUpRuc] = useState(false)

  // Establecimientos (locales anexos) del emisor en SUNAT. Se llenan al buscar el RUC
  // con la lupa y se usan como punto de partida al emitir guías de remisión.
  const [establishments, setEstablishments] = useState([])

  // Cuentas bancarias estructuradas
  // Estructura: [{ bank: 'BCP', accountType, currency: 'PEN', accountNumber: '123-456789-0-12', cci: '00212345678901234567' }]
  const [bankAccounts, setBankAccounts] = useState([])
  const [cuentaNueva, setCuentaNueva] = useState(CUENTA_VACIA)

  // Billeteras digitales (Yape / Plin) con QR
  // Estructura: [{ provider: 'Yape'|'Plin', holderName, phoneNumber, qrImageUrl, _qrFile?, _qrPreview? }]
  const [digitalWallets, setDigitalWallets] = useState([])
  const [billeteraNueva, setBilleteraNueva] = useState(BILLETERA_VACIA)
  const [newWalletQrFile, setNewWalletQrFile] = useState(null)
  const [newWalletQrPreview, setNewWalletQrPreview] = useState('')

  // Edición inline de cuentas bancarias y billeteras (fila en modo editable)
  const [editingBankIndex, setEditingBankIndex] = useState(null)
  const [editingWalletIndex, setEditingWalletIndex] = useState(null)
  const updateBankAccount = (i, patch) => setBankAccounts(prev => prev.map((a, idx) => idx === i ? { ...a, ...patch } : a))
  const updateWallet = (i, patch) => setDigitalWallets(prev => prev.map((w, idx) => idx === i ? { ...w, ...patch } : w))

  // Demo: datos de muestra. Efecto aparte y SIN `businessSettings` en las
  // dependencias: en demo useAppContext() arma ese objeto en cada render, y
  // resetear el formulario en cada render sería un bucle.
  useEffect(() => {
    if (isDemoMode) reset(DATOS_DEMO)
  }, [isDemoMode, reset])

  // Real: el formulario y las listas salen del documento del negocio, y se
  // vuelven a sincronizar cuando el contexto lo refresca (tras cada guardado).
  // El `return` en demo es obligatorio por lo mismo de arriba: ahí
  // `businessSettings` cambia de referencia en cada render.
  useEffect(() => {
    if (isDemoMode || !businessSettings) return

    reset({
      ruc: businessSettings.ruc || '',
      businessName: businessSettings.businessName || '',
      tradeName: businessSettings.name || '',
      phone: businessSettings.phone || '',
      email: businessSettings.email || '',
      website: businessSettings.website || '',
      socialMedia: businessSettings.socialMedia || '',
      address: businessSettings.address || '',
      urbanization: businessSettings.urbanization || '',
      district: businessSettings.district || '',
      province: businessSettings.province || '',
      department: businessSettings.department || '',
      ubigeo: businessSettings.ubigeo || '',
      mtcRegistration: businessSettings.mtcRegistration || '',
    })

    // Los tres selectores se arman desde el ubigeo guardado
    if (businessSettings.ubigeo && businessSettings.ubigeo.length === 6) {
      setLocationDeptCode(businessSettings.ubigeo.substring(0, 2))
      setLocationProvCode(businessSettings.ubigeo.substring(2, 4))
      setLocationDistCode(businessSettings.ubigeo.substring(4, 6))
    } else {
      setLocationDeptCode('')
      setLocationProvCode('')
      setLocationDistCode('')
    }

    setEstablishments(Array.isArray(businessSettings.establishments) ? businessSettings.establishments : [])
    setBankAccounts(Array.isArray(businessSettings.bankAccountsList) ? businessSettings.bankAccountsList : [])
    setDigitalWallets(Array.isArray(businessSettings.digitalWalletsList) ? businessSettings.digitalWalletsList : [])
    setLogoUrl(businessSettings.logoUrl || '')
    setLogoFile(null)
  }, [businessSettings, isDemoMode, reset])

  // ── Ubicación ─────────────────────────────────────────────────────────────
  const getProvincias = (deptCode) => {
    return PROVINCIAS[deptCode] || []
  }

  const getDistritos = (deptCode, provCode) => {
    const key = `${deptCode}${provCode}`
    return DISTRITOS[key] || []
  }

  const getLocationUbigeo = () => {
    if (locationDeptCode && locationProvCode && locationDistCode) {
      return `${locationDeptCode}${locationProvCode}${locationDistCode}`
    }
    return ''
  }

  // Actualizar form values cuando cambian los códigos de ubicación
  const handleLocationChange = (type, value) => {
    if (type === 'department') {
      setLocationDeptCode(value)
      setLocationProvCode('')
      setLocationDistCode('')
      // Actualizar nombres en el form
      const dept = DEPARTAMENTOS.find(d => d.code === value)
      setValue('department', dept?.name || '')
      setValue('province', '')
      setValue('district', '')
      setValue('ubigeo', '')
    } else if (type === 'province') {
      setLocationProvCode(value)
      setLocationDistCode('')
      const prov = getProvincias(locationDeptCode).find(p => p.code === value)
      setValue('province', prov?.name || '')
      setValue('district', '')
      setValue('ubigeo', '')
    } else if (type === 'district') {
      setLocationDistCode(value)
      const dist = getDistritos(locationDeptCode, locationProvCode).find(d => d.code === value)
      setValue('district', dist?.name || '')
      // Calcular ubigeo
      const ubigeo = `${locationDeptCode}${locationProvCode}${value}`
      setValue('ubigeo', ubigeo)
    }
  }

  // ── Logo ──────────────────────────────────────────────────────────────────
  const handleLogoUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Validar tipo de archivo
    if (!TIPOS_IMAGEN.includes(file.type)) {
      toast.error('El archivo debe ser una imagen (JPG, PNG o WEBP)')
      return
    }

    // Validar tamaño (max 2MB)
    if (file.size > IMAGEN_MAX_BYTES) {
      toast.error('La imagen no debe superar los 2MB')
      return
    }

    setLogoFile(file)

    // Mostrar preview; el archivo se sube a Storage recién al guardar
    const reader = new FileReader()
    reader.onload = (ev) => {
      setLogoUrl(ev.target.result)
    }
    reader.readAsDataURL(file)
    // Permite volver a elegir el mismo archivo si el usuario se arrepiente
    e.target.value = ''
  }

  // Quita el logo AHORA, sin esperar al botón Guardar (así fue siempre): borra
  // el archivo de Storage si estaba ahí y deja `logoUrl` en null. Es el único
  // campo que se escribe por este camino.
  const handleRemoveLogo = async () => {
    if (!user?.uid) return
    if (isDemoMode) {
      toast.error(MENSAJE_DEMO)
      return
    }

    // Si hay un logo en storage, eliminarlo
    if (logoUrl && logoUrl.includes('firebase')) {
      try {
        const logoRef = ref(storage, `businesses/${getBusinessId()}/logo`)
        await deleteObject(logoRef)
      } catch (error) {
        console.log('No se pudo eliminar el logo anterior:', error)
      }
    }

    const ok = await guardar({ logoUrl: null }, 'Logo eliminado')
    if (!ok) return

    setLogoUrl('')
    setLogoFile(null)
    // Invalidar caché del logo
    invalidateLogoCache()
  }

  // ── Lupa del RUC ──────────────────────────────────────────────────────────
  const handleLookupRuc = async () => {
    const rucNumber = (watch('ruc') || '').replace(/\D/g, '')

    if (!rucNumber) {
      toast.error('Ingrese un número de RUC para buscar')
      return
    }

    if (rucNumber.length !== 11) {
      toast.error('El RUC debe tener 11 dígitos')
      return
    }

    setIsLookingUpRuc(true)

    try {
      const result = await consultarRUC(rucNumber)

      if (result.success) {
        // Autocompletar datos
        setValue('businessName', result.data.razonSocial || '')
        setValue('tradeName', result.data.nombreComercial || '')
        setValue('address', result.data.direccion || '')

        // La UBICACIÓN también. Antes había que ponerla a mano SIEMPRE, y es el
        // dato que SUNAT lee en el comprobante y en la guía de remisión.
        // Solo se pisa lo que la consulta pudo resolver: si trae el departamento
        // pero no el distrito, no se inventa uno.
        const ubi = codigosDeUbigeo(result.data)
        if (ubi.departamento) {
          setLocationDeptCode(ubi.departamento)
          setValue('department', DEPARTAMENTOS.find(d => d.code === ubi.departamento)?.name || '')
          setLocationProvCode(ubi.provincia)
          setValue('province', ubi.provincia
            ? (getProvincias(ubi.departamento).find(p => p.code === ubi.provincia)?.name || '')
            : '')
          setLocationDistCode(ubi.distrito)
          setValue('district', ubi.distrito
            ? (getDistritos(ubi.departamento, ubi.provincia).find(d => d.code === ubi.distrito)?.name || '')
            : '')
          setValue('ubigeo', ubigeoDeCodigos(ubi))
        }

        toast.success(`Datos encontrados: ${result.data.razonSocial}`)

        // Además, traer los locales/establecimientos del RUC (si tiene más de uno)
        // para poder elegirlos como punto de partida en las guías de remisión.
        // Es complementario al domicilio fiscal; no bloquea ni avisa si falla.
        try {
          const estResult = await consultarEstablecimientos(rucNumber)
          if (estResult.success) {
            setEstablishments(estResult.data || [])
          }
        } catch (estError) {
          console.error('Error al traer establecimientos:', estError)
        }
      } else {
        toast.error(result.error || 'No se encontraron datos para este RUC', 5000)
      }
    } catch (error) {
      console.error('Error al buscar RUC:', error)
      toast.error('Error al consultar el RUC. Verifique su conexión.', 5000)
    } finally {
      setIsLookingUpRuc(false)
    }
  }

  // ── Cuentas bancarias y billeteras ────────────────────────────────────────
  const agregarCuenta = () => {
    const { bank, accountType, currency, accountNumber, cci } = cuentaNueva
    if (!bank || !accountNumber) {
      toast.error('Ingresa el banco y número de cuenta')
      return
    }
    setBankAccounts([...bankAccounts, { bank, accountType, currency, accountNumber, cci }])
    setCuentaNueva(CUENTA_VACIA)
  }

  const quitarCuenta = (index) => {
    setBankAccounts(bankAccounts.filter((_, i) => i !== index))
    setEditingBankIndex(null)
  }

  const handleWalletQrSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!TIPOS_IMAGEN.includes(file.type)) {
      toast.error('El QR debe ser una imagen (JPG, PNG o WEBP)')
      return
    }
    if (file.size > IMAGEN_MAX_BYTES) {
      toast.error('La imagen no debe superar los 2MB')
      return
    }
    setNewWalletQrFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setNewWalletQrPreview(ev.target.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const agregarBilletera = () => {
    const { provider, holderName, phoneNumber } = billeteraNueva
    if (!provider || !phoneNumber) {
      toast.error('Elige Yape o Plin e ingresa el número')
      return
    }
    // El QR viaja como archivo hasta el guardado, que lo sube y lo cambia por su URL
    setDigitalWallets([...digitalWallets, { provider, holderName, phoneNumber, qrImageUrl: null, _qrFile: newWalletQrFile, _qrPreview: newWalletQrPreview }])
    setBilleteraNueva(BILLETERA_VACIA)
    setNewWalletQrFile(null)
    setNewWalletQrPreview('')
  }

  const quitarBilletera = (index) => {
    setDigitalWallets(digitalWallets.filter((_, i) => i !== index))
    setEditingWalletIndex(null)
  }

  // ── Guardar ───────────────────────────────────────────────────────────────
  const onSubmit = async (data) => {
    if (!user?.uid) return

    // La subida a Storage va antes del guardado, así que el demo se corta
    // aquí y no recién en `guardar` (que también lo bloquea).
    if (isDemoMode) {
      toast.error(MENSAJE_DEMO)
      return
    }

    let uploadedLogoUrl = logoUrl
    let walletsToSave = digitalWallets.map(w => ({
      provider: w.provider,
      holderName: w.holderName || '',
      phoneNumber: w.phoneNumber || '',
      qrImageUrl: w.qrImageUrl || null,
    }))

    setSubiendoArchivos(true)
    try {
      // Si hay un nuevo archivo de logo, subirlo a Storage
      if (logoFile) {
        try {
          const logoRef = ref(storage, `businesses/${getBusinessId()}/logo`)
          await uploadBytes(logoRef, logoFile)
          uploadedLogoUrl = await getDownloadURL(logoRef)
          // Invalidar caché del logo para que se descargue el nuevo
          invalidateLogoCache()
        } catch (logoError) {
          console.error('Error al subir logo:', logoError)
          toast.error('Error al subir el logo. Se guardará el resto de la configuración.')
        }
      }

      // Subir los QR pendientes de las billeteras digitales (Yape/Plin). Mismo patrón que
      // el logo: el archivo se sube a Storage al guardar y se reemplaza por su URL.
      if (digitalWallets.some(w => w._qrFile)) {
        try {
          walletsToSave = await Promise.all(digitalWallets.map(async (w, i) => {
            let qrUrl = w.qrImageUrl || null
            if (w._qrFile) {
              const wRef = ref(storage, `businesses/${getBusinessId()}/wallet-qr/${w.provider}_${Date.now()}_${i}`)
              await uploadBytes(wRef, w._qrFile)
              qrUrl = await getDownloadURL(wRef)
            }
            return { provider: w.provider, holderName: w.holderName || '', phoneNumber: w.phoneNumber || '', qrImageUrl: qrUrl }
          }))
          invalidateLogoCache()
        } catch (e) {
          console.error('Error al subir QR de billetera:', e)
          toast.error('Error al subir el QR de Yape/Plin. Se guardará el resto de la configuración.')
        }
      }
    } finally {
      setSubiendoArchivos(false)
    }

    // SOLO lo que esta pestaña edita. `name` sigue siendo el nombre comercial
    // con la razón social de respaldo, como siempre.
    const ok = await guardar({
      ruc: data.ruc,
      businessName: data.businessName,
      name: data.tradeName || data.businessName,
      phone: data.phone,
      email: data.email,
      website: data.website,
      socialMedia: data.socialMedia || '',
      bankAccountsList: bankAccounts,
      digitalWalletsList: walletsToSave,
      address: data.address,
      urbanization: data.urbanization,
      district: data.district,
      province: data.province,
      department: data.department,
      ubigeo: data.ubigeo,
      logoUrl: uploadedLogoUrl || null,
      mtcRegistration: data.mtcRegistration || '',
      establishments,
    }, 'Datos de la empresa guardados')
    if (!ok) return

    setLogoFile(null) // Limpiar archivo temporal
    setLogoUrl(uploadedLogoUrl || '')
    setDigitalWallets(walletsToSave) // Reflejar las URLs subidas (quita los archivos/preview temporales)
    setNewWalletQrFile(null)
    setNewWalletQrPreview('')
  }

  // Los errores de los campos sin control visible (ubigeo, departamento...) no
  // se ven solos, y con la pestaña larga el del RUC puede quedar fuera de la
  // pantalla: el toast señala el primero para que se sepa qué falta.
  const alFallarValidacion = (erroresForm) => {
    const primero = Object.values(erroresForm)[0]
    toast.error(primero?.message || 'Revisa los campos marcados')
  }

  const enviar = handleSubmit(onSubmit, alFallarValidacion)
  const ocupado = guardando || subiendoArchivos
  const ubigeoActual = getLocationUbigeo()
  const errorUbicacion = errors.department?.message || errors.province?.message || errors.district?.message || errors.ubigeo?.message

  return (
    <div className="space-y-8">
      {/* noValidate: valida zod (el esquema de siempre), no el navegador. Sin esto
          `type="url"` rechazaba "www.miempresa.com" antes de llegar al esquema. */}
      <form onSubmit={enviar} className="space-y-8" noValidate>
        <Seccion
          titulo="Datos legales"
          descripcion="Lo que sale en la cabecera de facturas, boletas y guías. Los campos con asterisco son obligatorios."
        >
          <Fila>
            <Campo
              id="opcion-ruc"
              etiqueta={<>RUC<Obligatorio /></>}
              ayuda="Escribe los 11 dígitos y usa la lupa: trae razón social, domicilio y ubicación desde SUNAT."
            >
              <div className="flex items-start gap-2">
                <Input placeholder="20123456789" inputMode="numeric" error={errors.ruc?.message} {...register('ruc')} />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleLookupRuc}
                  disabled={isLookingUpRuc}
                  className="shrink-0 px-3 py-2"
                  title="Buscar datos del RUC"
                  aria-label="Buscar datos del RUC"
                >
                  {isLookingUpRuc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
            </Campo>
            <Campo id="opcion-businessName" etiqueta={<>Razón social<Obligatorio /></>}>
              <Input placeholder="MI EMPRESA SAC" error={errors.businessName?.message} {...register('businessName')} />
            </Campo>
            <Campo id="opcion-name" etiqueta="Nombre comercial" ayuda="Si lo dejas vacío se usa la razón social.">
              <Input placeholder="Mi Empresa" error={errors.tradeName?.message} {...register('tradeName')} />
            </Campo>
            <Campo id="opcion-mtcRegistration" etiqueta="N° de registro MTC" ayuda="Solo para guías de remisión transportista. Opcional.">
              <Input placeholder="Ej: 0001234" error={errors.mtcRegistration?.message} {...register('mtcRegistration')} />
            </Campo>
          </Fila>
        </Seccion>

        <Separador />

        <Seccion
          titulo="Ubicación"
          descripcion="El domicilio fiscal. El ubigeo es el dato que SUNAT lee en el comprobante y en la guía de remisión."
        >
          <div className="space-y-4">
            <Fila>
              <Campo id="opcion-address" etiqueta={<>Dirección<Obligatorio /></>} ayuda="Calle o avenida y número.">
                <Input placeholder="Av. Principal 123" error={errors.address?.message} {...register('address')} />
              </Campo>
              <Campo id="opcion-urbanization" etiqueta="Urbanización" ayuda="Opcional.">
                <Input placeholder="Las Flores" error={errors.urbanization?.message} {...register('urbanization')} />
              </Campo>
            </Fila>

            <Campo
              id="opcion-ubigeo"
              etiqueta={<>Departamento, provincia y distrito<Obligatorio /></>}
              ayuda={ubigeoActual ? `Ubigeo ${ubigeoActual}, calculado con los tres.` : 'Elige los tres para que se calcule el ubigeo.'}
            >
              <Fila columnas={3}>
                <Select
                  aria-label="Departamento"
                  className="text-sm"
                  value={locationDeptCode}
                  onChange={(e) => handleLocationChange('department', e.target.value)}
                >
                  <option value="">Departamento</option>
                  {DEPARTAMENTOS.map(dept => (
                    <option key={dept.code} value={dept.code}>{dept.name}</option>
                  ))}
                </Select>
                <Select
                  aria-label="Provincia"
                  className="text-sm"
                  value={locationProvCode}
                  onChange={(e) => handleLocationChange('province', e.target.value)}
                  disabled={!locationDeptCode}
                >
                  <option value="">Provincia</option>
                  {getProvincias(locationDeptCode).map(prov => (
                    <option key={prov.code} value={prov.code}>{prov.name}</option>
                  ))}
                </Select>
                <Select
                  aria-label="Distrito"
                  className="text-sm"
                  value={locationDistCode}
                  onChange={(e) => handleLocationChange('district', e.target.value)}
                  disabled={!locationProvCode}
                >
                  <option value="">Distrito</option>
                  {getDistritos(locationDeptCode, locationProvCode).map(dist => (
                    <option key={dist.code} value={dist.code}>{dist.name}</option>
                  ))}
                </Select>
              </Fila>
              {errorUbicacion && <p className="mt-1 text-sm text-red-600">{errorUbicacion}</p>}
              {/* Los nombres y el ubigeo viajan en el formulario; los selectores solo eligen códigos */}
              <input type="hidden" {...register('district')} />
              <input type="hidden" {...register('province')} />
              <input type="hidden" {...register('department')} />
              <input type="hidden" {...register('ubigeo')} />
            </Campo>

            {establishments.length > 0 && (
              <Campo
                id="opcion-establishments"
                etiqueta="Establecimientos anexos (SUNAT)"
                ayuda="Se cargan al buscar el RUC con la lupa y sirven como punto de partida en las guías de remisión."
              >
                <div className="border border-gray-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 w-16">Código</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Dirección</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 w-24">Ubigeo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {establishments.map((est, index) => (
                        <tr key={est.codigo || index}>
                          <td className="px-3 py-2 font-mono text-xs">{est.codigo || '-'}</td>
                          <td className="px-3 py-2">{est.direccionCompleta || est.direccion || '-'}</td>
                          <td className="px-3 py-2 font-mono text-xs">{est.ubigeo || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Campo>
            )}
          </div>
        </Seccion>

        <Separador />

        <Seccion titulo="Contacto" descripcion="Salen en los comprobantes, en las cotizaciones y en el catálogo.">
          <Fila>
            <Campo id="opcion-phone" etiqueta="Teléfono">
              <Input type="tel" placeholder="01-2345678" error={errors.phone?.message} {...register('phone')} />
            </Campo>
            <Campo id="opcion-email" etiqueta="Correo electrónico">
              <Input type="email" placeholder="contacto@miempresa.com" error={errors.email?.message} {...register('email')} />
            </Campo>
            <Campo id="opcion-website" etiqueta="Sitio web">
              <Input type="url" placeholder="https://miempresa.com" error={errors.website?.message} {...register('website')} />
            </Campo>
            <Campo id="opcion-socialMedia" etiqueta="Redes sociales" ayuda="Usuario de Facebook, Instagram u otra red social.">
              <Input placeholder="@miempresa o facebook.com/miempresa" error={errors.socialMedia?.message} {...register('socialMedia')} />
            </Campo>
          </Fila>
        </Seccion>

        <Separador />

        <Seccion
          id="opcion-logoUrl"
          titulo="Logo"
          descripcion="Aparece en facturas, boletas, cotizaciones y tickets. El tamaño con el que sale en el ticket se regula en Impresión."
        >
          <div className="flex items-start gap-4">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo de la empresa" className="w-32 h-32 shrink-0 object-contain border border-gray-200 rounded-lg p-2 bg-white" />
            ) : (
              <div className="w-32 h-32 shrink-0 border border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 text-xs text-gray-400">
                Sin logo
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  {logoUrl ? 'Cambiar logo' : 'Subir logo'}
                  <input type="file" accept={ACCEPT_IMAGEN} onChange={handleLogoUpload} className="hidden" />
                </label>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    disabled={ocupado}
                    className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Quitar logo
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                JPG, PNG o WEBP de hasta 2 MB.
                {logoFile && ' El logo nuevo se sube al guardar.'}
              </p>
            </div>
          </div>
        </Seccion>

        <Separador />

        <Seccion
          id="opcion-bankAccountsList"
          titulo="Cuentas bancarias"
          descripcion="Aparecen en facturas, boletas y cotizaciones para que el cliente sepa dónde pagar."
        >
          {bankAccounts.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Banco</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Tipo</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Moneda</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">N° de cuenta</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">CCI</th>
                    <th className="px-3 py-2 w-16"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {bankAccounts.map((account, index) => {
                    const editando = editingBankIndex === index
                    return (
                      <tr key={index}>
                        {editando ? (
                          <>
                            <td className="px-2 py-1.5 min-w-[9rem]">
                              <Select className={CELDA} aria-label="Banco" value={account.bank} onChange={e => updateBankAccount(index, { bank: e.target.value })}>
                                {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                              </Select>
                            </td>
                            <td className="px-2 py-1.5 min-w-[8rem]">
                              <Select className={CELDA} aria-label="Tipo de cuenta" value={account.accountType} onChange={e => updateBankAccount(index, { accountType: e.target.value })}>
                                {TIPOS_CUENTA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                              </Select>
                            </td>
                            <td className="px-2 py-1.5 min-w-[7rem]">
                              <Select className={CELDA} aria-label="Moneda" value={account.currency} onChange={e => updateBankAccount(index, { currency: e.target.value })}>
                                {MONEDAS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                              </Select>
                            </td>
                            <td className="px-2 py-1.5 min-w-[10rem]">
                              <Input className={`${CELDA} font-mono`} aria-label="Número de cuenta" placeholder="N° de cuenta" value={account.accountNumber || ''} onChange={e => updateBankAccount(index, { accountNumber: e.target.value })} />
                            </td>
                            <td className="px-2 py-1.5 min-w-[10rem]">
                              <Input className={`${CELDA} font-mono`} aria-label="CCI" placeholder="CCI" value={account.cci || ''} onChange={e => updateBankAccount(index, { cci: e.target.value })} />
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2">{account.bank}</td>
                            <td className="px-3 py-2">{etiquetaTipoCuenta(account.accountType)}</td>
                            <td className="px-3 py-2">{etiquetaMoneda(account.currency)}</td>
                            <td className="px-3 py-2 font-mono text-xs">{account.accountNumber}</td>
                            <td className="px-3 py-2 font-mono text-xs">{account.cci || '-'}</td>
                          </>
                        )}
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {editando ? (
                              <button type="button" onClick={() => setEditingBankIndex(null)} className="text-primary-600 hover:text-primary-700" title="Listo" aria-label="Listo">
                                <Check className="w-4 h-4" />
                              </button>
                            ) : (
                              <button type="button" onClick={() => setEditingBankIndex(index)} className="text-gray-400 hover:text-primary-600" title="Editar" aria-label="Editar">
                                <Edit className="w-4 h-4" />
                              </button>
                            )}
                            <button type="button" onClick={() => quitarCuenta(index)} className="text-gray-400 hover:text-red-600" title="Eliminar" aria-label="Eliminar">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Alta de una cuenta nueva */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 p-3 bg-gray-50 rounded-lg">
            <Select className="text-sm" aria-label="Banco" value={cuentaNueva.bank} onChange={e => setCuentaNueva({ ...cuentaNueva, bank: e.target.value })}>
              <option value="">Banco</option>
              {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
            </Select>
            <Select className="text-sm" aria-label="Tipo de cuenta" value={cuentaNueva.accountType} onChange={e => setCuentaNueva({ ...cuentaNueva, accountType: e.target.value })}>
              {TIPOS_CUENTA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
            <Select className="text-sm" aria-label="Moneda" value={cuentaNueva.currency} onChange={e => setCuentaNueva({ ...cuentaNueva, currency: e.target.value })}>
              {MONEDAS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
            <Input aria-label="Número de cuenta" placeholder="N° de cuenta" value={cuentaNueva.accountNumber} onChange={e => setCuentaNueva({ ...cuentaNueva, accountNumber: e.target.value })} />
            <Input aria-label="CCI" placeholder="CCI (opcional)" value={cuentaNueva.cci} onChange={e => setCuentaNueva({ ...cuentaNueva, cci: e.target.value })} />
            <Button type="button" size="sm" onClick={agregarCuenta}>Agregar</Button>
          </div>
        </Seccion>

        <Separador />

        <Seccion
          id="opcion-digitalWalletsList"
          titulo="Yape y Plin"
          descripcion="Número, titular y QR de tus billeteras para que tus clientes te paguen."
        >
          {digitalWallets.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Billetera</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Titular</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Número</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">QR</th>
                    <th className="px-3 py-2 w-16"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {digitalWallets.map((w, index) => {
                    const editando = editingWalletIndex === index
                    return (
                      <tr key={index}>
                        {editando ? (
                          <>
                            <td className="px-2 py-1.5 min-w-[7rem]">
                              <Select className={CELDA} aria-label="Billetera" value={w.provider} onChange={e => updateWallet(index, { provider: e.target.value })}>
                                {BILLETERAS.map(b => <option key={b} value={b}>{b}</option>)}
                              </Select>
                            </td>
                            <td className="px-2 py-1.5 min-w-[10rem]">
                              <Input className={CELDA} aria-label="Titular" placeholder="Titular" value={w.holderName || ''} onChange={e => updateWallet(index, { holderName: e.target.value })} />
                            </td>
                            <td className="px-2 py-1.5 min-w-[8rem]">
                              <Input className={`${CELDA} font-mono`} aria-label="Número" placeholder="Número" value={w.phoneNumber || ''} onChange={e => updateWallet(index, { phoneNumber: e.target.value })} />
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 font-medium text-gray-900">{w.provider}</td>
                            <td className="px-3 py-2">{w.holderName || '-'}</td>
                            <td className="px-3 py-2 font-mono text-xs">{w.phoneNumber}</td>
                          </>
                        )}
                        <td className="px-3 py-2">
                          {(w._qrPreview || w.qrImageUrl) ? (
                            <img src={w._qrPreview || w.qrImageUrl} alt="QR" className="w-10 h-10 object-contain border border-gray-200 rounded" />
                          ) : (
                            <span className="text-xs text-gray-400">Sin QR</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {editando ? (
                              <button type="button" onClick={() => setEditingWalletIndex(null)} className="text-primary-600 hover:text-primary-700" title="Listo" aria-label="Listo">
                                <Check className="w-4 h-4" />
                              </button>
                            ) : (
                              <button type="button" onClick={() => setEditingWalletIndex(index)} className="text-gray-400 hover:text-primary-600" title="Editar" aria-label="Editar">
                                <Edit className="w-4 h-4" />
                              </button>
                            )}
                            <button type="button" onClick={() => quitarBilletera(index)} className="text-gray-400 hover:text-red-600" title="Eliminar" aria-label="Eliminar">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Alta de una billetera nueva */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-3 bg-gray-50 rounded-lg">
            <Select className="text-sm" aria-label="Billetera" value={billeteraNueva.provider} onChange={e => setBilleteraNueva({ ...billeteraNueva, provider: e.target.value })}>
              <option value="">Yape o Plin</option>
              {BILLETERAS.map(b => <option key={b} value={b}>{b}</option>)}
            </Select>
            <Input aria-label="Titular" placeholder="Titular (opcional)" value={billeteraNueva.holderName} onChange={e => setBilleteraNueva({ ...billeteraNueva, holderName: e.target.value })} />
            <Input aria-label="Número" inputMode="tel" placeholder="Número (celular)" value={billeteraNueva.phoneNumber} onChange={e => setBilleteraNueva({ ...billeteraNueva, phoneNumber: e.target.value })} />
            <label className="flex items-center justify-center px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors truncate">
              {newWalletQrPreview ? 'QR listo' : 'Subir QR (opcional)'}
              <input type="file" accept={ACCEPT_IMAGEN} className="hidden" onChange={handleWalletQrSelect} />
            </label>
            <Button type="button" size="sm" onClick={agregarBilletera}>Agregar</Button>
          </div>
        </Seccion>

        <BarraGuardar onClick={enviar} guardando={ocupado} />
      </form>

      {/* Datos personalizables por sucursal (logo, nombre comercial, dirección, teléfono).
          Solo el dueño/admin puede editar sucursales (las reglas de Firestore restringen
          la escritura al owner). Los sub-usuarios no ven esta sección. */}
      {!isDemoMode && (isBusinessOwner || isAdmin) && (
        <BranchInfoSettings
          businessId={getBusinessId()}
          mainBranchName={businessSettings?.mainBranchName || 'Sucursal Principal'}
        />
      )}
    </div>
  )
}
